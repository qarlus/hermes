use std::{
    collections::HashMap,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, Mutex},
    thread,
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
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, State};
use uuid::Uuid;

const AUTH_DEFAULT: &str = "default";
const AUTH_SSH_KEY: &str = "sshKey";
const AUTH_PASSWORD: &str = "password";
const KEYCHAIN_SERVICE: &str = "Hermes";

#[derive(Clone)]
struct AppState {
    db: Database,
    sessions: Arc<Mutex<HashMap<String, SessionHandle>>>,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalTab {
    id: String,
    server_id: String,
    title: String,
    status: String,
    started_at: String,
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
struct TmuxSessionRecord {
    name: String,
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
                    tmux_session TEXT NOT NULL DEFAULT 'main',
                    use_tmux INTEGER NOT NULL DEFAULT 0,
                    is_favorite INTEGER NOT NULL DEFAULT 0,
                    notes TEXT NOT NULL DEFAULT '',
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
            "credential_id",
            "ALTER TABLE hosts ADD COLUMN credential_id TEXT DEFAULT NULL",
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
                "UPDATE hosts SET auth_kind = ?2, credential_id = NULL, updated_at = ?3 WHERE credential_id = ?1",
                params![id, AUTH_DEFAULT, now],
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
        let (auth_kind, credential_id) = self.prepare_server_auth(&connection, None, &input, &now)?;

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
                    tmux_session,
                    use_tmux,
                    notes,
                    created_at,
                    updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
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
        let (auth_kind, credential_id) =
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
                    tmux_session = ?9,
                    use_tmux = ?10,
                    notes = ?11,
                    updated_at = ?12
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

    fn prepare_server_auth(
        &self,
        connection: &Connection,
        existing: Option<&ServerRecord>,
        input: &ServerInput,
        now: &str,
    ) -> Result<(String, Option<String>), String> {
        let auth_kind = normalized_auth_kind(&input.auth_kind)?;

        if auth_kind == AUTH_DEFAULT {
            return Ok((auth_kind.to_string(), None));
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

        Ok((auth_kind.to_string(), Some(credential_id)))
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

    let session_id = Uuid::new_v4().to_string();
    let title = server_display_label(&server);
    let started_at = Utc::now().to_rfc3339();
    append_log(
        &state.log_path,
        "connect_session",
        &format!("starting session for {title} ({})", ssh_target(&server)),
    );
    let resolved_tmux_session = input
        .tmux_session
        .as_deref()
        .map(sanitized_tmux_session)
        .unwrap_or_else(|| sanitized_tmux_session(&server.tmux_session));

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 32,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;

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
    let session_handle = SessionHandle {
        writer: writer.clone(),
        master: Arc::new(Mutex::new(pair.master)),
        child: Arc::new(Mutex::new(child)),
        process_id,
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
            message: format!("Connecting to {}...", title),
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
    );
    spawn_wait_thread(
        app,
        state.inner().clone(),
        session_id.clone(),
        session_handle.child.clone(),
        title.clone(),
    );

    Ok(TerminalTab {
        id: session_id,
        server_id: server.id,
        title,
        status: "connecting".to_string(),
        started_at,
    })
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

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let log_path = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?
                .join("hermes.log");
            let state = AppState {
                db: Database::new(&app.handle())?,
                sessions: Arc::new(Mutex::new(HashMap::new())),
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
            update_keychain_item_name,
            delete_keychain_item,
            list_tmux_sessions,
            connect_session,
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
) {
    thread::spawn(move || {
        let mut buffer = [0_u8; 4096];
        let mut pending_password = auto_password;
        let mut announced_connected = false;

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(read) => {
                    let chunk = String::from_utf8_lossy(&buffer[..read]).to_string();

                    if !announced_connected && !chunk.trim().is_empty() {
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

fn spawn_wait_thread(
    app: tauri::AppHandle,
    state: AppState,
    session_id: String,
    child: Arc<Mutex<Box<dyn portable_pty::Child + Send>>>,
    title: String,
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

fn emit_status(app: &tauri::AppHandle, event: TerminalStatusEvent) {
    let _ = app.emit("terminal:status", event);
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
        tmux_session: row.get(9)?,
        use_tmux: row.get::<_, i64>(10)? != 0,
        notes: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

fn lock_error<T>(error: std::sync::PoisonError<T>) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::{decrypt_secret, encrypt_secret, sanitized_tmux_session};

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
}
