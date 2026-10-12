use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use super::db;
use super::redact;
use super::settings::HistorySettings;
use super::types::NewEntry;
use crate::error::AppResult;
use crate::http_engine::RequestSpec;
use crate::variables::environments;
use crate::workspace::schema::WORKSPACE_FILE;
use crate::workspace::store::read_container;

pub enum Outcome {
    Response {
        status: u16,
        duration_ms: u32,
        size_bytes: u32,
    },
    Failed {
        message: String,
    },
}

pub struct RecordInput {
    /// The request as written, before variables were substituted.
    pub spec: RequestSpec,
    pub environment_id: Option<String>,
    pub request_path: Option<String>,
    pub outcome: Outcome,
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|d| i64::try_from(d.as_millis()).ok())
        .unwrap_or(0)
}

pub fn record(
    app_dir: &Path,
    root: &Path,
    settings: &HistorySettings,
    input: RecordInput,
) -> AppResult<()> {
    let workspace_id = read_container(&root.join(WORKSPACE_FILE))?.id;
    let environment = input
        .environment_id
        .as_deref()
        .and_then(|id| environments::list(root).into_iter().find(|e| e.id == id))
        .map(|e| e.name);

    let (status, duration_ms, size_bytes, error) = match input.outcome {
        Outcome::Response {
            status,
            duration_ms,
            size_bytes,
        } => (Some(status), Some(duration_ms), Some(size_bytes), None),
        Outcome::Failed { message } => (None, None, None, Some(message)),
    };

    let conn = db::open(app_dir, &workspace_id)?;
    let now = now_ms();
    db::insert(
        &conn,
        &NewEntry {
            ts_ms: now,
            spec: redact::for_history(&input.spec, settings),
            status,
            duration_ms,
            size_bytes,
            error,
            environment,
            request_path: input.request_path,
        },
    )?;
    db::prune(&conn, settings, now)
}
