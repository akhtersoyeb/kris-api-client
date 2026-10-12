use crate::commands::workspace::blocking;
use crate::error::AppResult;
use crate::http_engine::{self, HttpState, RequestSpec, ResponseSpec};
use crate::variables::{apply::apply, builtins, context, Context, SecretsState};

use crate::workspace::WorkspaceState;

use std::path::PathBuf;

use tauri::{AppHandle, Manager, State};

use crate::error::AppError;
use crate::history::recorder::{self, Outcome, RecordInput};
use crate::history::SettingsState;

#[tauri::command]
#[specta::specta]
#[allow(clippy::too_many_arguments)]
pub async fn send_request(
    app: AppHandle,
    http: State<'_, HttpState>,
    workspace: State<'_, WorkspaceState>,
    secrets: State<'_, SecretsState>,
    settings: State<'_, SettingsState>,
    request_id: String,
    spec: RequestSpec,
    environment_id: Option<String>,
    request_path: Option<String>,
) -> AppResult<ResponseSpec> {
    let root = workspace.root().ok(); // without a workspace only built-in variables exist (and nothing is recorded)
    let store = secrets.store.clone();
    let original = spec.clone();

    let applied = {
        let root = root.clone();
        let (env, path) = (environment_id.clone(), request_path.clone());
        blocking(move || {
            let ctx = match root {
                Some(root) => {
                    context::build(&root, Some(store.as_ref()), env.as_deref(), path.as_deref())?
                }
                None => Context::new(builtins::dynamic_value),
            };
            apply(&ctx, spec)
        })
        .await?
    };

    let token = http.register(&request_id);
    let result = http_engine::execute_cancellable(http.inner(), applied.spec, &token).await;
    http.unregister(&request_id);

    record_history(
        &app,
        &settings,
        root,
        original,
        environment_id,
        request_path,
        &result,
    )
    .await;

    result.map(|mut response| {
        response.unresolved = applied.unresolved;
        response
    })
}

/// Best effort: a history problem must never turn a successful send into an error.
async fn record_history(
    app: &AppHandle,
    settings: &SettingsState,
    root: Option<PathBuf>,
    spec: RequestSpec,
    environment_id: Option<String>,
    request_path: Option<String>,
    result: &AppResult<ResponseSpec>,
) {
    let Some(root) = root else { return };
    let history = settings.history();
    if !history.enabled {
        return;
    }
    let outcome = match result {
        Ok(r) => Outcome::Response {
            status: r.status,
            duration_ms: r.duration_ms,
            size_bytes: r.size_bytes,
        },
        Err(AppError::Network(message) | AppError::Timeout(message)) => Outcome::Failed {
            message: message.clone(),
        },
        Err(_) => return, // cancelled, or never sent (invalid URL, undefined variable)
    };
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    let input = RecordInput {
        spec,
        environment_id,
        request_path,
        outcome,
    };
    if let Err(e) = blocking(move || recorder::record(&dir, &root, &history, input)).await {
        eprintln!("history: could not record request: {e}");
    }
}

#[tauri::command]
#[specta::specta]
pub fn cancel_request(state: State<'_, HttpState>, request_id: String) -> bool {
    state.cancel(&request_id)
}
