use std::path::Path;

use super::config::AuthConfig;
use crate::error::{AppError, AppResult};
use crate::variables::scopes::collection_of;
use crate::variables::Context;
use crate::workspace::fs_util::safe_join;
use crate::workspace::schema::COLLECTION_FILE;
use crate::workspace::store::read_container;

/// The auth of the collection a request lives in. Unreadable or missing means none, like variables.
pub fn collection_auth(root: Option<&Path>, request_path: Option<&str>) -> Option<AuthConfig> {
    let collection = collection_of(request_path?)?;
    let meta = safe_join(root?, &collection).ok()?.join(COLLECTION_FILE);
    match read_container(&meta).ok()?.auth? {
        AuthConfig::Inherit => None,
        other => Some(other),
    }
}

/// Replaces `Inherit` with whatever it points to. Unsaved requests have no collection, so they get none.
pub fn effective(root: Option<&Path>, request_path: Option<&str>, auth: &AuthConfig) -> AuthConfig {
    match auth {
        AuthConfig::Inherit => collection_auth(root, request_path).unwrap_or(AuthConfig::None),
        other => other.clone(),
    }
}

/// Substitutes {{variables}} in every field. Undefined variables fail the send: unlike a header,
/// credentials containing a literal "{{token}}" are never what anyone meant.
pub fn substitute(context: &Context, auth: AuthConfig) -> AppResult<AuthConfig> {
    let mut missing: Vec<String> = Vec::new();
    let mut sub = |text: &str| -> String {
        let resolved = context.resolve(text);
        missing.extend(resolved.unresolved);
        missing.extend(resolved.cyclic);
        resolved.text
    };
    let resolved = match auth {
        AuthConfig::Basic { username, password } => AuthConfig::Basic {
            username: sub(&username),
            password: sub(&password),
        },
        AuthConfig::Bearer { token, prefix } => AuthConfig::Bearer {
            token: sub(&token),
            prefix: sub(&prefix),
        },
        AuthConfig::ApiKey {
            key,
            value,
            location,
        } => AuthConfig::ApiKey {
            key: sub(&key),
            value: sub(&value),
            location,
        },
        other => other,
    };
    if !missing.is_empty() {
        missing.sort();
        missing.dedup();
        return Err(AppError::InvalidInput(format!(
            "The authorization settings use variables that aren't defined: {}. Select an environment or define them first.",
            missing.join(", ")
        )));
    }
    Ok(resolved)
}
