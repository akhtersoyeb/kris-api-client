use tauri::State;

use crate::error::AppResult;
use crate::http_engine::{self, HttpState, RequestSpec, ResponseSpec};

#[tauri::command]
#[specta::specta]
pub async fn send_request(
    state: State<'_, HttpState>,
    request_id: String,
    spec: RequestSpec,
) -> AppResult<ResponseSpec> {
    let token = state.register(&request_id);
    let result = http_engine::execute_cancellable(state.inner(), spec, &token).await;
    state.unregister(&request_id);
    result
}

#[tauri::command]
#[specta::specta]
pub fn cancel_request(state: State<'_, HttpState>, request_id: String) -> bool {
    state.cancel(&request_id)
}
