use tauri::State;

use crate::commands::workspace::blocking;
use crate::error::AppResult;
use crate::http_engine::{self, HttpState, RequestSpec, ResponseSpec};
use crate::variables::{apply::apply, builtins, context, Context, SecretsState};

use crate::workspace::WorkspaceState;

#[tauri::command]
#[specta::specta]
pub async fn send_request(
    http: State<'_, HttpState>,
    workspace: State<'_, WorkspaceState>,
    secrets: State<'_, SecretsState>,
    request_id: String,
    spec: RequestSpec,
    environment_id: Option<String>,
    request_path: Option<String>,
) -> AppResult<ResponseSpec> {
    let root = workspace.root().ok(); // without a workspace, only built-in variables are available
    let store = secrets.store.clone();

    // Reading files and the keychain can block, so keep it off the async threads.
    let applied = blocking(move || {
        let ctx = match root {
            Some(root) => context::build(
                &root,
                Some(store.as_ref()),
                environment_id.as_deref(),
                request_path.as_deref(),
            )?,
            None => Context::new(builtins::dynamic_value),
        };
        apply(&ctx, spec)
    })
    .await?;

    let token = http.register(&request_id);
    let result = http_engine::execute_cancellable(http.inner(), applied.spec, &token).await;
    http.unregister(&request_id);

    result.map(|mut response| {
        response.unresolved = applied.unresolved;
        response
    })
}

#[tauri::command]
#[specta::specta]
pub fn cancel_request(state: State<'_, HttpState>, request_id: String) -> bool {
    state.cancel(&request_id)
}
