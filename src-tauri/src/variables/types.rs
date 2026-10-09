use serde::{Deserialize, Serialize};
use specta::Type;

fn enabled_by_default() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Variable {
    pub key: String,
    #[serde(default)]
    pub value: String,
    #[serde(default = "enabled_by_default")]
    pub enabled: bool,
    /// Secret values live in the OS keychain, never in workspace files.
    #[serde(default)]
    pub secret: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum VariableScope {
    Builtin,
    Global,
    Collection,
    Environment,
}

#[derive(Debug, Clone, Default, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Resolution {
    pub text: String,
    /// Variable names that weren't defined.
    pub unresolved: Vec<String>,
    /// Variable names that reference themselves.
    pub cyclic: Vec<String>,
}

/// One effective variable as the UI sees it (secret values are never included).
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct VariableInfo {
    pub name: String,
    pub scope: VariableScope,
    pub secret: bool,
    pub value: String,
}
