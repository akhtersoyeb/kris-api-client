use rusqlite::Connection;
use tauri::{AppHandle, Manager, State};

use crate::commands::workspace::blocking;
use crate::error::{AppError, AppResult};
use crate::history::recorder::now_ms;
use crate::history::{db, AppSettings, HistoryEntry, SettingsState};
use crate::http_engine::RequestSpec;
use crate::workspace::schema::WORKSPACE_FILE;
use crate::workspace::store::read_container;
use crate::workspace::WorkspaceState;

/// Opens the current workspace's history database off the async threads.
async fn with_history<T: Send + 'static>(
    app: &AppHandle,
    workspace: &WorkspaceState,
    work: impl FnOnce(&Connection) -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    let root = workspace.root()?;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    blocking(move || {
        let id = read_container(&root.join(WORKSPACE_FILE))?.id;
        work(&db::open(&dir, &id)?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn list_history(
    app: AppHandle,
    workspace: State<'_, WorkspaceState>,
    limit: u32,
    offset: u32,
) -> AppResult<Vec<HistoryEntry>> {
    let limit = limit.min(500);
    with_history(&app, &workspace, move |conn| db::list(conn, limit, offset)).await
}

#[tauri::command]
#[specta::specta]
pub async fn search_history(
    app: AppHandle,
    workspace: State<'_, WorkspaceState>,
    query: String,
    limit: u32,
) -> AppResult<Vec<HistoryEntry>> {
    let limit = limit.min(500);
    with_history(&app, &workspace, move |conn| {
        db::search(conn, &query, limit)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn get_history_request(
    app: AppHandle,
    workspace: State<'_, WorkspaceState>,
    id: u32,
) -> AppResult<RequestSpec> {
    with_history(&app, &workspace, move |conn| db::get_request(conn, id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_history_entry(
    app: AppHandle,
    workspace: State<'_, WorkspaceState>,
    id: u32,
) -> AppResult<()> {
    with_history(&app, &workspace, move |conn| db::delete(conn, id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn clear_history(app: AppHandle, workspace: State<'_, WorkspaceState>) -> AppResult<()> {
    with_history(&app, &workspace, |conn| db::clear(conn)).await
}

#[tauri::command]
#[specta::specta]
pub fn get_app_settings(settings: State<'_, SettingsState>) -> AppSettings {
    settings.get()
}

/// Saves the settings, then applies the new retention limits to the open workspace right away.
#[tauri::command]
#[specta::specta]
pub async fn set_app_settings(
    app: AppHandle,
    workspace: State<'_, WorkspaceState>,
    settings: State<'_, SettingsState>,
    new_settings: AppSettings,
) -> AppResult<AppSettings> {
    let saved = settings.set(new_settings)?;
    let history = saved.history.clone();
    // Best effort: with no workspace open there's nothing to prune.
    let _ = with_history(&app, &workspace, move |conn| {
        db::prune(conn, &history, now_ms())
    })
    .await;
    Ok(saved)
}
