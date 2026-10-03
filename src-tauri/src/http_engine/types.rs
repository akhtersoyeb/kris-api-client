use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct KeyValue {
    pub key: String,
    pub value: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RequestSettings {
    /// 0 means no timeout.
    pub timeout_ms: u32,
    pub follow_redirects: bool,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RequestBody {
    None,
    Json { content: String },
    Raw { content: String, mime: String },
    FormUrlEncoded { fields: Vec<KeyValue> },
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RequestSpec {
    pub method: String,
    /// Final URL including the query string.
    pub url: String,
    pub headers: Vec<KeyValue>,
    pub body: RequestBody,
    pub settings: RequestSettings,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct HeaderEntry {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum BodyEncoding {
    Utf8,
    Base64,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ResponseSpec {
    pub status: u16,
    pub status_text: String,
    pub http_version: String,
    pub headers: Vec<HeaderEntry>,
    pub body: String,
    pub body_encoding: BodyEncoding,
    pub body_truncated: bool,
    pub size_bytes: u32,
    pub duration_ms: u32,
    pub final_url: String,
    pub content_type: Option<String>,
}
