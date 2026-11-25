use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use super::models::MemoryError;

pub struct MemoryStore {
    conn: Mutex<Connection>,
}

impl MemoryStore {
    pub(crate) fn lock(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

const SCHEMA_VERSION: i64 = 2;

const BASE_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS ai_conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    context_key TEXT NOT NULL DEFAULT 'machine',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_context
    ON ai_conversations (context_key, archived, updated_at DESC);

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
"#;

pub fn open(app: &AppHandle) -> Result<Arc<MemoryStore>, MemoryError> {
    let dir: PathBuf = app
        .path()
        .app_data_dir()
        .map_err(|error| MemoryError::Io(error.to_string()))?;
    fs::create_dir_all(&dir)?;

    let path = dir.join("windog.memory.db");
    let conn = Connection::open(path)?;
    conn.busy_timeout(Duration::from_secs(5))?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         PRAGMA foreign_keys=ON;
         PRAGMA temp_store=MEMORY;",
    )?;
    migrate(&conn)?;

    Ok(Arc::new(MemoryStore {
        conn: Mutex::new(conn),
    }))
}

fn migrate(conn: &Connection) -> Result<(), MemoryError> {
    conn.execute_batch(BASE_SCHEMA)?;

    let current: i64 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_version",
        [],
        |row| row.get(0),
    )?;
    if current >= SCHEMA_VERSION {
        return Ok(());
    }

    // v2 replaces the unused FTS index with direct searches and removes
    // the debug rows created by the old settings panel.
    conn.execute_batch(
        r#"
        DROP TABLE IF EXISTS ai_search_index;
        DELETE FROM ai_conversations WHERE title = 'Test conversation';
        DELETE FROM ai_memory_facts WHERE key = 'test.fact';
        "#,
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO schema_version (version) VALUES (?1)",
        [SCHEMA_VERSION],
    )?;
    Ok(())
}
