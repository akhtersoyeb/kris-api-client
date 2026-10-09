use serde::Serialize;
use specta::Type;

#[allow(dead_code)]
/// Error returned from every Tauri command. Serializes to
/// `{ "kind": "InvalidInput", "message": "..." }`, so the UI can switch on `kind`.
#[derive(Debug, thiserror::Error, Serialize, Type)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("io error: {0}")]
    Io(String),
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("{0}")]
    Internal(String),
    #[error("network error: {0}")]
    Network(String),
    #[error("timed out: {0}")]
    Timeout(String),
    #[error("{0}")]
    Cancelled(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("{0}")]
    Unsupported(String),
    #[error("system keychain unavailable: {0}")]
    Keychain(String),
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

#[allow(dead_code)]
pub type AppResult<T> = Result<T, AppError>;
