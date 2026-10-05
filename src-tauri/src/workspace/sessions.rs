use std::path::{Path, PathBuf};

use super::fs_util::atomic_write;
use crate::error::{AppError, AppResult};

const MAX_BYTES: usize = 20 * 1024 * 1024;

fn session_path(app_dir: &Path, workspace_id: &str) -> AppResult<PathBuf> {
    // The id becomes a file name, so allow only characters that can't escape the folder.
    let valid = !workspace_id.is_empty()
        && workspace_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-');
    if !valid {
        return Err(AppError::InvalidInput("invalid workspace id".into()));
    }
    Ok(app_dir
        .join("sessions")
        .join(format!("{workspace_id}.json")))
}

pub fn save(app_dir: &Path, workspace_id: &str, json: &str) -> AppResult<()> {
    if json.len() > MAX_BYTES {
        return Err(AppError::InvalidInput("session data is too large".into()));
    }
    let path = session_path(app_dir, workspace_id)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    atomic_write(&path, json.as_bytes())
}

pub fn load(app_dir: &Path, workspace_id: &str) -> AppResult<Option<String>> {
    match std::fs::read_to_string(session_path(app_dir, workspace_id)?) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}
