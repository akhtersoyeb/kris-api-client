use std::path::Path;

use super::builtins;
use super::environments;
use super::resolver::Context;
use super::scopes::{collection_of, fill_secrets, require_secrets};
use super::secrets::SecretStore;
use super::types::{VariableInfo, VariableScope};
use crate::error::{AppError, AppResult};
use crate::workspace::fs_util::safe_join;
use crate::workspace::schema::{COLLECTION_FILE, WORKSPACE_FILE};
use crate::workspace::store::read_container;

/// Layers globals, the request's collection and the chosen environment (in that order, so later wins).
/// `secrets: None` builds a context that never touches the keychain (secret values stay empty).
pub fn build(
    root: &Path,
    secrets: Option<&dyn SecretStore>,
    environment_id: Option<&str>,
    request_path: Option<&str>,
) -> AppResult<Context> {
    let workspace = read_container(&root.join(WORKSPACE_FILE))?;
    let mut context = Context::new(builtins::dynamic_value);

    let globals = fill_secrets(secrets, &workspace.id, &workspace.id, &workspace.variables);
    context.add_layer(VariableScope::Global, &strict(secrets, globals)?);

    if let Some(collection_path) = request_path.and_then(collection_of) {
        // A request that isn't inside a readable collection simply has no collection layer.
        if let Ok(collection) =
            read_container(&safe_join(root, &collection_path)?.join(COLLECTION_FILE))
        {
            let filled = fill_secrets(
                secrets,
                &workspace.id,
                &collection.id,
                &collection.variables,
            );
            context.add_layer(VariableScope::Collection, &strict(secrets, filled)?);
        }
    }

    if let Some(id) = environment_id {
        match environments::load_inner(root, secrets, &workspace.id, id) {
            Ok(env) => {
                if let (Some(message), Some(_)) = (env.secrets_error, secrets) {
                    return Err(AppError::Keychain(message));
                }
                context.add_layer(VariableScope::Environment, &env.variables);
            }
            Err(AppError::NotFound(_)) => {} // a deleted environment is treated as "none selected"
            Err(e) => return Err(e),
        }
    }
    Ok(context)
}

/// With a store, a keychain failure must stop the send; without one there is nothing to fail.
fn strict(
    secrets: Option<&dyn SecretStore>,
    result: (Vec<super::types::Variable>, Option<String>),
) -> AppResult<Vec<super::types::Variable>> {
    if secrets.is_some() {
        require_secrets(result)
    } else {
        Ok(result.0)
    }
}

/// The effective variables for highlighting and tooltips. Secret values are never included.
pub fn describe(context: &Context) -> Vec<VariableInfo> {
    let mut infos: Vec<VariableInfo> = context
        .entries()
        .map(|(name, entry)| VariableInfo {
            name: name.clone(),
            scope: entry.scope,
            secret: entry.secret,
            value: if entry.secret {
                String::new()
            } else {
                entry.value.clone()
            },
        })
        .collect();
    infos.sort_by_key(|a| a.name.to_lowercase());
    infos.extend(builtins::NAMES.iter().map(|name| VariableInfo {
        name: (*name).to_string(),
        scope: VariableScope::Builtin,
        secret: false,
        value: String::new(),
    }));
    infos
}
