use std::sync::Arc;

use tauri::State;

use super::db::MemoryStore;
use super::models::{
    AiConversation, AiMemoryFact, AiMessage, MemoryBootstrap, MemoryError, MemorySearchHit,
    MemoryStats,
};

/// Run one blocking SQLite operation off the async runtime and the UI thread.
async fn run<T, F>(state: State<'_, Arc<MemoryStore>>, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&MemoryStore) -> Result<T, MemoryError> + Send + 'static,
{
    let store = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || task(&store))
        .await
        .map_err(|error| format!("memory task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn memory_bootstrap(
    state: State<'_, Arc<MemoryStore>>,
    context_key: Option<String>,
    conversation_limit: Option<i64>,
    message_limit: Option<i64>,
) -> Result<MemoryBootstrap, String> {
    let context_key = context_key.unwrap_or_else(|| "machine".to_string());
    let conversation_limit = conversation_limit.unwrap_or(50);
    let message_limit = message_limit.unwrap_or(200);
    run(state, move |store| {
        store.bootstrap(&context_key, conversation_limit, message_limit)
    })
    .await
}

#[tauri::command]
pub async fn memory_conversation_create(
    state: State<'_, Arc<MemoryStore>>,
    title: Option<String>,
    context_key: Option<String>,
) -> Result<AiConversation, String> {
    run(state, move |store| {
        store.conversation_create(title, context_key)
    })
    .await
}

#[tauri::command]
pub async fn memory_conversation_list(
    state: State<'_, Arc<MemoryStore>>,
    context_key: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
    archived: Option<bool>,
) -> Result<Vec<AiConversation>, String> {
    run(state, move |store| {
        store.conversation_list(context_key.as_deref(), limit, offset, archived)
    })
    .await
}

#[tauri::command]
pub async fn memory_conversation_delete(
    state: State<'_, Arc<MemoryStore>>,
    id: String,
) -> Result<(), String> {
    run(state, move |store| store.conversation_delete(&id)).await
}

#[tauri::command]
pub async fn memory_conversation_rename(
    state: State<'_, Arc<MemoryStore>>,
    id: String,
    title: String,
) -> Result<(), String> {
    run(state, move |store| store.conversation_rename(&id, &title)).await
}

#[tauri::command]
pub async fn memory_conversation_messages(
    state: State<'_, Arc<MemoryStore>>,
    conversation_id: String,
    limit: Option<i64>,
) -> Result<Vec<AiMessage>, String> {
    run(state, move |store| {
        store.messages(&conversation_id, limit)
    })
    .await
}

#[tauri::command]
pub async fn memory_turn_append(
    state: State<'_, Arc<MemoryStore>>,
    conversation_id: String,
    user_content: String,
    assistant_content: String,
    model: Option<String>,
    title: Option<String>,
) -> Result<(), String> {
    run(state, move |store| {
        store.turn_append(
            &conversation_id,
            &user_content,
            &assistant_content,
            model.as_deref(),
            title.as_deref(),
        )
    })
    .await
}

#[tauri::command]
pub async fn memory_fact_upsert(
    state: State<'_, Arc<MemoryStore>>,
    scope: Option<String>,
    key: String,
    value: String,
    source: Option<String>,
    confidence: Option<f64>,
    expires_at: Option<i64>,
    pinned: Option<bool>,
) -> Result<AiMemoryFact, String> {
    run(state, move |store| {
        store.fact_upsert(scope, key, value, source, confidence, expires_at, pinned)
    })
    .await
}

#[tauri::command]
pub async fn memory_fact_list(
    state: State<'_, Arc<MemoryStore>>,
    scope: Option<String>,
    include_expired: Option<bool>,
) -> Result<Vec<AiMemoryFact>, String> {
    run(state, move |store| {
        store.fact_list(scope, include_expired)
    })
    .await
}

#[tauri::command]
pub async fn memory_fact_delete(
    state: State<'_, Arc<MemoryStore>>,
    id: String,
) -> Result<(), String> {
    run(state, move |store| store.fact_delete(&id)).await
}

#[tauri::command]
pub async fn memory_fact_clear(
    state: State<'_, Arc<MemoryStore>>,
    scope: Option<String>,
) -> Result<(), String> {
    run(state, move |store| store.fact_clear(scope)).await
}

#[tauri::command]
pub async fn memory_search(
    state: State<'_, Arc<MemoryStore>>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<MemorySearchHit>, String> {
    run(state, move |store| store.search(&query, limit)).await
}

#[tauri::command]
pub async fn memory_stats(state: State<'_, Arc<MemoryStore>>) -> Result<MemoryStats, String> {
    run(state, |store| store.stats()).await
}

#[tauri::command]
pub async fn memory_clear_all(state: State<'_, Arc<MemoryStore>>) -> Result<(), String> {
    run(state, |store| store.clear_all()).await
}
