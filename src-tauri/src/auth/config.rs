use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ApiKeyLocation {
    Header,
    Query,
}

/// How a request authenticates. Every string may contain {{variables}}.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AuthConfig {
    /// On a request: use the collection's auth. On a collection it means the same as `None`.
    Inherit,
    None,
    Basic {
        username: String,
        password: String,
    },
    /// `prefix` is usually "Bearer"; an empty prefix means "Bearer".
    Bearer {
        token: String,
        prefix: String,
    },
    ApiKey {
        key: String,
        value: String,
        location: ApiKeyLocation,
    },
}

/// Files and history entries written before auth existed have no `auth` field.
pub fn default_auth() -> AuthConfig {
    AuthConfig::Inherit
}
