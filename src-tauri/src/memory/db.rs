use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::{Connection, Result as SqlResult};
use tauri::{AppHandle, Manager};

use super::models::MemoryError;

pub struct MemoryState(pub Mutex<Connection>);

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
);
INSERT OR IGNORE INTO schema_version (version) VALUES (1);

CREATE TABLE IF NOT EXISTS ai_conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    context_key TEXT NOT NULL DEFAULT 'machine',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ai_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('system','user','assistant','tool')),
    content TEXT NOT NULL,
    model TEXT,
    tokens INTEGER,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conv
    ON ai_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS ai_memory_facts (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'machine',
    source TEXT NOT NULL DEFAULT 'observed'
        CHECK (source IN ('observed','user','ai-suggested')),
    confidence REAL,
    observed_at INTEGER NOT NULL,
    expires_at INTEGER,
    pinned INTEGER NOT NULL DEFAULT 0,
    UNIQUE (scope, key)
);
CREATE INDEX IF NOT EXISTS idx_ai_memory_facts_scope
    ON ai_memory_facts (scope, observed_at);

CREATE VIRTUAL TABLE IF NOT EXISTS ai_search_index USING fts5(
    entity_type,
    entity_id UNINDEXED,
    title,
    body,
    tokenize = 'porter unicode61'
);
"#;

pub fn open(app: &AppHandle) -> Result<MemoryState, MemoryError> {
    let dir: PathBuf = app
        .path()
        .app_data_dir()
        .map_err(|e| MemoryError::Io(e.to_string()))?;
    fs::create_dir_all(&dir).map_err(|e| MemoryError::Io(e.to_string()))?;
    let path = dir.join("windog.memory.db");
    let conn = Connection::open(path).map_err(|e| MemoryError::Sql(e.to_string()))?;
    conn
        .execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .map_err(|e| MemoryError::Sql(e.to_string()))?;
    migrate(&conn)?;
    Ok(MemoryState(Mutex::new(conn)))
}

fn migrate(conn: &Connection) -> Result<(), MemoryError> {
    conn
        .execute_batch(SCHEMA)
        .map_err(|e| MemoryError::Sql(e.to_string()))?;
    // Future migrations go here, gated on schema_version.
    let _ = conn.query_row("SELECT version FROM schema_version LIMIT 1", [], |_| Ok(()));
    Ok(())
}

// Helper to lock without poisoning.
pub fn lock(conn: &Mutex<Connection>) -> std::sync::MutexGuard<'_, Connection> {
    conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[allow(dead_code)]
pub fn with_conn<T, F>(state: &MemoryState, f: F) -> Result<T, MemoryError>
where
    F: FnOnce(&Connection) -> SqlResult<T>,
{
    let guard = lock(&state.0);
    f(&guard).map_err(|e| MemoryError::Sql(e.to_string()))
}