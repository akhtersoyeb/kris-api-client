use serde::Serialize;
use specta::Type;

use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PingResponse {
    pub reply: String,
    pub app_version: String,
}

#[tauri::command]
#[specta::specta]
pub fn ping(message: String) -> AppResult<PingResponse> {
    let message = message.trim();
    if message.is_empty() {
        return Err(AppError::InvalidInput("message must not be empty".into()));
    }
    Ok(PingResponse {
        reply: format!("pong: {message}"),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replies_with_pong() {
        let res = ping("hello".into()).unwrap();
        assert_eq!(res.reply, "pong: hello");
    }

    #[test]
    fn rejects_empty_message() {
        assert!(matches!(ping("  ".into()), Err(AppError::InvalidInput(_))));
    }
}
