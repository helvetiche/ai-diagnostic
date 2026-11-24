use serde_json::Value;

#[tauri::command]
pub fn openrouter_chat(
    base_url: String,
    api_key: Option<String>,
    model: String,
    messages: Vec<Value>,
    temperature: f64,
    max_tokens: i64,
) -> Result<String, String> {
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    });

    let mut req = ureq::post(&url)
        .set("Content-Type", "application/json")
        .set("HTTP-Referer", "https://windog.ai")
        .set("X-Title", "Windog");

    if let Some(key) = api_key {
        if !key.trim().is_empty() {
            req = req.set("Authorization", &format!("Bearer {}", key.trim()));
        }
    }

    let response = req.send_json(body).map_err(|e| e.to_string())?;
    let json: Value = response.into_json().map_err(|e| e.to_string())?;
    let content = json
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    if content.is_empty() {
        // Surface API-level errors if present.
        if let Some(err) = json.get("error") {
            return Err(err.to_string());
        }
    }
    Ok(content)
}