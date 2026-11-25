use serde_json::{json, Value};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

/// Ask OpenRouter for one complete reply.
///
/// `ureq` is blocking, so the work is pushed to the blocking thread pool.
/// Keeping it in a synchronous command would run it on Tauri's main thread and
/// freeze the window until the model answered.
#[tauri::command]
pub async fn openrouter_chat(
    base_url: String,
    api_key: Option<String>,
    model: String,
    messages: Vec<Value>,
    temperature: f64,
    max_tokens: i64,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        request_chat(base_url, api_key, model, messages, temperature, max_tokens)
    })
    .await
    .map_err(|error| format!("AI request task failed: {error}"))?
}

fn request_chat(
    base_url: String,
    api_key: Option<String>,
    model: String,
    messages: Vec<Value>,
    temperature: f64,
    max_tokens: i64,
) -> Result<String, String> {
    let url = format!(
        "{}/chat/completions",
        base_url.trim().trim_end_matches('/')
    );
    let body = json!({
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    });

    let agent = ureq::AgentBuilder::new()
        .timeout_connect(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .build();

    let mut request = agent
        .post(&url)
        .set("Content-Type", "application/json")
        .set("HTTP-Referer", "https://windog.ai")
        .set("X-Title", "Windog");

    if let Some(key) = api_key {
        if !key.trim().is_empty() {
            request = request.set("Authorization", &format!("Bearer {}", key.trim()));
        }
    }

    let response = request.send_json(body).map_err(|error| match error {
        ureq::Error::Status(status, response) => {
            let detail = response.into_string().unwrap_or_default();
            let detail = detail.trim();
            if detail.is_empty() {
                format!("OpenRouter returned HTTP {status}")
            } else {
                format!("OpenRouter returned HTTP {status}: {detail}")
            }
        }
        other => format!("Could not reach OpenRouter: {other}"),
    })?;

    let json: Value = response
        .into_json()
        .map_err(|error| format!("Invalid OpenRouter response: {error}"))?;

    let content = json
        .get("choices")
        .and_then(|choices| choices.get(0))
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(|content| content.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    if content.is_empty() {
        // Surface API-level errors if present.
        if let Some(error) = json.get("error") {
            return Err(error.to_string());
        }
    }

    Ok(content)
}

#[tauri::command]
pub fn save_markdown(title: String, content: String) -> Result<String, String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|e| e.to_string())?;
    let directory = std::path::Path::new(&home).join("Documents").join("Windog");
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;

    let safe_title: String = title
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let safe_title = if safe_title.is_empty() {
        "windog-ai".to_string()
    } else {
        safe_title
    };
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let path = directory.join(format!("{safe_title}-{stamp}.md"));

    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
