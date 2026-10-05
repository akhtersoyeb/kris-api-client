use std::path::{Path, PathBuf};

use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult};
use crate::workspace::{store, WorkspaceInfo, WorkspaceState};

/// Runs blocking file-system work off the async runtime's worker threads.
pub(crate) async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
}

async fn open_at(
    app: &AppHandle,
    state: &WorkspaceState,
    path: PathBuf,
) -> AppResult<WorkspaceInfo> {
    let info = blocking(move || {
        // Canonical root so watcher event paths line up on macOS (/private/var) and Windows (\\?\ stripped by dunce).
        let root = dunce::canonicalize(&path)
            .map_err(|_| AppError::NotFound(format!("folder not found: {}", path.display())))?;
        store::scan(&root)
    })
    .await?;
    state.open(app, PathBuf::from(&info.root));
    Ok(info)
}

#[tauri::command]
#[specta::specta]
pub async fn open_workspace(
    app: AppHandle,
    state: State<'_, WorkspaceState>,
    path: String,
) -> AppResult<WorkspaceInfo> {
    open_at(&app, state.inner(), PathBuf::from(path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn create_workspace(
    app: AppHandle,
    state: State<'_, WorkspaceState>,
    parent_dir: String,
    name: String,
) -> AppResult<WorkspaceInfo> {
    let root = blocking(move || store::create_workspace(Path::new(&parent_dir), &name)).await?;
    open_at(&app, state.inner(), root).await
}

#[tauri::command]
#[specta::specta]
pub fn close_workspace(state: State<'_, WorkspaceState>) {
    state.close();
}

#[tauri::command]
#[specta::specta]
pub async fn refresh_workspace(state: State<'_, WorkspaceState>) -> AppResult<WorkspaceInfo> {
    let root = state.root()?;
    blocking(move || store::scan(&root)).await
}
