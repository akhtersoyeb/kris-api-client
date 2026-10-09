use std::path::Path;

use tauri::State;

use crate::commands::workspace::blocking;
use crate::error::AppError;
use crate::error::AppResult;
use crate::variables::context;
use crate::variables::environments::{self, Environment, EnvironmentSummary};
use crate::variables::scopes::{self, ScopeRef, ScopeVariables};
use crate::variables::secrets::{SecretStore, SecretsState};
use crate::variables::types::{Resolution, VariableInfo};
use crate::workspace::schema::WORKSPACE_FILE;
use crate::workspace::store::read_container;
use crate::workspace::WorkspaceState;

/// Runs blocking work with the workspace root, its id and the secret store.
pub(crate) async fn with_workspace<T: Send + 'static>(
    workspace: &WorkspaceState,
    secrets: &SecretsState,
    work: impl FnOnce(&Path, &str, &dyn SecretStore) -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    let root = workspace.root()?;
    let store = secrets.store.clone();
    blocking(move || {
        let id = read_container(&root.join(WORKSPACE_FILE))?.id;
        work(&root, &id, store.as_ref())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn list_environments(
    workspace: State<'_, WorkspaceState>,
    secrets: State<'_, SecretsState>,
) -> AppResult<Vec<EnvironmentSummary>> {
    with_workspace(&workspace, &secrets, |root, _, _| {
        Ok(environments::list(root))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn create_environment(
    workspace: State<'_, WorkspaceState>,
    secrets: State<'_, SecretsState>,
    name: String,
) -> AppResult<Environment> {
    with_workspace(&workspace, &secrets, move |root, _, _| {
        environments::create(root, &name)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn load_environment(
    workspace: State<'_, WorkspaceState>,
    secrets: State<'_, SecretsState>,
    id: String,
) -> AppResult<Environment> {
    with_workspace(&workspace, &secrets, move |root, ws, store| {
        environments::load(root, store, ws, &id)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn save_environment(
    workspace: State<'_, WorkspaceState>,
    secrets: State<'_, SecretsState>,
    environment: Environment,
) -> AppResult<Environment> {
    with_workspace(&workspace, &secrets, move |root, ws, store| {
        environments::save(root, store, ws, environment)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn duplicate_environment(
    workspace: State<'_, WorkspaceState>,
    secrets: State<'_, SecretsState>,
    id: String,
) -> AppResult<Environment> {
    with_workspace(&workspace, &secrets, move |root, ws, store| {
        environments::duplicate(root, store, ws, &id)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_environment(
    workspace: State<'_, WorkspaceState>,
    secrets: State<'_, SecretsState>,
    id: String,
) -> AppResult<()> {
    with_workspace(&workspace, &secrets, move |root, ws, store| {
        environments::delete(root, store, ws, &id)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn get_scope_variables(
    workspace: State<'_, WorkspaceState>,
    secrets: State<'_, SecretsState>,
    scope: ScopeRef,
) -> AppResult<ScopeVariables> {
    with_workspace(&workspace, &secrets, move |root, ws, store| {
        scopes::get(root, store, ws, &scope)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn set_scope_variables(
    workspace: State<'_, WorkspaceState>,
    secrets: State<'_, SecretsState>,
    scope: ScopeRef,
    variables: Vec<crate::variables::Variable>,
) -> AppResult<ScopeVariables> {
    with_workspace(&workspace, &secrets, move |root, ws, store| {
        scopes::set(root, store, ws, &scope, &variables)
    })
    .await
}

/// Effective variables for the given environment and request (no secret values, no keychain access).
#[tauri::command]
#[specta::specta]
pub async fn variable_context(
    workspace: State<'_, WorkspaceState>,
    secrets: State<'_, SecretsState>,
    environment_id: Option<String>,
    request_path: Option<String>,
) -> AppResult<Vec<VariableInfo>> {
    with_workspace(&workspace, &secrets, move |root, _, _| {
        let ctx = context::build(
            root,
            None,
            environment_id.as_deref(),
            request_path.as_deref(),
        )?;
        Ok(context::describe(&ctx))
    })
    .await
}

/// Resolves text for display (tooltips). Dynamic variables are evaluated, secrets show as empty.
#[tauri::command]
#[specta::specta]
pub async fn resolve_preview(
    workspace: State<'_, WorkspaceState>,
    secrets: State<'_, SecretsState>,
    texts: Vec<String>,
    environment_id: Option<String>,
    request_path: Option<String>,
) -> AppResult<Vec<Resolution>> {
    if texts.len() > 200 {
        return Err(AppError::InvalidInput(
            "too many texts to resolve at once".into(),
        ));
    }
    with_workspace(&workspace, &secrets, move |root, _, _| {
        let ctx = context::build(
            root,
            None,
            environment_id.as_deref(),
            request_path.as_deref(),
        )?;
        Ok(texts.iter().map(|t| ctx.resolve(t)).collect())
    })
    .await
}
