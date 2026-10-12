use serde::Serialize;
use specta::Type;

use crate::http_engine::RequestSpec;

/// A row as the sidebar and palette show it. The full request is fetched separately when reopening.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: u32,
    /// Unix milliseconds (a float so it stays a plain JS number).
    pub ts: f64,
    pub method: String,
    pub url: String,
    /// None when the request failed before a response arrived.
    pub status: Option<u16>,
    pub duration_ms: Option<u32>,
    pub size_bytes: Option<u32>,
    pub error: Option<String>,
    pub environment: Option<String>,
    pub request_path: Option<String>,
}

pub struct NewEntry {
    pub ts_ms: i64,
    /// Already redacted.
    pub spec: RequestSpec,
    pub status: Option<u16>,
    pub duration_ms: Option<u32>,
    pub size_bytes: Option<u32>,
    pub error: Option<String>,
    pub environment: Option<String>,
    pub request_path: Option<String>,
}
