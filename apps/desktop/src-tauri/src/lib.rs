use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use aes_gcm_siv::{
    aead::{Aead, KeyInit},
    Aes256GcmSiv, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Utc;
use keyring::{Entry, Error as KeyringError};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use rand::{rngs::OsRng, RngCore};
use reqwest::{
    blocking::{Client, Response},
    header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT},
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, State};
use uuid::Uuid;

const AUTH_DEFAULT: &str = "default";
const AUTH_SSH_KEY: &str = "sshKey";
const AUTH_PASSWORD: &str = "password";
const KEYCHAIN_SERVICE: &str = "Hermes";
const GITHUB_KEYRING_ACCOUNT: &str = "github-device-token";
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
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectRecord {
    id: String,
    name: String,
    description: String,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectSessionInput {
    server_id: String,
    tmux_session: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectLocalSessionInput {
    cwd: Option<String>,
    label: Option<String>,
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
                SELECT id, name, description, created_at, updated_at
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
                SELECT id, name, description, created_at, updated_at
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
                INSERT INTO projects (id, name, description, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5)
                "#,
                params![id, input.name.trim(), input.description.trim(), now, now],
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
                SET name = ?2, description = ?3, updated_at = ?4
                WHERE id = ?1
                "#,
                params![id, input.name.trim(), input.description.trim(), now],
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

    fn create_keychain_item(&self, input: CreateKeychainItemInput) -> Result<KeychainItemRecord, String> {
        let name = input.name.trim();
        if name.is_empty() {
            return Err("Credential name is required.".to_string());
        }

        let kind = normalized_auth_kind(&input.kind)?;
        if kind == AUTH_DEFAULT {
            return Err("Saved credentials must be either an SSH key path or password.".to_string());
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

    fn create_local_ssh_key(&self, input: CreateLocalSshKeyInput) -> Result<KeychainItemRecord, String> {
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

        let private_key_path = expand_home_path(&self.read_secret(id)?);
        let public_key_path = PathBuf::from(format!("{}.pub", private_key_path.display()));
        if !public_key_path.exists() {
            return Err(format!(
                "Public key file was not found at {}.",
                public_key_path.display()
            ));
        }

        fs::read_to_string(&public_key_path)
            .map(|value| value.trim().to_string())
            .map_err(|error| error.to_string())
    }

    fn update_keychain_item_name(&self, id: &str, name: &str) -> Result<KeychainItemRecord, String> {
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
                    auth_kind,
                    credential_id,
                    device_credential_mode,
                    is_favorite,
                    tmux_session,
                    use_tmux,
                    notes,
                    created_at,
                    updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
                "#,
                params![
                    id,
                    input.project_id.trim(),
                    input.name.trim(),
                    input.hostname.trim(),
                    i64::from(input.port),
                    input.username.trim(),
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
                    auth_kind = ?7,
                    credential_id = ?8,
                    device_credential_mode = ?9,
                    is_favorite = ?10,
                    tmux_session = ?11,
                    use_tmux = ?12,
                    notes = ?13,
                    updated_at = ?14
                WHERE id = ?1
                "#,
                params![
                    id,
                    input.project_id.trim(),
                    input.name.trim(),
                    input.hostname.trim(),
                    i64::from(input.port),
                    input.username.trim(),
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
            let device_credential_mode = if existing
                .is_some_and(|server| {
                    server.auth_kind == AUTH_DEFAULT
                        && server.device_credential_mode == DEVICE_CREDENTIAL_MODE_DISABLED
                })
            {
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
            .query_map(
                params![AUTH_DEFAULT, DEVICE_CREDENTIAL_MODE_AUTO],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, u16>(3)?,
                        row.get::<_, String>(4)?,
                    ))
                },
            )
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

    fn load_github_token(&self) -> Result<Option<String>, String> {
        let connection = self.connection.lock().map_err(lock_error)?;
        if let Some(token) = self.read_setting_secret_with_connection(&connection, GITHUB_TOKEN_SETTING_KEY)? {
            return Ok(Some(token));
        }

        match github_keyring_entry()?.get_password() {
            Ok(token) => {
                let trimmed = token.trim().to_string();
                if trimmed.is_empty() {
                    return Ok(None);
                }

                self.store_setting_secret_with_connection(&connection, GITHUB_TOKEN_SETTING_KEY, &trimmed)?;
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
fn create_project(state: State<'_, AppState>, input: ProjectInput) -> Result<ProjectRecord, String> {
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
fn get_default_ssh_directory() -> Result<Option<String>, String> {
    Ok(default_ssh_directory()
        .filter(|path| path.exists())
        .map(|path| path.to_string_lossy().to_string()))
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

    let output = ssh_command_output(&state.db, &server, &["tmux", "list-sessions", "-F", "#{session_name}"])?;

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

    let mut command = CommandBuilder::new("ssh");
    command.arg("-tt");
    command.arg("-o");
    command.arg("ServerAliveInterval=30");
    command.arg("-o");
    command.arg("ServerAliveCountMax=3");
    apply_connect_auth(&mut command, &server, auth_secret.as_deref())?;
    command.arg(ssh_target(&server));

    if server.use_tmux {
        command.arg(format!("tmux new -A -s {}", resolved_tmux_session));
    }

    let log_message = format!("starting session for {} ({})", title, ssh_target(&server));

    spawn_session(
        app,
        state.inner(),
        command,
        title,
        server.id.clone(),
        None,
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
fn list_terminal_commands(state: State<'_, AppState>) -> Result<Vec<TerminalCommandRecord>, String> {
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
            return Err(format!(
                "Clone target already exists: {}",
                target.display()
            ));
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
async fn commit_git_repository(path: String, message: String) -> Result<GitRepositoryRecord, String> {
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

        let staged_output = git_command_output(&root, &["diff", "--cached", "--quiet", "--exit-code"])?;
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
fn start_github_device_flow(
    state: State<'_, AppState>,
) -> Result<GitHubDeviceFlowRecord, String> {
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
            (
                "grant_type",
                "urn:ietf:params:oauth:grant-type:device_code",
            ),
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
                active_flow.interval_seconds = payload.interval.unwrap_or(flow.interval_seconds + 5);
            }
            Ok(None)
        }
        Some("expired_token") => {
            let mut current_flow = state.github_device_flow.lock().map_err(lock_error)?;
            *current_flow = None;
            Err("GitHub sign-in expired. Start it again.".to_string())
        }
        Some(error) => Err(
            payload
                .error_description
                .unwrap_or_else(|| error.to_string()),
        ),
        None => Ok(None),
    }
}

#[tauri::command]
fn sign_in_github_with_token(state: State<'_, AppState>, token: String) -> Result<GitHubAuthSession, String> {
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
fn list_github_repositories(state: State<'_, AppState>) -> Result<Vec<GitHubRepositoryRecord>, String> {
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
fn search_github_repositories(state: State<'_, AppState>, query: String) -> Result<Vec<GitHubRepositoryRecord>, String> {
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
    let spec = cli_tool_spec(&tool_id)
        .ok_or_else(|| format!("Tool updater {tool_id} was not found."))?;
    let update = spec
        .update
        .ok_or_else(|| format!("{} does not support quick updates.", spec.name))?;

    if !can_execute_program(update.program) {
        return Err(format!("{} is not available on this device.", update.program));
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
fn write_session(state: State<'_, AppState>, session_id: String, data: String) -> Result<(), String> {
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
            create_keychain_item,
            get_keychain_public_key,
            get_default_ssh_directory,
            create_local_ssh_key,
            update_keychain_item_name,
            delete_keychain_item,
            list_tmux_sessions,
            connect_session,
            connect_local_session,
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

        let status = if exit_code == Some(0) { "closed" } else { "error" };
        if let Ok(mut current_status) = session_status.lock() {
            *current_status = status.to_string();
        }
        append_log(
            &state.log_path,
            "spawn_wait_thread",
            &format!("session {session_id} ended with status {status} and exit code {:?}", exit_code),
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
    let writer = pair.master.take_writer().map_err(|error| error.to_string())?;
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

fn local_session_title(label_override: Option<String>, cwd: Option<&Path>, shell_label: &str) -> String {
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
    cli_tool_specs()
        .into_iter()
        .find(|spec| spec.id == tool_id)
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
    let latest_output = spec.latest_version.and_then(|command| run_cli_command(command).ok());
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
    } else if let (Some(current), Some(latest)) = (current_version.as_deref(), latest_version.as_deref()) {
        if compare_versions(current, latest) >= 0 {
            ("upToDate".to_string(), "Already on the latest version.".to_string())
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
    let mut command = Command::new(resolve_program_path("git").unwrap_or_else(|| PathBuf::from(resolved_program("git"))));
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
        return Err(format!("Repository path was not found: {}", candidate.display()));
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
        last_commit_relative: recent_commits.first().map(|commit| commit.relative_date.clone()),
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

    let staged = git_diff_output(&root, &["diff", "--cached", "--no-ext-diff", "--no-color", "--", trimmed_file_path])?;
    let unstaged = git_diff_output(&root, &["diff", "--no-ext-diff", "--no-color", "--", trimmed_file_path])?;

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

    let against_head =
        git_diff_output(&root, &["diff", "--no-ext-diff", "--no-color", "HEAD", "--", trimmed_file_path])?;
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

fn push_existing_directory(roots: &mut Vec<PathBuf>, seen: &mut HashSet<String>, candidate: PathBuf) {
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

fn matching_github_checkout(path: &Path, target_slug: &str) -> Result<Option<GitRepositoryRecord>, String> {
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

    let short_head = String::from_utf8_lossy(&head_output.stdout).trim().to_string();
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
    matches!(
        (x, y),
        ('U', _)
            | (_, 'U')
            | ('A', 'A')
            | ('D', 'D')
    )
}

fn git_remotes(root: &Path) -> Result<Vec<GitRemoteRecord>, String> {
    let output = git_command_output(root, &["remote", "-v"])?;
    if !output.status.success() {
        return Ok(Vec::new());
    }

    let mut remotes = HashMap::<String, GitRemoteRecord>::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let mut parts = line.split_whitespace();
        let Some(name) = parts.next().map(str::trim).filter(|value| !value.is_empty()) else {
            continue;
        };
        let Some(url) = parts.next().map(str::trim).filter(|value| !value.is_empty()) else {
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
            let upstream = parts.next().map(str::trim).filter(|value| !value.is_empty());
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

fn git_default_base_branch(root: &Path, branches: &[GitBranchRecord]) -> Result<Option<String>, String> {
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
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static("Hermes-Desktop"),
    );
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
    Command::new(resolve_program_path(command.program).unwrap_or_else(|| PathBuf::from(resolved_program(command.program))))
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
        candidates.push(PathBuf::from(&local_app_data).join("Programs").join("Git").join("cmd").join(&file_name));
        candidates.push(PathBuf::from(&local_app_data).join("Programs").join("Git").join("bin").join(&file_name));
    }

    if let Some(program_files) = std::env::var_os("ProgramFiles") {
        candidates.push(PathBuf::from(&program_files).join("Git").join("cmd").join(&file_name));
        candidates.push(PathBuf::from(&program_files).join("Git").join("bin").join(&file_name));
    }

    if let Some(program_files_x86) = std::env::var_os("ProgramFiles(x86)") {
        candidates.push(PathBuf::from(&program_files_x86).join("Git").join("cmd").join(&file_name));
        candidates.push(PathBuf::from(&program_files_x86).join("Git").join("bin").join(&file_name));
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
        return Err("Workspace name is required.".to_string());
    }

    Ok(())
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

fn query_servers(connection: &Connection, project_id: Option<&str>) -> Result<Vec<ServerRecord>, String> {
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

    let mut statement = connection.prepare(&sql).map_err(|error| error.to_string())?;
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

    Ok(parse_identity_file_from_ssh_config_output(&String::from_utf8_lossy(&output.stdout)))
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
            let secret = auth_secret.ok_or_else(|| "Stored SSH key path was not found.".to_string())?;
            let expanded = expand_home_path(secret);
            if !expanded.exists() {
                return Err(format!("SSH key path was not found: {}", expanded.display()));
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
            let secret = auth_secret.ok_or_else(|| "Stored SSH key path was not found.".to_string())?;
            let expanded = expand_home_path(secret);
            if !expanded.exists() {
                return Err(format!("SSH key path was not found: {}", expanded.display()));
            }
            command
                .arg("-i")
                .arg(expanded.to_string_lossy().to_string());
        }
        AUTH_PASSWORD => {
            return Err("Password-authenticated servers do not support background tmux listing yet.".to_string());
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

    let line = format!(
        "{} [{}] {}\n",
        Utc::now().to_rfc3339(),
        scope,
        message
    );
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
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
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
        auth_kind: row.get(6)?,
        credential_id: row.get(7)?,
        credential_name: row.get(8)?,
        device_credential_mode: row.get(9)?,
        is_favorite: row.get::<_, i64>(10)? != 0,
        tmux_session: row.get(11)?,
        use_tmux: row.get::<_, i64>(12)? != 0,
        notes: row.get(13)?,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
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
