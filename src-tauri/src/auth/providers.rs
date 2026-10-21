use base64::{engine::general_purpose::STANDARD, Engine as _};
use url::form_urlencoded::{byte_serialize, parse};

use super::config::{ApiKeyLocation, AuthConfig};
use crate::error::{AppError, AppResult};
use crate::http_engine::{KeyValue, RequestSpec};

/// Adds credentials to an outgoing request. Everything it needs is already resolved (variables
/// substituted, tokens fetched), so providers stay synchronous and easy to test.
pub trait AuthProvider {
    fn apply(&self, spec: &mut RequestSpec) -> AppResult<()>;
}

fn has_header(spec: &RequestSpec, name: &str) -> bool {
    spec.headers
        .iter()
        .any(|h| h.enabled && h.key.trim().eq_ignore_ascii_case(name))
}

/// A header the user wrote by hand always wins over one generated from the Auth tab.
fn add_header(spec: &mut RequestSpec, name: &str, value: String) {
    if !has_header(spec, name) {
        spec.headers.push(KeyValue {
            key: name.to_string(),
            value,
            enabled: true,
        });
    }
}

struct Basic<'a> {
    username: &'a str,
    password: &'a str,
}

impl AuthProvider for Basic<'_> {
    fn apply(&self, spec: &mut RequestSpec) -> AppResult<()> {
        if self.username.contains(':') {
            return Err(AppError::InvalidInput(
                "Basic auth usernames can't contain a colon.".into(),
            ));
        }
        let encoded = STANDARD.encode(format!("{}:{}", self.username, self.password));
        add_header(spec, "Authorization", format!("Basic {encoded}"));
        Ok(())
    }
}

struct Bearer<'a> {
    token: &'a str,
    prefix: &'a str,
}

impl AuthProvider for Bearer<'_> {
    fn apply(&self, spec: &mut RequestSpec) -> AppResult<()> {
        let token = self.token.trim();
        if token.is_empty() {
            return Err(AppError::InvalidInput("The bearer token is empty.".into()));
        }
        let prefix = if self.prefix.trim().is_empty() {
            "Bearer"
        } else {
            self.prefix.trim()
        };
        add_header(spec, "Authorization", format!("{prefix} {token}"));
        Ok(())
    }
}

struct ApiKey<'a> {
    key: &'a str,
    value: &'a str,
    location: ApiKeyLocation,
}

impl AuthProvider for ApiKey<'_> {
    fn apply(&self, spec: &mut RequestSpec) -> AppResult<()> {
        let key = self.key.trim();
        if key.is_empty() {
            return Err(AppError::InvalidInput("The API key name is empty.".into()));
        }
        if self.value.is_empty() {
            return Err(AppError::InvalidInput("The API key value is empty.".into()));
        }
        match self.location {
            ApiKeyLocation::Header => add_header(spec, key, self.value.to_string()),
            ApiKeyLocation::Query => spec.url = set_query_param(&spec.url, key, self.value),
        }
        Ok(())
    }
}

fn provider_for(config: &AuthConfig) -> Option<Box<dyn AuthProvider + '_>> {
    match config {
        AuthConfig::Inherit | AuthConfig::None | AuthConfig::OAuth2(_) => None,
        AuthConfig::Basic { username, password } => Some(Box::new(Basic { username, password })),
        AuthConfig::Bearer { token, prefix } => Some(Box::new(Bearer { token, prefix })),
        AuthConfig::ApiKey {
            key,
            value,
            location,
        } => Some(Box::new(ApiKey {
            key,
            value,
            location: *location,
        })),
    }
}

pub fn apply_auth(config: &AuthConfig, spec: &mut RequestSpec) -> AppResult<()> {
    if matches!(config, AuthConfig::OAuth2(_)) {
        return Err(AppError::Internal(
            "an OAuth 2.0 token must be fetched before auth is applied".into(),
        ));
    }
    match provider_for(config) {
        Some(provider) => provider.apply(spec),
        None => Ok(()),
    }
}

/// Sets a query parameter, replacing any existing one with that name. Other parameters and the
/// #fragment are left exactly as written.
pub fn set_query_param(url: &str, key: &str, value: &str) -> String {
    let (before_hash, hash) = match url.find('#') {
        Some(i) => (&url[..i], &url[i..]),
        None => (url, ""),
    };
    let (base, query) = before_hash.split_once('?').unwrap_or((before_hash, ""));
    let encoded = format!(
        "{}={}",
        byte_serialize(key.as_bytes()).collect::<String>(),
        byte_serialize(value.as_bytes()).collect::<String>()
    );

    let mut replaced = false;
    let mut segments: Vec<String> = Vec::new();
    for segment in query.split('&').filter(|s| !s.is_empty()) {
        let name = parse(segment.as_bytes())
            .next()
            .map(|(k, _)| k.into_owned())
            .unwrap_or_default();
        if name == key {
            if !replaced {
                segments.push(encoded.clone());
                replaced = true;
            }
        } else {
            segments.push(segment.to_string());
        }
    }
    if !replaced {
        segments.push(encoded);
    }
    format!("{base}?{}{hash}", segments.join("&"))
}
