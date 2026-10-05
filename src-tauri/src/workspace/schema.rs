use serde::{Deserialize, Serialize};
use specta::Type;

use crate::http_engine::{KeyValue, RequestSettings};

pub const SCHEMA_VERSION: u32 = 1;
pub const COLLECTIONS_DIR: &str = "collections";
pub const WORKSPACE_FILE: &str = "workspace.json";
pub const COLLECTION_FILE: &str = "collection.json";
pub const FOLDER_FILE: &str = "folder.json";
pub const REQUEST_SUFFIX: &str = ".request.json";

pub fn new_id() -> String {
    ulid::Ulid::generate().to_string()
}

/// workspace.json, collection.json and folder.json all share this shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerFile {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    /// Child ids in display order. Children not listed here sort after, by name.
    #[serde(default)]
    pub order: Vec<String>,
}

impl ContainerFile {
    pub fn new(name: &str) -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            id: new_id(),
            name: name.to_string(),
            order: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum BodyMode {
    None,
    Json,
    Raw,
    Form,
}

fn default_mime() -> String {
    "text/plain".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BodyFile {
    pub mode: BodyMode,
    #[serde(default)]
    pub json: String,
    #[serde(default)]
    pub raw: String,
    #[serde(default = "default_mime")]
    pub raw_mime: String,
    #[serde(default)]
    pub form: Vec<KeyValue>,
}

/// <name>.request.json. Mirrors the editor state so nothing is lost between body modes.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RequestFile {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub params: Vec<KeyValue>,
    #[serde(default)]
    pub headers: Vec<KeyValue>,
    pub body: BodyFile,
    pub settings: RequestSettings,
}
