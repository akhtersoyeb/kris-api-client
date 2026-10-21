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
#[serde(rename = "oauth2")]
pub enum AuthConfig {
    /// On a request: use the collection's auth. On a collection it means the same as `None`.
    Inherit,
    None,
    OAuth2(OAuth2Config),
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum OAuth2Grant {
    ClientCredentials,
    AuthorizationCode,
}

/// Where the client secret goes when talking to the token endpoint.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ClientAuthMethod {
    Header,
    Body,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OAuth2Config {
    pub grant: OAuth2Grant,
    pub token_url: String,
    /// Authorization code only.
    pub auth_url: String,
    pub client_id: String,
    /// Required for client credentials; optional for authorization code with PKCE (public clients).
    pub client_secret: String,
    /// Space separated.
    pub scope: String,
    /// Authorization code only. 0 picks a free port.
    pub redirect_port: u16,
    pub client_auth: ClientAuthMethod,
    /// Header prefix for the access token; empty means "Bearer".
    pub header_prefix: String,
}
