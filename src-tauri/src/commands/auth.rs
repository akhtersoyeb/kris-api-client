use tauri::State;

use crate::auth::{self, AuthConfig};
use crate::commands::workspace::blocking;
use crate::error::AppResult;
use crate::workspace::WorkspaceState;

#[tauri::command]
#[specta::specta]
pub async fn get_collection_auth(
    workspace: State<'_, WorkspaceState>,
    path: String,
) -> AppResult<AuthConfig> {
    let root = workspace.root()?;
    blocking(move || auth::collection::get(&root, &path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_collection_auth(
    workspace: State<'_, WorkspaceState>,
    path: String,
    auth: AuthConfig,
) -> AppResult<()> {
    let root = workspace.root()?;
    blocking(move || auth::collection::set(&root, &path, auth)).await
}
