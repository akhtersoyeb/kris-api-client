use std::path::Path;

use super::config::AuthConfig;
use crate::error::AppResult;
use crate::variables::scopes::{scope_meta, ScopeRef};
use crate::workspace::fs_util::write_json;
use crate::workspace::store::read_container;

fn meta(root: &Path, collection: &str) -> AppResult<std::path::PathBuf> {
    scope_meta(
        root,
        &ScopeRef::Collection {
            path: collection.to_string(),
        },
    ) // also validates the path
}

pub fn get(root: &Path, collection: &str) -> AppResult<AuthConfig> {
    Ok(read_container(&meta(root, collection)?)?
        .auth
        .unwrap_or(AuthConfig::None))
}

/// `None` and `Inherit` both clear the setting, so collection.json stays free of an empty `auth` entry.
pub fn set(root: &Path, collection: &str, auth: AuthConfig) -> AppResult<()> {
    let path = meta(root, collection)?;
    let mut container = read_container(&path)?;
    container.auth = match auth {
        AuthConfig::None | AuthConfig::Inherit => None,
        other => Some(other),
    };
    write_json(&path, &container)
}
