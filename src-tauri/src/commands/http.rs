use tauri::State;

use crate::error::AppResult;
use crate::http_engine::{self, HttpState, RequestSpec, ResponseSpec};

#[tauri::command]
#[specta::specta]
pub async fn send_request(
    state: State<'_, HttpState>,
    spec: RequestSpec,
) -> AppResult<ResponseSpec> {
    http_engine::execute(state.inner(), spec).await
}
