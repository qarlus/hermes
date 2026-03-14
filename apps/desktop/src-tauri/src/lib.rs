use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use aes_gcm_siv::{
    aead::{Aead, KeyInit},
    Aes256GcmSiv, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use chrono::{TimeZone, Utc};
use ed25519_dalek::{Signature as Ed25519Signature, Signer, SigningKey as Ed25519SigningKey, Verifier, VerifyingKey as Ed25519VerifyingKey};
use hkdf::Hkdf;
use keyring::{Entry, Error as KeyringError};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use rand::{rngs::OsRng, RngCore};
use reqwest::{
    blocking::{Client, Response},
    header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT},
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{Emitter, Manager, State};
use uuid::Uuid;
use x25519_dalek::{PublicKey as X25519PublicKey, StaticSecret as X25519SecretKey};

const AUTH_DEFAULT: &str = "default";
const AUTH_SSH_KEY: &str = "sshKey";
const AUTH_PASSWORD: &str = "password";
const KEYCHAIN_SERVICE: &str = "Hermes";
const GITHUB_KEYRING_ACCOUNT: &str = "github-device-token";
const RELAY_IDENTITY_KEY_PREFIX: &str = "relay-device-identity";
const RELAY_IDENTITY_SETTING_PREFIX: &str = "relay.device-identity";
const RELAY_WORKSPACE_KEY_PREFIX: &str = "relay-workspace-key";
const RELAY_WORKSPACE_KEY_SETTING_PREFIX: &str = "relay.workspace-key";
const INLINE_SSH_KEY_PREFIX: &str = "hermes-inline-ssh-key:";
const GITHUB_TOKEN_SETTING_KEY: &str = "github.token";
const GITHUB_API_VERSION: &str = "2022-11-28";
const GITHUB_DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const GITHUB_OAUTH_ACCESS_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL: &str = "https://api.github.com/user";
const GITHUB_USER_REPOS_URL: &str = "https://api.github.com/user/repos";
const GITHUB_SEARCH_REPOSITORIES_URL: &str = "https://api.github.com/search/repositories";
const DEVICE_CREDENTIAL_MODE_AUTO: &str = "auto";
const DEVICE_CREDENTIAL_MODE_DISABLED: &str = "disabled";
const LOCAL_SESSION_SERVER_ID: &str = "__local__";

#[derive(Clone)]
struct AppState {
    db: Database,
    sessions: Arc<Mutex<HashMap<String, SessionHandle>>>,
    github_device_flow: Arc<Mutex<Option<GitHubDeviceFlowState>>>,
    log_path: PathBuf,
}

#[derive(Clone)]
struct Database {
    connection: Arc<Mutex<Connection>>,
    keychain_service: String,
    secret_key: Arc<[u8; 32]>,
}

struct SessionHandle {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    child: Arc<Mutex<Box<dyn portable_pty::Child + Send>>>,
    process_id: Option<u32>,
    status: Arc<Mutex<String>>,
}

#[derive(Clone)]
struct GitHubDeviceFlowState {
    device_code: String,
    interval_seconds: u64,
    expires_at: Instant,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectInput {
    name: String,
    description: String,
    path: String,
    target_kind: String,
    linked_server_id: String,
    github_repo_full_name: String,
    github_default_branch: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectRemoteConnectionInput {
    hostname: String,
    port: u16,
    username: String,
    auth_kind: String,
    credential_id: Option<String>,
    credential_name: String,
    credential_secret: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectRecord {
    id: String,
    name: String,
    description: String,
    path: String,
    target_kind: String,
    linked_server_id: Option<String>,
    github_repo_full_name: String,
    github_default_branch: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct KeychainItemRecord {
    id: String,
    name: String,
    kind: String,
    usage_count: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateKeychainItemInput {
    name: String,
    kind: String,
    secret: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncableKeychainItemRecord {
    name: String,
    kind: String,
    secret: String,
    public_key: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateLocalSshKeyInput {
    name: String,
    directory: String,
    file_name: String,
    passphrase: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServerInput {
    project_id: String,
    name: String,
    hostname: String,
    port: u16,
    username: String,
    path: String,
    auth_kind: String,
    credential_id: Option<String>,
    credential_name: String,
    credential_secret: String,
    is_favorite: bool,
    tmux_session: String,
    use_tmux: bool,
    notes: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ServerRecord {
    id: String,
    project_id: String,
    name: String,
    hostname: String,
    port: u16,
    username: String,
    path: String,
    auth_kind: String,
    credential_id: Option<String>,
    credential_name: Option<String>,
    device_credential_mode: String,
    is_favorite: bool,
    tmux_session: String,
    use_tmux: bool,
    notes: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RelayHostInspectionRecord {
    server_id: String,
    git_installed: bool,
    docker_installed: bool,
    apple_container_installed: bool,
    tailscale_installed: bool,
    tailscale_connected: bool,
    tailscale_ipv4: Option<String>,
    tailscale_dns_name: Option<String>,
    relay_installed: bool,
    relay_running: bool,
    relay_healthy: bool,
    relay_version: Option<String>,
    relay_id: Option<String>,
    suggested_relay_urls: Vec<String>,
    suggested_relay_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RelayDevicePublicKeysRecord {
    encryption_public_key: String,
    signing_public_key: String,
    encoding: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RelayWorkspaceKeyWrapRecord {
    version: u8,
    algorithm: String,
    recipient_device_id: String,
    wrapped_by_device_id: String,
    ephemeral_public_key: String,
    salt: String,
    nonce: String,
    ciphertext: String,
    encoding: String,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RelayEncryptedEventEnvelopeRecord {
    version: u8,
    workspace_id: String,
    event_id: String,
    author_device_id: String,
    sequence: u64,
    ciphertext: String,
    nonce: String,
    aad: String,
    signature: String,
    encoding: String,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RelayEncryptedSnapshotEnvelopeRecord {
    version: u8,
    workspace_id: String,
    snapshot_id: String,
    author_device_id: String,
    base_sequence: u64,
    ciphertext: String,
    nonce: String,
    aad: String,
    signature: String,
    encoding: String,
    created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RelayDeviceIdentityRecord {
    device_id: String,
    public_keys: RelayDevicePublicKeysRecord,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredRelayDeviceIdentityRecord {
    device_id: String,
    encryption_private_key: String,
    encryption_public_key: String,
    signing_private_key: String,
    signing_public_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectSessionInput {
    server_id: String,
    tmux_session: Option<String>,
    cwd: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectLocalSessionInput {
    cwd: Option<String>,
    label: Option<String>,
    program: Option<String>,
    args: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FileBrowserTargetInput {
    kind: String,
    server_id: Option<String>,
    path: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FileBrowserEntryRecord {
    name: String,
    path: String,
    kind: String,
    size: Option<u64>,
    modified_at: Option<String>,
    hidden: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileBrowserDirectoryRecord {
    target: FileBrowserTargetInput,
    title: String,
    parent_path: Option<String>,
    entries: Vec<FileBrowserEntryRecord>,
    can_write: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FilePreviewRecord {
    target: FileBrowserTargetInput,
    name: String,
    size: Option<u64>,
    encoding: String,
    content: String,
    binary: bool,
    truncated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalEditableFileRecord {
    target: FileBrowserTargetInput,
    local_path: String,
    file_name: String,
    temporary: bool,
    size: Option<u64>,
    modified_at_ms: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalFileSyncInput {
    local_path: String,
    target: FileBrowserTargetInput,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalEditableFileStateRecord {
    local_path: String,
    exists: bool,
    size: Option<u64>,
    modified_at_ms: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateTerminalCommandInput {
    name: String,
    command: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalCommandRecord {
    id: String,
    name: String,
    command: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalTab {
    id: String,
    server_id: String,
    title: String,
    status: String,
    started_at: String,
    cwd: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalDataEvent {
    session_id: String,
    data: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalExitEvent {
    session_id: String,
    exit_code: Option<u32>,
    reason: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalStatusEvent {
    session_id: String,
    status: String,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionStatusSnapshot {
    session_id: String,
    status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TmuxSessionRecord {
    name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CliToolUpdateRecord {
    id: String,
    name: String,
    description: String,
    installed: bool,
    current_version: Option<String>,
    latest_version: Option<String>,
    state: String,
    can_run_update: bool,
    action_label: String,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitFileChangeRecord {
    path: String,
    previous_path: Option<String>,
    status: String,
    staged: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitCommitRecord {
    id: String,
    summary: String,
    author: String,
    relative_date: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitBranchRecord {
    name: String,
    current: bool,
    upstream: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitRemoteRecord {
    name: String,
    fetch_url: String,
    push_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitReviewRecord {
    base_branch: String,
    commit_count: i64,
    changed_files: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitRepositoryRecord {
    root_path: String,
    name: String,
    branch: String,
    upstream: Option<String>,
    has_remote: bool,
    remote_name: Option<String>,
    remotes: Vec<GitRemoteRecord>,
    ahead: i64,
    behind: i64,
    staged_count: i64,
    changed_count: i64,
    untracked_count: i64,
    conflicted_count: i64,
    clean: bool,
    last_commit_summary: Option<String>,
    last_commit_relative: Option<String>,
    default_base: Option<String>,
    branches: Vec<GitBranchRecord>,
    recent_commits: Vec<GitCommitRecord>,
    changes: Vec<GitFileChangeRecord>,
    review: Option<GitReviewRecord>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitHubAuthSession {
    login: String,
    name: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitHubDeviceFlowRecord {
    verification_uri: String,
    user_code: String,
    expires_in: u64,
    interval: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitHubRepositoryRecord {
    id: String,
    name: String,
    full_name: String,
    owner_login: String,
    owner_type: String,
    description: String,
    private: bool,
    stargazer_count: i64,
    language: Option<String>,
    updated_at: String,
    html_url: String,
    clone_url: String,
    default_branch: String,
}

#[derive(Debug, Default)]
struct GitStatusSummary {
    upstream: Option<String>,
    ahead: i64,
    behind: i64,
    staged_count: i64,
    changed_count: i64,
    untracked_count: i64,
    conflicted_count: i64,
    changes: Vec<GitFileChangeRecord>,
}

#[derive(Debug, Deserialize)]
struct GitHubUserApiResponse {
    login: String,
    name: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubDeviceCodeApiResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u64,
    interval: u64,
}

#[derive(Debug, Deserialize)]
struct GitHubAccessTokenApiResponse {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
    interval: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct GitHubSearchRepositoriesResponse {
    items: Vec<GitHubRepositoryApiResponse>,
}

#[derive(Debug, Deserialize)]
struct GitHubRepositoryApiResponse {
    id: i64,
    name: String,
    full_name: String,
    description: Option<String>,
    private: bool,
    stargazers_count: i64,
    language: Option<String>,
    updated_at: String,
    html_url: String,
    clone_url: String,
    default_branch: String,
    owner: GitHubRepositoryOwnerApiResponse,
}

#[derive(Debug, Deserialize)]
struct GitHubRepositoryOwnerApiResponse {
    login: String,
    #[serde(rename = "type")]
    owner_type: String,
}

#[derive(Clone, Copy)]
struct CliToolCommand {
    program: &'static str,
    args: &'static [&'static str],
}

#[derive(Clone, Copy)]
struct CliToolSpec {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    current_version: CliToolCommand,
    latest_version: Option<CliToolCommand>,
    update: Option<CliToolCommand>,
}

impl Database {
    fn new(app: &tauri::AppHandle) -> Result<Self, String> {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?;

        fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;

        let database_path = app_data_dir.join("hermes.sqlite");
        let connection = Connection::open(database_path).map_err(|error| error.to_string())?;
        let secret_key = load_or_create_secret_key(&app_data_dir.join("hermes.secrets.key"))?;

        let database = Self {
            connection: Arc::new(Mutex::new(connection)),
            keychain_service: KEYCHAIN_SERVICE.to_string(),
            secret_key: Arc::new(secret_key),
        };

        database.migrate()?;
        Ok(database)
    }

    fn migrate(&self) -> Result<(), String> {
        let connection = self.connection.lock().map_err(lock_error)?;
        connection
            .execute_batch(
                r#"
                PRAGMA foreign_keys = ON;

                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    path TEXT NOT NULL DEFAULT '',
                    target_kind TEXT NOT NULL DEFAULT 'local',
                    linked_server_id TEXT DEFAULT NULL,
                    github_repo_full_name TEXT NOT NULL DEFAULT '',
                    github_default_branch TEXT NOT NULL DEFAULT 'main',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS credentials (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    secret_blob TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS hosts (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    hostname TEXT NOT NULL,
                    port INTEGER NOT NULL,
                    username TEXT NOT NULL DEFAULT '',
                    path TEXT NOT NULL DEFAULT '',
                    identity_file TEXT NOT NULL DEFAULT '',
                    auth_kind TEXT NOT NULL DEFAULT 'default',
                    credential_id TEXT DEFAULT NULL,
                    device_credential_mode TEXT NOT NULL DEFAULT 'auto',
                    tmux_session TEXT NOT NULL DEFAULT 'main',
                    use_tmux INTEGER NOT NULL DEFAULT 0,
                    is_favorite INTEGER NOT NULL DEFAULT 0,
                    notes TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS terminal_commands (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    command TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_hosts_project_id ON hosts(project_id);
                "#,
            )
            .map_err(|error| error.to_string())?;

        ensure_column(
            &connection,
            "projects",
            "path",
            "ALTER TABLE projects ADD COLUMN path TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &connection,
            "projects",
            "target_kind",
            "ALTER TABLE projects ADD COLUMN target_kind TEXT NOT NULL DEFAULT 'local'",
        )?;
        ensure_column(
            &connection,
            "projects",
            "linked_server_id",
            "ALTER TABLE projects ADD COLUMN linked_server_id TEXT DEFAULT NULL",
        )?;
        ensure_column(
            &connection,
            "projects",
            "github_repo_full_name",
            "ALTER TABLE projects ADD COLUMN github_repo_full_name TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &connection,
            "projects",
            "github_default_branch",
            "ALTER TABLE projects ADD COLUMN github_default_branch TEXT NOT NULL DEFAULT 'main'",
        )?;
        ensure_column(
            &connection,
            "credentials",
            "secret_blob",
            "ALTER TABLE credentials ADD COLUMN secret_blob TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &connection,
            "hosts",
            "project_id",
            "ALTER TABLE hosts ADD COLUMN project_id TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &connection,
            "hosts",
            "path",
            "ALTER TABLE hosts ADD COLUMN path TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &connection,
            "hosts",
            "auth_kind",
            "ALTER TABLE hosts ADD COLUMN auth_kind TEXT NOT NULL DEFAULT 'default'",
        )?;
        ensure_column(
            &connection,
            "hosts",
            "is_favorite",
            "ALTER TABLE hosts ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0",
        )?;
        ensure_column(
            &connection,
            "hosts",
            "credential_id",
            "ALTER TABLE hosts ADD COLUMN credential_id TEXT DEFAULT NULL",
        )?;
        ensure_column(
            &connection,
            "hosts",
            "device_credential_mode",
            "ALTER TABLE hosts ADD COLUMN device_credential_mode TEXT NOT NULL DEFAULT 'auto'",
        )?;
        connection
            .execute(
                "CREATE INDEX IF NOT EXISTS idx_hosts_credential_id ON hosts(credential_id)",
                [],
            )
            .map_err(|error| error.to_string())?;

        let host_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM hosts", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        let project_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;

        connection
            .execute(
                "UPDATE projects SET name = 'Workspace', description = '' WHERE name = 'Imported'",
                [],
            )
            .map_err(|error| error.to_string())?;

        if host_count == 0 {
            connection
                .execute(
                    "DELETE FROM projects WHERE (name = 'Imported' OR name = 'Workspace') AND (description = '' OR description = 'Migrated from the flat host list.')",
                    [],
                )
                .map_err(|error| error.to_string())?;
        } else {
            let default_project_id = if project_count == 0 {
                let id = Uuid::new_v4().to_string();
                let now = Utc::now().to_rfc3339();
                connection
                    .execute(
                        r#"
                        INSERT INTO projects (id, name, description, created_at, updated_at)
                        VALUES (?1, ?2, ?3, ?4, ?5)
                        "#,
                        params![id, "Workspace", "", now, now],
                    )
                    .map_err(|error| error.to_string())?;
                id
            } else {
                connection
                    .query_row(
                        "SELECT id FROM projects ORDER BY updated_at DESC LIMIT 1",
                        [],
                        |row| row.get(0),
                    )
                    .map_err(|error| error.to_string())?
            };

            connection
                .execute(
                    "UPDATE hosts SET project_id = ?1 WHERE project_id = '' OR project_id IS NULL",
                    [default_project_id],
                )
                .map_err(|error| error.to_string())?;
        }

        let mut legacy_statement = connection
            .prepare(
                r#"
                SELECT id, name, hostname, identity_file
                FROM hosts
                WHERE TRIM(identity_file) <> ''
                  AND (credential_id IS NULL OR credential_id = '')
                "#,
            )
            .map_err(|error| error.to_string())?;

        let legacy_rows = legacy_statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(|error| error.to_string())?;

        let mut legacy_servers = Vec::new();
        for row in legacy_rows {
            legacy_servers.push(row.map_err(|error| error.to_string())?);
        }
        drop(legacy_statement);

        for (server_id, server_name, hostname, identity_file) in legacy_servers {
            let credential_id = Uuid::new_v4().to_string();
            let now = Utc::now().to_rfc3339();
            let base_name = if server_name.trim().is_empty() {
                hostname.trim()
            } else {
                server_name.trim()
            };

            connection
                .execute(
                    r#"
                    INSERT INTO credentials (id, name, kind, created_at, updated_at)
                    VALUES (?1, ?2, ?3, ?4, ?5)
                    "#,
                    params![
                        credential_id,
                        format!("{base_name} key"),
                        AUTH_SSH_KEY,
                        now,
                        now
                    ],
                )
                .map_err(|error| error.to_string())?;
            self.store_secret_with_connection(&connection, &credential_id, identity_file.trim())?;
            connection
                .execute(
                    "UPDATE hosts SET auth_kind = ?2, credential_id = ?3 WHERE id = ?1",
                    params![server_id, AUTH_SSH_KEY, credential_id],
                )
                .map_err(|error| error.to_string())?;
        }

        connection
            .execute(
                "UPDATE hosts SET auth_kind = ?1 WHERE auth_kind IS NULL OR TRIM(auth_kind) = ''",
                [AUTH_DEFAULT],
            )
            .map_err(|error| error.to_string())?;
        self.sync_missing_default_auth_credentials(&connection)?;

        Ok(())
    }

    fn list_projects(&self) -> Result<Vec<ProjectRecord>, String> {
        let connection = self.connection.lock().map_err(lock_error)?;
        let mut statement = connection
            .prepare(
                r#"
                SELECT id, name, description, path, target_kind, linked_server_id, github_repo_full_name, github_default_branch, created_at, updated_at
                FROM projects
                ORDER BY updated_at DESC, name COLLATE NOCASE ASC
                "#,
            )
            .map_err(|error| error.to_string())?;

        let rows = statement
            .query_map([], map_project_row)
            .map_err(|error| error.to_string())?;

        let mut projects = Vec::new();
        for row in rows {
            projects.push(row.map_err(|error| error.to_string())?);
        }

        Ok(projects)
    }

    fn get_project(&self, id: &str) -> Result<ProjectRecord, String> {
        let connection = self.connection.lock().map_err(lock_error)?;
        connection
            .query_row(
                r#"
                SELECT id, name, description, path, target_kind, linked_server_id, github_repo_full_name, github_default_branch, created_at, updated_at
                FROM projects
                WHERE id = ?1
                "#,
                [id],
                map_project_row,
            )
            .optional()
            .map_err(|error| error.to_string())?
            .ok_or_else(|| format!("Workspace {id} was not found."))
    }

    fn create_project(&self, input: ProjectInput) -> Result<ProjectRecord, String> {
        validate_project_input(&input)?;

        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let connection = self.connection.lock().map_err(lock_error)?;
        connection
            .execute(
                r#"
                INSERT INTO projects (
                    id,
                    name,
                    description,
                    path,
                    target_kind,
                    linked_server_id,
                    github_repo_full_name,
                    github_default_branch,
                    created_at,
                    updated_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                "#,
                params![
                    id,
                    input.name.trim(),
                    input.description.trim(),
                    input.path.trim(),
                    normalized_project_target_kind(&input.target_kind)?,
                    optional_non_empty(input.linked_server_id.trim()),
                    input.github_repo_full_name.trim(),
                    normalized_project_branch(&input.github_default_branch),
                    now,
                    now
                ],
            )
            .map_err(|error| error.to_string())?;
        drop(connection);
        self.get_project(&id)
    }

    fn update_project(&self, id: &str, input: ProjectInput) -> Result<ProjectRecord, String> {
        validate_project_input(&input)?;

        let now = Utc::now().to_rfc3339();
        let connection = self.connection.lock().map_err(lock_error)?;
        connection
            .execute(
                r#"
                UPDATE projects
                SET
                    name = ?2,
                    description = ?3,
                    path = ?4,
                    target_kind = ?5,
                    linked_server_id = ?6,
                    github_repo_full_name = ?7,
                    github_default_branch = ?8,
                    updated_at = ?9
                WHERE id = ?1
                "#,
                params![
                    id,
                    input.name.trim(),
                    input.description.trim(),
                    input.path.trim(),
                    normalized_project_target_kind(&input.target_kind)?,
                    optional_non_empty(input.linked_server_id.trim()),
                    input.github_repo_full_name.trim(),
                    normalized_project_branch(&input.github_default_branch),
                    now
                ],
            )
            .map_err(|error| error.to_string())?;
        drop(connection);
        self.get_project(id)
    }

    fn delete_project(&self, id: &str) -> Result<(), String> {
        let servers = self.list_servers_for_project(id)?;
        let connection = self.connection.lock().map_err(lock_error)?;
        connection
            .execute("DELETE FROM hosts WHERE project_id = ?1", [id])
            .map_err(|error| error.to_string())?;
        connection
            .execute("DELETE FROM projects WHERE id = ?1", [id])
            .map_err(|error| error.to_string())?;

        for server in servers {
            self.cleanup_orphan_credential(&connection, server.credential_id.as_deref())?;
        }

        Ok(())
    }

    fn list_keychain_items(&self) -> Result<Vec<KeychainItemRecord>, String> {
        let connection = self.connection.lock().map_err(lock_error)?;
        let mut statement = connection
            .prepare(
                r#"
                SELECT
                    credentials.id,
                    credentials.name,
                    credentials.kind,
                    COUNT(hosts.id) AS usage_count,
                    credentials.created_at,
                    credentials.updated_at
                FROM credentials
                LEFT JOIN hosts ON hosts.credential_id = credentials.id
                GROUP BY credentials.id, credentials.name, credentials.kind, credentials.created_at, credentials.updated_at
                ORDER BY credentials.updated_at DESC, credentials.name COLLATE NOCASE ASC
                "#,
            )
            .map_err(|error| error.to_string())?;

        let rows = statement
            .query_map([], map_keychain_row)
            .map_err(|error| error.to_string())?;

        let mut credentials = Vec::new();
        for row in rows {
            credentials.push(row.map_err(|error| error.to_string())?);
        }

        Ok(credentials)
    }

    fn create_keychain_item(
        &self,
        input: CreateKeychainItemInput,
    ) -> Result<KeychainItemRecord, String> {
        let name = input.name.trim();
        if name.is_empty() {
            return Err("Credential name is required.".to_string());
        }

        let kind = normalized_auth_kind(&input.kind)?;
        if kind == AUTH_DEFAULT {
            return Err(
                "Saved credentials must be either an SSH key path or password.".to_string(),
            );
        }

        let secret = input.secret.trim();
        if secret.is_empty() {
            return Err("Credential secret is required.".to_string());
        }

        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let connection = self.connection.lock().map_err(lock_error)?;
        connection
            .execute(
                r#"
                INSERT INTO credentials (id, name, kind, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5)
                "#,
                params![id, name, kind, now, now],
            )
            .map_err(|error| error.to_string())?;
        self.store_secret_with_connection(&connection, &id, secret)?;
        drop(connection);
        self.get_keychain_item(&id)
    }

    fn create_local_ssh_key(
        &self,
        input: CreateLocalSshKeyInput,
    ) -> Result<KeychainItemRecord, String> {
        let credential_name = input.name.trim();
        if credential_name.is_empty() {
            return Err("Credential name is required.".to_string());
        }

        let directory = PathBuf::from(input.directory.trim());
        if input.directory.trim().is_empty() {
            return Err("Choose a directory for the SSH key.".to_string());
        }

        if !directory.exists() {
            fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        }

        if !directory.is_dir() {
            return Err("SSH key directory is invalid.".to_string());
        }

        let file_name = sanitize_ssh_key_file_name(&input.file_name);
        if file_name.is_empty() {
            return Err("SSH key filename is required.".to_string());
        }

        let private_key_path = directory.join(file_name);
        if private_key_path.exists() {
            return Err(format!(
                "A file already exists at {}.",
                private_key_path.display()
            ));
        }

        let passphrase = input.passphrase;
        let comment = credential_name.to_string();

        let output = Command::new(resolved_program("ssh-keygen"))
            .args([
                "-q",
                "-t",
                "ed25519",
                "-f",
                &private_key_path.to_string_lossy(),
                "-N",
                &passphrase,
                "-C",
                &comment,
            ])
            .current_dir(neutral_command_cwd())
            .output()
            .map_err(|error| error.to_string())?;

        if !output.status.success() {
            return Err(command_error_message(
                &output,
                "Failed to generate SSH key locally.",
            ));
        }

        self.create_keychain_item(CreateKeychainItemInput {
            name: credential_name.to_string(),
            kind: AUTH_SSH_KEY.to_string(),
            secret: private_key_path.to_string_lossy().to_string(),
        })
    }

    fn get_keychain_item(&self, id: &str) -> Result<KeychainItemRecord, String> {
        let connection = self.connection.lock().map_err(lock_error)?;
        connection
            .query_row(
                r#"
                SELECT
                    credentials.id,
                    credentials.name,
                    credentials.kind,
                    COUNT(hosts.id) AS usage_count,
                    credentials.created_at,
                    credentials.updated_at
                FROM credentials
                LEFT JOIN hosts ON hosts.credential_id = credentials.id
                WHERE credentials.id = ?1
                GROUP BY credentials.id, credentials.name, credentials.kind, credentials.created_at, credentials.updated_at
                "#,
                [id],
                map_keychain_row,
            )
            .optional()
            .map_err(|error| error.to_string())?
            .ok_or_else(|| format!("Credential {id} was not found."))
    }

    fn get_keychain_public_key(&self, id: &str) -> Result<String, String> {
        let item = self.get_keychain_item(id)?;
        if item.kind != AUTH_SSH_KEY {
            return Err("Only SSH key credentials have a public key.".to_string());
        }

        let secret = self.read_secret(id)?;
        let private_key_path = materialize_ssh_key_secret(&secret)?;
        let public_key_path = PathBuf::from(format!("{}.pub", private_key_path.display()));
        if public_key_path.exists() {
            return fs::read_to_string(&public_key_path)
                .map(|value| value.trim().to_string())
                .map_err(|error| error.to_string());
        }

        ssh_public_key_from_private_key(&private_key_path)
    }

    fn list_syncable_keychain_items(&self) -> Result<Vec<SyncableKeychainItemRecord>, String> {
        let items = self.list_keychain_items()?;
        let mut synced = Vec::new();

        for item in items {
            let secret = self.read_secret(&item.id)?;
            if item.kind == AUTH_SSH_KEY {
                let private_key_contents = read_ssh_private_key_secret(&secret)?;
                let public_key = self.get_keychain_public_key(&item.id).ok();
                synced.push(SyncableKeychainItemRecord {
                    name: item.name,
                    kind: item.kind,
                    secret: private_key_contents,
                    public_key: public_key.filter(|value| !value.trim().is_empty()),
                });
            } else if item.kind == AUTH_PASSWORD {
                synced.push(SyncableKeychainItemRecord {
                    name: item.name,
                    kind: item.kind,
                    secret,
                    public_key: None,
                });
            }
        }

        Ok(synced)
    }

    fn upsert_syncable_keychain_items(
        &self,
        items: Vec<SyncableKeychainItemRecord>,
    ) -> Result<Vec<KeychainItemRecord>, String> {
        let mut saved = Vec::new();
        let connection = self.connection.lock().map_err(lock_error)?;

        for item in items {
            let kind = normalized_auth_kind(&item.kind)?.to_string();
            let name = item.name.trim();
            if name.is_empty() {
                continue;
            }

            let existing_id: Option<String> = connection
                .query_row(
                    "SELECT id FROM credentials WHERE name = ?1 AND kind = ?2 ORDER BY updated_at DESC LIMIT 1",
                    params![name, kind],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|error| error.to_string())?;
            let credential_id = existing_id.unwrap_or_else(|| Uuid::new_v4().to_string());
            let now = Utc::now().to_rfc3339();

            let stored_secret = if kind == AUTH_SSH_KEY {
                encode_inline_ssh_key_secret(&item.secret)
            } else {
                item.secret.trim().to_string()
            };
            if stored_secret.is_empty() {
                continue;
            }

            let exists = connection
                .query_row(
                    "SELECT COUNT(*) FROM credentials WHERE id = ?1",
                    [credential_id.clone()],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(|error| error.to_string())?
                > 0;

            if exists {
                connection
                    .execute(
                        "UPDATE credentials SET name = ?2, kind = ?3, updated_at = ?4 WHERE id = ?1",
                        params![credential_id, name, kind, now],
                    )
                    .map_err(|error| error.to_string())?;
            } else {
                connection
                    .execute(
                        r#"
                        INSERT INTO credentials (id, name, kind, created_at, updated_at)
                        VALUES (?1, ?2, ?3, ?4, ?5)
                        "#,
                        params![credential_id, name, kind, now, now],
                    )
                    .map_err(|error| error.to_string())?;
            }

            self.store_secret_with_connection(&connection, &credential_id, &stored_secret)?;
            saved.push(self.get_keychain_item(&credential_id)?);
        }

        Ok(saved)
    }

    fn update_keychain_item_name(
        &self,
        id: &str,
        name: &str,
    ) -> Result<KeychainItemRecord, String> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err("Credential name is required.".to_string());
        }

        let connection = self.connection.lock().map_err(lock_error)?;
        connection
            .execute(
                "UPDATE credentials SET name = ?2, updated_at = ?3 WHERE id = ?1",
                params![id, trimmed, Utc::now().to_rfc3339()],
            )
            .map_err(|error| error.to_string())?;
        drop(connection);
        self.get_keychain_item(id)
    }

    fn delete_keychain_item(&self, id: &str) -> Result<(), String> {
        let connection = self.connection.lock().map_err(lock_error)?;
        let mut statement = connection
            .prepare("SELECT DISTINCT project_id FROM hosts WHERE credential_id = ?1")
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([id], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        let mut affected_projects = Vec::new();
        for row in rows {
            affected_projects.push(row.map_err(|error| error.to_string())?);
        }
        drop(statement);

        let now = Utc::now().to_rfc3339();
        connection
            .execute(
                r#"
                UPDATE hosts
                SET
                    auth_kind = ?2,
                    credential_id = NULL,
                    device_credential_mode = CASE
                        WHEN auth_kind = ?2 THEN ?3
                        ELSE ?4
                    END,
                    updated_at = ?5
                WHERE credential_id = ?1
                "#,
                params![
                    id,
                    AUTH_DEFAULT,
                    DEVICE_CREDENTIAL_MODE_DISABLED,
                    DEVICE_CREDENTIAL_MODE_AUTO,
                    now
                ],
            )
            .map_err(|error| error.to_string())?;
        connection
            .execute("DELETE FROM credentials WHERE id = ?1", [id])
            .map_err(|error| error.to_string())?;
        self.delete_secret_with_connection(&connection, id)?;

        for project_id in affected_projects {
            update_project_timestamp(&connection, &project_id)?;
        }

        Ok(())
    }

    fn list_servers(&self) -> Result<Vec<ServerRecord>, String> {
        let connection = self.connection.lock().map_err(lock_error)?;
        query_servers(&connection, None)
    }

    fn list_servers_for_project(&self, project_id: &str) -> Result<Vec<ServerRecord>, String> {
        let connection = self.connection.lock().map_err(lock_error)?;
        query_servers(&connection, Some(project_id))
    }

    fn get_server(&self, id: &str) -> Result<ServerRecord, String> {
        let connection = self.connection.lock().map_err(lock_error)?;
        connection
            .query_row(
                server_select_sql("WHERE hosts.id = ?1"),
                [id],
                map_server_row,
            )
            .optional()
            .map_err(|error| error.to_string())?
            .ok_or_else(|| format!("Server {id} was not found."))
    }

    fn create_server(&self, input: ServerInput) -> Result<ServerRecord, String> {
        validate_server_input(self, &input)?;

        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let connection = self.connection.lock().map_err(lock_error)?;
        let (auth_kind, credential_id, device_credential_mode) =
            self.prepare_server_auth(&connection, None, &input, &now)?;

        connection
            .execute(
                r#"
                INSERT INTO hosts (
                    id,
                    project_id,
                    name,
                    hostname,
                    port,
                    username,
                    path,
                    auth_kind,
                    credential_id,
                    device_credential_mode,
                    is_favorite,
                    tmux_session,
                    use_tmux,
                    notes,
                    created_at,
                    updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
                "#,
                params![
                    id,
                    input.project_id.trim(),
                    input.name.trim(),
                    input.hostname.trim(),
                    i64::from(input.port),
                    input.username.trim(),
                    input.path.trim(),
                    auth_kind,
                    credential_id,
                    device_credential_mode,
                    bool_to_int(input.is_favorite),
                    sanitized_tmux_session(&input.tmux_session),
                    bool_to_int(input.use_tmux),
                    input.notes.trim(),
                    now,
                    now
                ],
            )
            .map_err(|error| error.to_string())?;

        update_project_timestamp(&connection, input.project_id.trim())?;
        drop(connection);
        self.get_server(&id)
    }

    fn update_server(&self, id: &str, input: ServerInput) -> Result<ServerRecord, String> {
        validate_server_input(self, &input)?;

        let existing = self.get_server(id)?;
        let now = Utc::now().to_rfc3339();
        let connection = self.connection.lock().map_err(lock_error)?;
        let (auth_kind, credential_id, device_credential_mode) =
            self.prepare_server_auth(&connection, Some(&existing), &input, &now)?;

        connection
            .execute(
                r#"
                UPDATE hosts
                SET
                    project_id = ?2,
                    name = ?3,
                    hostname = ?4,
                    port = ?5,
                    username = ?6,
                    path = ?7,
                    auth_kind = ?8,
                    credential_id = ?9,
                    device_credential_mode = ?10,
                    is_favorite = ?11,
                    tmux_session = ?12,
                    use_tmux = ?13,
                    notes = ?14,
                    updated_at = ?15
                WHERE id = ?1
                "#,
                params![
                    id,
                    input.project_id.trim(),
                    input.name.trim(),
                    input.hostname.trim(),
                    i64::from(input.port),
                    input.username.trim(),
                    input.path.trim(),
                    auth_kind,
                    credential_id,
                    device_credential_mode,
                    bool_to_int(input.is_favorite),
                    sanitized_tmux_session(&input.tmux_session),
                    bool_to_int(input.use_tmux),
                    input.notes.trim(),
                    now
                ],
            )
            .map_err(|error| error.to_string())?;

        update_project_timestamp(&connection, input.project_id.trim())?;
        if existing.project_id != input.project_id.trim() {
            update_project_timestamp(&connection, &existing.project_id)?;
        }
        self.cleanup_orphan_credential(&connection, existing.credential_id.as_deref())?;
        drop(connection);
        self.get_server(id)
    }

    fn delete_server(&self, id: &str) -> Result<(), String> {
        let server = self.get_server(id)?;
        let connection = self.connection.lock().map_err(lock_error)?;
        connection
            .execute(
                "UPDATE projects SET linked_server_id = NULL WHERE linked_server_id = ?1",
                [id],
            )
            .map_err(|error| error.to_string())?;
        connection
            .execute("DELETE FROM hosts WHERE id = ?1", [id])
            .map_err(|error| error.to_string())?;
        update_project_timestamp(&connection, &server.project_id)?;
        self.cleanup_orphan_credential(&connection, server.credential_id.as_deref())?;
        Ok(())
    }

    fn list_terminal_commands(&self) -> Result<Vec<TerminalCommandRecord>, String> {
        let connection = self.connection.lock().map_err(lock_error)?;
        let mut statement = connection
            .prepare(
                r#"
                SELECT id, name, command, created_at, updated_at
                FROM terminal_commands
                ORDER BY updated_at DESC, name COLLATE NOCASE ASC
                "#,
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], map_terminal_command_row)
            .map_err(|error| error.to_string())?;

        let mut commands = Vec::new();
        for row in rows {
            commands.push(row.map_err(|error| error.to_string())?);
        }

        Ok(commands)
    }

    fn get_terminal_command(&self, id: &str) -> Result<TerminalCommandRecord, String> {
        let connection = self.connection.lock().map_err(lock_error)?;
        connection
            .query_row(
                r#"
                SELECT id, name, command, created_at, updated_at
                FROM terminal_commands
                WHERE id = ?1
                "#,
                [id],
                map_terminal_command_row,
            )
            .map_err(|error| error.to_string())
    }

    fn create_terminal_command(
        &self,
        input: CreateTerminalCommandInput,
    ) -> Result<TerminalCommandRecord, String> {
        validate_terminal_command_input(&input)?;

        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let connection = self.connection.lock().map_err(lock_error)?;
        connection
            .execute(
                r#"
                INSERT INTO terminal_commands (id, name, command, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5)
                "#,
                params![id, input.name.trim(), input.command.trim(), now, now],
            )
            .map_err(|error| error.to_string())?;
        drop(connection);

        self.get_terminal_command(&id)
    }

    fn delete_terminal_command(&self, id: &str) -> Result<(), String> {
        let connection = self.connection.lock().map_err(lock_error)?;
        connection
            .execute("DELETE FROM terminal_commands WHERE id = ?1", [id])
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    fn prepare_server_auth(
        &self,
        connection: &Connection,
        existing: Option<&ServerRecord>,
        input: &ServerInput,
        now: &str,
    ) -> Result<(String, Option<String>, String), String> {
        let auth_kind = normalized_auth_kind(&input.auth_kind)?;

        if auth_kind == AUTH_DEFAULT {
            let device_credential_mode = if existing.is_some_and(|server| {
                server.auth_kind == AUTH_DEFAULT
                    && server.device_credential_mode == DEVICE_CREDENTIAL_MODE_DISABLED
            }) {
                DEVICE_CREDENTIAL_MODE_DISABLED.to_string()
            } else {
                DEVICE_CREDENTIAL_MODE_AUTO.to_string()
            };

            if device_credential_mode == DEVICE_CREDENTIAL_MODE_DISABLED {
                return Ok((auth_kind.to_string(), None, device_credential_mode));
            }

            let existing_credential_id = existing
                .filter(|server| server.auth_kind == AUTH_DEFAULT)
                .and_then(|server| server.credential_id.as_deref());
            let credential_id = self.sync_default_auth_credential(
                connection,
                input.name.trim(),
                input.hostname.trim(),
                input.username.trim(),
                input.port,
                existing_credential_id,
                now,
            )?;

            return Ok((auth_kind.to_string(), credential_id, device_credential_mode));
        }

        let credential_name = input.credential_name.trim();
        if credential_name.is_empty() {
            return Err("Credential name is required.".to_string());
        }

        let incoming_credential_id = input
            .credential_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);

        let existing_credential_id = existing.and_then(|server| server.credential_id.clone());
        let credential_id = incoming_credential_id
            .clone()
            .or(existing_credential_id.clone())
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let credential_secret = input.credential_secret.trim();

        let current_kind: Option<String> = connection
            .query_row(
                "SELECT kind FROM credentials WHERE id = ?1",
                [credential_id.clone()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;

        let needs_new_secret = current_kind.is_none() || current_kind.as_deref() != Some(auth_kind);
        if needs_new_secret && credential_secret.is_empty() {
            let message = if auth_kind == AUTH_PASSWORD {
                "Password is required for password authentication."
            } else {
                "SSH key path is required for SSH key authentication."
            };
            return Err(message.to_string());
        }

        if current_kind.is_some() {
            connection
                .execute(
                    "UPDATE credentials SET name = ?2, kind = ?3, updated_at = ?4 WHERE id = ?1",
                    params![credential_id, credential_name, auth_kind, now],
                )
                .map_err(|error| error.to_string())?;
        } else {
            connection
                .execute(
                    r#"
                    INSERT INTO credentials (id, name, kind, created_at, updated_at)
                    VALUES (?1, ?2, ?3, ?4, ?5)
                    "#,
                    params![credential_id, credential_name, auth_kind, now, now],
                )
                .map_err(|error| error.to_string())?;
        }

        if !credential_secret.is_empty() {
            self.store_secret_with_connection(connection, &credential_id, credential_secret)?;
        } else if current_kind.is_some() {
            self.read_secret_with_connection(connection, &credential_id)?;
        }

        Ok((
            auth_kind.to_string(),
            Some(credential_id),
            DEVICE_CREDENTIAL_MODE_AUTO.to_string(),
        ))
    }

    fn sync_missing_default_auth_credentials(&self, connection: &Connection) -> Result<(), String> {
        let mut statement = connection
            .prepare(
                r#"
                SELECT id, name, hostname, port, username
                FROM hosts
                WHERE auth_kind = ?1
                  AND device_credential_mode = ?2
                  AND (credential_id IS NULL OR credential_id = '')
                "#,
            )
            .map_err(|error| error.to_string())?;

        let rows = statement
            .query_map(params![AUTH_DEFAULT, DEVICE_CREDENTIAL_MODE_AUTO], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, u16>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|error| error.to_string())?;

        let mut servers = Vec::new();
        for row in rows {
            servers.push(row.map_err(|error| error.to_string())?);
        }
        drop(statement);

        for (server_id, name, hostname, port, username) in servers {
            let Some(credential_id) = self.sync_default_auth_credential(
                connection,
                name.trim(),
                hostname.trim(),
                username.trim(),
                port,
                None,
                &Utc::now().to_rfc3339(),
            )?
            else {
                continue;
            };

            connection
                .execute(
                    "UPDATE hosts SET credential_id = ?2 WHERE id = ?1",
                    params![server_id, credential_id],
                )
                .map_err(|error| error.to_string())?;
        }

        Ok(())
    }

    fn sync_default_auth_credential(
        &self,
        connection: &Connection,
        server_name: &str,
        hostname: &str,
        username: &str,
        port: u16,
        existing_credential_id: Option<&str>,
        now: &str,
    ) -> Result<Option<String>, String> {
        let Some(secret) = resolve_device_ssh_key_path(hostname, username, port)? else {
            return Ok(None);
        };

        let credential_id = existing_credential_id
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| Uuid::new_v4().to_string());

        let current_name: Option<String> = connection
            .query_row(
                "SELECT name FROM credentials WHERE id = ?1",
                [credential_id.clone()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;

        if current_name.is_some() {
            connection
                .execute(
                    "UPDATE credentials SET kind = ?2, updated_at = ?3 WHERE id = ?1",
                    params![credential_id, AUTH_SSH_KEY, now],
                )
                .map_err(|error| error.to_string())?;
        } else {
            connection
                .execute(
                    r#"
                    INSERT INTO credentials (id, name, kind, created_at, updated_at)
                    VALUES (?1, ?2, ?3, ?4, ?5)
                    "#,
                    params![
                        credential_id,
                        default_device_credential_name(server_name, hostname),
                        AUTH_SSH_KEY,
                        now,
                        now
                    ],
                )
                .map_err(|error| error.to_string())?;
        }

        self.store_secret_with_connection(connection, &credential_id, &secret)?;
        Ok(Some(credential_id))
    }

    fn resolve_server_secret(&self, server: &ServerRecord) -> Result<Option<String>, String> {
        let Some(credential_id) = server.credential_id.as_deref() else {
            return Ok(None);
        };

        Ok(Some(self.read_secret(credential_id)?))
    }

    fn cleanup_orphan_credential(
        &self,
        connection: &Connection,
        credential_id: Option<&str>,
    ) -> Result<(), String> {
        let Some(credential_id) = credential_id else {
            return Ok(());
        };

        let remaining: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM hosts WHERE credential_id = ?1",
                [credential_id],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;

        if remaining == 0 {
            connection
                .execute("DELETE FROM credentials WHERE id = ?1", [credential_id])
                .map_err(|error| error.to_string())?;
            self.delete_secret_with_connection(connection, credential_id)?;
        }

        Ok(())
    }

    fn read_secret(&self, credential_id: &str) -> Result<String, String> {
        let connection = self.connection.lock().map_err(lock_error)?;
        self.read_secret_with_connection(&connection, credential_id)
    }

    fn store_setting_secret_with_connection(
        &self,
        connection: &Connection,
        key: &str,
        value: &str,
    ) -> Result<(), String> {
        let encrypted = encrypt_secret(&self.secret_key, value)?;
        connection
            .execute(
                r#"
                INSERT INTO app_settings (key, value, updated_at)
                VALUES (?1, ?2, ?3)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = excluded.updated_at
                "#,
                params![key, encrypted, Utc::now().to_rfc3339()],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    fn read_setting_secret_with_connection(
        &self,
        connection: &Connection,
        key: &str,
    ) -> Result<Option<String>, String> {
        let value: Option<String> = connection
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                [key],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;

        match value.filter(|value| !value.trim().is_empty()) {
            Some(value) => decrypt_secret(&self.secret_key, &value).map(Some),
            None => Ok(None),
        }
    }

    fn delete_setting_secret_with_connection(
        &self,
        connection: &Connection,
        key: &str,
    ) -> Result<(), String> {
        connection
            .execute("DELETE FROM app_settings WHERE key = ?1", [key])
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    fn store_relay_workspace_key_backup(
        &self,
        workspace_id: &str,
        encoded_key: &str,
    ) -> Result<(), String> {
        let connection = self.connection.lock().map_err(lock_error)?;
        self.store_setting_secret_with_connection(
            &connection,
            &relay_workspace_key_setting_key(workspace_id),
            encoded_key,
        )
    }

    fn load_relay_workspace_key_backup(&self, workspace_id: &str) -> Result<Option<String>, String> {
        let connection = self.connection.lock().map_err(lock_error)?;
        self.read_setting_secret_with_connection(
            &connection,
            &relay_workspace_key_setting_key(workspace_id),
        )
    }

    fn store_relay_identity_backup(&self, device_id: &str, secret: &str) -> Result<(), String> {
        let connection = self.connection.lock().map_err(lock_error)?;
        self.store_setting_secret_with_connection(
            &connection,
            &relay_identity_setting_key(device_id),
            secret,
        )
    }

    fn load_relay_identity_backup(&self, device_id: &str) -> Result<Option<String>, String> {
        let connection = self.connection.lock().map_err(lock_error)?;
        self.read_setting_secret_with_connection(
            &connection,
            &relay_identity_setting_key(device_id),
        )
    }

    fn load_github_token(&self) -> Result<Option<String>, String> {
        let connection = self.connection.lock().map_err(lock_error)?;
        if let Some(token) =
            self.read_setting_secret_with_connection(&connection, GITHUB_TOKEN_SETTING_KEY)?
        {
            return Ok(Some(token));
        }

        match github_keyring_entry()?.get_password() {
            Ok(token) => {
                let trimmed = token.trim().to_string();
                if trimmed.is_empty() {
                    return Ok(None);
                }

                self.store_setting_secret_with_connection(
                    &connection,
                    GITHUB_TOKEN_SETTING_KEY,
                    &trimmed,
                )?;
                Ok(Some(trimmed))
            }
            Err(KeyringError::NoEntry) => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    }

    fn save_github_token(&self, token: &str) -> Result<(), String> {
        let trimmed = token.trim();
        if trimmed.is_empty() {
            return Err("GitHub token is required.".to_string());
        }

        let connection = self.connection.lock().map_err(lock_error)?;
        self.store_setting_secret_with_connection(&connection, GITHUB_TOKEN_SETTING_KEY, trimmed)?;

        if let Ok(entry) = github_keyring_entry() {
            let _ = entry.set_password(trimmed);
        }

        Ok(())
    }

    fn delete_github_token(&self) -> Result<(), String> {
        let connection = self.connection.lock().map_err(lock_error)?;
        self.delete_setting_secret_with_connection(&connection, GITHUB_TOKEN_SETTING_KEY)?;

        match github_keyring_entry()?.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }

    fn load_github_session(&self) -> Result<Option<GitHubAuthSession>, String> {
        let Some(token) = self.load_github_token()? else {
            return Ok(None);
        };

        match github_session_from_token(&token) {
            Ok(session) => Ok(Some(session)),
            Err(error) => {
                let _ = self.delete_github_token();
                Err(error)
            }
        }
    }

    fn delete_secret_with_connection(
        &self,
        connection: &Connection,
        credential_id: &str,
    ) -> Result<(), String> {
        connection
            .execute(
                "UPDATE credentials SET secret_blob = '' WHERE id = ?1",
                [credential_id],
            )
            .map_err(|error| error.to_string())?;
        self.delete_keyring_secret(credential_id)
    }

    fn store_secret_with_connection(
        &self,
        connection: &Connection,
        credential_id: &str,
        secret: &str,
    ) -> Result<(), String> {
        let encrypted = encrypt_secret(&self.secret_key, secret)?;
        connection
            .execute(
                "UPDATE credentials SET secret_blob = ?2 WHERE id = ?1",
                params![credential_id, encrypted],
            )
            .map_err(|error| error.to_string())?;

        if let Ok(entry) = keychain_entry(&self.keychain_service, credential_id) {
            let _ = entry.set_password(secret);
        }

        Ok(())
    }

    fn read_secret_with_connection(
        &self,
        connection: &Connection,
        credential_id: &str,
    ) -> Result<String, String> {
        let secret_blob: Option<String> = connection
            .query_row(
                "SELECT secret_blob FROM credentials WHERE id = ?1",
                [credential_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;

        if let Some(secret_blob) = secret_blob.filter(|value| !value.trim().is_empty()) {
            return decrypt_secret(&self.secret_key, &secret_blob);
        }

        match keychain_entry(&self.keychain_service, credential_id)?.get_password() {
            Ok(secret) => {
                self.store_secret_with_connection(connection, credential_id, &secret)?;
                Ok(secret)
            }
            Err(KeyringError::NoEntry) => Err(
                "Saved credential is missing. Edit this server and enter the SSH key path or password again."
                    .to_string(),
            ),
            Err(error) => Err(error.to_string()),
        }
    }

    fn delete_keyring_secret(&self, credential_id: &str) -> Result<(), String> {
        match keychain_entry(&self.keychain_service, credential_id)?.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }
}

#[tauri::command]
fn list_projects(state: State<'_, AppState>) -> Result<Vec<ProjectRecord>, String> {
    state.db.list_projects()
}

#[tauri::command]
fn create_project(
    state: State<'_, AppState>,
    input: ProjectInput,
) -> Result<ProjectRecord, String> {
    state.db.create_project(input)
}

#[tauri::command]
fn update_project(
    state: State<'_, AppState>,
    id: String,
    input: ProjectInput,
) -> Result<ProjectRecord, String> {
    state.db.update_project(&id, input)
}

#[tauri::command]
fn delete_project(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.delete_project(&id)
}

#[tauri::command]
fn list_servers(state: State<'_, AppState>) -> Result<Vec<ServerRecord>, String> {
    state.db.list_servers()
}

#[tauri::command]
fn create_server(state: State<'_, AppState>, input: ServerInput) -> Result<ServerRecord, String> {
    state.db.create_server(input)
}

#[tauri::command]
fn update_server(
    state: State<'_, AppState>,
    id: String,
    input: ServerInput,
) -> Result<ServerRecord, String> {
    state.db.update_server(&id, input)
}

#[tauri::command]
fn delete_server(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.delete_server(&id)
}

#[tauri::command]
fn list_keychain_items(state: State<'_, AppState>) -> Result<Vec<KeychainItemRecord>, String> {
    state.db.list_keychain_items()
}

#[tauri::command]
fn list_syncable_keychain_items(
    state: State<'_, AppState>,
) -> Result<Vec<SyncableKeychainItemRecord>, String> {
    state.db.list_syncable_keychain_items()
}

#[tauri::command]
fn create_keychain_item(
    state: State<'_, AppState>,
    input: CreateKeychainItemInput,
) -> Result<KeychainItemRecord, String> {
    state.db.create_keychain_item(input)
}

#[tauri::command]
fn get_keychain_public_key(state: State<'_, AppState>, id: String) -> Result<String, String> {
    state.db.get_keychain_public_key(&id)
}

#[tauri::command]
fn upsert_syncable_keychain_items(
    state: State<'_, AppState>,
    items: Vec<SyncableKeychainItemRecord>,
) -> Result<Vec<KeychainItemRecord>, String> {
    state.db.upsert_syncable_keychain_items(items)
}

#[tauri::command]
fn get_default_ssh_directory() -> Result<Option<String>, String> {
    Ok(default_ssh_directory()
        .filter(|path| path.exists())
        .map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
fn get_local_account_name() -> Result<Option<String>, String> {
    Ok(std::env::var("USERNAME")
        .ok()
        .or_else(|| std::env::var("USER").ok())
        .or_else(|| std::env::var("LOGNAME").ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty()))
}

#[tauri::command]
fn get_or_create_relay_device_identity(
    state: State<'_, AppState>,
    device_id: String,
) -> Result<RelayDeviceIdentityRecord, String> {
    let identity = load_or_create_relay_device_identity(&state, &device_id)?;
    Ok(RelayDeviceIdentityRecord {
        device_id: identity.device_id,
        public_keys: RelayDevicePublicKeysRecord {
            encryption_public_key: identity.encryption_public_key,
            signing_public_key: identity.signing_public_key,
            encoding: "base64".to_string(),
        },
    })
}

#[tauri::command]
fn has_relay_workspace_key(state: State<'_, AppState>, workspace_id: String) -> Result<bool, String> {
    if workspace_id.trim().is_empty() {
        return Err("Relay workspace id is required.".to_string());
    }

    Ok(load_existing_relay_workspace_key(&state, &workspace_id)?.is_some())
}

#[tauri::command]
fn wrap_relay_workspace_key_for_device(
    state: State<'_, AppState>,
    workspace_id: String,
    wrapped_by_device_id: String,
    recipient_device_id: String,
    recipient_public_key: String,
) -> Result<RelayWorkspaceKeyWrapRecord, String> {
    let _identity = load_or_create_relay_device_identity(&state, &wrapped_by_device_id)?;
    let workspace_key = load_or_create_relay_workspace_key(&state, &workspace_id)?;
    let recipient_public_bytes =
        decode_fixed_base64::<32>(&recipient_public_key, "Relay recipient public key is invalid.")?;
    let recipient_public = X25519PublicKey::from(recipient_public_bytes);

    let ephemeral_secret = X25519SecretKey::random_from_rng(OsRng);
    let ephemeral_public = X25519PublicKey::from(&ephemeral_secret);
    let shared_secret = ephemeral_secret.diffie_hellman(&recipient_public);

    let mut salt = [0_u8; 32];
    OsRng.fill_bytes(&mut salt);

    let hkdf = Hkdf::<Sha256>::new(Some(&salt), shared_secret.as_bytes());
    let mut aead_key = [0_u8; 32];
    hkdf.expand(
        b"hermes-relay-workspace-key-wrap/v1",
        &mut aead_key,
    )
    .map_err(|_| "Failed to derive relay workspace wrapping key.".to_string())?;

    let cipher =
        XChaCha20Poly1305::new_from_slice(&aead_key).map_err(|error| error.to_string())?;
    let mut nonce = [0_u8; 24];
    OsRng.fill_bytes(&mut nonce);
    let aad = relay_workspace_wrap_aad(&workspace_id, &recipient_device_id, &wrapped_by_device_id);
    let ciphertext = cipher
        .encrypt(
            XNonce::from_slice(&nonce),
            chacha20poly1305::aead::Payload {
                msg: &workspace_key,
                aad: aad.as_bytes(),
            },
        )
        .map_err(|_| "Failed to wrap relay workspace key.".to_string())?;

    Ok(RelayWorkspaceKeyWrapRecord {
        version: 1,
        algorithm: "x25519-hkdf-sha256-xchacha20poly1305".to_string(),
        recipient_device_id,
        wrapped_by_device_id,
        ephemeral_public_key: STANDARD.encode(ephemeral_public.as_bytes()),
        salt: STANDARD.encode(salt),
        nonce: STANDARD.encode(nonce),
        ciphertext: STANDARD.encode(ciphertext),
        encoding: "base64".to_string(),
        created_at: Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
fn unwrap_relay_workspace_key(
    state: State<'_, AppState>,
    workspace_id: String,
    device_id: String,
    wrap: RelayWorkspaceKeyWrapRecord,
) -> Result<bool, String> {
    let identity = load_or_create_relay_device_identity(&state, &device_id)?;

    if wrap.recipient_device_id != device_id {
        return Err("Wrapped workspace key does not belong to this device.".to_string());
    }

    let private_key = decode_fixed_base64::<32>(
        &identity.encryption_private_key,
        "Local relay encryption key is invalid.",
    )?;
    let ephemeral_public_bytes = decode_fixed_base64::<32>(
        &wrap.ephemeral_public_key,
        "Relay workspace wrap public key is invalid.",
    )?;
    let salt = decode_fixed_base64::<32>(&wrap.salt, "Relay workspace wrap salt is invalid.")?;
    let nonce = decode_fixed_base64::<24>(&wrap.nonce, "Relay workspace wrap nonce is invalid.")?;
    let ciphertext = STANDARD
        .decode(&wrap.ciphertext)
        .map_err(|error| error.to_string())?;

    let secret = X25519SecretKey::from(private_key);
    let ephemeral_public = X25519PublicKey::from(ephemeral_public_bytes);
    let shared_secret = secret.diffie_hellman(&ephemeral_public);

    let hkdf = Hkdf::<Sha256>::new(Some(&salt), shared_secret.as_bytes());
    let mut aead_key = [0_u8; 32];
    hkdf.expand(
        b"hermes-relay-workspace-key-wrap/v1",
        &mut aead_key,
    )
    .map_err(|_| "Failed to derive relay workspace unwrapping key.".to_string())?;

    let cipher =
        XChaCha20Poly1305::new_from_slice(&aead_key).map_err(|error| error.to_string())?;
    let aad = relay_workspace_wrap_aad(
        &workspace_id,
        &wrap.recipient_device_id,
        &wrap.wrapped_by_device_id,
    );
    let plaintext = cipher
        .decrypt(
            XNonce::from_slice(&nonce),
            chacha20poly1305::aead::Payload {
                msg: ciphertext.as_ref(),
                aad: aad.as_bytes(),
            },
        )
        .map_err(|_| "Failed to decrypt relay workspace key.".to_string())?;

    if plaintext.len() != 32 {
        return Err("Relay workspace key payload is invalid.".to_string());
    }

    store_relay_workspace_key(&state, &workspace_id, &STANDARD.encode(plaintext))?;
    Ok(true)
}

#[tauri::command]
fn rotate_relay_workspace_key(state: State<'_, AppState>, workspace_id: String) -> Result<bool, String> {
    if workspace_id.trim().is_empty() {
        return Err("Relay workspace id is required.".to_string());
    }

    let mut workspace_key = [0_u8; 32];
    OsRng.fill_bytes(&mut workspace_key);
    store_relay_workspace_key(&state, &workspace_id, &STANDARD.encode(workspace_key))?;
    Ok(true)
}

#[tauri::command]
fn create_relay_encrypted_event(
    state: State<'_, AppState>,
    workspace_id: String,
    device_id: String,
    event_id: String,
    sequence: u64,
    payload_json: String,
) -> Result<RelayEncryptedEventEnvelopeRecord, String> {
    let identity = load_or_create_relay_device_identity(&state, &device_id)?;
    let signing_key = load_relay_signing_key(&identity)?;
    let workspace_key = require_relay_workspace_key(&state, &workspace_id)?;
    let created_at = Utc::now().to_rfc3339();
    let aad = relay_event_aad(&workspace_id, &event_id, &device_id, sequence, &created_at);
    let (ciphertext, nonce) = encrypt_relay_payload(&workspace_key, payload_json.as_bytes(), &aad)?;
    let signature_payload = relay_event_signature_payload(
        &workspace_id,
        &event_id,
        &device_id,
        sequence,
        &ciphertext,
        &nonce,
        &aad,
        &created_at,
    );
    let signature = signing_key.sign(signature_payload.as_bytes());

    Ok(RelayEncryptedEventEnvelopeRecord {
        version: 1,
        workspace_id,
        event_id,
        author_device_id: device_id,
        sequence,
        ciphertext,
        nonce,
        aad,
        signature: STANDARD.encode(signature.to_bytes()),
        encoding: "base64".to_string(),
        created_at,
    })
}

#[tauri::command]
fn create_relay_encrypted_snapshot(
    state: State<'_, AppState>,
    workspace_id: String,
    device_id: String,
    snapshot_id: String,
    base_sequence: u64,
    payload_json: String,
) -> Result<RelayEncryptedSnapshotEnvelopeRecord, String> {
    let identity = load_or_create_relay_device_identity(&state, &device_id)?;
    let signing_key = load_relay_signing_key(&identity)?;
    let workspace_key = require_relay_workspace_key(&state, &workspace_id)?;
    let created_at = Utc::now().to_rfc3339();
    let aad = relay_snapshot_aad(
        &workspace_id,
        &snapshot_id,
        &device_id,
        base_sequence,
        &created_at,
    );
    let (ciphertext, nonce) = encrypt_relay_payload(&workspace_key, payload_json.as_bytes(), &aad)?;
    let signature_payload = relay_snapshot_signature_payload(
        &workspace_id,
        &snapshot_id,
        &device_id,
        base_sequence,
        &ciphertext,
        &nonce,
        &aad,
        &created_at,
    );
    let signature = signing_key.sign(signature_payload.as_bytes());

    Ok(RelayEncryptedSnapshotEnvelopeRecord {
        version: 1,
        workspace_id,
        snapshot_id,
        author_device_id: device_id,
        base_sequence,
        ciphertext,
        nonce,
        aad,
        signature: STANDARD.encode(signature.to_bytes()),
        encoding: "base64".to_string(),
        created_at,
    })
}

#[tauri::command]
fn decrypt_relay_encrypted_event(
    state: State<'_, AppState>,
    workspace_id: String,
    device_id: String,
    author_signing_public_key: String,
    event: RelayEncryptedEventEnvelopeRecord,
) -> Result<String, String> {
    if event.workspace_id != workspace_id {
        return Err("Relay event workspace does not match the current workspace.".to_string());
    }

    let _identity = load_or_create_relay_device_identity(&state, &device_id)?;
    let verifying_key = load_relay_verifying_key(&author_signing_public_key)?;
    let signature_payload = relay_event_signature_payload(
        &event.workspace_id,
        &event.event_id,
        &event.author_device_id,
        event.sequence,
        &event.ciphertext,
        &event.nonce,
        &event.aad,
        &event.created_at,
    );
    let signature_bytes =
        decode_fixed_base64::<64>(&event.signature, "Relay event signature is invalid.")?;
    let signature = Ed25519Signature::from_bytes(&signature_bytes);
    verifying_key
        .verify(signature_payload.as_bytes(), &signature)
        .map_err(|_| "Relay event signature verification failed.".to_string())?;

    let workspace_key = require_relay_workspace_key(&state, &workspace_id)?;
    let plaintext = decrypt_relay_payload(
        &workspace_key,
        &event.ciphertext,
        &event.nonce,
        &event.aad,
    )?;
    String::from_utf8(plaintext).map_err(|error| error.to_string())
}

#[tauri::command]
fn decrypt_relay_encrypted_snapshot(
    state: State<'_, AppState>,
    workspace_id: String,
    device_id: String,
    author_signing_public_key: String,
    snapshot: RelayEncryptedSnapshotEnvelopeRecord,
) -> Result<String, String> {
    if snapshot.workspace_id != workspace_id {
        return Err("Relay snapshot workspace does not match the current workspace.".to_string());
    }

    let _identity = load_or_create_relay_device_identity(&state, &device_id)?;
    let verifying_key = load_relay_verifying_key(&author_signing_public_key)?;
    let signature_payload = relay_snapshot_signature_payload(
        &snapshot.workspace_id,
        &snapshot.snapshot_id,
        &snapshot.author_device_id,
        snapshot.base_sequence,
        &snapshot.ciphertext,
        &snapshot.nonce,
        &snapshot.aad,
        &snapshot.created_at,
    );
    let signature_bytes = decode_fixed_base64::<64>(
        &snapshot.signature,
        "Relay snapshot signature is invalid.",
    )?;
    let signature = Ed25519Signature::from_bytes(&signature_bytes);
    verifying_key
        .verify(signature_payload.as_bytes(), &signature)
        .map_err(|_| "Relay snapshot signature verification failed.".to_string())?;

    let workspace_key = require_relay_workspace_key(&state, &workspace_id)?;
    let plaintext = decrypt_relay_payload(
        &workspace_key,
        &snapshot.ciphertext,
        &snapshot.nonce,
        &snapshot.aad,
    )?;
    String::from_utf8(plaintext).map_err(|error| error.to_string())
}

#[tauri::command]
async fn create_local_ssh_key(
    state: State<'_, AppState>,
    input: CreateLocalSshKeyInput,
) -> Result<KeychainItemRecord, String> {
    let database = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || database.create_local_ssh_key(input))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
fn update_keychain_item_name(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<KeychainItemRecord, String> {
    state.db.update_keychain_item_name(&id, &name)
}

#[tauri::command]
fn delete_keychain_item(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.delete_keychain_item(&id)
}

#[tauri::command]
fn list_tmux_sessions(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<TmuxSessionRecord>, String> {
    let server = state.db.get_server(&server_id)?;
    if server.auth_kind == AUTH_PASSWORD {
        return Ok(Vec::new());
    }

    let output = ssh_command_output(
        &state.db,
        &server,
        &["tmux", "list-sessions", "-F", "#{session_name}"],
    )?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let sessions = stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|name| TmuxSessionRecord {
            name: name.to_string(),
        })
        .collect();

    Ok(sessions)
}

#[tauri::command]
fn inspect_relay_host(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<RelayHostInspectionRecord, String> {
    let server = state.db.get_server(&server_id)?;
    if server.auth_kind == AUTH_PASSWORD {
        return Err(
            "Relay host inspection currently requires default or SSH key authentication."
                .to_string(),
        );
    }

    let script = r#"#!/bin/sh
set +e
if command -v git >/dev/null 2>&1; then echo "GIT_INSTALLED=1"; else echo "GIT_INSTALLED=0"; fi
if command -v docker >/dev/null 2>&1; then echo "DOCKER_INSTALLED=1"; else echo "DOCKER_INSTALLED=0"; fi
if command -v container >/dev/null 2>&1; then echo "APPLE_CONTAINER_INSTALLED=1"; else echo "APPLE_CONTAINER_INSTALLED=0"; fi
if command -v docker >/dev/null 2>&1; then
  if docker ps -a --filter name=^/hermes-relay$ --format '{{.Names}}' 2>/dev/null | grep -q '^hermes-relay$'; then
    echo "RELAY_INSTALLED=1"
  else
    echo "RELAY_INSTALLED=0"
  fi
  if docker ps --filter name=^/hermes-relay$ --format '{{.Names}}' 2>/dev/null | grep -q '^hermes-relay$'; then
    echo "RELAY_RUNNING=1"
    echo "__RELAY_HEALTH_JSON_BEGIN__"
    curl -fsS http://127.0.0.1:8787/health 2>/dev/null || true
    echo
    echo "__RELAY_HEALTH_JSON_END__"
  else
    echo "RELAY_RUNNING=0"
  fi
else
  echo "RELAY_INSTALLED=0"
  echo "RELAY_RUNNING=0"
fi
if command -v tailscale >/dev/null 2>&1; then
  echo "TAILSCALE_INSTALLED=1"
  echo "TAILSCALE_IPV4=$(tailscale ip -4 2>/dev/null | head -n 1)"
  echo "__TAILSCALE_JSON_BEGIN__"
  tailscale status --json 2>/dev/null || true
  echo
  echo "__TAILSCALE_JSON_END__"
else
  echo "TAILSCALE_INSTALLED=0"
  echo "TAILSCALE_IPV4="
fi
"#;

    let output = ssh_command_output_script(&state.db, &server, script, &[])?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Relay host inspection failed.".to_string()
        } else {
            stderr
        });
    }

    parse_relay_host_inspection(&server_id, &String::from_utf8_lossy(&output.stdout))
}

#[tauri::command]
fn connect_session(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    input: ConnectSessionInput,
) -> Result<TerminalTab, String> {
    let server = state.db.get_server(&input.server_id)?;
    let auth_secret = state.db.resolve_server_secret(&server)?;
    let auto_password = if server.auth_kind == AUTH_PASSWORD {
        auth_secret.clone()
    } else {
        None
    };

    let title = server_display_label(&server);
    let resolved_tmux_session = input
        .tmux_session
        .as_deref()
        .map(sanitized_tmux_session)
        .unwrap_or_else(|| sanitized_tmux_session(&server.tmux_session));
    let cwd = input
        .cwd
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    let mut command = CommandBuilder::new("ssh");
    command.arg("-tt");
    command.arg("-o");
    command.arg("ServerAliveInterval=30");
    command.arg("-o");
    command.arg("ServerAliveCountMax=3");
    apply_connect_auth(&mut command, &server, auth_secret.as_deref())?;
    command.arg(ssh_target(&server));

    if let Some(remote_command) = build_remote_session_command(
        cwd.as_deref(),
        if server.use_tmux {
            Some(resolved_tmux_session.as_str())
        } else {
            None
        },
    ) {
        command.arg(remote_command);
    }

    let log_message = format!("starting session for {} ({})", title, ssh_target(&server));

    spawn_session(
        app,
        state.inner(),
        command,
        title,
        server.id.clone(),
        cwd,
        auto_password,
        "connect_session",
        &log_message,
        None,
    )
}

#[tauri::command]
fn connect_local_session(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    input: Option<ConnectLocalSessionInput>,
) -> Result<TerminalTab, String> {
    let (command, title, cwd) = local_shell_command(input.as_ref())?;

    spawn_session(
        app,
        state.inner(),
        command,
        title,
        LOCAL_SESSION_SERVER_ID.to_string(),
        cwd,
        None,
        "connect_local_session",
        "starting local terminal session",
        Some("Opening local terminal...".to_string()),
    )
}

#[tauri::command]
async fn read_project_remote_directory(
    state: State<'_, AppState>,
    connection: ProjectRemoteConnectionInput,
    path: Option<String>,
) -> Result<FileBrowserDirectoryRecord, String> {
    let database = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        load_project_remote_directory(&database, &connection, path.as_deref())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn read_file_directory(
    state: State<'_, AppState>,
    target: FileBrowserTargetInput,
) -> Result<FileBrowserDirectoryRecord, String> {
    let database = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || load_file_directory(&database, &target))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn read_file_preview(
    state: State<'_, AppState>,
    target: FileBrowserTargetInput,
) -> Result<FilePreviewRecord, String> {
    let database = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || load_file_preview(&database, &target))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn open_file_on_device(
    state: State<'_, AppState>,
    target: FileBrowserTargetInput,
) -> Result<LocalEditableFileRecord, String> {
    let database = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || open_file_on_device_inner(&database, &target))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn open_file_with_dialog_on_device(
    state: State<'_, AppState>,
    target: FileBrowserTargetInput,
) -> Result<LocalEditableFileRecord, String> {
    let database = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        open_file_with_dialog_on_device_inner(&database, &target)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn inspect_local_editable_file(local_path: String) -> Result<LocalEditableFileStateRecord, String> {
    tauri::async_runtime::spawn_blocking(move || inspect_local_editable_file_inner(&local_path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn create_file_directory(
    state: State<'_, AppState>,
    target: FileBrowserTargetInput,
    name: String,
) -> Result<FileBrowserDirectoryRecord, String> {
    let database = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        create_file_directory_inner(&database, &target, &name)?;
        load_file_directory(&database, &target)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn delete_file_entries(
    state: State<'_, AppState>,
    targets: Vec<FileBrowserTargetInput>,
) -> Result<(), String> {
    let database = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || delete_file_entries_inner(&database, &targets))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn transfer_file_entries(
    state: State<'_, AppState>,
    sources: Vec<FileBrowserTargetInput>,
    destination: FileBrowserTargetInput,
    operation: String,
) -> Result<FileBrowserDirectoryRecord, String> {
    let database = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        transfer_file_entries_inner(&database, &sources, &destination, &operation)?;
        load_file_directory(&database, &destination)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn write_file(
    state: State<'_, AppState>,
    parent: FileBrowserTargetInput,
    name: String,
    contents_base64: String,
) -> Result<FileBrowserDirectoryRecord, String> {
    let database = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        write_file_inner(&database, &parent, &name, &contents_base64)?;
        load_file_directory(&database, &parent)
    })
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn sync_local_file_to_target(
    state: State<'_, AppState>,
    local_path: String,
    target: FileBrowserTargetInput,
) -> Result<(), String> {
    let database = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        sync_local_file_to_target_inner(&database, &local_path, &target)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn sync_local_files_to_targets(
    state: State<'_, AppState>,
    files: Vec<LocalFileSyncInput>,
) -> Result<(), String> {
    let database = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || sync_local_files_to_targets_inner(&database, &files))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
fn list_terminal_commands(
    state: State<'_, AppState>,
) -> Result<Vec<TerminalCommandRecord>, String> {
    state.db.list_terminal_commands()
}

#[tauri::command]
fn create_terminal_command(
    state: State<'_, AppState>,
    input: CreateTerminalCommandInput,
) -> Result<TerminalCommandRecord, String> {
    state.db.create_terminal_command(input)
}

#[tauri::command]
fn delete_terminal_command(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.delete_terminal_command(&id)
}

#[tauri::command]
async fn inspect_git_repository(path: String) -> Result<GitRepositoryRecord, String> {
    tauri::async_runtime::spawn_blocking(move || load_git_repository(&path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn get_git_repository_change_diff(path: String, file_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || load_git_repository_change_diff(&path, &file_path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn clone_git_repository(
    clone_url: String,
    parent_directory: String,
    directory_name: String,
) -> Result<GitRepositoryRecord, String> {
    tauri::async_runtime::spawn_blocking(move || {
        ensure_git_available()?;

        let trimmed_clone_url = clone_url.trim();
        if trimmed_clone_url.is_empty() {
            return Err("Clone URL is required.".to_string());
        }

        let trimmed_parent_directory = parent_directory.trim();
        if trimmed_parent_directory.is_empty() {
            return Err("Choose a destination folder before cloning.".to_string());
        }

        let parent = PathBuf::from(trimmed_parent_directory);
        if !parent.exists() {
            return Err(format!(
                "Clone destination was not found: {}",
                parent.display()
            ));
        }
        if !parent.is_dir() {
            return Err("Clone destination must be a directory.".to_string());
        }

        let target_name = sanitize_clone_directory_name(&directory_name);
        if target_name.is_empty() {
            return Err("Clone folder name is invalid.".to_string());
        }

        let target = parent.join(&target_name);
        if target.exists() {
            return Err(format!("Clone target already exists: {}", target.display()));
        }

        let output = git_command(&parent)
            .args(["clone", trimmed_clone_url, target_name.as_str()])
            .output()
            .map_err(|error| error.to_string())?;
        if !output.status.success() {
            return Err(command_error_message(
                &output,
                "Failed to clone the repository.",
            ));
        }

        load_git_repository_from_root(&target)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn find_local_github_checkouts(
    repository_full_name: String,
    repository_name: String,
) -> Result<Vec<GitRepositoryRecord>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        discover_local_github_checkouts(&repository_full_name, &repository_name)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn commit_git_repository(
    path: String,
    message: String,
) -> Result<GitRepositoryRecord, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = resolve_git_root(&path)?;
        let trimmed_message = message.trim();
        if trimmed_message.is_empty() {
            return Err("Commit message is required.".to_string());
        }

        let add_output = git_command_output(&root, &["add", "-A"])?;
        if !add_output.status.success() {
            return Err(command_error_message(
                &add_output,
                "Failed to stage repository changes.",
            ));
        }

        let staged_output =
            git_command_output(&root, &["diff", "--cached", "--quiet", "--exit-code"])?;
        if staged_output.status.success() {
            return Err("There are no staged changes to commit.".to_string());
        }

        let commit_output = git_command(&root)
            .args(["commit", "-m", trimmed_message])
            .output()
            .map_err(|error| error.to_string())?;
        if !commit_output.status.success() {
            return Err(command_error_message(
                &commit_output,
                "Failed to create commit.",
            ));
        }

        load_git_repository_from_root(&root)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn push_git_repository(path: String) -> Result<GitRepositoryRecord, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = resolve_git_root(&path)?;
        let repository = load_git_repository_from_root(&root)?;
        if repository.branch.starts_with("detached@") {
            return Err("Checkout a branch before publishing.".to_string());
        }

        let push_output = if repository.upstream.is_some() {
            git_command_output(&root, &["push"])?
        } else {
            let remote = repository
                .remote_name
                .clone()
                .ok_or_else(|| "No remote is configured for this repository.".to_string())?;
            git_command(&root)
                .args(["push", "-u", remote.as_str(), repository.branch.as_str()])
                .output()
                .map_err(|error| error.to_string())?
        };

        if !push_output.status.success() {
            return Err(command_error_message(
                &push_output,
                "Failed to publish the current branch.",
            ));
        }

        load_git_repository_from_root(&root)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn create_git_branch(path: String, name: String) -> Result<GitRepositoryRecord, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = resolve_git_root(&path)?;
        let trimmed_name = name.trim();
        if trimmed_name.is_empty() {
            return Err("Branch name is required.".to_string());
        }

        let validation_output = git_command(&root)
            .args(["check-ref-format", "--branch", trimmed_name])
            .output()
            .map_err(|error| error.to_string())?;
        if !validation_output.status.success() {
            return Err(command_error_message(
                &validation_output,
                "Branch name is invalid.",
            ));
        }

        let switch_output = git_command(&root)
            .args(["switch", "-c", trimmed_name])
            .output()
            .map_err(|error| error.to_string())?;
        if !switch_output.status.success() {
            return Err(command_error_message(
                &switch_output,
                "Failed to create branch.",
            ));
        }

        load_git_repository_from_root(&root)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn checkout_git_branch(path: String, name: String) -> Result<GitRepositoryRecord, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = resolve_git_root(&path)?;
        let trimmed_name = name.trim();
        if trimmed_name.is_empty() {
            return Err("Choose a branch to checkout.".to_string());
        }

        let switch_output = git_command(&root)
            .args(["switch", trimmed_name])
            .output()
            .map_err(|error| error.to_string())?;
        if !switch_output.status.success() {
            return Err(command_error_message(
                &switch_output,
                "Failed to checkout branch.",
            ));
        }

        load_git_repository_from_root(&root)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
fn get_github_session(state: State<'_, AppState>) -> Result<Option<GitHubAuthSession>, String> {
    state.db.load_github_session()
}

#[tauri::command]
fn is_github_device_flow_available() -> bool {
    resolve_github_client_id().is_some()
}

#[tauri::command]
fn start_github_device_flow(state: State<'_, AppState>) -> Result<GitHubDeviceFlowRecord, String> {
    let client_id = github_client_id()?;
    let client = github_http_client()?;
    let response = client
        .post(GITHUB_DEVICE_CODE_URL)
        .header(ACCEPT, "application/json")
        .form(&[
            ("client_id", client_id.as_str()),
            ("scope", "repo read:user user:email"),
        ])
        .send()
        .map_err(|error| error.to_string())?;

    let payload: GitHubDeviceCodeApiResponse = parse_github_json(response)?;
    let flow_state = GitHubDeviceFlowState {
        device_code: payload.device_code.clone(),
        interval_seconds: payload.interval.max(5),
        expires_at: Instant::now()
            .checked_add(Duration::from_secs(payload.expires_in))
            .unwrap_or_else(Instant::now),
    };

    let mut current_flow = state.github_device_flow.lock().map_err(lock_error)?;
    *current_flow = Some(flow_state);

    Ok(GitHubDeviceFlowRecord {
        verification_uri: payload.verification_uri,
        user_code: payload.user_code,
        expires_in: payload.expires_in,
        interval: payload.interval.max(5),
    })
}

#[tauri::command]
fn poll_github_device_flow(
    state: State<'_, AppState>,
) -> Result<Option<GitHubAuthSession>, String> {
    let flow = state
        .github_device_flow
        .lock()
        .map_err(lock_error)?
        .clone()
        .ok_or_else(|| "GitHub sign-in has not been started.".to_string())?;

    if Instant::now() >= flow.expires_at {
        let mut current_flow = state.github_device_flow.lock().map_err(lock_error)?;
        *current_flow = None;
        return Err("GitHub sign-in expired. Start it again.".to_string());
    }

    let client_id = github_client_id()?;
    let client = github_http_client()?;
    let response = client
        .post(GITHUB_OAUTH_ACCESS_TOKEN_URL)
        .header(ACCEPT, "application/json")
        .form(&[
            ("client_id", client_id.as_str()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("device_code", flow.device_code.as_str()),
        ])
        .send()
        .map_err(|error| error.to_string())?;

    let payload: GitHubAccessTokenApiResponse = parse_github_json(response)?;

    if let Some(access_token) = payload.access_token {
        state.db.save_github_token(&access_token)?;
        let session = github_session_from_token(&access_token)?;
        let mut current_flow = state.github_device_flow.lock().map_err(lock_error)?;
        *current_flow = None;
        return Ok(Some(session));
    }

    match payload.error.as_deref() {
        Some("authorization_pending") => Ok(None),
        Some("slow_down") => {
            let mut current_flow = state.github_device_flow.lock().map_err(lock_error)?;
            if let Some(active_flow) = current_flow.as_mut() {
                active_flow.interval_seconds =
                    payload.interval.unwrap_or(flow.interval_seconds + 5);
            }
            Ok(None)
        }
        Some("expired_token") => {
            let mut current_flow = state.github_device_flow.lock().map_err(lock_error)?;
            *current_flow = None;
            Err("GitHub sign-in expired. Start it again.".to_string())
        }
        Some(error) => Err(payload
            .error_description
            .unwrap_or_else(|| error.to_string())),
        None => Ok(None),
    }
}

#[tauri::command]
fn sign_in_github_with_token(
    state: State<'_, AppState>,
    token: String,
) -> Result<GitHubAuthSession, String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return Err("Enter a GitHub personal access token.".to_string());
    }

    let session = github_session_from_token(trimmed)?;
    state.db.save_github_token(trimmed)?;
    Ok(session)
}

#[tauri::command]
fn disconnect_github(state: State<'_, AppState>) -> Result<(), String> {
    state.db.delete_github_token()
}

#[tauri::command]
fn list_github_repositories(
    state: State<'_, AppState>,
) -> Result<Vec<GitHubRepositoryRecord>, String> {
    let token = state
        .db
        .load_github_token()?
        .ok_or_else(|| "Sign in to GitHub first.".to_string())?;
    let client = github_http_client()?;
    let mut repositories = Vec::new();
    let per_page = 100;

    for page in 1..=5 {
        let response = client
            .get(GITHUB_USER_REPOS_URL)
            .headers(github_api_headers(Some(&token))?)
            .query(&[
                ("per_page", per_page.to_string()),
                ("page", page.to_string()),
                ("sort", "updated".to_string()),
                ("direction", "desc".to_string()),
                ("type", "all".to_string()),
            ])
            .send()
            .map_err(|error| error.to_string())?;

        let batch: Vec<GitHubRepositoryApiResponse> = parse_github_json(response)?;
        let batch_len = batch.len();
        repositories.extend(batch.into_iter().map(map_github_repository));

        if batch_len < per_page as usize {
            break;
        }
    }

    Ok(repositories)
}

#[tauri::command]
fn search_github_repositories(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<GitHubRepositoryRecord>, String> {
    let trimmed_query = query.trim();
    if trimmed_query.is_empty() {
        return Ok(Vec::new());
    }

    let client = github_http_client()?;
    let token = state.db.load_github_token()?;
    let response = client
        .get(GITHUB_SEARCH_REPOSITORIES_URL)
        .headers(github_api_headers(token.as_deref())?)
        .query(&[
            ("q", trimmed_query),
            ("per_page", "12"),
            ("sort", "stars"),
            ("order", "desc"),
        ])
        .send()
        .map_err(|error| error.to_string())?;

    let payload: GitHubSearchRepositoriesResponse = parse_github_json(response)?;
    Ok(payload
        .items
        .into_iter()
        .map(map_github_repository)
        .collect())
}

#[tauri::command]
fn list_installed_cli_tools() -> Result<Vec<CliToolUpdateRecord>, String> {
    Ok(cli_tool_specs()
        .into_iter()
        .filter(|spec| can_execute_program(spec.current_version.program))
        .map(placeholder_cli_tool_status)
        .collect())
}

#[tauri::command]
async fn get_cli_tool_update(tool_id: String) -> Result<CliToolUpdateRecord, String> {
    let tool_id_for_task = tool_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let spec = cli_tool_spec(&tool_id_for_task)
            .ok_or_else(|| format!("Tool updater {tool_id_for_task} was not found."))?;
        Ok(cli_tool_status(spec))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn run_cli_tool_update(tool_id: String) -> Result<CliToolUpdateRecord, String> {
    let spec =
        cli_tool_spec(&tool_id).ok_or_else(|| format!("Tool updater {tool_id} was not found."))?;
    let update = spec
        .update
        .ok_or_else(|| format!("{} does not support quick updates.", spec.name))?;

    if !can_execute_program(update.program) {
        return Err(format!(
            "{} is not available on this device.",
            update.program
        ));
    }

    tauri::async_runtime::spawn_blocking(move || {
        let output = run_cli_command(update)?;
        if !output.status.success() {
            return Err(command_error_message(
                &output,
                &format!("Failed to update {}.", spec.name),
            ));
        }

        Ok(cli_tool_status(spec))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
fn write_session(
    state: State<'_, AppState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(lock_error)?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("Session {session_id} is not active."))?;
    let mut writer = session.writer.lock().map_err(lock_error)?;
    writer
        .write_all(data.as_bytes())
        .and_then(|_| writer.flush())
        .map_err(|error| {
            append_log(
                &state.log_path,
                "write_session",
                &format!("failed to write to session {session_id}: {error}"),
            );
            error.to_string()
        })
}

#[tauri::command]
fn resize_session(
    state: State<'_, AppState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(lock_error)?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("Session {session_id} is not active."))?;
    let master = session.master.lock().map_err(lock_error)?;
    master
        .resize(PtySize {
            rows: rows.max(2),
            cols: cols.max(20),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| {
            append_log(
                &state.log_path,
                "resize_session",
                &format!("failed to resize session {session_id}: {error}"),
            );
            error.to_string()
        })
}

#[tauri::command]
fn close_session(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    append_log(
        &state.log_path,
        "close_session",
        &format!("closing session {session_id}"),
    );
    let session = {
        let mut sessions = state.sessions.lock().map_err(lock_error)?;
        sessions.remove(&session_id)
    };

    let Some(session) = session else {
        return Ok(());
    };

    terminate_process(session.process_id).map_err(|error| {
        append_log(
            &state.log_path,
            "close_session",
            &format!("failed to terminate session {session_id}: {error}"),
        );
        error
    })
}

#[tauri::command]
fn list_session_statuses(state: State<'_, AppState>) -> Result<Vec<SessionStatusSnapshot>, String> {
    let sessions = state.sessions.lock().map_err(lock_error)?;
    let snapshots = sessions
        .iter()
        .map(|(session_id, session)| {
            let status = session
                .status
                .lock()
                .map(|status| status.clone())
                .unwrap_or_else(|_| "error".to_string());
            SessionStatusSnapshot {
                session_id: session_id.clone(),
                status,
            }
        })
        .collect();

    Ok(snapshots)
}

const FILE_PREVIEW_LIMIT_BYTES: usize = 64 * 1024;

fn load_file_directory(
    database: &Database,
    target: &FileBrowserTargetInput,
) -> Result<FileBrowserDirectoryRecord, String> {
    match normalized_file_target_kind(&target.kind)? {
        "local" => load_local_file_directory(target),
        "server" => load_remote_file_directory(database, target),
        _ => Err("Unsupported file target.".to_string()),
    }
}

fn load_local_file_directory(
    target: &FileBrowserTargetInput,
) -> Result<FileBrowserDirectoryRecord, String> {
    let path = target
        .path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if path.is_none() {
        let mut entries = local_drive_entries();
        sort_file_entries(&mut entries);
        return Ok(FileBrowserDirectoryRecord {
            target: FileBrowserTargetInput {
                kind: "local".to_string(),
                server_id: None,
                path: None,
            },
            title: "Local drives".to_string(),
            parent_path: None,
            entries,
            can_write: false,
        });
    }

    let directory = PathBuf::from(path.unwrap());
    if !directory.exists() {
        return Err(format!("Directory was not found: {}", directory.display()));
    }
    if !directory.is_dir() {
        return Err(format!("Path is not a directory: {}", directory.display()));
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(&directory).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
        let file_type = metadata.file_type();
        let kind = if file_type.is_dir() {
            "directory"
        } else if file_type.is_file() {
            "file"
        } else if file_type.is_symlink() {
            "symlink"
        } else {
            "other"
        };
        let modified_at = metadata
            .modified()
            .ok()
            .map(|value| chrono::DateTime::<Utc>::from(value).to_rfc3339());
        entries.push(FileBrowserEntryRecord {
            name: entry.file_name().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            kind: kind.to_string(),
            size: if file_type.is_file() {
                Some(metadata.len())
            } else {
                None
            },
            modified_at,
            hidden: is_hidden_name(&entry.file_name().to_string_lossy()),
        });
    }

    sort_file_entries(&mut entries);

    Ok(FileBrowserDirectoryRecord {
        target: FileBrowserTargetInput {
            kind: "local".to_string(),
            server_id: None,
            path: Some(directory.to_string_lossy().to_string()),
        },
        title: directory_title(&directory),
        parent_path: directory
            .parent()
            .map(|value| value.to_string_lossy().to_string()),
        entries,
        can_write: fs::metadata(&directory)
            .map(|metadata| !metadata.permissions().readonly())
            .unwrap_or(true),
    })
}

fn load_remote_file_directory(
    database: &Database,
    target: &FileBrowserTargetInput,
) -> Result<FileBrowserDirectoryRecord, String> {
    let server = file_target_server(database, target)?;
    let requested_path = target.path.clone().unwrap_or_default();
    let script = r#"target="$1"
if [ -n "$target" ]; then
  cd -- "$target" || exit 11
else
  cd -- "$HOME" || exit 11
fi
pwd
printf '\0'
find . -mindepth 1 -maxdepth 1 -printf '%P\0%y\0%s\0%T@\0' 2>/dev/null
"#;
    let output = ssh_command_output_script(database, &server, script, &[requested_path.as_str()])?;
    if !output.status.success() {
        return Err(command_error_message(
            &output,
            "Failed to load the remote directory.",
        ));
    }

    let mut tokens = output.stdout.split(|byte| *byte == 0_u8);
    let current_path = String::from_utf8_lossy(tokens.next().unwrap_or_default())
        .trim()
        .to_string();

    let mut entries = Vec::new();
    loop {
        let Some(name_bytes) = tokens.next() else {
            break;
        };
        if name_bytes.is_empty() {
            break;
        }
        let file_type = tokens.next().unwrap_or_default();
        let size_bytes = tokens.next().unwrap_or_default();
        let modified_bytes = tokens.next().unwrap_or_default();

        let name = String::from_utf8_lossy(name_bytes).to_string();
        if name.is_empty() {
            continue;
        }

        let kind = match file_type.first().copied() {
            Some(b'd') => "directory",
            Some(b'f') => "file",
            Some(b'l') => "symlink",
            _ => "other",
        };
        let full_path = join_remote_path(&current_path, &name);
        let size = if kind == "file" {
            String::from_utf8_lossy(size_bytes)
                .trim()
                .parse::<u64>()
                .ok()
        } else {
            None
        };
        let modified_at = parse_remote_epoch_timestamp(&String::from_utf8_lossy(modified_bytes));
        entries.push(FileBrowserEntryRecord {
            name: name.clone(),
            path: full_path,
            kind: kind.to_string(),
            size,
            modified_at,
            hidden: is_hidden_name(&name),
        });
    }

    sort_file_entries(&mut entries);

    Ok(FileBrowserDirectoryRecord {
        target: FileBrowserTargetInput {
            kind: "server".to_string(),
            server_id: Some(server.id.clone()),
            path: Some(current_path.clone()),
        },
        title: current_path.clone(),
        parent_path: remote_parent_path(&current_path),
        entries,
        can_write: true,
    })
}

fn load_project_remote_directory(
    database: &Database,
    connection: &ProjectRemoteConnectionInput,
    path: Option<&str>,
) -> Result<FileBrowserDirectoryRecord, String> {
    let auth_kind = normalized_auth_kind(&connection.auth_kind)?;
    if auth_kind == AUTH_PASSWORD {
        return Err(
            "Password-authenticated remote browsing is not supported yet. Choose an SSH key or system SSH."
                .to_string(),
        );
    }

    if connection.hostname.trim().is_empty() {
        return Err("Server hostname is required before browsing remote folders.".to_string());
    }

    let server = project_remote_server(connection, auth_kind);
    let auth_secret = resolve_project_remote_secret(database, connection, auth_kind)?;
    let requested_path = path.unwrap_or_default().trim().to_string();
    let script = r#"target="$1"
if [ -n "$target" ]; then
  cd -- "$target" || exit 11
else
  cd -- "$HOME" || exit 11
fi
pwd
printf '\0'
find . -mindepth 1 -maxdepth 1 -printf '%P\0%y\0%s\0%T@\0' 2>/dev/null
"#;
    let output = ssh_command_output_script_with_auth(
        &server,
        auth_secret.as_deref(),
        script,
        &[requested_path.as_str()],
    )?;
    if !output.status.success() {
        return Err(command_error_message(
            &output,
            "Failed to load the remote directory.",
        ));
    }

    let mut tokens = output.stdout.split(|byte| *byte == 0_u8);
    let current_path = String::from_utf8_lossy(tokens.next().unwrap_or_default())
        .trim()
        .to_string();

    let mut entries = Vec::new();
    loop {
        let Some(name_bytes) = tokens.next() else {
            break;
        };
        if name_bytes.is_empty() {
            break;
        }
        let file_type = tokens.next().unwrap_or_default();
        let size_bytes = tokens.next().unwrap_or_default();
        let modified_bytes = tokens.next().unwrap_or_default();

        let name = String::from_utf8_lossy(name_bytes).to_string();
        if name.is_empty() {
            continue;
        }

        let kind = match file_type.first().copied() {
            Some(b'd') => "directory",
            Some(b'f') => "file",
            Some(b'l') => "symlink",
            _ => "other",
        };
        let full_path = join_remote_path(&current_path, &name);
        let size = if kind == "file" {
            String::from_utf8_lossy(size_bytes)
                .trim()
                .parse::<u64>()
                .ok()
        } else {
            None
        };
        let modified_at = parse_remote_epoch_timestamp(&String::from_utf8_lossy(modified_bytes));
        entries.push(FileBrowserEntryRecord {
            name: name.clone(),
            path: full_path,
            kind: kind.to_string(),
            size,
            modified_at,
            hidden: is_hidden_name(&name),
        });
    }

    sort_file_entries(&mut entries);

    Ok(FileBrowserDirectoryRecord {
        target: FileBrowserTargetInput {
            kind: "server".to_string(),
            server_id: None,
            path: Some(current_path.clone()),
        },
        title: current_path.clone(),
        parent_path: remote_parent_path(&current_path),
        entries,
        can_write: true,
    })
}

fn load_file_preview(
    database: &Database,
    target: &FileBrowserTargetInput,
) -> Result<FilePreviewRecord, String> {
    match normalized_file_target_kind(&target.kind)? {
        "local" => load_local_file_preview(target),
        "server" => load_remote_file_preview(database, target),
        _ => Err("Unsupported file target.".to_string()),
    }
}

fn open_file_on_device_inner(
    database: &Database,
    target: &FileBrowserTargetInput,
) -> Result<LocalEditableFileRecord, String> {
    let editable = materialize_local_editable_file(database, target)?;
    open_path_on_device(Path::new(&editable.local_path))?;
    Ok(editable)
}

fn open_file_with_dialog_on_device_inner(
    database: &Database,
    target: &FileBrowserTargetInput,
) -> Result<LocalEditableFileRecord, String> {
    let editable = materialize_local_editable_file(database, target)?;
    open_path_with_dialog_on_device(Path::new(&editable.local_path))?;
    Ok(editable)
}

fn materialize_local_editable_file(
    database: &Database,
    target: &FileBrowserTargetInput,
) -> Result<LocalEditableFileRecord, String> {
    match normalized_file_target_kind(&target.kind)? {
        "local" => {
            let path = PathBuf::from(required_file_path(target)?);
            let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
            if !metadata.is_file() {
                return Err("Choose a file to open.".to_string());
            }
            let signature = local_file_signature_from_metadata(&path, &metadata);

            Ok(LocalEditableFileRecord {
                target: target.clone(),
                local_path: path.to_string_lossy().to_string(),
                file_name: path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or_default()
                    .to_string(),
                temporary: false,
                size: signature.size,
                modified_at_ms: signature.modified_at_ms,
            })
        }
        "server" => {
            let server = file_target_server(database, target)?;
            let remote_path = required_file_path(target)?;
            let local_path = download_remote_file_to_temp(database, &server, &remote_path)?;
            let metadata = fs::metadata(&local_path).map_err(|error| error.to_string())?;
            let signature = local_file_signature_from_metadata(&local_path, &metadata);

            Ok(LocalEditableFileRecord {
                target: FileBrowserTargetInput {
                    kind: "server".to_string(),
                    server_id: Some(server.id.clone()),
                    path: Some(remote_path.clone()),
                },
                local_path: local_path.to_string_lossy().to_string(),
                file_name: file_name_from_path(&remote_path),
                temporary: true,
                size: signature.size,
                modified_at_ms: signature.modified_at_ms,
            })
        }
        _ => Err("Unsupported file target.".to_string()),
    }
}

fn inspect_local_editable_file_inner(local_path: &str) -> Result<LocalEditableFileStateRecord, String> {
    let path = PathBuf::from(local_path.trim());
    match fs::metadata(&path) {
        Ok(metadata) => {
            let signature = local_file_signature_from_metadata(&path, &metadata);
            Ok(LocalEditableFileStateRecord {
                local_path: path.to_string_lossy().to_string(),
                exists: metadata.is_file(),
                size: signature.size,
                modified_at_ms: signature.modified_at_ms,
            })
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(LocalEditableFileStateRecord {
            local_path: path.to_string_lossy().to_string(),
            exists: false,
            size: None,
            modified_at_ms: None,
        }),
        Err(error) => Err(error.to_string()),
    }
}

fn local_file_signature_from_metadata(path: &Path, metadata: &fs::Metadata) -> LocalEditableFileStateRecord {
    let modified_at_ms = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|value| value.as_millis() as u64);

    LocalEditableFileStateRecord {
        local_path: path.to_string_lossy().to_string(),
        exists: metadata.is_file(),
        size: Some(metadata.len()),
        modified_at_ms,
    }
}

fn load_local_file_preview(target: &FileBrowserTargetInput) -> Result<FilePreviewRecord, String> {
    let path = required_file_path(target)?;
    let absolute_path = PathBuf::from(&path);
    let metadata = fs::metadata(&absolute_path).map_err(|error| error.to_string())?;
    if !metadata.is_file() {
        return Err("Choose a file to preview.".to_string());
    }

    let file = fs::File::open(&absolute_path).map_err(|error| error.to_string())?;
    let mut bytes = Vec::new();
    file.take((FILE_PREVIEW_LIMIT_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;

    let truncated =
        bytes.len() > FILE_PREVIEW_LIMIT_BYTES || metadata.len() > FILE_PREVIEW_LIMIT_BYTES as u64;
    if bytes.len() > FILE_PREVIEW_LIMIT_BYTES {
        bytes.truncate(FILE_PREVIEW_LIMIT_BYTES);
    }

    Ok(build_file_preview(
        target.clone(),
        absolute_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or(&path)
            .to_string(),
        Some(metadata.len()),
        bytes,
        truncated,
    ))
}

fn load_remote_file_preview(
    database: &Database,
    target: &FileBrowserTargetInput,
) -> Result<FilePreviewRecord, String> {
    let server = file_target_server(database, target)?;
    let path = required_file_path(target)?;
    let script = format!(
        "path=\"$1\"\nif [ -z \"$path\" ] || [ ! -f \"$path\" ]; then\n  exit 12\nfi\nwc -c < \"$path\" | tr -d ' \\n'\nprintf '\\0'\nhead -c {FILE_PREVIEW_LIMIT_BYTES} \"$path\"\n"
    );
    let output = ssh_command_output_script(database, &server, &script, &[path.as_str()])?;
    if !output.status.success() {
        return Err(command_error_message(
            &output,
            "Failed to load the remote file preview.",
        ));
    }

    let Some(separator) = output.stdout.iter().position(|byte| *byte == 0_u8) else {
        return Err("Remote file preview was malformed.".to_string());
    };
    let size = String::from_utf8_lossy(&output.stdout[..separator])
        .trim()
        .parse::<u64>()
        .ok();
    let bytes = output.stdout[(separator + 1)..].to_vec();
    let truncated = size.is_some_and(|value| value > bytes.len() as u64);

    Ok(build_file_preview(
        FileBrowserTargetInput {
            kind: "server".to_string(),
            server_id: Some(server.id.clone()),
            path: Some(path.clone()),
        },
        file_name_from_path(&path),
        size,
        bytes,
        truncated,
    ))
}

fn create_file_directory_inner(
    database: &Database,
    target: &FileBrowserTargetInput,
    name: &str,
) -> Result<(), String> {
    let sanitized_name = sanitize_file_name(name)?;
    match normalized_file_target_kind(&target.kind)? {
        "local" => {
            let parent = required_directory_path(target)?;
            fs::create_dir(parent.join(sanitized_name)).map_err(|error| error.to_string())
        }
        "server" => {
            let server = file_target_server(database, target)?;
            let path = target.path.clone().unwrap_or_default();
            let script = r#"parent="$1"
name="$2"
if [ -n "$parent" ]; then
  cd -- "$parent" || exit 11
else
  cd -- "$HOME" || exit 11
fi
mkdir -- "$name"
"#;
            let output = ssh_command_output_script(
                database,
                &server,
                script,
                &[path.as_str(), sanitized_name.as_str()],
            )?;
            if output.status.success() {
                Ok(())
            } else {
                Err(command_error_message(
                    &output,
                    "Failed to create the remote folder.",
                ))
            }
        }
        _ => Err("Unsupported file target.".to_string()),
    }
}

fn delete_file_entries_inner(
    database: &Database,
    targets: &[FileBrowserTargetInput],
) -> Result<(), String> {
    if targets.is_empty() {
        return Ok(());
    }

    for target in targets {
        match normalized_file_target_kind(&target.kind)? {
            "local" => {
                let path = PathBuf::from(required_file_path(target)?);
                if path.is_dir() {
                    fs::remove_dir_all(&path).map_err(|error| error.to_string())?;
                } else if path.exists() {
                    fs::remove_file(&path).map_err(|error| error.to_string())?;
                }
            }
            "server" => {
                let server = file_target_server(database, target)?;
                let path = required_file_path(target)?;
                let script = r#"for path in "$@"; do
  rm -rf -- "$path" || exit 13
done
"#;
                let output =
                    ssh_command_output_script(database, &server, script, &[path.as_str()])?;
                if !output.status.success() {
                    return Err(command_error_message(
                        &output,
                        "Failed to delete the remote item.",
                    ));
                }
            }
            _ => return Err("Unsupported file target.".to_string()),
        }
    }

    Ok(())
}

fn transfer_file_entries_inner(
    database: &Database,
    sources: &[FileBrowserTargetInput],
    destination: &FileBrowserTargetInput,
    operation: &str,
) -> Result<(), String> {
    if sources.is_empty() {
        return Ok(());
    }

    let move_requested = normalized_file_transfer_operation(operation)? == "move";
    let destination_kind = normalized_file_target_kind(&destination.kind)?;

    let all_local = sources
        .iter()
        .all(|source| normalized_file_target_kind(&source.kind) == Ok("local"));
    let all_remote = sources
        .iter()
        .all(|source| normalized_file_target_kind(&source.kind) == Ok("server"));

    match (all_local, all_remote, destination_kind) {
        (true, false, "local") => transfer_local_to_local(sources, destination, move_requested),
        (true, false, "server") => {
            transfer_local_to_remote(database, sources, destination, move_requested)
        }
        (false, true, "local") => {
            transfer_remote_to_local(database, sources, destination, move_requested)
        }
        (false, true, "server") => {
            transfer_remote_to_remote(database, sources, destination, move_requested)
        }
        _ => Err("Mixed file sources are not supported in one paste action.".to_string()),
    }
}

fn write_file_inner(
    database: &Database,
    parent: &FileBrowserTargetInput,
    name: &str,
    contents_base64: &str,
) -> Result<(), String> {
    let file_name = sanitize_file_name(name)?;
    let contents = STANDARD
        .decode(contents_base64)
        .map_err(|error| error.to_string())?;

    match normalized_file_target_kind(&parent.kind)? {
        "local" => {
            let directory = required_directory_path(parent)?;
            fs::write(directory.join(file_name), contents).map_err(|error| error.to_string())
        }
        "server" => {
            let server = file_target_server(database, parent)?;
            let parent_path = parent
                .path
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(".");
            let remote_path = if parent_path == "." {
                file_name.clone()
            } else {
                join_remote_path(parent_path, &file_name)
            };

            let temporary_path =
                std::env::temp_dir().join(format!("hermes-upload-{}", Uuid::new_v4()));
            fs::write(&temporary_path, contents).map_err(|error| error.to_string())?;
            let transfer_result = (|| {
                let mut command = scp_command(database, &server)?;
                command.arg(temporary_path.as_os_str());
                command.arg(build_scp_remote_spec(&server, &remote_path));
                let output = command.output().map_err(|error| error.to_string())?;
                if output.status.success() {
                    Ok(())
                } else {
                    Err(command_error_message(&output, "Failed to upload the file."))
                }
            })();
            let _ = fs::remove_file(&temporary_path);
            transfer_result
        }
        _ => Err("Unsupported file target.".to_string()),
    }
}

fn sync_local_file_to_target_inner(
    database: &Database,
    local_path: &str,
    target: &FileBrowserTargetInput,
) -> Result<(), String> {
    let source = validated_local_upload_source(local_path)?;

    match normalized_file_target_kind(&target.kind)? {
        "local" => {
            let destination = PathBuf::from(required_file_path(target)?);
            if source != destination {
                fs::copy(&source, &destination).map_err(|error| error.to_string())?;
            }
            Ok(())
        }
        "server" => {
            let server = file_target_server(database, target)?;
            let remote_path = required_file_path(target)?;
            let mut command = scp_command(database, &server)?;
            command.arg(&source);
            command.arg(build_scp_remote_spec(&server, &remote_path));
            let output = command.output().map_err(|error| error.to_string())?;
            if output.status.success() {
                Ok(())
            } else {
                Err(command_error_message(
                    &output,
                    "Failed to upload the edited file.",
                ))
            }
        }
        _ => Err("Unsupported file target.".to_string()),
    }
}

struct RemoteUploadBatch {
    server: ServerRecord,
    parent_path: String,
    files: Vec<RemoteUploadBatchFile>,
}

struct RemoteUploadBatchFile {
    source: PathBuf,
    remote_path: String,
}

fn sync_local_files_to_targets_inner(
    database: &Database,
    files: &[LocalFileSyncInput],
) -> Result<(), String> {
    if files.is_empty() {
        return Ok(());
    }

    if let Some(batch) = build_remote_upload_batch(database, files)? {
        return upload_local_file_batch_to_remote_directory(database, &batch);
    }

    for file in files {
        sync_local_file_to_target_inner(database, &file.local_path, &file.target)?;
    }

    Ok(())
}

fn build_remote_upload_batch(
    database: &Database,
    files: &[LocalFileSyncInput],
) -> Result<Option<RemoteUploadBatch>, String> {
    if files.len() < 2 {
        return Ok(None);
    }

    let first = &files[0];
    if normalized_file_target_kind(&first.target.kind)? != "server" {
        return Ok(None);
    }

    let first_server = file_target_server(database, &first.target)?;
    let first_remote_path = required_file_path(&first.target)?;
    let first_parent_path = remote_parent_path(&first_remote_path).unwrap_or_else(|| ".".to_string());
    let mut batch_files = vec![RemoteUploadBatchFile {
        source: validated_local_upload_source(&first.local_path)?,
        remote_path: first_remote_path,
    }];

    for file in &files[1..] {
        if normalized_file_target_kind(&file.target.kind)? != "server" {
            return Ok(None);
        }

        let server = file_target_server(database, &file.target)?;
        if server.id != first_server.id {
            return Ok(None);
        }

        let remote_path = required_file_path(&file.target)?;
        let parent_path = remote_parent_path(&remote_path).unwrap_or_else(|| ".".to_string());
        if parent_path != first_parent_path {
            return Ok(None);
        }

        batch_files.push(RemoteUploadBatchFile {
            source: validated_local_upload_source(&file.local_path)?,
            remote_path,
        });
    }

    Ok(Some(RemoteUploadBatch {
        server: first_server,
        parent_path: first_parent_path,
        files: batch_files,
    }))
}

fn upload_local_file_batch_to_remote_directory(
    database: &Database,
    batch: &RemoteUploadBatch,
) -> Result<(), String> {
    let staging_directory = std::env::temp_dir()
        .join("hermes")
        .join("upload-staging")
        .join(Uuid::new_v4().to_string());
    fs::create_dir_all(&staging_directory).map_err(|error| error.to_string())?;

    let transfer_result = (|| {
        let mut staged_paths = Vec::with_capacity(batch.files.len());
        let mut staged_names = HashSet::with_capacity(batch.files.len());

        for file in &batch.files {
            let file_name = file_name_from_path(&file.remote_path);
            if file_name.trim().is_empty() {
                return Err("Choose a local file to upload.".to_string());
            }
            if !staged_names.insert(file_name.clone()) {
                return Err(format!(
                    "Cannot batch upload duplicate file names to {}.",
                    batch.parent_path
                ));
            }

            let staged_path = staging_directory.join(&file_name);
            if fs::hard_link(&file.source, &staged_path).is_err() {
                fs::copy(&file.source, &staged_path).map_err(|error| error.to_string())?;
            }
            staged_paths.push(staged_path);
        }

        let mut command = scp_command(database, &batch.server)?;
        for staged_path in &staged_paths {
            command.arg(staged_path);
        }
        command.arg(build_scp_remote_spec(&batch.server, &batch.parent_path));

        let output = command.output().map_err(|error| error.to_string())?;
        if output.status.success() {
            Ok(())
        } else {
            Err(command_error_message(
                &output,
                "Failed to upload the edited files.",
            ))
        }
    })();

    let _ = fs::remove_dir_all(&staging_directory);
    transfer_result
}

fn validated_local_upload_source(local_path: &str) -> Result<PathBuf, String> {
    let source = PathBuf::from(local_path.trim());
    let metadata = fs::metadata(&source).map_err(|error| error.to_string())?;
    if !metadata.is_file() {
        return Err("Choose a local file to upload.".to_string());
    }
    Ok(source)
}

fn download_remote_file_to_temp(
    database: &Database,
    server: &ServerRecord,
    remote_path: &str,
) -> Result<PathBuf, String> {
    let file_name = file_name_from_path(remote_path);
    let directory = std::env::temp_dir().join("hermes").join("opened-files");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let local_path = directory.join(format!("{}-{}", Uuid::new_v4(), file_name));
    let mut command = scp_command(database, server)?;
    command.arg(build_scp_remote_spec(server, remote_path));
    command.arg(&local_path);
    let output = command.output().map_err(|error| error.to_string())?;
    if output.status.success() {
        Ok(local_path)
    } else {
        Err(command_error_message(
            &output,
            "Failed to download the remote file.",
        ))
    }
}

fn open_path_on_device(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let status = Command::new("cmd")
            .args(["/C", "start", "", &path.to_string_lossy()])
            .status()
            .map_err(|error| error.to_string())?;
        if status.success() {
            return Ok(());
        }
        return Err("Failed to open the file on this device.".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .arg(path)
            .status()
            .map_err(|error| error.to_string())?;
        if status.success() {
            return Ok(());
        }
        return Err("Failed to open the file on this device.".to_string());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let status = Command::new("xdg-open")
            .arg(path)
            .status()
            .map_err(|error| error.to_string())?;
        if status.success() {
            return Ok(());
        }
        return Err("Failed to open the file on this device.".to_string());
    }
}

fn open_path_with_dialog_on_device(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let status = Command::new("rundll32.exe")
            .arg("shell32.dll,OpenAs_RunDLL")
            .arg(path)
            .status()
            .map_err(|error| error.to_string())?;
        if status.success() {
            return Ok(());
        }
        return Err("Failed to show the native Open with dialog.".to_string());
    }

    #[cfg(not(target_os = "windows"))]
    {
        open_path_on_device(path)
    }
}

fn transfer_local_to_local(
    sources: &[FileBrowserTargetInput],
    destination: &FileBrowserTargetInput,
    move_requested: bool,
) -> Result<(), String> {
    let destination_directory = required_directory_path(destination)?;
    ensure_directory_exists(&destination_directory)?;

    for source in sources {
        let source_path = PathBuf::from(required_file_path(source)?);
        copy_or_move_local_path(&source_path, &destination_directory, move_requested)?;
    }

    Ok(())
}

fn transfer_local_to_remote(
    database: &Database,
    sources: &[FileBrowserTargetInput],
    destination: &FileBrowserTargetInput,
    move_requested: bool,
) -> Result<(), String> {
    let server = file_target_server(database, destination)?;
    let destination_path = destination
        .path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(".");
    let mut command = scp_command(database, &server)?;
    command.arg("-r");
    for source in sources {
        command.arg(required_file_path(source)?);
    }
    command.arg(build_scp_remote_spec(&server, destination_path));

    let output = command.output().map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(command_error_message(
            &output,
            "Failed to copy files to the remote server.",
        ));
    }

    if move_requested {
        delete_file_entries_inner(database, sources)?;
    }

    Ok(())
}

fn transfer_remote_to_local(
    database: &Database,
    sources: &[FileBrowserTargetInput],
    destination: &FileBrowserTargetInput,
    move_requested: bool,
) -> Result<(), String> {
    let destination_directory = required_directory_path(destination)?;
    ensure_directory_exists(&destination_directory)?;

    let first_server = file_target_server(database, &sources[0])?;
    if sources
        .iter()
        .any(|source| source.server_id.as_deref() != Some(first_server.id.as_str()))
    {
        return Err("Paste from multiple servers is not supported.".to_string());
    }

    let mut command = scp_command(database, &first_server)?;
    command.arg("-r");
    for source in sources {
        command.arg(build_scp_remote_spec(
            &first_server,
            &required_file_path(source)?,
        ));
    }
    command.arg(destination_directory);

    let output = command.output().map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(command_error_message(
            &output,
            "Failed to copy files from the remote server.",
        ));
    }

    if move_requested {
        delete_file_entries_inner(database, sources)?;
    }

    Ok(())
}

fn transfer_remote_to_remote(
    database: &Database,
    sources: &[FileBrowserTargetInput],
    destination: &FileBrowserTargetInput,
    move_requested: bool,
) -> Result<(), String> {
    let destination_server = file_target_server(database, destination)?;
    if sources
        .iter()
        .any(|source| source.server_id.as_deref() != Some(destination_server.id.as_str()))
    {
        return Err("Drag and drop between different servers is not supported yet.".to_string());
    }

    let destination_path = destination
        .path
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| ".".to_string());
    let action = if move_requested { "mv" } else { "cp -R" };
    let script = format!(
        "dest=\"$1\"\nshift\nif [ ! -d \"$dest\" ]; then\n  exit 21\nfi\nfor source in \"$@\"; do\n  {action} -- \"$source\" \"$dest\"/ || exit 20\ndone\n"
    );
    let mut args = vec![destination_path];
    for source in sources {
        args.push(required_file_path(source)?);
    }
    let borrowed = args.iter().map(|value| value.as_str()).collect::<Vec<_>>();
    let output = ssh_command_output_script(database, &destination_server, &script, &borrowed)?;
    if !output.status.success() {
        return Err(command_error_message(
            &output,
            "Failed to transfer the remote files.",
        ));
    }

    Ok(())
}

fn copy_or_move_local_path(
    source: &Path,
    destination_directory: &Path,
    move_requested: bool,
) -> Result<(), String> {
    let name = source
        .file_name()
        .ok_or_else(|| format!("Path has no file name: {}", source.display()))?;
    let destination_path = destination_directory.join(name);

    if destination_path == source {
        return Ok(());
    }
    if destination_path.starts_with(source) {
        return Err("Cannot paste a folder into itself.".to_string());
    }
    if destination_path.exists() {
        return Err(format!(
            "Destination already exists: {}",
            destination_path.display()
        ));
    }

    if move_requested {
        match fs::rename(source, &destination_path) {
            Ok(()) => return Ok(()),
            Err(_) => {
                copy_path_recursive(source, &destination_path)?;
                remove_local_path(source)?;
                return Ok(());
            }
        }
    }

    copy_path_recursive(source, &destination_path)
}

fn copy_path_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(source).map_err(|error| error.to_string())?;
    if metadata.file_type().is_dir() {
        fs::create_dir(destination).map_err(|error| error.to_string())?;
        for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            copy_path_recursive(&entry.path(), &destination.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(source, destination)
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
}

fn remove_local_path(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if metadata.file_type().is_dir() {
        fs::remove_dir_all(path).map_err(|error| error.to_string())
    } else {
        fs::remove_file(path).map_err(|error| error.to_string())
    }
}

fn ensure_directory_exists(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("Directory was not found: {}", path.display()));
    }
    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }
    Ok(())
}

fn build_file_preview(
    target: FileBrowserTargetInput,
    name: String,
    size: Option<u64>,
    bytes: Vec<u8>,
    truncated: bool,
) -> FilePreviewRecord {
    if let Ok(text) = String::from_utf8(bytes.clone()) {
        FilePreviewRecord {
            target,
            name,
            size,
            encoding: "text".to_string(),
            content: text,
            binary: false,
            truncated,
        }
    } else {
        FilePreviewRecord {
            target,
            name,
            size,
            encoding: "base64".to_string(),
            content: STANDARD.encode(bytes),
            binary: true,
            truncated,
        }
    }
}

fn local_drive_entries() -> Vec<FileBrowserEntryRecord> {
    #[cfg(target_os = "windows")]
    {
        let mut entries = Vec::new();
        for letter in b'A'..=b'Z' {
            let path = format!("{}:\\", letter as char);
            let candidate = PathBuf::from(&path);
            if candidate.exists() {
                entries.push(FileBrowserEntryRecord {
                    name: path.clone(),
                    path,
                    kind: "directory".to_string(),
                    size: None,
                    modified_at: None,
                    hidden: false,
                });
            }
        }
        entries
    }

    #[cfg(not(target_os = "windows"))]
    {
        vec![FileBrowserEntryRecord {
            name: "/".to_string(),
            path: "/".to_string(),
            kind: "directory".to_string(),
            size: None,
            modified_at: None,
            hidden: false,
        }]
    }
}

fn sort_file_entries(entries: &mut [FileBrowserEntryRecord]) {
    entries.sort_by(|left, right| {
        if left.kind == right.kind {
            left.name
                .to_ascii_lowercase()
                .cmp(&right.name.to_ascii_lowercase())
        } else if left.kind == "directory" {
            std::cmp::Ordering::Less
        } else if right.kind == "directory" {
            std::cmp::Ordering::Greater
        } else {
            left.name
                .to_ascii_lowercase()
                .cmp(&right.name.to_ascii_lowercase())
        }
    });
}

fn normalized_file_target_kind(value: &str) -> Result<&'static str, String> {
    match value.trim() {
        "local" => Ok("local"),
        "server" => Ok("server"),
        _ => Err("Unsupported file target.".to_string()),
    }
}

fn normalized_file_transfer_operation(value: &str) -> Result<&'static str, String> {
    match value.trim() {
        "copy" => Ok("copy"),
        "move" => Ok("move"),
        _ => Err("Unsupported file transfer operation.".to_string()),
    }
}

fn file_target_server(
    database: &Database,
    target: &FileBrowserTargetInput,
) -> Result<ServerRecord, String> {
    let server_id = target
        .server_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Choose a saved server first.".to_string())?;
    database.get_server(server_id)
}

fn required_file_path(target: &FileBrowserTargetInput) -> Result<String, String> {
    target
        .path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .ok_or_else(|| "Choose a file or folder first.".to_string())
}

fn required_directory_path(target: &FileBrowserTargetInput) -> Result<PathBuf, String> {
    let path = required_file_path(target)?;
    Ok(PathBuf::from(path))
}

fn sanitize_file_name(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("A file or folder name is required.".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed == "." || trimmed == ".." {
        return Err("Names cannot include path separators.".to_string());
    }
    Ok(trimmed.to_string())
}

fn is_hidden_name(name: &str) -> bool {
    name.starts_with('.')
}

fn directory_title(path: &Path) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

fn file_name_from_path(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(path)
        .to_string()
}

fn remote_parent_path(path: &str) -> Option<String> {
    if path == "/" {
        return None;
    }

    let trimmed = path.trim_end_matches('/');
    if trimmed.is_empty() {
        return Some("/".to_string());
    }

    match trimmed.rfind('/') {
        Some(0) => Some("/".to_string()),
        Some(index) => Some(trimmed[..index].to_string()),
        None => None,
    }
}

fn join_remote_path(parent: &str, name: &str) -> String {
    if parent == "/" {
        format!("/{name}")
    } else {
        format!("{}/{}", parent.trim_end_matches('/'), name)
    }
}

fn parse_remote_epoch_timestamp(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut parts = trimmed.split('.');
    let seconds = parts.next()?.parse::<i64>().ok()?;
    let nanos = parts
        .next()
        .map(|fraction| {
            let padded = format!("{:0<9}", &fraction[..fraction.len().min(9)]);
            padded.parse::<u32>().ok()
        })
        .flatten()
        .unwrap_or(0);

    Utc.timestamp_opt(seconds, nanos)
        .single()
        .map(|value| value.to_rfc3339())
}

fn ssh_command_output_script(
    database: &Database,
    server: &ServerRecord,
    script: &str,
    args: &[&str],
) -> Result<std::process::Output, String> {
    let auth_secret = database.resolve_server_secret(server)?;
    ssh_command_output_script_with_auth(server, auth_secret.as_deref(), script, args)
}

fn ssh_command_output_script_with_auth(
    server: &ServerRecord,
    auth_secret: Option<&str>,
    script: &str,
    args: &[&str],
) -> Result<std::process::Output, String> {
    let mut command =
        Command::new(resolve_program_path("ssh").unwrap_or_else(|| PathBuf::from("ssh")));
    command.arg("-o").arg("BatchMode=yes");
    command.arg("-o").arg("ConnectTimeout=5");
    apply_shell_auth(&mut command, server, auth_secret)?;
    command.arg(ssh_target(server));
    command.arg(build_remote_script_command(args));
    command.stdin(Stdio::piped());
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|error| error.to_string())?;
    {
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Failed to open SSH stdin.".to_string())?;
        stdin
            .write_all(script.as_bytes())
            .and_then(|_| stdin.flush())
            .map_err(|error| error.to_string())?;
    }
    child.wait_with_output().map_err(|error| error.to_string())
}

fn scp_command(database: &Database, server: &ServerRecord) -> Result<Command, String> {
    let auth_secret = database.resolve_server_secret(server)?;
    let mut command =
        Command::new(resolve_program_path("scp").unwrap_or_else(|| PathBuf::from("scp")));
    command.arg("-C");
    if server.port != 22 {
        command.arg("-P").arg(server.port.to_string());
    }
    match server.auth_kind.as_str() {
        AUTH_SSH_KEY => {
            let secret =
                auth_secret.ok_or_else(|| "Stored SSH key was not found.".to_string())?;
            let expanded = materialize_ssh_key_secret(&secret)?;
            if !expanded.exists() {
                return Err(format!(
                    "SSH key path was not found: {}",
                    expanded.display()
                ));
            }
            command.arg("-i").arg(expanded);
        }
        AUTH_PASSWORD => {
            return Err(
                "Password-authenticated servers are not supported in the file browser yet."
                    .to_string(),
            );
        }
        _ => {}
    }
    Ok(command)
}

fn project_remote_server(
    connection: &ProjectRemoteConnectionInput,
    auth_kind: &str,
) -> ServerRecord {
    ServerRecord {
        id: "project-remote".to_string(),
        project_id: String::new(),
        name: connection.hostname.trim().to_string(),
        hostname: connection.hostname.trim().to_string(),
        port: connection.port,
        username: connection.username.trim().to_string(),
        path: String::new(),
        auth_kind: auth_kind.to_string(),
        credential_id: connection
            .credential_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        credential_name: connection
            .credential_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|_| connection.credential_name.trim().to_string()),
        device_credential_mode: DEVICE_CREDENTIAL_MODE_AUTO.to_string(),
        is_favorite: false,
        tmux_session: "main".to_string(),
        use_tmux: false,
        notes: String::new(),
        created_at: String::new(),
        updated_at: String::new(),
    }
}

fn resolve_project_remote_secret(
    database: &Database,
    connection: &ProjectRemoteConnectionInput,
    auth_kind: &str,
) -> Result<Option<String>, String> {
    if auth_kind == AUTH_DEFAULT {
        return Ok(None);
    }

    let credential_id = connection
        .credential_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if let Some(credential_id) = credential_id {
        return database.read_secret(credential_id).map(Some);
    }

    let secret = connection.credential_secret.trim();
    if secret.is_empty() {
        return Err("Choose a saved SSH key or provide a private key path first.".to_string());
    }

    Ok(Some(secret.to_string()))
}

fn build_scp_remote_spec(server: &ServerRecord, path: &str) -> String {
    format!("{}:{}", ssh_target(server), escape_scp_remote_path(path))
}

fn escape_scp_remote_path(path: &str) -> String {
    let mut escaped = String::with_capacity(path.len());
    for ch in path.chars() {
        match ch {
            ' ' | '\t' | '\n' | '\\' | '"' | '\'' | '$' | '`' | '!' | '&' | ';' | '(' | ')' | '['
            | ']' | '{' | '}' | '<' | '>' | '|' | '*' | '?' | '#' => {
                escaped.push('\\');
                escaped.push(ch);
            }
            _ => escaped.push(ch),
        }
    }
    escaped
}

fn build_remote_script_command(args: &[&str]) -> String {
    let mut command = String::from("sh -s --");
    for arg in args {
        command.push(' ');
        command.push_str(&shell_single_quote(arg));
    }
    command
}

fn build_remote_session_command(cwd: Option<&str>, tmux_session: Option<&str>) -> Option<String> {
    match (cwd, tmux_session) {
        (Some(path), Some(session)) => Some(format!(
            "tmux new -A -s {} -c {}",
            shell_single_quote(session),
            shell_single_quote(path)
        )),
        (Some(path), None) => Some(format!(
            "cd {} && exec \"${{SHELL:-/bin/sh}}\" -i",
            shell_single_quote(path)
        )),
        (None, Some(session)) => Some(format!("tmux new -A -s {}", shell_single_quote(session))),
        (None, None) => None,
    }
}

fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn parse_relay_host_inspection(
    server_id: &str,
    stdout: &str,
) -> Result<RelayHostInspectionRecord, String> {
    let mut git_installed = false;
    let mut docker_installed = false;
    let mut apple_container_installed = false;
    let mut tailscale_installed = false;
    let mut tailscale_ipv4: Option<String> = None;
    let mut tailscale_json = String::new();
    let mut relay_health_json = String::new();
    let mut relay_installed = false;
    let mut relay_running = false;
    let mut in_tailscale_json = false;
    let mut in_relay_health_json = false;

    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed == "__TAILSCALE_JSON_BEGIN__" {
            in_tailscale_json = true;
            continue;
        }
        if trimmed == "__TAILSCALE_JSON_END__" {
            in_tailscale_json = false;
            continue;
        }
        if trimmed == "__RELAY_HEALTH_JSON_BEGIN__" {
            in_relay_health_json = true;
            continue;
        }
        if trimmed == "__RELAY_HEALTH_JSON_END__" {
            in_relay_health_json = false;
            continue;
        }

        if in_tailscale_json {
            tailscale_json.push_str(line);
            tailscale_json.push('\n');
            continue;
        }
        if in_relay_health_json {
            relay_health_json.push_str(line);
            relay_health_json.push('\n');
            continue;
        }

        if let Some(value) = trimmed.strip_prefix("GIT_INSTALLED=") {
            git_installed = value == "1";
        } else if let Some(value) = trimmed.strip_prefix("DOCKER_INSTALLED=") {
            docker_installed = value == "1";
        } else if let Some(value) = trimmed.strip_prefix("APPLE_CONTAINER_INSTALLED=") {
            apple_container_installed = value == "1";
        } else if let Some(value) = trimmed.strip_prefix("RELAY_INSTALLED=") {
            relay_installed = value == "1";
        } else if let Some(value) = trimmed.strip_prefix("RELAY_RUNNING=") {
            relay_running = value == "1";
        } else if let Some(value) = trimmed.strip_prefix("TAILSCALE_INSTALLED=") {
            tailscale_installed = value == "1";
        } else if let Some(value) = trimmed.strip_prefix("TAILSCALE_IPV4=") {
            let candidate = value.trim();
            if !candidate.is_empty() {
                tailscale_ipv4 = Some(candidate.to_string());
            }
        }
    }

    let mut tailscale_connected = false;
    let mut tailscale_dns_name = None;
    let mut relay_healthy = false;
    let mut relay_version = None;
    let mut relay_id = None;

    if tailscale_installed && !tailscale_json.trim().is_empty() {
        if let Ok(parsed) = serde_json::from_str::<Value>(&tailscale_json) {
            tailscale_dns_name = parsed
                .get("Self")
                .and_then(|value| value.get("DNSName"))
                .and_then(Value::as_str)
                .map(|value| value.trim_end_matches('.').to_string())
                .filter(|value| !value.is_empty());

            tailscale_connected = parsed
                .get("BackendState")
                .and_then(Value::as_str)
                .map(|value| value.eq_ignore_ascii_case("Running"))
                .unwrap_or(false)
                || tailscale_ipv4.is_some();
        }
    }

    let mut suggested_relay_urls = Vec::new();
    if let Some(ipv4) = tailscale_ipv4.as_ref() {
        suggested_relay_urls.push(format!("http://{}:8787", ipv4));
    }
    if let Some(dns_name) = tailscale_dns_name.as_ref() {
        suggested_relay_urls.push(format!("http://{}:8787", dns_name));
    }

    if relay_running && !relay_health_json.trim().is_empty() {
        if let Ok(parsed) = serde_json::from_str::<Value>(&relay_health_json) {
            relay_healthy = parsed
                .get("status")
                .and_then(Value::as_str)
                .map(|value| value.eq_ignore_ascii_case("ok"))
                .unwrap_or(false);
            relay_version = parsed
                .get("version")
                .and_then(Value::as_str)
                .map(|value| value.to_string());
            relay_id = parsed
                .get("relayId")
                .and_then(Value::as_str)
                .map(|value| value.to_string());
        }
    }

    Ok(RelayHostInspectionRecord {
        server_id: server_id.to_string(),
        git_installed,
        docker_installed,
        apple_container_installed,
        tailscale_installed,
        tailscale_connected,
        tailscale_ipv4,
        tailscale_dns_name,
        relay_installed,
        relay_running,
        relay_healthy,
        relay_version,
        relay_id,
        suggested_relay_url: suggested_relay_urls.first().cloned(),
        suggested_relay_urls,
    })
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let log_path = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?
                .join("hermes.log");
            let state = AppState {
                db: Database::new(&app.handle())?,
                sessions: Arc::new(Mutex::new(HashMap::new())),
                github_device_flow: Arc::new(Mutex::new(None)),
                log_path,
            };
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_projects,
            create_project,
            update_project,
            delete_project,
            list_servers,
            create_server,
            update_server,
            delete_server,
            list_keychain_items,
            list_syncable_keychain_items,
            create_keychain_item,
            get_keychain_public_key,
            upsert_syncable_keychain_items,
            get_default_ssh_directory,
            get_local_account_name,
            get_or_create_relay_device_identity,
            has_relay_workspace_key,
            wrap_relay_workspace_key_for_device,
            unwrap_relay_workspace_key,
            rotate_relay_workspace_key,
            create_relay_encrypted_event,
            create_relay_encrypted_snapshot,
            decrypt_relay_encrypted_event,
            decrypt_relay_encrypted_snapshot,
            create_local_ssh_key,
            update_keychain_item_name,
            delete_keychain_item,
            list_tmux_sessions,
            inspect_relay_host,
            connect_session,
            connect_local_session,
            read_project_remote_directory,
            read_file_directory,
            read_file_preview,
            open_file_on_device,
            open_file_with_dialog_on_device,
            inspect_local_editable_file,
            create_file_directory,
            delete_file_entries,
            transfer_file_entries,
            write_file,
            sync_local_file_to_target,
            sync_local_files_to_targets,
            list_terminal_commands,
            create_terminal_command,
            delete_terminal_command,
            inspect_git_repository,
            get_git_repository_change_diff,
            clone_git_repository,
            find_local_github_checkouts,
            commit_git_repository,
            push_git_repository,
            create_git_branch,
            checkout_git_branch,
            get_github_session,
            is_github_device_flow_available,
            start_github_device_flow,
            poll_github_device_flow,
            sign_in_github_with_token,
            disconnect_github,
            list_github_repositories,
            search_github_repositories,
            list_installed_cli_tools,
            get_cli_tool_update,
            run_cli_tool_update,
            list_session_statuses,
            write_session,
            resize_session,
            close_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hermes");
}

impl Clone for SessionHandle {
    fn clone(&self) -> Self {
        Self {
            writer: self.writer.clone(),
            master: self.master.clone(),
            child: self.child.clone(),
            process_id: self.process_id,
            status: self.status.clone(),
        }
    }
}

fn spawn_reader_thread(
    app: tauri::AppHandle,
    session_id: String,
    title: String,
    log_path: PathBuf,
    mut reader: Box<dyn Read + Send>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    auto_password: Option<String>,
    session_status: Arc<Mutex<String>>,
    normalize_local_windows_newlines: bool,
) {
    thread::spawn(move || {
        let mut buffer = [0_u8; 4096];
        let mut pending_password = auto_password;
        let mut announced_connected = false;

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(read) => {
                    let chunk = normalize_terminal_chunk(
                        String::from_utf8_lossy(&buffer[..read]).to_string(),
                        normalize_local_windows_newlines,
                    );

                    if !announced_connected && !chunk.trim().is_empty() {
                        if let Ok(mut status) = session_status.lock() {
                            *status = "connected".to_string();
                        }
                        emit_status(
                            &app,
                            TerminalStatusEvent {
                                session_id: session_id.clone(),
                                status: "connected".to_string(),
                                message: format!("Connected to {}.", title),
                            },
                        );
                        append_log(
                            &log_path,
                            "spawn_reader_thread",
                            &format!("session {session_id} connected for {title}"),
                        );
                        announced_connected = true;
                    }

                    if let Some(secret) = pending_password.as_ref() {
                        if looks_like_password_prompt(&chunk) {
                            if let Ok(mut writer) = writer.lock() {
                                let _ = writer.write_all(secret.as_bytes());
                                let _ = writer.write_all(b"\n");
                                let _ = writer.flush();
                            }
                            pending_password = None;
                        }
                    }

                    let payload = TerminalDataEvent {
                        session_id: session_id.clone(),
                        data: chunk,
                    };
                    let _ = app.emit("terminal:data", payload);
                }
                Err(error) => {
                    append_log(
                        &log_path,
                        "spawn_reader_thread",
                        &format!("session {session_id} reader ended with error: {error}"),
                    );
                    break;
                }
            }
        }
    });
}

fn normalize_terminal_chunk(chunk: String, normalize_local_windows_newlines: bool) -> String {
    #[cfg(target_os = "windows")]
    if normalize_local_windows_newlines {
        return chunk.replace("\r\r\n", "\r\n");
    }

    chunk
}

fn spawn_wait_thread(
    app: tauri::AppHandle,
    state: AppState,
    session_id: String,
    child: Arc<Mutex<Box<dyn portable_pty::Child + Send>>>,
    title: String,
    session_status: Arc<Mutex<String>>,
) {
    thread::spawn(move || {
        let exit_code = {
            let mut child = match child.lock() {
                Ok(child) => child,
                Err(_) => {
                    emit_status(
                        &app,
                        TerminalStatusEvent {
                            session_id: session_id.clone(),
                            status: "error".to_string(),
                            message: format!("{title} failed because the PTY state was poisoned."),
                        },
                    );
                    return;
                }
            };

            match child.wait() {
                Ok(status) => Some(status.exit_code()),
                Err(_) => None,
            }
        };

        if let Ok(mut sessions) = state.sessions.lock() {
            sessions.remove(&session_id);
        }

        let status = if exit_code == Some(0) {
            "closed"
        } else {
            "error"
        };
        if let Ok(mut current_status) = session_status.lock() {
            *current_status = status.to_string();
        }
        append_log(
            &state.log_path,
            "spawn_wait_thread",
            &format!(
                "session {session_id} ended with status {status} and exit code {:?}",
                exit_code
            ),
        );
        emit_status(
            &app,
            TerminalStatusEvent {
                session_id: session_id.clone(),
                status: status.to_string(),
                message: format!("{title} disconnected."),
            },
        );
        let _ = app.emit(
            "terminal:exit",
            TerminalExitEvent {
                session_id,
                exit_code,
                reason: format!("{title} session ended."),
            },
        );
    });
}

fn spawn_session(
    app: tauri::AppHandle,
    state: &AppState,
    command: CommandBuilder,
    title: String,
    server_id: String,
    cwd: Option<String>,
    auto_password: Option<String>,
    log_context: &str,
    log_message: &str,
    connecting_message: Option<String>,
) -> Result<TerminalTab, String> {
    let session_id = Uuid::new_v4().to_string();
    let started_at = Utc::now().to_rfc3339();
    append_log(&state.log_path, log_context, log_message);

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 32,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| error.to_string())?;
    drop(pair.slave);

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| error.to_string())?;
    let writer = Arc::new(Mutex::new(writer));

    let process_id = child.process_id();
    let session_status = Arc::new(Mutex::new("connecting".to_string()));
    let session_handle = SessionHandle {
        writer: writer.clone(),
        master: Arc::new(Mutex::new(pair.master)),
        child: Arc::new(Mutex::new(child)),
        process_id,
        status: session_status.clone(),
    };

    {
        let mut sessions = state.sessions.lock().map_err(lock_error)?;
        sessions.insert(session_id.clone(), session_handle.clone());
    }

    emit_status(
        &app,
        TerminalStatusEvent {
            session_id: session_id.clone(),
            status: "connecting".to_string(),
            message: connecting_message.unwrap_or_else(|| format!("Connecting to {}...", title)),
        },
    );

    spawn_reader_thread(
        app.clone(),
        session_id.clone(),
        title.clone(),
        state.log_path.clone(),
        reader,
        writer,
        auto_password,
        session_status.clone(),
        cfg!(target_os = "windows") && server_id == LOCAL_SESSION_SERVER_ID,
    );
    spawn_wait_thread(
        app,
        state.clone(),
        session_id.clone(),
        session_handle.child.clone(),
        title.clone(),
        session_status,
    );

    Ok(TerminalTab {
        id: session_id,
        server_id,
        title,
        status: "connecting".to_string(),
        started_at,
        cwd,
    })
}

fn emit_status(app: &tauri::AppHandle, event: TerminalStatusEvent) {
    let _ = app.emit("terminal:status", event);
}

fn local_shell_command(
    input: Option<&ConnectLocalSessionInput>,
) -> Result<(CommandBuilder, String, Option<String>), String> {
    let cwd = input
        .and_then(|value| value.cwd.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);
    if let Some(path) = cwd.as_ref() {
        if !path.is_dir() {
            return Err(format!("Directory not found: {}", path.display()));
        }
    }
    let label_override = input
        .and_then(|value| value.label.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let program_override = input
        .and_then(|value| value.program.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let args_override = input
        .and_then(|value| value.args.as_ref())
        .cloned()
        .unwrap_or_default();

    if let Some(program) = program_override {
        let label = label_override
            .clone()
            .unwrap_or_else(|| shell_label(&program));
        let mut command = CommandBuilder::new(program);
        for argument in args_override {
            command.arg(argument);
        }
        if let Some(path) = cwd.as_ref() {
            command.cwd(path);
        }
        return Ok((
            command,
            local_session_title(Some(label), cwd.as_deref(), "terminal"),
            cwd.as_ref().map(|path| path.to_string_lossy().to_string()),
        ));
    }

    #[cfg(target_os = "windows")]
    {
        let shell = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());
        let label = shell_label(&shell);
        let mut command = CommandBuilder::new(shell);
        if let Some(path) = cwd.as_ref() {
            command.cwd(path);
        }
        Ok((
            command,
            local_session_title(label_override, cwd.as_deref(), &label),
            cwd.as_ref().map(|path| path.to_string_lossy().to_string()),
        ))
    }

    #[cfg(not(target_os = "windows"))]
    {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        let label = shell_label(&shell);
        let mut command = CommandBuilder::new(shell);
        command.arg("-l");
        if let Some(path) = cwd.as_ref() {
            command.cwd(path);
        }
        Ok((
            command,
            local_session_title(label_override, cwd.as_deref(), &label),
            cwd.as_ref().map(|path| path.to_string_lossy().to_string()),
        ))
    }
}

fn shell_label(shell: &str) -> String {
    Path::new(shell)
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("terminal")
        .to_string()
}

fn local_session_title(
    label_override: Option<String>,
    cwd: Option<&Path>,
    shell_label: &str,
) -> String {
    if let Some(label) = label_override {
        return format!("Local {label}");
    }

    if let Some(path) = cwd {
        if let Some(name) = path.file_name().and_then(|value| value.to_str()) {
            if !name.trim().is_empty() {
                return format!("Local {}", name.trim());
            }
        }

        return format!("Local {}", path.display());
    }

    format!("Local {shell_label}")
}

fn cli_tool_specs() -> Vec<CliToolSpec> {
    vec![
        CliToolSpec {
            id: "opencode",
            name: "OpenCode",
            description: "OpenCode CLI coding agent",
            current_version: CliToolCommand {
                program: "opencode",
                args: &["--version"],
            },
            latest_version: Some(CliToolCommand {
                program: "npm",
                args: &["view", "opencode-ai", "version"],
            }),
            update: Some(CliToolCommand {
                program: "opencode",
                args: &["upgrade"],
            }),
        },
        CliToolSpec {
            id: "codex",
            name: "Codex CLI",
            description: "OpenAI terminal coding agent",
            current_version: CliToolCommand {
                program: "codex",
                args: &["--version"],
            },
            latest_version: Some(CliToolCommand {
                program: "npm",
                args: &["view", "@openai/codex", "version"],
            }),
            update: Some(CliToolCommand {
                program: "npm",
                args: &["install", "-g", "@openai/codex@latest"],
            }),
        },
        CliToolSpec {
            id: "claude",
            name: "Claude Code",
            description: "Anthropic coding agent in the terminal",
            current_version: CliToolCommand {
                program: "claude",
                args: &["--version"],
            },
            latest_version: Some(CliToolCommand {
                program: "npm",
                args: &["view", "@anthropic-ai/claude-code", "version"],
            }),
            update: Some(CliToolCommand {
                program: "claude",
                args: &["update"],
            }),
        },
        CliToolSpec {
            id: "gemini",
            name: "Gemini CLI",
            description: "Google Gemini coding agent",
            current_version: CliToolCommand {
                program: "gemini",
                args: &["--version"],
            },
            latest_version: Some(CliToolCommand {
                program: "npm",
                args: &["view", "@google/gemini-cli", "version"],
            }),
            update: Some(CliToolCommand {
                program: "npm",
                args: &["install", "-g", "@google/gemini-cli@latest"],
            }),
        },
    ]
}

fn cli_tool_spec(tool_id: &str) -> Option<CliToolSpec> {
    cli_tool_specs().into_iter().find(|spec| spec.id == tool_id)
}

fn placeholder_cli_tool_status(spec: CliToolSpec) -> CliToolUpdateRecord {
    CliToolUpdateRecord {
        id: spec.id.to_string(),
        name: spec.name.to_string(),
        description: spec.description.to_string(),
        installed: true,
        current_version: None,
        latest_version: None,
        state: "checking".to_string(),
        can_run_update: spec
            .update
            .map(|command| can_execute_program(command.program))
            .unwrap_or(false),
        action_label: "Update".to_string(),
        message: "Checking local and latest versions...".to_string(),
    }
}

fn cli_tool_status(spec: CliToolSpec) -> CliToolUpdateRecord {
    let current_output = run_cli_command(spec.current_version);
    let latest_output = spec
        .latest_version
        .and_then(|command| run_cli_command(command).ok());
    let installed = current_output
        .as_ref()
        .map(|output| output.status.success())
        .unwrap_or(false);
    let current_version = current_output
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| version_from_output(&String::from_utf8_lossy(&output.stdout)));
    let latest_version = latest_output
        .and_then(|output| version_from_output(&String::from_utf8_lossy(&output.stdout)));
    let can_run_update = spec
        .update
        .map(|command| can_execute_program(command.program))
        .unwrap_or(false);
    let action_label = if installed {
        "Update"
    } else if can_run_update {
        "Install"
    } else {
        "Unavailable"
    };

    let (state, message) = if !installed {
        if can_run_update {
            (
                "notInstalled".to_string(),
                "Not installed locally. Quick install is available.".to_string(),
            )
        } else {
            (
                "notInstalled".to_string(),
                "Not installed locally on this device.".to_string(),
            )
        }
    } else if let (Some(current), Some(latest)) =
        (current_version.as_deref(), latest_version.as_deref())
    {
        if compare_versions(current, latest) >= 0 {
            (
                "upToDate".to_string(),
                "Already on the latest version.".to_string(),
            )
        } else {
            (
                "updateAvailable".to_string(),
                format!("Update available: {current} -> {latest}"),
            )
        }
    } else {
        (
            "unavailable".to_string(),
            "Installed locally. Latest version could not be checked.".to_string(),
        )
    };

    CliToolUpdateRecord {
        id: spec.id.to_string(),
        name: spec.name.to_string(),
        description: spec.description.to_string(),
        installed,
        current_version,
        latest_version,
        state,
        can_run_update,
        action_label: action_label.to_string(),
        message,
    }
}

fn neutral_command_cwd() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .filter(|path| path.is_dir())
        .unwrap_or_else(std::env::temp_dir)
}

fn ensure_git_available() -> Result<(), String> {
    if can_execute_program("git") {
        Ok(())
    } else {
        Err("Git is not available on this device.".to_string())
    }
}

fn git_command(root: &Path) -> Command {
    let mut command = Command::new(
        resolve_program_path("git").unwrap_or_else(|| PathBuf::from(resolved_program("git"))),
    );
    command.env("GIT_TERMINAL_PROMPT", "0");
    command.arg("-C").arg(root);
    command.current_dir(neutral_command_cwd());
    command
}

fn git_command_output(root: &Path, args: &[&str]) -> Result<std::process::Output, String> {
    git_command(root)
        .args(args)
        .output()
        .map_err(|error| error.to_string())
}

fn resolve_git_root(path: &str) -> Result<PathBuf, String> {
    ensure_git_available()?;

    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Choose a repository path.".to_string());
    }

    let candidate = PathBuf::from(trimmed);
    if !candidate.exists() {
        return Err(format!(
            "Repository path was not found: {}",
            candidate.display()
        ));
    }

    if !candidate.is_dir() {
        return Err("Repository path must be a directory.".to_string());
    }

    let output = git_command_output(&candidate, &["rev-parse", "--show-toplevel"])?;
    if !output.status.success() {
        return Err(command_error_message(
            &output,
            "This directory is not inside a Git repository.",
        ));
    }

    let root_output = String::from_utf8_lossy(&output.stdout);
    let root = root_output
        .lines()
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Git did not return a repository root.".to_string())?;

    Ok(PathBuf::from(root))
}

fn load_git_repository(path: &str) -> Result<GitRepositoryRecord, String> {
    let root = resolve_git_root(path)?;
    load_git_repository_from_root(&root)
}

fn discover_local_github_checkouts(
    repository_full_name: &str,
    repository_name: &str,
) -> Result<Vec<GitRepositoryRecord>, String> {
    ensure_git_available()?;

    let target_slug = repository_full_name.trim().to_ascii_lowercase();
    let target_name = repository_name.trim().to_ascii_lowercase();
    if target_slug.is_empty() || target_name.is_empty() {
        return Ok(Vec::new());
    }

    let mut discovered = Vec::new();
    let mut discovered_roots = HashSet::new();
    let mut visited_directories = HashSet::new();
    let mut visited_count = 0_usize;

    for root in candidate_local_repository_roots() {
        scan_for_github_checkout(
            &root,
            &target_name,
            &target_slug,
            &mut visited_directories,
            &mut discovered_roots,
            &mut discovered,
            &mut visited_count,
        )?;

        if discovered.len() >= 6 {
            break;
        }
    }

    discovered.sort_by(|left, right| left.root_path.cmp(&right.root_path));
    Ok(discovered)
}

fn load_git_repository_from_root(root: &Path) -> Result<GitRepositoryRecord, String> {
    ensure_git_available()?;

    let branch = current_git_branch(root)?;
    let status_output = git_command_output(root, &["status", "--porcelain=1", "--branch"])?;
    if !status_output.status.success() {
        return Err(command_error_message(
            &status_output,
            "Failed to inspect repository status.",
        ));
    }

    let status = parse_git_status(&String::from_utf8_lossy(&status_output.stdout), &branch);
    let branches = git_branches(root, &branch)?;
    let remotes = git_remotes(root)?;
    let remote_name = remotes.first().map(|remote| remote.name.clone());
    let recent_commits = git_recent_commits(root)?;
    let default_base = git_default_base_branch(root, &branches)?;
    let review = git_review_record(root, &branch, default_base.as_deref())?;
    let name = root
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| root.to_string_lossy().to_string());

    Ok(GitRepositoryRecord {
        root_path: root.to_string_lossy().to_string(),
        name,
        branch,
        upstream: status.upstream,
        has_remote: !remotes.is_empty(),
        remote_name,
        remotes,
        ahead: status.ahead,
        behind: status.behind,
        staged_count: status.staged_count,
        changed_count: status.changed_count,
        untracked_count: status.untracked_count,
        conflicted_count: status.conflicted_count,
        clean: status.changes.is_empty(),
        last_commit_summary: recent_commits.first().map(|commit| commit.summary.clone()),
        last_commit_relative: recent_commits
            .first()
            .map(|commit| commit.relative_date.clone()),
        default_base,
        branches,
        recent_commits,
        changes: status.changes,
        review,
    })
}

fn load_git_repository_change_diff(path: &str, file_path: &str) -> Result<String, String> {
    ensure_git_available()?;

    let trimmed_path = path.trim();
    if trimmed_path.is_empty() {
        return Err("Repository path is required.".to_string());
    }

    let trimmed_file_path = file_path.trim();
    if trimmed_file_path.is_empty() {
        return Err("Change path is required.".to_string());
    }

    let root = PathBuf::from(trimmed_path);
    if !root.exists() {
        return Err(format!("Repository path was not found: {}", root.display()));
    }

    let staged = git_diff_output(
        &root,
        &[
            "diff",
            "--cached",
            "--no-ext-diff",
            "--no-color",
            "--",
            trimmed_file_path,
        ],
    )?;
    let unstaged = git_diff_output(
        &root,
        &[
            "diff",
            "--no-ext-diff",
            "--no-color",
            "--",
            trimmed_file_path,
        ],
    )?;

    let mut sections = Vec::new();
    if !staged.trim().is_empty() {
        sections.push(staged);
    }
    if !unstaged.trim().is_empty() {
        sections.push(unstaged);
    }
    if !sections.is_empty() {
        return Ok(sections.join("\n\n"));
    }

    let against_head = git_diff_output(
        &root,
        &[
            "diff",
            "--no-ext-diff",
            "--no-color",
            "HEAD",
            "--",
            trimmed_file_path,
        ],
    )?;
    if !against_head.trim().is_empty() {
        return Ok(against_head);
    }

    let absolute_path = root.join(trimmed_file_path);
    if absolute_path.is_file() {
        let contents = fs::read_to_string(&absolute_path).map_err(|error| {
            format!(
                "Failed to read {} for diff preview: {error}",
                absolute_path.display()
            )
        })?;

        return Ok(build_untracked_file_diff(trimmed_file_path, &contents));
    }

    Ok(format!("No diff available for {trimmed_file_path}."))
}

fn git_diff_output(root: &Path, args: &[&str]) -> Result<String, String> {
    let output = git_command_output(root, args)?;
    if !output.status.success() {
        return Err(command_error_message(
            &output,
            "Failed to load repository diff.",
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn build_untracked_file_diff(file_path: &str, contents: &str) -> String {
    let mut diff = String::new();
    diff.push_str(&format!("diff --git a/{file_path} b/{file_path}\n"));
    diff.push_str("new file mode 100644\n");
    diff.push_str("--- /dev/null\n");
    diff.push_str(&format!("+++ b/{file_path}\n"));

    let lines: Vec<&str> = contents.lines().collect();
    let line_count = lines.len().max(1);
    diff.push_str(&format!("@@ -0,0 +1,{line_count} @@\n"));

    if lines.is_empty() {
        diff.push_str("+\n");
        return diff;
    }

    for line in lines.into_iter().take(400) {
        diff.push('+');
        diff.push_str(line);
        diff.push('\n');
    }

    if contents.lines().count() > 400 {
        diff.push_str("+\n");
        diff.push_str("+[diff truncated]\n");
    }

    diff
}

fn candidate_local_repository_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut seen = HashSet::new();

    if let Ok(current_dir) = std::env::current_dir() {
        push_existing_directory(&mut roots, &mut seen, current_dir);
    }

    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from);

    if let Some(home) = home {
        for candidate in [
            home.join("Documents"),
            home.join("Desktop"),
            home.join("source"),
            home.join("source").join("repos"),
            home.join("Code"),
            home.join("code"),
            home.join("Dev"),
            home.join("dev"),
            home.join("Projects"),
            home.join("projects"),
            home.join("Repos"),
            home.join("repos"),
            home.join("Repositories"),
            home.join("Downloads"),
            home.clone(),
        ] {
            push_existing_directory(&mut roots, &mut seen, candidate);
        }
    }

    roots
}

fn push_existing_directory(
    roots: &mut Vec<PathBuf>,
    seen: &mut HashSet<String>,
    candidate: PathBuf,
) {
    if !candidate.is_dir() {
        return;
    }

    let key = candidate.to_string_lossy().to_ascii_lowercase();
    if seen.insert(key) {
        roots.push(candidate);
    }
}

fn scan_for_github_checkout(
    root: &Path,
    target_name: &str,
    target_slug: &str,
    visited_directories: &mut HashSet<String>,
    discovered_roots: &mut HashSet<String>,
    discovered: &mut Vec<GitRepositoryRecord>,
    visited_count: &mut usize,
) -> Result<(), String> {
    const MAX_SCAN_DEPTH: usize = 4;
    const MAX_VISITED_DIRECTORIES: usize = 4_000;

    if !root.is_dir() {
        return Ok(());
    }

    let mut queue = VecDeque::from([(root.to_path_buf(), 0_usize)]);

    while let Some((directory, depth)) = queue.pop_front() {
        if *visited_count >= MAX_VISITED_DIRECTORIES || discovered.len() >= 6 {
            break;
        }

        let key = directory.to_string_lossy().to_ascii_lowercase();
        if !visited_directories.insert(key) {
            continue;
        }
        *visited_count += 1;

        let directory_name = directory
            .file_name()
            .and_then(|value| value.to_str())
            .map(|value| value.trim().to_ascii_lowercase())
            .unwrap_or_default();
        let has_git_marker = directory.join(".git").exists();

        if has_git_marker || directory_name == target_name {
            if let Some(snapshot) = matching_github_checkout(&directory, target_slug)? {
                if discovered_roots.insert(snapshot.root_path.clone()) {
                    discovered.push(snapshot);
                }
            }
        }

        if depth >= MAX_SCAN_DEPTH {
            continue;
        }

        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries {
            let Ok(entry) = entry else {
                continue;
            };
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if !file_type.is_dir() {
                continue;
            }

            let path = entry.path();
            if should_skip_checkout_scan_directory(&path) {
                continue;
            }

            queue.push_back((path, depth + 1));
        }
    }

    Ok(())
}

fn matching_github_checkout(
    path: &Path,
    target_slug: &str,
) -> Result<Option<GitRepositoryRecord>, String> {
    let snapshot = match load_git_repository(&path.to_string_lossy()) {
        Ok(snapshot) => snapshot,
        Err(_) => return Ok(None),
    };

    let matches_remote = snapshot.remotes.iter().any(|remote| {
        [
            normalize_github_repository_slug(&remote.fetch_url),
            normalize_github_repository_slug(&remote.push_url),
        ]
        .into_iter()
        .flatten()
        .any(|slug| slug == target_slug)
    });

    Ok(matches_remote.then_some(snapshot))
}

fn should_skip_checkout_scan_directory(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };

    matches!(
        name,
        ".git"
            | "node_modules"
            | "target"
            | "dist"
            | "build"
            | ".next"
            | ".nuxt"
            | ".svelte-kit"
            | ".turbo"
            | ".cache"
            | ".cargo"
            | ".rustup"
            | ".pnpm-store"
            | ".yarn"
            | "vendor"
            | "AppData"
            | "Library"
            | "tmp"
            | "Temp"
            | ".venv"
            | "venv"
    )
}

fn normalize_github_repository_slug(value: &str) -> Option<String> {
    let trimmed = value.trim().trim_end_matches(".git");
    let github_index = trimmed.to_ascii_lowercase().find("github.com")?;
    let suffix = trimmed.get(github_index + "github.com".len()..)?.trim();
    let suffix = suffix.trim_start_matches([':', '/']);
    let suffix = suffix.trim_end_matches('/');
    if suffix.is_empty() || !suffix.contains('/') {
        return None;
    }

    Some(suffix.to_ascii_lowercase())
}

fn current_git_branch(root: &Path) -> Result<String, String> {
    let output = git_command_output(root, &["branch", "--show-current"])?;
    if output.status.success() {
        let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !branch.is_empty() {
            return Ok(branch);
        }
    }

    let head_output = git_command_output(root, &["rev-parse", "--short", "HEAD"])?;
    if !head_output.status.success() {
        return Ok("HEAD".to_string());
    }

    let short_head = String::from_utf8_lossy(&head_output.stdout)
        .trim()
        .to_string();
    if short_head.is_empty() {
        Ok("HEAD".to_string())
    } else {
        Ok(format!("detached@{short_head}"))
    }
}

fn parse_git_status(output: &str, branch: &str) -> GitStatusSummary {
    let mut summary = GitStatusSummary::default();

    for (index, line) in output.lines().enumerate() {
        if index == 0 && line.starts_with("## ") {
            apply_git_branch_status_line(&mut summary, &line[3..], branch);
            continue;
        }

        let Some(change) = parse_git_change_line(line) else {
            continue;
        };

        let x = line.chars().next().unwrap_or(' ');
        let y = line.chars().nth(1).unwrap_or(' ');
        if change.staged {
            summary.staged_count += 1;
        }
        if y != ' ' && y != '?' {
            summary.changed_count += 1;
        }
        if x == '?' && y == '?' {
            summary.untracked_count += 1;
        }
        if git_status_is_conflicted(x, y) {
            summary.conflicted_count += 1;
        }

        summary.changes.push(change);
    }

    summary
}

fn apply_git_branch_status_line(summary: &mut GitStatusSummary, branch_line: &str, branch: &str) {
    let normalized = branch_line.trim();
    let Some((_, rest)) = normalized.split_once("...") else {
        return;
    };

    let (upstream_part, counts_part) = rest
        .split_once(" [")
        .map(|(upstream, counts)| (upstream.trim(), Some(counts.trim_end_matches(']'))))
        .unwrap_or((rest.trim(), None));

    if !upstream_part.is_empty() && upstream_part != branch {
        summary.upstream = Some(upstream_part.to_string());
    }

    if let Some(counts) = counts_part {
        for item in counts.split(',') {
            let trimmed = item.trim();
            if let Some(value) = trimmed.strip_prefix("ahead ") {
                summary.ahead = value.parse::<i64>().unwrap_or(0);
            } else if let Some(value) = trimmed.strip_prefix("behind ") {
                summary.behind = value.parse::<i64>().unwrap_or(0);
            }
        }
    }
}

fn parse_git_change_line(line: &str) -> Option<GitFileChangeRecord> {
    if line.len() < 4 || line.starts_with("## ") {
        return None;
    }

    let x = line.chars().next()?;
    let y = line.chars().nth(1)?;
    let raw_path = line.get(3..)?.trim();
    if raw_path.is_empty() {
        return None;
    }

    let (previous_path, path) = raw_path
        .split_once(" -> ")
        .map(|(from, to)| (Some(from.trim().to_string()), to.trim().to_string()))
        .unwrap_or((None, raw_path.to_string()));

    Some(GitFileChangeRecord {
        path,
        previous_path,
        status: git_change_status(x, y).to_string(),
        staged: x != ' ' && x != '?',
    })
}

fn git_change_status(x: char, y: char) -> &'static str {
    if git_status_is_conflicted(x, y) {
        return "conflicted";
    }

    match if x != ' ' && x != '?' { x } else { y } {
        'A' => "added",
        'D' => "deleted",
        'R' => "renamed",
        'C' => "copied",
        '?' => "untracked",
        _ => "modified",
    }
}

fn git_status_is_conflicted(x: char, y: char) -> bool {
    matches!((x, y), ('U', _) | (_, 'U') | ('A', 'A') | ('D', 'D'))
}

fn git_remotes(root: &Path) -> Result<Vec<GitRemoteRecord>, String> {
    let output = git_command_output(root, &["remote", "-v"])?;
    if !output.status.success() {
        return Ok(Vec::new());
    }

    let mut remotes = HashMap::<String, GitRemoteRecord>::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let mut parts = line.split_whitespace();
        let Some(name) = parts
            .next()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        let Some(url) = parts
            .next()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        let direction = parts
            .next()
            .map(str::trim)
            .map(|value| value.trim_start_matches('(').trim_end_matches(')'))
            .unwrap_or("fetch");

        let entry = remotes
            .entry(name.to_string())
            .or_insert_with(|| GitRemoteRecord {
                name: name.to_string(),
                fetch_url: url.to_string(),
                push_url: url.to_string(),
            });

        match direction {
            "push" => entry.push_url = url.to_string(),
            _ => entry.fetch_url = url.to_string(),
        }
    }

    let mut values = remotes.into_values().collect::<Vec<_>>();
    values.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(values)
}

fn git_branches(root: &Path, current_branch: &str) -> Result<Vec<GitBranchRecord>, String> {
    let output = git_command_output(
        root,
        &[
            "for-each-ref",
            "--format=%(refname:short)\t%(HEAD)\t%(upstream:short)",
            "refs/heads",
        ],
    )?;
    if !output.status.success() {
        return Ok(Vec::new());
    }

    let branches = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let mut parts = line.split('\t');
            let name = parts.next()?.trim();
            if name.is_empty() {
                return None;
            }

            let head_marker = parts.next().unwrap_or("").trim();
            let upstream = parts
                .next()
                .map(str::trim)
                .filter(|value| !value.is_empty());
            Some(GitBranchRecord {
                name: name.to_string(),
                current: head_marker == "*" || name == current_branch,
                upstream: upstream.map(str::to_string),
            })
        })
        .collect();

    Ok(branches)
}

fn git_recent_commits(root: &Path) -> Result<Vec<GitCommitRecord>, String> {
    let output = git_command_output(
        root,
        &["log", "-n", "6", "--pretty=format:%H%x1f%s%x1f%an%x1f%cr"],
    )?;
    if !output.status.success() {
        return Ok(Vec::new());
    }

    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let mut parts = line.split('\u{1f}');
            let id = parts.next()?.trim();
            let summary = parts.next()?.trim();
            let author = parts.next()?.trim();
            let relative_date = parts.next()?.trim();
            if id.is_empty() || summary.is_empty() {
                return None;
            }

            Some(GitCommitRecord {
                id: id.to_string(),
                summary: summary.to_string(),
                author: author.to_string(),
                relative_date: relative_date.to_string(),
            })
        })
        .collect())
}

fn git_default_base_branch(
    root: &Path,
    branches: &[GitBranchRecord],
) -> Result<Option<String>, String> {
    let output = git_command_output(root, &["symbolic-ref", "refs/remotes/origin/HEAD"])?;
    if output.status.success() {
        let resolved = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if let Some(base_branch) = resolved.strip_prefix("refs/remotes/origin/") {
            if !base_branch.is_empty() {
                return Ok(Some(base_branch.to_string()));
            }
        }
    }

    if branches.iter().any(|branch| branch.name == "main") {
        return Ok(Some("main".to_string()));
    }

    if branches.iter().any(|branch| branch.name == "master") {
        return Ok(Some("master".to_string()));
    }

    Ok(None)
}

fn git_review_record(
    root: &Path,
    current_branch: &str,
    base_branch: Option<&str>,
) -> Result<Option<GitReviewRecord>, String> {
    let Some(base_branch) = base_branch else {
        return Ok(None);
    };
    if current_branch == base_branch || current_branch.starts_with("detached@") {
        return Ok(None);
    }

    let rev_list_output = git_command(root)
        .args(["rev-list", "--count", &format!("{base_branch}..HEAD")])
        .output()
        .map_err(|error| error.to_string())?;
    if !rev_list_output.status.success() {
        return Ok(None);
    }

    let commit_count = String::from_utf8_lossy(&rev_list_output.stdout)
        .trim()
        .parse::<i64>()
        .unwrap_or(0);
    if commit_count == 0 {
        return Ok(None);
    }

    let diff_output = git_command(root)
        .args(["diff", "--name-only", &format!("{base_branch}...HEAD")])
        .output()
        .map_err(|error| error.to_string())?;
    if !diff_output.status.success() {
        return Ok(None);
    }

    let changed_files = String::from_utf8_lossy(&diff_output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .count() as i64;

    Ok(Some(GitReviewRecord {
        base_branch: base_branch.to_string(),
        commit_count,
        changed_files,
    }))
}

fn github_client_id() -> Result<String, String> {
    resolve_github_client_id()
        .ok_or_else(|| {
            "GitHub sign-in is not configured for this Hermes build yet. Set HERMES_GITHUB_CLIENT_ID before launching Hermes.".to_string()
        })
}

fn resolve_github_client_id() -> Option<String> {
    ["HERMES_GITHUB_CLIENT_ID", "GITHUB_CLIENT_ID"]
        .into_iter()
        .find_map(|key| {
            std::env::var(key)
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
        })
}

fn github_http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())
}

fn github_api_headers(token: Option<&str>) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("application/vnd.github+json"),
    );
    headers.insert(USER_AGENT, HeaderValue::from_static("Hermes-Desktop"));
    headers.insert(
        "X-GitHub-Api-Version",
        HeaderValue::from_static(GITHUB_API_VERSION),
    );

    if let Some(token) = token {
        let value = HeaderValue::from_str(&format!("Bearer {}", token.trim()))
            .map_err(|error| error.to_string())?;
        headers.insert(AUTHORIZATION, value);
    }

    Ok(headers)
}

fn parse_github_json<T: for<'de> Deserialize<'de>>(response: Response) -> Result<T, String> {
    let status = response.status();
    if status.is_success() {
        return response.json::<T>().map_err(|error| error.to_string());
    }

    let text = response.text().map_err(|error| error.to_string())?;
    if let Ok(payload) = serde_json::from_str::<serde_json::Value>(&text) {
        if let Some(message) = payload.get("message").and_then(|value| value.as_str()) {
            return Err(message.to_string());
        }
    }

    Err(if text.trim().is_empty() {
        format!("GitHub request failed with status {}.", status)
    } else {
        text
    })
}

fn github_keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, GITHUB_KEYRING_ACCOUNT).map_err(|error| error.to_string())
}

fn relay_identity_keyring_entry(device_id: &str) -> Result<Entry, String> {
    keychain_entry(
        KEYCHAIN_SERVICE,
        &format!("{RELAY_IDENTITY_KEY_PREFIX}:{device_id}"),
    )
}

fn relay_workspace_key_keyring_entry(workspace_id: &str) -> Result<Entry, String> {
    keychain_entry(
        KEYCHAIN_SERVICE,
        &format!("{RELAY_WORKSPACE_KEY_PREFIX}:{workspace_id}"),
    )
}

fn relay_workspace_key_setting_key(workspace_id: &str) -> String {
    format!("{RELAY_WORKSPACE_KEY_SETTING_PREFIX}:{workspace_id}")
}

fn relay_identity_setting_key(device_id: &str) -> String {
    format!("{RELAY_IDENTITY_SETTING_PREFIX}:{device_id}")
}

fn load_or_create_relay_device_identity(
    state: &AppState,
    device_id: &str,
) -> Result<StoredRelayDeviceIdentityRecord, String> {
    if device_id.trim().is_empty() {
        return Err("Relay device id is required.".to_string());
    }

    let keyring_entry = relay_identity_keyring_entry(device_id).ok();
    if let Some(entry) = keyring_entry.as_ref() {
        match entry.get_password() {
            Ok(secret) => {
                return serde_json::from_str::<StoredRelayDeviceIdentityRecord>(&secret)
                    .map_err(|error| error.to_string());
            }
            Err(KeyringError::NoEntry) => {}
            Err(_) => {}
        }
    }

    if let Some(secret) = state.db.load_relay_identity_backup(device_id)? {
        let identity = serde_json::from_str::<StoredRelayDeviceIdentityRecord>(&secret)
            .map_err(|error| error.to_string())?;
        if let Some(entry) = keyring_entry.as_ref() {
            let _ = entry.set_password(&secret);
        }
        return Ok(identity);
    }

    let encryption_private = X25519SecretKey::random_from_rng(OsRng);
    let encryption_public = X25519PublicKey::from(&encryption_private);
    let signing_private = Ed25519SigningKey::generate(&mut OsRng);
    let signing_public = signing_private.verifying_key();

    let identity = StoredRelayDeviceIdentityRecord {
        device_id: device_id.to_string(),
        encryption_private_key: STANDARD.encode(encryption_private.to_bytes()),
        encryption_public_key: STANDARD.encode(encryption_public.as_bytes()),
        signing_private_key: STANDARD.encode(signing_private.to_keypair_bytes()),
        signing_public_key: STANDARD.encode(signing_public.to_bytes()),
    };
    let serialized = serde_json::to_string(&identity).map_err(|error| error.to_string())?;
    state
        .db
        .store_relay_identity_backup(device_id, &serialized)?;
    if let Some(entry) = keyring_entry.as_ref() {
        let _ = entry.set_password(&serialized);
    }

    Ok(identity)
}

fn load_relay_signing_key(
    identity: &StoredRelayDeviceIdentityRecord,
) -> Result<Ed25519SigningKey, String> {
    let signing_key_bytes = decode_fixed_base64::<64>(
        &identity.signing_private_key,
        "Local relay signing key is invalid.",
    )?;
    Ok(Ed25519SigningKey::from_keypair_bytes(&signing_key_bytes)
        .map_err(|error| error.to_string())?)
}

fn load_relay_verifying_key(public_key: &str) -> Result<Ed25519VerifyingKey, String> {
    let public_key_bytes =
        decode_fixed_base64::<32>(public_key, "Relay signing public key is invalid.")?;
    Ed25519VerifyingKey::from_bytes(&public_key_bytes).map_err(|error| error.to_string())
}

fn load_existing_relay_workspace_key(
    state: &AppState,
    workspace_id: &str,
) -> Result<Option<[u8; 32]>, String> {
    if workspace_id.trim().is_empty() {
        return Err("Relay workspace id is required.".to_string());
    }

    let keyring_entry = relay_workspace_key_keyring_entry(workspace_id).ok();
    if let Some(entry) = keyring_entry.as_ref() {
        match entry.get_password() {
            Ok(secret) => {
                return decode_fixed_base64::<32>(&secret, "Local relay workspace key is invalid.")
                    .map(Some);
            }
            Err(KeyringError::NoEntry) => {}
            Err(_) => {}
        }
    }

    if let Some(secret) = state.db.load_relay_workspace_key_backup(workspace_id)? {
        let workspace_key =
            decode_fixed_base64::<32>(&secret, "Local relay workspace key is invalid.")?;
        if let Some(entry) = keyring_entry.as_ref() {
            let _ = entry.set_password(&secret);
        }
        return Ok(Some(workspace_key));
    }

    Ok(None)
}

fn load_or_create_relay_workspace_key(
    state: &AppState,
    workspace_id: &str,
) -> Result<[u8; 32], String> {
    if let Some(workspace_key) = load_existing_relay_workspace_key(state, workspace_id)? {
        return Ok(workspace_key);
    }

    let mut workspace_key = [0_u8; 32];
    OsRng.fill_bytes(&mut workspace_key);
    store_relay_workspace_key(state, workspace_id, &STANDARD.encode(workspace_key))?;
    Ok(workspace_key)
}

fn require_relay_workspace_key(
    state: &AppState,
    workspace_id: &str,
) -> Result<[u8; 32], String> {
    load_existing_relay_workspace_key(state, workspace_id)?.ok_or_else(|| {
        "Local relay workspace key was not found on this device.".to_string()
    })
}

fn store_relay_workspace_key(
    state: &AppState,
    workspace_id: &str,
    encoded_key: &str,
) -> Result<(), String> {
    if workspace_id.trim().is_empty() {
        return Err("Relay workspace id is required.".to_string());
    }

    state
        .db
        .store_relay_workspace_key_backup(workspace_id, encoded_key)?;

    if let Ok(entry) = relay_workspace_key_keyring_entry(workspace_id) {
        let _ = entry.set_password(encoded_key);
    }

    Ok(())
}

fn decode_fixed_base64<const N: usize>(value: &str, error_message: &str) -> Result<[u8; N], String> {
    let bytes = STANDARD
        .decode(value)
        .map_err(|_| error_message.to_string())?;
    bytes
        .try_into()
        .map_err(|_| error_message.to_string())
}

fn relay_workspace_wrap_aad(
    workspace_id: &str,
    recipient_device_id: &str,
    wrapped_by_device_id: &str,
) -> String {
    format!(
        "hermes-relay-workspace-key-wrap/v1:{workspace_id}:{recipient_device_id}:{wrapped_by_device_id}"
    )
}

fn relay_event_aad(
    workspace_id: &str,
    event_id: &str,
    author_device_id: &str,
    sequence: u64,
    created_at: &str,
) -> String {
    format!(
        "hermes-relay-event/v1:{workspace_id}:{event_id}:{author_device_id}:{sequence}:{created_at}"
    )
}

fn relay_snapshot_aad(
    workspace_id: &str,
    snapshot_id: &str,
    author_device_id: &str,
    base_sequence: u64,
    created_at: &str,
) -> String {
    format!(
        "hermes-relay-snapshot/v1:{workspace_id}:{snapshot_id}:{author_device_id}:{base_sequence}:{created_at}"
    )
}

fn relay_event_signature_payload(
    workspace_id: &str,
    event_id: &str,
    author_device_id: &str,
    sequence: u64,
    ciphertext: &str,
    nonce: &str,
    aad: &str,
    created_at: &str,
) -> String {
    format!(
        "relay-event|1|{workspace_id}|{event_id}|{author_device_id}|{sequence}|{ciphertext}|{nonce}|{aad}|{created_at}"
    )
}

fn relay_snapshot_signature_payload(
    workspace_id: &str,
    snapshot_id: &str,
    author_device_id: &str,
    base_sequence: u64,
    ciphertext: &str,
    nonce: &str,
    aad: &str,
    created_at: &str,
) -> String {
    format!(
        "relay-snapshot|1|{workspace_id}|{snapshot_id}|{author_device_id}|{base_sequence}|{ciphertext}|{nonce}|{aad}|{created_at}"
    )
}

fn encrypt_relay_payload(
    workspace_key: &[u8; 32],
    plaintext: &[u8],
    aad: &str,
) -> Result<(String, String), String> {
    let cipher = XChaCha20Poly1305::new_from_slice(workspace_key)
        .map_err(|error| error.to_string())?;
    let mut nonce = [0_u8; 24];
    OsRng.fill_bytes(&mut nonce);
    let ciphertext = cipher
        .encrypt(
            XNonce::from_slice(&nonce),
            chacha20poly1305::aead::Payload {
                msg: plaintext,
                aad: aad.as_bytes(),
            },
        )
        .map_err(|_| "Failed to encrypt relay payload.".to_string())?;

    Ok((STANDARD.encode(ciphertext), STANDARD.encode(nonce)))
}

fn decrypt_relay_payload(
    workspace_key: &[u8; 32],
    ciphertext: &str,
    nonce: &str,
    aad: &str,
) -> Result<Vec<u8>, String> {
    let cipher = XChaCha20Poly1305::new_from_slice(workspace_key)
        .map_err(|error| error.to_string())?;
    let nonce_bytes = decode_fixed_base64::<24>(nonce, "Relay payload nonce is invalid.")?;
    let ciphertext_bytes = STANDARD
        .decode(ciphertext)
        .map_err(|_| "Relay payload ciphertext is invalid.".to_string())?;

    cipher
        .decrypt(
            XNonce::from_slice(&nonce_bytes),
            chacha20poly1305::aead::Payload {
                msg: ciphertext_bytes.as_ref(),
                aad: aad.as_bytes(),
            },
        )
        .map_err(|_| "Failed to decrypt relay payload.".to_string())
}

fn github_session_from_token(token: &str) -> Result<GitHubAuthSession, String> {
    let client = github_http_client()?;
    let response = client
        .get(GITHUB_USER_URL)
        .headers(github_api_headers(Some(token))?)
        .send()
        .map_err(|error| error.to_string())?;

    let user: GitHubUserApiResponse = parse_github_json(response)?;
    Ok(GitHubAuthSession {
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url,
    })
}

fn map_github_repository(repository: GitHubRepositoryApiResponse) -> GitHubRepositoryRecord {
    GitHubRepositoryRecord {
        id: repository.id.to_string(),
        name: repository.name,
        full_name: repository.full_name,
        owner_login: repository.owner.login,
        owner_type: repository.owner.owner_type,
        description: repository.description.unwrap_or_default(),
        private: repository.private,
        stargazer_count: repository.stargazers_count,
        language: repository.language,
        updated_at: repository.updated_at,
        html_url: repository.html_url,
        clone_url: repository.clone_url,
        default_branch: repository.default_branch,
    }
}

fn can_execute_program(program: &str) -> bool {
    resolve_program_path(program).is_some()
}

fn resolve_program_path(program: &str) -> Option<PathBuf> {
    find_program_on_path(&resolved_program(program)).or_else(|| fallback_program_path(program))
}

fn run_cli_command(command: CliToolCommand) -> Result<std::process::Output, String> {
    Command::new(
        resolve_program_path(command.program)
            .unwrap_or_else(|| PathBuf::from(resolved_program(command.program))),
    )
    .args(command.args)
    .current_dir(neutral_command_cwd())
    .output()
    .map_err(|error| error.to_string())
}

fn version_from_output(output: &str) -> Option<String> {
    output
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .and_then(extract_version_token)
}

fn extract_version_token(output: &str) -> Option<String> {
    let mut token = String::new();
    let mut seen_digit = false;

    for character in output.chars() {
        if character.is_ascii_digit() {
            seen_digit = true;
            token.push(character);
            continue;
        }

        if seen_digit && matches!(character, '.' | '-') {
            token.push(character);
            continue;
        }

        if seen_digit {
            break;
        }
    }

    let normalized = token.trim_matches('-').trim().to_string();
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn compare_versions(left: &str, right: &str) -> i32 {
    let left_parts = parse_version_parts(left);
    let right_parts = parse_version_parts(right);
    let length = left_parts.len().max(right_parts.len());

    for index in 0..length {
        let left_part = *left_parts.get(index).unwrap_or(&0);
        let right_part = *right_parts.get(index).unwrap_or(&0);
        if left_part > right_part {
            return 1;
        }
        if left_part < right_part {
            return -1;
        }
    }

    0
}

fn parse_version_parts(version: &str) -> Vec<u32> {
    version
        .split(['.', '-'])
        .filter_map(|part| part.parse::<u32>().ok())
        .collect()
}

#[cfg(target_os = "windows")]
fn resolved_program(program: &str) -> String {
    if program.contains('.') {
        program.to_string()
    } else {
        format!("{program}.cmd")
    }
}

#[cfg(not(target_os = "windows"))]
fn resolved_program(program: &str) -> String {
    program.to_string()
}

fn find_program_on_path(program: &str) -> Option<PathBuf> {
    let candidate = PathBuf::from(program);
    if candidate.is_absolute() && candidate.exists() {
        return Some(candidate);
    }

    let path_var = std::env::var_os("PATH")?;
    let search_paths = std::env::split_paths(&path_var);

    #[cfg(target_os = "windows")]
    let extensions = windows_path_extensions(program);

    for directory in search_paths {
        #[cfg(target_os = "windows")]
        {
            for extension in &extensions {
                let file_name = if extension.is_empty() {
                    program.to_string()
                } else if program.to_ascii_lowercase().ends_with(extension) {
                    program.to_string()
                } else {
                    format!("{program}{extension}")
                };
                let full_path = directory.join(file_name);
                if full_path.exists() {
                    return Some(full_path);
                }
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            let full_path = directory.join(program);
            if full_path.exists() {
                return Some(full_path);
            }
        }
    }

    None
}

#[cfg(target_os = "windows")]
fn fallback_program_path(program: &str) -> Option<PathBuf> {
    let normalized = program.trim().to_ascii_lowercase();
    let file_name = if normalized.ends_with(".exe") {
        normalized.clone()
    } else {
        format!("{normalized}.exe")
    };

    let mut candidates = Vec::new();
    if normalized == "git" || normalized == "git.exe" {
        candidates.push(PathBuf::from(r"C:\Program Files\Git\cmd\git.exe"));
        candidates.push(PathBuf::from(r"C:\Program Files\Git\bin\git.exe"));
        candidates.push(PathBuf::from(r"C:\Program Files (x86)\Git\cmd\git.exe"));
        candidates.push(PathBuf::from(r"C:\Program Files (x86)\Git\bin\git.exe"));
    }

    if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
        candidates.push(
            PathBuf::from(&local_app_data)
                .join("Programs")
                .join("Git")
                .join("cmd")
                .join(&file_name),
        );
        candidates.push(
            PathBuf::from(&local_app_data)
                .join("Programs")
                .join("Git")
                .join("bin")
                .join(&file_name),
        );
    }

    if let Some(program_files) = std::env::var_os("ProgramFiles") {
        candidates.push(
            PathBuf::from(&program_files)
                .join("Git")
                .join("cmd")
                .join(&file_name),
        );
        candidates.push(
            PathBuf::from(&program_files)
                .join("Git")
                .join("bin")
                .join(&file_name),
        );
    }

    if let Some(program_files_x86) = std::env::var_os("ProgramFiles(x86)") {
        candidates.push(
            PathBuf::from(&program_files_x86)
                .join("Git")
                .join("cmd")
                .join(&file_name),
        );
        candidates.push(
            PathBuf::from(&program_files_x86)
                .join("Git")
                .join("bin")
                .join(&file_name),
        );
    }

    candidates.into_iter().find(|candidate| candidate.exists())
}

#[cfg(not(target_os = "windows"))]
fn fallback_program_path(_program: &str) -> Option<PathBuf> {
    None
}

#[cfg(target_os = "windows")]
fn windows_path_extensions(program: &str) -> Vec<String> {
    let mut extensions = Vec::new();
    let has_extension = Path::new(program).extension().is_some();
    if has_extension {
        extensions.push(String::new());
        return extensions;
    }

    let mut seen = HashSet::new();
    for value in std::env::var("PATHEXT")
        .unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string())
        .split(';')
    {
        let normalized = value.trim().to_ascii_lowercase();
        if normalized.is_empty() || !seen.insert(normalized.clone()) {
            continue;
        }
        extensions.push(normalized);
    }

    if extensions.is_empty() {
        extensions.push(".cmd".to_string());
    }

    extensions
}

fn command_error_message(output: &std::process::Output, fallback: &str) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stderr.is_empty() {
        return stderr;
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stdout.is_empty() {
        return stdout;
    }

    fallback.to_string()
}

fn terminate_process(process_id: Option<u32>) -> Result<(), String> {
    let Some(process_id) = process_id else {
        return Err("Session process id was unavailable.".to_string());
    };

    #[cfg(target_os = "windows")]
    {
        let output = Command::new("taskkill")
            .args(["/PID", &process_id.to_string(), "/T", "/F"])
            .output()
            .map_err(|error| error.to_string())?;

        if output.status.success() {
            return Ok(());
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.contains("not found") || stderr.contains("no running instance") {
            return Ok(());
        }

        return Err(if stderr.is_empty() {
            format!("taskkill failed for pid {process_id}")
        } else {
            stderr
        });
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("kill")
            .args(["-TERM", &process_id.to_string()])
            .output()
            .map_err(|error| error.to_string())?;

        if output.status.success() {
            return Ok(());
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.contains("No such process") {
            return Ok(());
        }

        return Err(if stderr.is_empty() {
            format!("kill failed for pid {process_id}")
        } else {
            stderr
        });
    }
}

fn validate_project_input(input: &ProjectInput) -> Result<(), String> {
    if input.name.trim().is_empty() {
        return Err("Project name is required.".to_string());
    }

    normalized_project_target_kind(&input.target_kind)?;
    Ok(())
}

fn normalized_project_target_kind(value: &str) -> Result<&'static str, String> {
    match value.trim() {
        "local" => Ok("local"),
        "server" => Ok("server"),
        _ => Err("Project target must be local or server.".to_string()),
    }
}

fn normalized_project_branch(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "main".to_string()
    } else {
        trimmed.to_string()
    }
}

fn optional_non_empty(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn validate_server_input(database: &Database, input: &ServerInput) -> Result<(), String> {
    if input.project_id.trim().is_empty() {
        return Err("Select a workspace for this server.".to_string());
    }

    database.get_project(input.project_id.trim())?;

    if input.hostname.trim().is_empty() {
        return Err("Hostname is required.".to_string());
    }

    if input.port == 0 {
        return Err("Port must be greater than zero.".to_string());
    }

    normalized_auth_kind(&input.auth_kind)?;
    Ok(())
}

fn validate_terminal_command_input(input: &CreateTerminalCommandInput) -> Result<(), String> {
    if input.name.trim().is_empty() {
        return Err("Command label is required.".to_string());
    }

    if input.command.trim().is_empty() {
        return Err("Command text is required.".to_string());
    }

    if input.name.trim().chars().count() > 64 {
        return Err("Command labels must be 64 characters or fewer.".to_string());
    }

    if input.command.trim().chars().count() > 4000 {
        return Err("Commands must be 4000 characters or fewer.".to_string());
    }

    Ok(())
}

fn update_project_timestamp(connection: &Connection, project_id: &str) -> Result<(), String> {
    connection
        .execute(
            "UPDATE projects SET updated_at = ?2 WHERE id = ?1",
            params![project_id, Utc::now().to_rfc3339()],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn ensure_column(
    connection: &Connection,
    table: &str,
    column: &str,
    alter_sql: &str,
) -> Result<(), String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?;

    for row in rows {
        if row.map_err(|error| error.to_string())? == column {
            return Ok(());
        }
    }

    connection
        .execute(alter_sql, [])
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn query_servers(
    connection: &Connection,
    project_id: Option<&str>,
) -> Result<Vec<ServerRecord>, String> {
    let sql = if project_id.is_some() {
        format!(
            "{} WHERE hosts.project_id = ?1 ORDER BY hosts.updated_at DESC, hosts.name COLLATE NOCASE ASC",
            server_select_sql("")
        )
    } else {
        format!(
            "{} ORDER BY hosts.updated_at DESC, hosts.name COLLATE NOCASE ASC",
            server_select_sql("")
        )
    };

    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| error.to_string())?;
    let rows = if let Some(project_id) = project_id {
        statement
            .query_map([project_id], map_server_row)
            .map_err(|error| error.to_string())?
    } else {
        statement
            .query_map([], map_server_row)
            .map_err(|error| error.to_string())?
    };

    let mut servers = Vec::new();
    for row in rows {
        servers.push(row.map_err(|error| error.to_string())?);
    }

    Ok(servers)
}

fn server_select_sql(where_clause: &str) -> &'static str {
    match where_clause {
        "" => {
            r#"
            SELECT
                hosts.id,
                hosts.project_id,
                hosts.name,
                hosts.hostname,
                hosts.port,
                hosts.username,
                hosts.path,
                hosts.auth_kind,
                hosts.credential_id,
                credentials.name,
                hosts.device_credential_mode,
                hosts.is_favorite,
                hosts.tmux_session,
                hosts.use_tmux,
                hosts.notes,
                hosts.created_at,
                hosts.updated_at
            FROM hosts
            LEFT JOIN credentials ON credentials.id = hosts.credential_id
            "#
        }
        _ => {
            r#"
            SELECT
                hosts.id,
                hosts.project_id,
                hosts.name,
                hosts.hostname,
                hosts.port,
                hosts.username,
                hosts.path,
                hosts.auth_kind,
                hosts.credential_id,
                credentials.name,
                hosts.device_credential_mode,
                hosts.is_favorite,
                hosts.tmux_session,
                hosts.use_tmux,
                hosts.notes,
                hosts.created_at,
                hosts.updated_at
            FROM hosts
            LEFT JOIN credentials ON credentials.id = hosts.credential_id
            WHERE hosts.id = ?1
            "#
        }
    }
}

fn normalized_auth_kind(value: &str) -> Result<&'static str, String> {
    match value.trim() {
        AUTH_DEFAULT => Ok(AUTH_DEFAULT),
        AUTH_SSH_KEY => Ok(AUTH_SSH_KEY),
        AUTH_PASSWORD => Ok(AUTH_PASSWORD),
        _ => Err("Unsupported authentication type.".to_string()),
    }
}

fn ssh_target(server: &ServerRecord) -> String {
    if server.username.trim().is_empty() {
        server.hostname.clone()
    } else {
        format!("{}@{}", server.username.trim(), server.hostname.trim())
    }
}

fn resolve_device_ssh_key_path(
    hostname: &str,
    username: &str,
    port: u16,
) -> Result<Option<String>, String> {
    let mut command = Command::new("ssh");
    command.arg("-G");
    if port != 22 {
        command.arg("-p").arg(port.to_string());
    }
    command.arg(ssh_target_parts(hostname, username));

    let output = command.output().map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Ok(None);
    }

    Ok(parse_identity_file_from_ssh_config_output(
        &String::from_utf8_lossy(&output.stdout),
    ))
}

fn parse_identity_file_from_ssh_config_output(output: &str) -> Option<String> {
    output
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            let value = trimmed.strip_prefix("identityfile ")?;
            let candidate = value.trim();
            if candidate.is_empty() || candidate.eq_ignore_ascii_case("none") {
                return None;
            }

            let expanded = expand_home_path(candidate);
            if expanded.exists() {
                Some(expanded.to_string_lossy().to_string())
            } else {
                None
            }
        })
        .next()
}

fn default_device_credential_name(server_name: &str, hostname: &str) -> String {
    let label = if server_name.trim().is_empty() {
        hostname.trim()
    } else {
        server_name.trim()
    };
    format!("{label} device key")
}

fn ssh_target_parts(hostname: &str, username: &str) -> String {
    if username.trim().is_empty() {
        hostname.trim().to_string()
    } else {
        format!("{}@{}", username.trim(), hostname.trim())
    }
}

fn ssh_command_output(
    database: &Database,
    server: &ServerRecord,
    remote_args: &[&str],
) -> Result<std::process::Output, String> {
    let auth_secret = database.resolve_server_secret(server)?;
    let mut command = Command::new("ssh");
    command.arg("-o").arg("BatchMode=yes");
    command.arg("-o").arg("ConnectTimeout=5");
    apply_shell_auth(&mut command, server, auth_secret.as_deref())?;
    command.arg(ssh_target(server));

    for arg in remote_args {
        command.arg(arg);
    }

    command.output().map_err(|error| error.to_string())
}

fn read_ssh_private_key_secret(secret: &str) -> Result<String, String> {
    if let Some(encoded) = secret.strip_prefix(INLINE_SSH_KEY_PREFIX) {
        let decoded = STANDARD
            .decode(encoded)
            .map_err(|_| "Stored inline SSH key is invalid.".to_string())?;
        return String::from_utf8(decoded).map_err(|error| error.to_string());
    }

    let path = expand_home_path(secret);
    fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read SSH key at {}: {}", path.display(), error))
}

fn encode_inline_ssh_key_secret(private_key: &str) -> String {
    format!(
        "{}{}",
        INLINE_SSH_KEY_PREFIX,
        STANDARD.encode(private_key.trim().as_bytes())
    )
}

fn materialize_ssh_key_secret(secret: &str) -> Result<PathBuf, String> {
    if !secret.starts_with(INLINE_SSH_KEY_PREFIX) {
        return Ok(expand_home_path(secret));
    }

    let private_key = read_ssh_private_key_secret(secret)?;
    let digest = Sha256::digest(private_key.as_bytes());
    let file_name = format!(
        "synced-{}.key",
        digest
            .iter()
            .map(|byte| format!("{:02x}", byte))
            .collect::<String>()
    );
    let directory = std::env::temp_dir().join("hermes").join("ssh");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = directory.join(file_name);
    if !path.exists() {
        fs::write(&path, private_key).map_err(|error| error.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(path)
}

fn ssh_public_key_from_private_key(private_key_path: &Path) -> Result<String, String> {
    let output = Command::new(resolved_program("ssh-keygen"))
        .args(["-y", "-f", &private_key_path.to_string_lossy()])
        .current_dir(neutral_command_cwd())
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(command_error_message(
            &output,
            "Failed to derive the SSH public key.",
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn apply_connect_auth(
    command: &mut CommandBuilder,
    server: &ServerRecord,
    auth_secret: Option<&str>,
) -> Result<(), String> {
    if server.port != 22 {
        command.arg("-p");
        command.arg(server.port.to_string());
    }

    match server.auth_kind.as_str() {
        AUTH_SSH_KEY => {
            let secret =
                auth_secret.ok_or_else(|| "Stored SSH key was not found.".to_string())?;
            let expanded = materialize_ssh_key_secret(secret)?;
            if !expanded.exists() {
                return Err(format!(
                    "SSH key path was not found: {}",
                    expanded.display()
                ));
            }
            command.arg("-i");
            command.arg(expanded.to_string_lossy().to_string());
        }
        AUTH_PASSWORD => {
            if auth_secret.is_none() {
                return Err("Stored password was not found.".to_string());
            }
            command.arg("-o");
            command.arg("PreferredAuthentications=password,keyboard-interactive");
            command.arg("-o");
            command.arg("PubkeyAuthentication=no");
        }
        _ => {}
    }

    Ok(())
}

fn apply_shell_auth(
    command: &mut Command,
    server: &ServerRecord,
    auth_secret: Option<&str>,
) -> Result<(), String> {
    if server.port != 22 {
        command.arg("-p").arg(server.port.to_string());
    }

    match server.auth_kind.as_str() {
        AUTH_SSH_KEY => {
            let secret =
                auth_secret.ok_or_else(|| "Stored SSH key was not found.".to_string())?;
            let expanded = materialize_ssh_key_secret(secret)?;
            if !expanded.exists() {
                return Err(format!(
                    "SSH key path was not found: {}",
                    expanded.display()
                ));
            }
            command
                .arg("-i")
                .arg(expanded.to_string_lossy().to_string());
        }
        AUTH_PASSWORD => {
            return Err(
                "Password-authenticated servers do not support background tmux listing yet."
                    .to_string(),
            );
        }
        _ => {}
    }

    Ok(())
}

fn server_display_label(server: &ServerRecord) -> String {
    if server.name.trim().is_empty() {
        server.hostname.clone()
    } else {
        server.name.clone()
    }
}

fn sanitized_tmux_session(input: &str) -> String {
    let filtered = input
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        .collect::<String>();

    if filtered.is_empty() {
        "main".to_string()
    } else {
        filtered
    }
}

fn sanitize_clone_directory_name(input: &str) -> String {
    input
        .trim()
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
        .collect::<String>()
}

fn expand_home_path(path: &str) -> PathBuf {
    if !path.starts_with("~/") && !path.starts_with("~\\") {
        return PathBuf::from(path);
    }

    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"));
    match home {
        Some(home) => Path::new(&home).join(path[2..].to_string()),
        None => PathBuf::from(path),
    }
}

fn default_ssh_directory() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .or_else(|| {
            let drive = std::env::var_os("HOMEDRIVE")?;
            let path = std::env::var_os("HOMEPATH")?;
            let mut combined = PathBuf::from(drive);
            combined.push(path);
            Some(combined.into_os_string())
        })?;

    let mut ssh_dir = PathBuf::from(home);
    ssh_dir.push(".ssh");
    Some(ssh_dir)
}

fn sanitize_ssh_key_file_name(input: &str) -> String {
    input
        .trim()
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
        .collect::<String>()
}

fn bool_to_int(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

fn looks_like_password_prompt(chunk: &str) -> bool {
    let lower = chunk.to_ascii_lowercase();
    lower.contains("password:") || lower.contains("passphrase for key")
}

fn keychain_entry(service: &str, credential_id: &str) -> Result<Entry, String> {
    Entry::new(service, credential_id).map_err(|error| error.to_string())
}

fn append_log(path: &Path, scope: &str, message: &str) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let line = format!("{} [{}] {}\n", Utc::now().to_rfc3339(), scope, message);
    let _ = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .and_then(|mut file| file.write_all(line.as_bytes()));
}

fn load_or_create_secret_key(path: &Path) -> Result<[u8; 32], String> {
    if path.exists() {
        let bytes = fs::read(path).map_err(|error| error.to_string())?;
        if bytes.len() == 32 {
            let mut key = [0_u8; 32];
            key.copy_from_slice(&bytes);
            return Ok(key);
        }

        return Err("Credential encryption key file is invalid.".to_string());
    }

    let mut key = [0_u8; 32];
    OsRng.fill_bytes(&mut key);
    fs::write(path, key).map_err(|error| error.to_string())?;
    Ok(key)
}

fn encrypt_secret(key: &[u8; 32], secret: &str) -> Result<String, String> {
    let cipher = Aes256GcmSiv::new_from_slice(key).map_err(|error| error.to_string())?;
    let mut nonce_bytes = [0_u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, secret.as_bytes())
        .map_err(|_| "Failed to encrypt credential.".to_string())?;

    let mut payload = nonce_bytes.to_vec();
    payload.extend_from_slice(&ciphertext);
    Ok(STANDARD.encode(payload))
}

fn decrypt_secret(key: &[u8; 32], secret_blob: &str) -> Result<String, String> {
    let payload = STANDARD
        .decode(secret_blob)
        .map_err(|error| error.to_string())?;

    if payload.len() <= 12 {
        return Err("Encrypted credential payload is invalid.".to_string());
    }

    let (nonce_bytes, ciphertext) = payload.split_at(12);
    let cipher = Aes256GcmSiv::new_from_slice(key).map_err(|error| error.to_string())?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
        .map_err(|_| "Failed to decrypt credential.".to_string())?;
    String::from_utf8(plaintext).map_err(|error| error.to_string())
}

fn map_project_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectRecord> {
    Ok(ProjectRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        path: row.get(3)?,
        target_kind: row.get(4)?,
        linked_server_id: row.get(5)?,
        github_repo_full_name: row.get(6)?,
        github_default_branch: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn map_keychain_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<KeychainItemRecord> {
    Ok(KeychainItemRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        kind: row.get(2)?,
        usage_count: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn map_server_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ServerRecord> {
    Ok(ServerRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        hostname: row.get(3)?,
        port: row.get(4)?,
        username: row.get(5)?,
        path: row.get(6)?,
        auth_kind: row.get(7)?,
        credential_id: row.get(8)?,
        credential_name: row.get(9)?,
        device_credential_mode: row.get(10)?,
        is_favorite: row.get::<_, i64>(11)? != 0,
        tmux_session: row.get(12)?,
        use_tmux: row.get::<_, i64>(13)? != 0,
        notes: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
    })
}

fn map_terminal_command_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TerminalCommandRecord> {
    Ok(TerminalCommandRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        command: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn lock_error<T>(error: std::sync::PoisonError<T>) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::{
        decrypt_secret, encrypt_secret, parse_identity_file_from_ssh_config_output,
        sanitized_tmux_session,
    };

    #[test]
    fn encrypt_roundtrip_preserves_secret() {
        let key = [7_u8; 32];
        let secret = "C:\\Users\\karl-\\.ssh\\id_ed25519";
        let encrypted = encrypt_secret(&key, secret).expect("secret should encrypt");
        let decrypted = decrypt_secret(&key, &encrypted).expect("secret should decrypt");
        assert_eq!(decrypted, secret);
    }

    #[test]
    fn tmux_session_name_is_sanitized() {
        assert_eq!(sanitized_tmux_session("prod/main !!"), "prodmain");
        assert_eq!(sanitized_tmux_session(""), "main");
    }

    #[test]
    fn parses_existing_identity_file_from_ssh_config_output() {
        let key_path = std::env::temp_dir().join(format!("hermes-test-{}", uuid::Uuid::new_v4()));
        std::fs::write(&key_path, "key").expect("key file should be written");
        let output = format!(
            "user root\nidentityfile {}\nidentityfile ~/.ssh/id_rsa\n",
            key_path.display()
        );

        let parsed = parse_identity_file_from_ssh_config_output(&output);
        assert_eq!(parsed, Some(key_path.to_string_lossy().to_string()));
        std::fs::remove_file(&key_path).expect("key file should be removed");
    }
}
