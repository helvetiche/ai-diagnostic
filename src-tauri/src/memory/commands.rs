use rusqlite::params;
use tauri::State;
use uuid::Uuid;

use super::db::{lock, MemoryState};
use super::models::{
    AiConversation, AiMemoryFact, AiMessage, MemorySearchHit, MemoryStats, timestamp_now,
};

fn map_conv(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiConversation> {
    Ok(AiConversation {
        id: row.get(0)?,
        title: row.get(1)?,
        context_key: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        archived: row.get::<_, i64>(5)? != 0,
    })
}

fn map_msg(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiMessage> {
    Ok(AiMessage {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        role: row.get(2)?,
        content: row.get(3)?,
        model: row.get(4)?,
        tokens: row.get(5)?,
        created_at: row.get(6)?,
    })
}

fn map_fact(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiMemoryFact> {
    Ok(AiMemoryFact {
        id: row.get(0)?,
        key: row.get(1)?,
        value: row.get(2)?,
        scope: row.get(3)?,
        source: row.get(4)?,
        confidence: row.get(5)?,
        observed_at: row.get(6)?,
        expires_at: row.get(7)?,
        pinned: row.get::<_, i64>(8)? != 0,
    })
}

#[tauri::command]
pub fn memory_conversation_create(
    state: State<'_, MemoryState>,
    title: Option<String>,
    context_key: Option<String>,
) -> Result<AiConversation, String> {
    let title = title.unwrap_or_else(|| "New conversation".to_string());
    let context_key = context_key.unwrap_or_else(|| "machine".to_string());
    let now = timestamp_now();
    let id = Uuid::new_v4().to_string();
    let guard = lock(&state.0);
    guard
        .execute(
            "INSERT INTO ai_conversations (id,title,context_key,created_at,updated_at,archived) VALUES (?1,?2,?3,?4,?5,0)",
            params![id, title, context_key, now, now],
        )
        .map_err(|e| e.to_string())?;
    Ok(AiConversation {
        id,
        title,
        context_key,
        created_at: now,
        updated_at: now,
        archived: false,
    })
}

#[tauri::command]
pub fn memory_conversation_list(
    state: State<'_, MemoryState>,
    limit: Option<i64>,
    offset: Option<i64>,
    archived: Option<bool>,
) -> Result<Vec<AiConversation>, String> {
    let limit = limit.unwrap_or(100).clamp(1, 1000);
    let offset = offset.unwrap_or(0).max(0);
    let guard = lock(&state.0);
    let mut out = Vec::new();
    if let Some(arch) = archived {
        let flag = if arch { 1i64 } else { 0i64 };
        let mut stmt = guard
            .prepare("SELECT id,title,context_key,created_at,updated_at,archived FROM ai_conversations WHERE archived=?1 ORDER BY updated_at DESC LIMIT ?2 OFFSET ?3")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![flag, limit, offset], map_conv)
            .map_err(|e| e.to_string())?;
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
    } else {
        let mut stmt = guard
            .prepare("SELECT id,title,context_key,created_at,updated_at,archived FROM ai_conversations ORDER BY updated_at DESC LIMIT ?1 OFFSET ?2")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![limit, offset], map_conv)
            .map_err(|e| e.to_string())?;
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn memory_conversation_get(
    state: State<'_, MemoryState>,
    id: String,
) -> Result<AiConversation, String> {
    let guard = lock(&state.0);
    guard
        .query_row(
            "SELECT id,title,context_key,created_at,updated_at,archived FROM ai_conversations WHERE id=?1",
            params![id],
            map_conv,
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_conversation_delete(state: State<'_, MemoryState>, id: String) -> Result<(), String> {
    let guard = lock(&state.0);
    guard
        .execute("DELETE FROM ai_conversations WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn memory_conversation_archive(
    state: State<'_, MemoryState>,
    id: String,
    archived: bool,
) -> Result<(), String> {
    let guard = lock(&state.0);
    guard
        .execute(
            "UPDATE ai_conversations SET archived=?1, updated_at=?2 WHERE id=?3",
            params![if archived { 1 } else { 0 }, timestamp_now(), id],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn memory_conversation_touch(
    state: State<'_, MemoryState>,
    id: String,
    title: Option<String>,
) -> Result<(), String> {
    let guard = lock(&state.0);
    if let Some(t) = title {
        guard
            .execute(
                "UPDATE ai_conversations SET title=?1, updated_at=?2 WHERE id=?3",
                params![t, timestamp_now(), id],
            )
            .map_err(|e| e.to_string())?;
    } else {
        guard
            .execute(
                "UPDATE ai_conversations SET updated_at=?1 WHERE id=?2",
                params![timestamp_now(), id],
            )
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn memory_message_append(
    state: State<'_, MemoryState>,
    conversation_id: String,
    role: String,
    content: String,
    model: Option<String>,
    tokens: Option<i64>,
) -> Result<AiMessage, String> {
    if !matches!(role.as_str(), "system" | "user" | "assistant" | "tool") {
        return Err("invalid role".to_string());
    }
    let now = timestamp_now();
    let id = Uuid::new_v4().to_string();
    let guard = lock(&state.0);
    guard
        .execute(
            "INSERT INTO ai_messages (id,conversation_id,role,content,model,tokens,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![id, conversation_id, role, content, model, tokens, now],
        )
        .map_err(|e| e.to_string())?;
    guard
        .execute(
            "UPDATE ai_conversations SET updated_at=?1 WHERE id=?2",
            params![now, conversation_id],
        )
        .map_err(|e| e.to_string())?;
    Ok(AiMessage {
        id,
        conversation_id,
        role,
        content,
        model,
        tokens,
        created_at: now,
    })
}

#[tauri::command]
pub fn memory_message_list(
    state: State<'_, MemoryState>,
    conversation_id: String,
    limit: Option<i64>,
) -> Result<Vec<AiMessage>, String> {
    let limit = limit.unwrap_or(500).clamp(1, 5000);
    let guard = lock(&state.0);
    let mut stmt = guard
        .prepare("SELECT id,conversation_id,role,content,model,tokens,created_at FROM ai_messages WHERE conversation_id=?1 ORDER BY created_at ASC LIMIT ?2")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![conversation_id, limit], map_msg)
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command]
pub fn memory_message_delete(state: State<'_, MemoryState>, id: String) -> Result<(), String> {
    let guard = lock(&state.0);
    guard
        .execute("DELETE FROM ai_messages WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn memory_fact_upsert(
    state: State<'_, MemoryState>,
    scope: Option<String>,
    key: String,
    value: String,
    source: Option<String>,
    confidence: Option<f64>,
    expires_at: Option<i64>,
    pinned: Option<bool>,
) -> Result<AiMemoryFact, String> {
    if key.trim().is_empty() {
        return Err("key required".to_string());
    }
    let scope = scope.unwrap_or_else(|| "machine".to_string());
    let source = source.unwrap_or_else(|| "observed".to_string());
    if !matches!(source.as_str(), "observed" | "user" | "ai-suggested") {
        return Err("invalid source".to_string());
    }
    let now = timestamp_now();
    let id = Uuid::new_v4().to_string();
    let pinned_i = if pinned.unwrap_or(false) { 1 } else { 0 };
    let guard = lock(&state.0);
    guard
        .execute(
            "INSERT INTO ai_memory_facts (id,key,value,scope,source,confidence,observed_at,expires_at,pinned) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(scope,key) DO UPDATE SET value=excluded.value, source=excluded.source, confidence=excluded.confidence, observed_at=excluded.observed_at, expires_at=excluded.expires_at, pinned=excluded.pinned",
            params![id, key, value, scope, source, confidence, now, expires_at, pinned_i],
        )
        .map_err(|e| e.to_string())?;
    // Fetch the row (possibly updated existing id).
    let row_id: String = guard
        .query_row(
            "SELECT id FROM ai_memory_facts WHERE scope=?1 AND key=?2",
            params![scope, key],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let fact = guard
        .query_row(
            "SELECT id,key,value,scope,source,confidence,observed_at,expires_at,pinned FROM ai_memory_facts WHERE id=?1",
            params![row_id],
            map_fact,
        )
        .map_err(|e| e.to_string())?;
    Ok(fact)
}

#[tauri::command]
pub fn memory_fact_list(
    state: State<'_, MemoryState>,
    scope: Option<String>,
    include_expired: Option<bool>,
) -> Result<Vec<AiMemoryFact>, String> {
    let now = timestamp_now();
    let guard = lock(&state.0);
    let mut out = Vec::new();
    match scope {
        Some(s) => {
            let sql = if include_expired.unwrap_or(false) {
                "SELECT id,key,value,scope,source,confidence,observed_at,expires_at,pinned FROM ai_memory_facts WHERE scope=?1 ORDER BY observed_at DESC"
            } else {
                "SELECT id,key,value,scope,source,confidence,observed_at,expires_at,pinned FROM ai_memory_facts WHERE scope=?1 AND (expires_at IS NULL OR expires_at > ?2) ORDER BY observed_at DESC"
            };
            let mut stmt = guard.prepare(sql).map_err(|e| e.to_string())?;
            let rows = if include_expired.unwrap_or(false) {
                stmt.query_map(params![s], map_fact).map_err(|e| e.to_string())?
            } else {
                stmt.query_map(params![s, now], map_fact).map_err(|e| e.to_string())?
            };
            for r in rows {
                out.push(r.map_err(|e| e.to_string())?);
            }
        }
        None => {
            let sql = if include_expired.unwrap_or(false) {
                "SELECT id,key,value,scope,source,confidence,observed_at,expires_at,pinned FROM ai_memory_facts ORDER BY observed_at DESC"
            } else {
                "SELECT id,key,value,scope,source,confidence,observed_at,expires_at,pinned FROM ai_memory_facts WHERE (expires_at IS NULL OR expires_at > ?1) ORDER BY observed_at DESC"
            };
            let mut stmt = guard.prepare(sql).map_err(|e| e.to_string())?;
            let rows = if include_expired.unwrap_or(false) {
                stmt.query_map([], map_fact).map_err(|e| e.to_string())?
            } else {
                stmt.query_map(params![now], map_fact).map_err(|e| e.to_string())?
            };
            for r in rows {
                out.push(r.map_err(|e| e.to_string())?);
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn memory_fact_delete(state: State<'_, MemoryState>, id: String) -> Result<(), String> {
    let guard = lock(&state.0);
    guard
        .execute("DELETE FROM ai_memory_facts WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn memory_fact_clear(state: State<'_, MemoryState>, scope: Option<String>) -> Result<(), String> {
    let guard = lock(&state.0);
    if let Some(s) = scope {
        guard
            .execute("DELETE FROM ai_memory_facts WHERE scope=?1", params![s])
            .map_err(|e| e.to_string())?;
    } else {
        guard
            .execute("DELETE FROM ai_memory_facts", [])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn memory_search_index_upsert(
    state: State<'_, MemoryState>,
    entity_type: String,
    entity_id: String,
    title: String,
    body: String,
) -> Result<(), String> {
    let guard = lock(&state.0);
    // Remove previous entry for same entity to avoid duplicates.
    guard
        .execute(
            "DELETE FROM ai_search_index WHERE entity_type=?1 AND entity_id=?2",
            params![entity_type, entity_id],
        )
        .map_err(|e| e.to_string())?;
    guard
        .execute(
            "INSERT INTO ai_search_index (entity_type,entity_id,title,body) VALUES (?1,?2,?3,?4)",
            params![entity_type, entity_id, title, body],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn memory_search_index_delete(
    state: State<'_, MemoryState>,
    entity_type: String,
    entity_id: String,
) -> Result<(), String> {
    let guard = lock(&state.0);
    guard
        .execute(
            "DELETE FROM ai_search_index WHERE entity_type=?1 AND entity_id=?2",
            params![entity_type, entity_id],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn memory_search(
    state: State<'_, MemoryState>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<MemorySearchHit>, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let limit = limit.unwrap_or(20).clamp(1, 100);
    let guard = lock(&state.0);
    // FTS5 query; wrap in quotes to treat as phrase-ish? Use raw; caller can use FTS syntax.
    let sql = "SELECT entity_type, entity_id, title, snippet(ai_search_index, 3, '[', ']', '…', 12), bm25(ai_search_index) FROM ai_search_index WHERE ai_search_index MATCH ?1 ORDER BY bm25(ai_search_index) LIMIT ?2";
    let mut stmt = guard.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![query, limit], |r| {
            Ok(MemorySearchHit {
                entity_type: r.get(0)?,
                entity_id: r.get(1)?,
                title: r.get(2)?,
                snippet: r.get(3)?,
                rank: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command]
pub fn memory_stats(state: State<'_, MemoryState>) -> Result<MemoryStats, String> {
    let guard = lock(&state.0);
    let conversations: i64 = guard
        .query_row("SELECT COUNT(*) FROM ai_conversations", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let messages: i64 = guard
        .query_row("SELECT COUNT(*) FROM ai_messages", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let facts: i64 = guard
        .query_row("SELECT COUNT(*) FROM ai_memory_facts", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let index_entries: i64 = guard
        .query_row("SELECT COUNT(*) FROM ai_search_index", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    Ok(MemoryStats {
        conversations,
        messages,
        facts,
        index_entries,
    })
}

#[tauri::command]
pub fn memory_clear_all(state: State<'_, MemoryState>) -> Result<(), String> {
    let guard = lock(&state.0);
    guard.execute_batch(
        "DELETE FROM ai_messages; DELETE FROM ai_conversations; DELETE FROM ai_memory_facts; DELETE FROM ai_search_index;",
    ).map_err(|e| e.to_string())?;
    Ok(())
}
