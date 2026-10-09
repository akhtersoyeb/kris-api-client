use std::collections::HashSet;

use super::secrets::{account, SecretStore};
use super::types::Variable;
use crate::error::{AppError, AppResult};

use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::workspace::fs_util::{safe_join, write_json};
use crate::workspace::schema::{COLLECTIONS_DIR, COLLECTION_FILE, WORKSPACE_FILE};
use crate::workspace::store::read_container;

/// Turns UI variables into what's written to a workspace file: secret values are moved into the
/// keychain and blanked. Also removes keychain entries for variables that were deleted, renamed or un-secreted.
pub fn store_secrets(
    secrets: &dyn SecretStore,
    workspace_id: &str,
    scope_id: &str,
    previous: &[Variable],
    current: &[Variable],
) -> AppResult<Vec<Variable>> {
    let mut file_vars = Vec::with_capacity(current.len());
    for v in current {
        let key = v.key.trim().to_string();
        if key.is_empty() {
            continue;
        }
        if v.secret {
            // Empty means "unchanged": the UI shows empty when it couldn't read the keychain,
            // and saving that must not wipe the real secret.
            if !v.value.is_empty() {
                secrets.set(&account(workspace_id, scope_id, &key), &v.value)?;
            }
            file_vars.push(Variable {
                key,
                value: String::new(),
                enabled: v.enabled,
                secret: true,
            });
        } else {
            file_vars.push(Variable {
                key,
                value: v.value.clone(),
                enabled: v.enabled,
                secret: false,
            });
        }
    }

    let still_secret: HashSet<&str> = file_vars
        .iter()
        .filter(|v| v.secret)
        .map(|v| v.key.as_str())
        .collect();
    for old in previous.iter().filter(|v| v.secret) {
        if !still_secret.contains(old.key.trim()) {
            secrets.delete(&account(workspace_id, scope_id, old.key.trim()))?;
        }
    }
    Ok(file_vars)
}

/// Fills secret values from the keychain. Never fails hard: the first problem is returned alongside the
/// data so the UI can still show everything else. `None` skips the keychain (secret values stay empty).
pub fn fill_secrets(
    secrets: Option<&dyn SecretStore>,
    workspace_id: &str,
    scope_id: &str,
    variables: &[Variable],
) -> (Vec<Variable>, Option<String>) {
    let mut error: Option<String> = None;
    let filled = variables
        .iter()
        .map(|v| {
            let mut v = v.clone();
            if v.secret {
                v.value.clear();
                if let Some(store) = secrets {
                    match store.get(&account(workspace_id, scope_id, v.key.trim())) {
                        Ok(value) => v.value = value.unwrap_or_default(),
                        Err(AppError::Keychain(message)) => {
                            error.get_or_insert(message);
                        }
                        Err(other) => {
                            error.get_or_insert(other.to_string());
                        }
                    }
                }
            }
            v
        })
        .collect();
    (filled, error)
}

/// For send time, where a missing secret must stop the request instead of silently sending an empty value.
pub fn require_secrets(result: (Vec<Variable>, Option<String>)) -> AppResult<Vec<Variable>> {
    match result {
        (variables, None) => Ok(variables),
        (_, Some(message)) => Err(AppError::Keychain(message)),
    }
}

/// `collections/<name>` for any path inside that collection, else None.
pub fn collection_of(path: &str) -> Option<String> {
    let mut parts = path.split('/');
    match (parts.next(), parts.next()) {
        (Some(COLLECTIONS_DIR), Some(name)) if !name.is_empty() => {
            Some(format!("{COLLECTIONS_DIR}/{name}"))
        }
        _ => None,
    }
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ScopeRef {
    Global,
    Collection { path: String },
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ScopeVariables {
    pub variables: Vec<Variable>,
    pub secrets_error: Option<String>,
}

fn scope_meta(root: &Path, scope: &ScopeRef) -> AppResult<std::path::PathBuf> {
    match scope {
        ScopeRef::Global => Ok(root.join(WORKSPACE_FILE)),
        ScopeRef::Collection { path } => {
            if collection_of(path).as_deref() != Some(path.as_str()) {
                return Err(AppError::InvalidInput(format!("not a collection: {path}")));
            }
            Ok(safe_join(root, path)?.join(COLLECTION_FILE))
        }
    }
}

pub fn get(
    root: &Path,
    secrets: &dyn SecretStore,
    workspace_id: &str,
    scope: &ScopeRef,
) -> AppResult<ScopeVariables> {
    let container = read_container(&scope_meta(root, scope)?)?;
    // Globals use the workspace id as their scope id; collections use their own id.
    let scope_id = if matches!(scope, ScopeRef::Global) {
        workspace_id
    } else {
        &container.id
    };
    let (variables, secrets_error) =
        fill_secrets(Some(secrets), workspace_id, scope_id, &container.variables);
    Ok(ScopeVariables {
        variables,
        secrets_error,
    })
}

pub fn set(
    root: &Path,
    secrets: &dyn SecretStore,
    workspace_id: &str,
    scope: &ScopeRef,
    variables: &[Variable],
) -> AppResult<ScopeVariables> {
    let meta = scope_meta(root, scope)?;
    let mut container = read_container(&meta)?;
    let scope_id = if matches!(scope, ScopeRef::Global) {
        workspace_id.to_string()
    } else {
        container.id.clone()
    };
    container.variables = store_secrets(
        secrets,
        workspace_id,
        &scope_id,
        &container.variables,
        variables,
    )?;
    write_json(&meta, &container)?;
    get(root, secrets, workspace_id, scope)
}

/// Best-effort cleanup when a collection is deleted, so its secrets don't linger in the keychain.
pub fn purge_collection_secrets(root: &Path, secrets: &dyn SecretStore, rel: &str) {
    if collection_of(rel).as_deref() != Some(rel) {
        return;
    }
    let Ok(workspace) = read_container(&root.join(WORKSPACE_FILE)) else {
        return;
    };
    let Ok(dir) = safe_join(root, rel) else {
        return;
    };
    let Ok(collection) = read_container(&dir.join(COLLECTION_FILE)) else {
        return;
    };
    for v in collection.variables.iter().filter(|v| v.secret) {
        let _ = secrets.delete(&account(&workspace.id, &collection.id, v.key.trim()));
    }
}
