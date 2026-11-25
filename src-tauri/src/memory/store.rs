use rusqlite::{params, Connection};
use uuid::Uuid;

use super::db::MemoryStore;
use super::models::{
    timestamp_now, AiConversation, AiMemoryFact, AiMessage, MemoryBootstrap, MemoryError,
    MemorySearchHit, MemoryStats,
};

fn map_conversation(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiConversation> {
    Ok(AiConversation {
        id: row.get(0)?,
        title: row.get(1)?,
        context_key: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        archived: row.get::<_, i64>(5)? != 0,
    })
}

fn map_message(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiMessage> {
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

fn map_hit(row: &rusqlite::Row<'_>) -> rusqlite::Result<MemorySearchHit> {
    Ok(MemorySearchHit {
        entity_type: row.get(0)?,
        entity_id: row.get(1)?,
        title: row.get(2)?,
        snippet: row.get(3)?,
        rank: row.get(4)?,
    })
}

fn clean(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

fn truncate(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn list_conversations(
    conn: &Connection,
    context_key: Option<&str>,
    limit: i64,
    offset: i64,
    archived: Option<bool>,
) -> Result<Vec<AiConversation>, MemoryError> {
    let limit = limit.clamp(1, 500);
    let offset = offset.max(0);
    let archived_flag = archived.map(|value| if value { 1i64 } else { 0i64 });

    let mut stmt = conn.prepare(
        "SELECT id, title, context_key, created_at, updated_at, archived
         FROM ai_conversations
         WHERE (?1 IS NULL OR context_key = ?1)
           AND (?2 IS NULL OR archived = ?2)
         ORDER BY updated_at DESC, id DESC
         LIMIT ?3 OFFSET ?4",
    )?;
    let rows = stmt.query_map(
        params![context_key, archived_flag, limit, offset],
        map_conversation,
    )?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

fn list_messages(
    conn: &Connection,
    conversation_id: &str,
    limit: i64,
) -> Result<Vec<AiMessage>, MemoryError> {
    let limit = limit.clamp(1, 1000);
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, role, content, model, tokens, created_at
         FROM (
             SELECT id, conversation_id, role, content, model, tokens, created_at
             FROM ai_messages
             WHERE conversation_id = ?1
             ORDER BY created_at DESC, id DESC
             LIMIT ?2
         )
         ORDER BY created_at ASC, id ASC",
    )?;
    let rows = stmt.query_map(params![conversation_id, limit], map_message)?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

fn like_pattern(query: &str) -> String {
    let mut pattern = String::with_capacity(query.len() + 2);
    pattern.push('%');
    for character in query.chars() {
        if matches!(character, '\\' | '%' | '_') {
            pattern.push('\\');
        }
        pattern.push(character);
    }
    pattern.push('%');
    pattern
}

impl MemoryStore {
    pub fn bootstrap(
        &self,
        context_key: &str,
        conversation_limit: i64,
        message_limit: i64,
    ) -> Result<MemoryBootstrap, MemoryError> {
        let conn = self.lock();
        let conversations = list_conversations(
            &conn,
            Some(context_key),
            conversation_limit,
            0,
            Some(false),
        )?;
        let active_conversation_id = conversations.first().map(|item| item.id.clone());
        let messages = match &active_conversation_id {
            Some(id) => list_messages(&conn, id, message_limit)?,
            None => Vec::new(),
        };

        Ok(MemoryBootstrap {
            conversations,
            active_conversation_id,
            messages,
        })
    }

    pub fn conversation_create(
        &self,
        title: Option<String>,
        context_key: Option<String>,
    ) -> Result<AiConversation, MemoryError> {
        let title = clean(title).unwrap_or_else(|| "New chat".to_string());
        let title = truncate(&title, 200);
        let context_key = clean(context_key).unwrap_or_else(|| "machine".to_string());
        let context_key = truncate(&context_key, 100);
        let now = timestamp_now();
        let id = Uuid::new_v4().to_string();

        let conn = self.lock();
        conn.execute(
            "INSERT INTO ai_conversations (id, title, context_key, created_at, updated_at, archived)
             VALUES (?1, ?2, ?3, ?4, ?5, 0)",
            params![id, title, context_key, now, now],
        )?;

        Ok(AiConversation {
            id,
            title,
            context_key,
            created_at: now,
            updated_at: now,
            archived: false,
        })
    }

    pub fn conversation_list(
        &self,
        context_key: Option<&str>,
        limit: Option<i64>,
        offset: Option<i64>,
        archived: Option<bool>,
    ) -> Result<Vec<AiConversation>, MemoryError> {
        let conn = self.lock();
        list_conversations(
            &conn,
            context_key,
            limit.unwrap_or(100),
            offset.unwrap_or(0),
            archived,
        )
    }

    pub fn conversation_delete(&self, id: &str) -> Result<(), MemoryError> {
        let conn = self.lock();
        conn.execute("DELETE FROM ai_conversations WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn conversation_rename(&self, id: &str, title: &str) -> Result<(), MemoryError> {
        let title = clean(Some(title.to_string()))
            .ok_or_else(|| MemoryError::Sql("title required".to_string()))?;
        let title = truncate(&title, 200);

        let conn = self.lock();
        conn.execute(
            "UPDATE ai_conversations SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![title, timestamp_now(), id],
        )?;
        Ok(())
    }

    pub fn messages(
        &self,
        conversation_id: &str,
        limit: Option<i64>,
    ) -> Result<Vec<AiMessage>, MemoryError> {
        let conn = self.lock();
        list_messages(&conn, conversation_id, limit.unwrap_or(200))
    }

    pub fn turn_append(
        &self,
        conversation_id: &str,
        user_content: &str,
        assistant_content: &str,
        model: Option<&str>,
        title: Option<&str>,
    ) -> Result<(), MemoryError> {
        if conversation_id.trim().is_empty() {
            return Err(MemoryError::Sql("conversation id required".to_string()));
        }
        if user_content.trim().is_empty() {
            return Err(MemoryError::Sql("user content required".to_string()));
        }
        if assistant_content.trim().is_empty() {
            return Err(MemoryError::Sql("assistant content required".to_string()));
        }

        let now = timestamp_now();
        let user_id = Uuid::new_v4().to_string();
        let assistant_id = Uuid::new_v4().to_string();
        let model = clean(model.map(|value| value.to_string()));
        let title = clean(title.map(|value| value.to_string())).map(|value| truncate(&value, 200));

        let mut conn = self.lock();
        let tx = conn.transaction()?;
        tx.execute(
            "INSERT INTO ai_messages (id, conversation_id, role, content, model, tokens, created_at)
             VALUES (?1, ?2, 'user', ?3, NULL, NULL, ?4)",
            params![user_id, conversation_id, user_content, now],
        )?;
        tx.execute(
            "INSERT INTO ai_messages (id, conversation_id, role, content, model, tokens, created_at)
             VALUES (?1, ?2, 'assistant', ?3, ?4, NULL, ?5)",
            params![assistant_id, conversation_id, assistant_content, model, now],
        )?;
        tx.execute(
            "UPDATE ai_conversations
             SET updated_at = ?1, title = COALESCE(?2, title)
             WHERE id = ?3",
            params![now, title, conversation_id],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn fact_upsert(
        &self,
        scope: Option<String>,
        key: String,
        value: String,
        source: Option<String>,
        confidence: Option<f64>,
        expires_at: Option<i64>,
        pinned: Option<bool>,
    ) -> Result<AiMemoryFact, MemoryError> {
        let key = clean(Some(key)).ok_or_else(|| MemoryError::Sql("key required".to_string()))?;
        let key = truncate(&key, 200);
        let value = truncate(&value, 20_000);
        let scope = clean(scope).unwrap_or_else(|| "machine".to_string());
        let scope = truncate(&scope, 100);
        let source = source.unwrap_or_else(|| "observed".to_string());
        if !matches!(source.as_str(), "observed" | "user" | "ai-suggested") {
            return Err(MemoryError::Sql("invalid source".to_string()));
        }
        let confidence = confidence.map(|item| item.clamp(0.0, 1.0));
        let pinned = if pinned.unwrap_or(false) { 1i64 } else { 0i64 };
        let now = timestamp_now();
        let id = Uuid::new_v4().to_string();

        let conn = self.lock();
        conn.execute(
            "INSERT INTO ai_memory_facts
                (id, key, value, scope, source, confidence, observed_at, expires_at, pinned)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(scope, key) DO UPDATE SET
                value = excluded.value,
                source = excluded.source,
                confidence = excluded.confidence,
                observed_at = excluded.observed_at,
                expires_at = excluded.expires_at,
                pinned = excluded.pinned",
            params![id, key, value, scope, source, confidence, now, expires_at, pinned],
        )?;

        let row_id: String = conn.query_row(
            "SELECT id FROM ai_memory_facts WHERE scope = ?1 AND key = ?2",
            params![scope, key],
            |row| row.get(0),
        )?;
        let fact = conn.query_row(
            "SELECT id, key, value, scope, source, confidence, observed_at, expires_at, pinned
             FROM ai_memory_facts WHERE id = ?1",
            params![row_id],
            map_fact,
        )?;
        Ok(fact)
    }

    pub fn fact_list(
        &self,
        scope: Option<String>,
        include_expired: Option<bool>,
    ) -> Result<Vec<AiMemoryFact>, MemoryError> {
        let scope = clean(scope);
        let include_expired = if include_expired.unwrap_or(false) {
            1i64
        } else {
            0i64
        };
        let now = timestamp_now();

        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT id, key, value, scope, source, confidence, observed_at, expires_at, pinned
             FROM ai_memory_facts
             WHERE (?1 IS NULL OR scope = ?1)
               AND (?2 = 1 OR expires_at IS NULL OR expires_at > ?3)
             ORDER BY pinned DESC, observed_at DESC",
        )?;
        let rows = stmt.query_map(params![scope, include_expired, now], map_fact)?;

        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn fact_delete(&self, id: &str) -> Result<(), MemoryError> {
        let conn = self.lock();
        conn.execute("DELETE FROM ai_memory_facts WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn fact_clear(&self, scope: Option<String>) -> Result<(), MemoryError> {
        let scope = clean(scope);
        let conn = self.lock();
        match scope {
            Some(scope) => {
                conn.execute(
                    "DELETE FROM ai_memory_facts WHERE scope = ?1",
                    params![scope],
                )?;
            }
            None => {
                conn.execute("DELETE FROM ai_memory_facts", [])?;
            }
        }
        Ok(())
    }

    pub fn search(&self, query: &str, limit: Option<i64>) -> Result<Vec<MemorySearchHit>, MemoryError> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(Vec::new());
        }

        let limit = limit.unwrap_or(20).clamp(1, 100);
        let pattern = like_pattern(query);
        let conn = self.lock();
        let mut out = Vec::new();

        let mut stmt = conn.prepare(
            r#"SELECT 'conversation', id, title, substr(title, 1, 160), 0.0
             FROM ai_conversations
             WHERE title LIKE ?1 ESCAPE '\'
             ORDER BY updated_at DESC
             LIMIT ?2"#,
        )?;
        let rows = stmt.query_map(params![pattern, limit], map_hit)?;
        for row in rows {
            out.push(row?);
        }

        let mut stmt = conn.prepare(
            r#"SELECT 'message', m.id, c.title,
                    substr(m.content, MAX(1, instr(lower(m.content), lower(?2)) - 40), 160),
                    0.0
             FROM ai_messages m
             JOIN ai_conversations c ON c.id = m.conversation_id
             WHERE m.content LIKE ?1 ESCAPE '\'
             ORDER BY m.created_at DESC
             LIMIT ?3"#,
        )?;
        let rows = stmt.query_map(params![pattern, query, limit], map_hit)?;
        for row in rows {
            out.push(row?);
        }

        let mut stmt = conn.prepare(
            r#"SELECT 'fact', id, key, substr(value, 1, 160), 0.0
             FROM ai_memory_facts
             WHERE key LIKE ?1 ESCAPE '\' OR value LIKE ?1 ESCAPE '\'
             ORDER BY pinned DESC, observed_at DESC
             LIMIT ?2"#,
        )?;
        let rows = stmt.query_map(params![pattern, limit], map_hit)?;
        for row in rows {
            out.push(row?);
        }

        out.truncate(limit as usize);
        Ok(out)
    }

    pub fn stats(&self) -> Result<MemoryStats, MemoryError> {
        let conn = self.lock();
        let conversations = conn.query_row("SELECT COUNT(*) FROM ai_conversations", [], |row| {
            row.get(0)
        })?;
        let messages =
            conn.query_row("SELECT COUNT(*) FROM ai_messages", [], |row| row.get(0))?;
        let facts =
            conn.query_row("SELECT COUNT(*) FROM ai_memory_facts", [], |row| row.get(0))?;

        Ok(MemoryStats {
            conversations,
            messages,
            facts,
        })
    }

    pub fn clear_all(&self) -> Result<(), MemoryError> {
        let conn = self.lock();
        let tx = conn.unchecked_transaction()?;
        tx.execute("DELETE FROM ai_messages", [])?;
        tx.execute("DELETE FROM ai_conversations", [])?;
        tx.execute("DELETE FROM ai_memory_facts", [])?;
        tx.commit()?;
        Ok(())
    }
}
