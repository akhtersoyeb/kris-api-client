use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;

use crate::auth::config::{OAuth2Config, OAuth2Grant};
use crate::error::{AppError, AppResult};
use crate::variables::secrets::{account, SecretStore};

/// Tokens this close to expiry are treated as expired, so a request doesn't leave with one that dies in flight.
const SKEW_MS: i64 = 30_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredToken {
    pub access_token: String,
    pub refresh_token: Option<String>,
    /// None when the server didn't say how long the token lives.
    pub expires_at_ms: Option<i64>,
    pub token_type: String,
    pub scope: Option<String>,
}

impl StoredToken {
    pub fn is_fresh(&self, now_ms: i64) -> bool {
        self.expires_at_ms.is_none_or(|at| at - SKEW_MS > now_ms)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum TokenState {
    None,
    Valid,
    Expired,
}

/// What the UI is allowed to know about a token. The token itself never leaves the backend.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TokenStatus {
    pub state: TokenState,
    /// Seconds until expiry (negative once expired); None if unknown.
    pub expires_in: Option<i32>,
    pub scope: Option<String>,
    pub refreshable: bool,
}

pub fn status(token: Option<&StoredToken>, now_ms: i64) -> TokenStatus {
    match token {
        None => TokenStatus {
            state: TokenState::None,
            expires_in: None,
            scope: None,
            refreshable: false,
        },
        Some(t) => TokenStatus {
            state: if t.is_fresh(now_ms) {
                TokenState::Valid
            } else {
                TokenState::Expired
            },
            expires_in: t.expires_at_ms.map(|at| {
                ((at - now_ms) / 1000).clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32
            }),
            scope: t.scope.clone(),
            refreshable: t.refresh_token.is_some(),
        },
    }
}

/// Identifies "the same OAuth setup". Changing the endpoint, client, scope or grant needs a new token, and so
/// does switching environment when those values come from variables (this runs on the substituted config).
pub fn token_key(config: &OAuth2Config) -> String {
    let mut hasher = Sha256::new();

    for part in [
        &config.token_url,
        &config.auth_url,
        &config.client_id,
        &config.scope,
    ] {
        hasher.update(part.trim().as_bytes());
        hasher.update([0u8]);
    }

    hasher.update([match config.grant {
        OAuth2Grant::ClientCredentials => 1u8,
        OAuth2Grant::AuthorizationCode => 2u8,
    }]);

    let digest = hasher.finalize();
    let mut output = String::with_capacity(digest.len() * 2);

    for byte in digest.as_slice() {
        use std::fmt::Write;
        write!(&mut output, "{byte:02x}").expect("writing to String cannot fail");
    }

    output
}

/// Reads a token endpoint's answer. `previous_refresh` is kept when a refresh response omits a new one.
pub fn parse_token_response(
    http_ok: bool,
    body: &[u8],
    now_ms: i64,
    previous_refresh: Option<&str>,
) -> AppResult<StoredToken> {
    let value: serde_json::Value = serde_json::from_slice(body).map_err(|_| {
        AppError::Auth(if http_ok {
            "The token endpoint didn't return JSON.".into()
        } else {
            "The token endpoint rejected the request (and didn't explain why).".into()
        })
    })?;

    if let Some(error) = value.get("error").and_then(|v| v.as_str()) {
        let message = match value.get("error_description").and_then(|v| v.as_str()) {
            Some(description) => format!("{error}: {description}"),
            None => error.to_string(),
        };
        return Err(AppError::Auth(message));
    }
    if !http_ok {
        return Err(AppError::Auth(
            "The token endpoint rejected the request.".into(),
        ));
    }

    let access_token = value
        .get("access_token")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::Auth("The token response has no access_token.".into()))?
        .to_string();
    // Servers disagree on whether expires_in is a number or a string.
    let expires_in = value
        .get("expires_in")
        .and_then(|v| {
            v.as_f64()
                .or_else(|| v.as_str().and_then(|s| s.trim().parse::<f64>().ok()))
        })
        .map(|secs| secs as i64)
        .filter(|secs| *secs > 0);

    Ok(StoredToken {
        access_token,
        refresh_token: value
            .get("refresh_token")
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .or_else(|| previous_refresh.map(str::to_string)),
        expires_at_ms: expires_in.map(|secs| now_ms + secs * 1000),
        token_type: value
            .get("token_type")
            .and_then(|v| v.as_str())
            .unwrap_or("Bearer")
            .to_string(),
        scope: value
            .get("scope")
            .and_then(|v| v.as_str())
            .map(str::to_string),
    })
}

// ---------- keychain storage ----------
//
// A token (JWT access token plus refresh token) can exceed what Windows Credential Manager accepts in one
// entry, so the JSON is split into chunks. `account` holds the chunk count; `account/<n>` holds the pieces.

const SCOPE: &str = "oauth";
const CHUNK_CHARS: usize = 900;
const MAX_CHUNKS: usize = 32;

fn chunk_account(base: &str, index: usize) -> String {
    format!("{base}/{index}")
}

fn chunk_count(secrets: &dyn SecretStore, base: &str) -> usize {
    secrets
        .get(base)
        .ok()
        .flatten()
        .and_then(|head| head.parse::<usize>().ok())
        .filter(|n| *n <= MAX_CHUNKS)
        .unwrap_or(0)
}

pub fn save(
    secrets: &dyn SecretStore,
    workspace_id: &str,
    key: &str,
    token: &StoredToken,
) -> AppResult<()> {
    let base = account(workspace_id, SCOPE, key);
    let json = serde_json::to_string(token)
        .map_err(|e| AppError::Internal(format!("could not serialize token: {e}")))?;
    let chars: Vec<char> = json.chars().collect();
    let chunks: Vec<String> = chars
        .chunks(CHUNK_CHARS)
        .map(|c| c.iter().collect())
        .collect();
    if chunks.len() > MAX_CHUNKS {
        return Err(AppError::Auth("The token is too large to store.".into()));
    }

    let previous = chunk_count(secrets, &base);
    for (index, chunk) in chunks.iter().enumerate() {
        secrets.set(&chunk_account(&base, index), chunk)?;
    }
    secrets.set(&base, &chunks.len().to_string())?; // written last: readers never see a half-written token
    for index in chunks.len()..previous {
        secrets.delete(&chunk_account(&base, index))?;
    }
    Ok(())
}

/// A token that is missing, incomplete or unparsable counts as "no token".
pub fn load(
    secrets: &dyn SecretStore,
    workspace_id: &str,
    key: &str,
) -> AppResult<Option<StoredToken>> {
    let base = account(workspace_id, SCOPE, key);
    let Some(head) = secrets.get(&base)? else {
        return Ok(None);
    };
    let Ok(count) = head.parse::<usize>() else {
        return Ok(None);
    };
    if count == 0 || count > MAX_CHUNKS {
        return Ok(None);
    }
    let mut json = String::new();
    for index in 0..count {
        match secrets.get(&chunk_account(&base, index))? {
            Some(part) => json.push_str(&part),
            None => return Ok(None),
        }
    }
    Ok(serde_json::from_str(&json).ok())
}

pub fn clear(secrets: &dyn SecretStore, workspace_id: &str, key: &str) -> AppResult<()> {
    let base = account(workspace_id, SCOPE, key);
    for index in 0..chunk_count(secrets, &base) {
        secrets.delete(&chunk_account(&base, index))?;
    }
    secrets.delete(&base)
}
