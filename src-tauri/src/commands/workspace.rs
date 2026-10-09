use std::path::{Path, PathBuf};

use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult};
use crate::workspace::{store, WorkspaceInfo, WorkspaceState};

use crate::workspace::schema::RequestFile;
use crate::workspace::Mutation;

use crate::variables::scopes;
use crate::variables::SecretsState;

use crate::workspace::recents::RecentWorkspace;
use crate::workspace::{recents, schema::WORKSPACE_FILE, sessions};
use tauri::Manager;

/// Runs blocking file-system work off the async runtime's worker threads.
pub(crate) async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
}

fn app_dir(app: &AppHandle) -> AppResult<PathBuf> {
    app.path()
        .app_data_dir()
        .map_err(|e| AppError::Internal(e.to_string()))
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
    if let Ok(dir) = app_dir(app) {
        let _ = recents::touch(&dir, &info.root, &info.name);
    }
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

/// Runs a tree mutation, then returns the affected path plus a fresh tree.
async fn mutate(
    state: &WorkspaceState,
    op: impl FnOnce(&Path) -> AppResult<String> + Send + 'static,
) -> AppResult<Mutation> {
    let root = state.root()?;
    blocking(move || {
        let path = op(&root)?;
        let info = store::scan(&root)?;
        Ok(Mutation { path, info })
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn create_collection(
    state: State<'_, WorkspaceState>,
    name: String,
) -> AppResult<Mutation> {
    mutate(state.inner(), move |root| {
        store::create_collection(root, &name)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn create_folder(
    state: State<'_, WorkspaceState>,
    parent_path: String,
    name: String,
) -> AppResult<Mutation> {
    mutate(state.inner(), move |root| {
        store::create_folder(root, &parent_path, &name)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn create_request(
    state: State<'_, WorkspaceState>,
    parent_path: String,
    request: RequestFile,
) -> AppResult<Mutation> {
    mutate(state.inner(), move |root| {
        store::create_request(root, &parent_path, request)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn rename_node(
    state: State<'_, WorkspaceState>,
    path: String,
    new_name: String,
) -> AppResult<Mutation> {
    mutate(state.inner(), move |root| {
        store::rename_node(root, &path, &new_name)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn duplicate_node(state: State<'_, WorkspaceState>, path: String) -> AppResult<Mutation> {
    mutate(state.inner(), move |root| {
        store::duplicate_node(root, &path)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_node(
    state: State<'_, WorkspaceState>,
    secrets: State<'_, SecretsState>,
    path: String,
) -> AppResult<WorkspaceInfo> {
    let store = secrets.store.clone();
    let result = mutate(state.inner(), move |root| {
        scopes::purge_collection_secrets(root, store.as_ref(), &path);
        store::delete_node(root, &path)?;
        Ok(String::new())
    })
    .await?;
    Ok(result.info)
}

#[tauri::command]
#[specta::specta]
pub async fn load_request(
    state: State<'_, WorkspaceState>,
    path: String,
) -> AppResult<RequestFile> {
    let root = state.root()?;
    blocking(move || store::load_request(&root, &path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn save_request(
    state: State<'_, WorkspaceState>,
    path: String,
    request: RequestFile,
) -> AppResult<()> {
    let root = state.root()?;
    blocking(move || store::save_request(&root, &path, request)).await
}

#[tauri::command]
#[specta::specta]
pub async fn move_node(
    state: State<'_, WorkspaceState>,
    path: String,
    new_parent_path: String,
    order: Vec<String>,
) -> AppResult<Mutation> {
    mutate(state.inner(), move |root| {
        store::move_node(root, &path, &new_parent_path, &order)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub fn list_recent_workspaces(app: AppHandle) -> AppResult<Vec<RecentWorkspace>> {
    // Hide entries whose folder was moved or deleted.
    Ok(recents::load(&app_dir(&app)?)
        .into_iter()
        .filter(|r| Path::new(&r.path).join(WORKSPACE_FILE).is_file())
        .collect())
}

#[tauri::command]
#[specta::specta]
pub fn forget_recent_workspace(app: AppHandle, path: String) -> AppResult<()> {
    recents::forget(&app_dir(&app)?, &path)
}

#[tauri::command]
#[specta::specta]
pub async fn save_session(app: AppHandle, workspace_id: String, json: String) -> AppResult<()> {
    let dir = app_dir(&app)?;
    blocking(move || sessions::save(&dir, &workspace_id, &json)).await
}

#[tauri::command]
#[specta::specta]
pub async fn load_session(app: AppHandle, workspace_id: String) -> AppResult<Option<String>> {
    let dir = app_dir(&app)?;
    blocking(move || sessions::load(&dir, &workspace_id)).await
}
