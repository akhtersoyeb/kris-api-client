use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;

use super::scopes::{fill_secrets, store_secrets};
use super::secrets::{account, SecretStore};
use super::types::Variable;
use crate::error::{AppError, AppResult};
use crate::workspace::fs_util::{slugify, unique_path, write_json};
use crate::workspace::schema::{new_id, SCHEMA_VERSION};
use crate::workspace::store::{clean_name, read_typed};

pub const ENV_DIR: &str = "environments";
pub const ENV_SUFFIX: &str = ".env.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EnvironmentFile {
    schema_version: u32,
    id: String,
    name: String,
    #[serde(default)]
    variables: Vec<Variable>,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct EnvironmentSummary {
    pub id: String,
    pub name: String,
}

/// What the UI edits: secret values are filled in from the keychain.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub id: String,
    pub name: String,
    pub variables: Vec<Variable>,
    /// Set when the keychain couldn't be read; secret values are then empty.
    #[serde(default)]
    pub secrets_error: Option<String>,
}

fn is_env_file(path: &Path) -> bool {
    path.file_name()
        .is_some_and(|n| n.to_string_lossy().ends_with(ENV_SUFFIX))
}

fn find(root: &Path, id: &str) -> AppResult<(PathBuf, EnvironmentFile)> {
    let not_found = || AppError::NotFound(format!("environment {id}"));
    let entries = std::fs::read_dir(root.join(ENV_DIR)).map_err(|_| not_found())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !is_env_file(&path) {
            continue;
        }
        if let Ok(file) = read_typed::<EnvironmentFile>(&path) {
            if file.id == id {
                return Ok((path, file));
            }
        }
    }
    Err(not_found())
}

pub fn list(root: &Path) -> Vec<EnvironmentSummary> {
    let Ok(entries) = std::fs::read_dir(root.join(ENV_DIR)) else {
        return Vec::new();
    };
    let mut list: Vec<EnvironmentSummary> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| is_env_file(p))
        .filter_map(|p| read_typed::<EnvironmentFile>(&p).ok())
        .map(|f| EnvironmentSummary {
            id: f.id,
            name: f.name,
        })
        .collect();
    list.sort_by_key(|e| e.name.to_lowercase());
    list
}

pub fn create(root: &Path, name: &str) -> AppResult<Environment> {
    let name = clean_name(name)?;
    let dir = root.join(ENV_DIR);
    std::fs::create_dir_all(&dir)?;
    let file = EnvironmentFile {
        schema_version: SCHEMA_VERSION,
        id: new_id(),
        name,
        variables: Vec::new(),
    };
    write_json(&unique_path(&dir, &slugify(&file.name), ENV_SUFFIX), &file)?;
    Ok(Environment {
        id: file.id,
        name: file.name,
        variables: file.variables,
        secrets_error: None,
    })
}

/// `secrets: None` skips the keychain (used for previews that must never read secret values).
pub fn load_inner(
    root: &Path,
    secrets: Option<&dyn SecretStore>,
    workspace_id: &str,
    id: &str,
) -> AppResult<Environment> {
    let (_, file) = find(root, id)?;
    let (variables, secrets_error) = fill_secrets(secrets, workspace_id, &file.id, &file.variables);
    Ok(Environment {
        id: file.id,
        name: file.name,
        variables,
        secrets_error,
    })
}

pub fn load(
    root: &Path,
    secrets: &dyn SecretStore,
    workspace_id: &str,
    id: &str,
) -> AppResult<Environment> {
    load_inner(root, Some(secrets), workspace_id, id)
}

pub fn save(
    root: &Path,
    secrets: &dyn SecretStore,
    workspace_id: &str,
    env: Environment,
) -> AppResult<Environment> {
    let name = clean_name(&env.name)?;
    let (path, existing) = find(root, &env.id)?;
    let variables = store_secrets(
        secrets,
        workspace_id,
        &env.id,
        &existing.variables,
        &env.variables,
    )?;
    let file = EnvironmentFile {
        schema_version: SCHEMA_VERSION,
        id: env.id.clone(),
        name: name.clone(),
        variables,
    };
    write_json(&path, &file)?;

    // Keep the file name in step with the display name, but only when the name actually changed
    // (otherwise "dev-2" would be renamed on every save).
    if existing.name != name {
        if let Some(dir) = path.parent() {
            let target = unique_path(dir, &slugify(&name), ENV_SUFFIX);
            std::fs::rename(&path, &target)?;
        }
    }
    load(root, secrets, workspace_id, &env.id) // return what is actually stored
}

pub fn duplicate(
    root: &Path,
    secrets: &dyn SecretStore,
    workspace_id: &str,
    id: &str,
) -> AppResult<Environment> {
    let source = load(root, secrets, workspace_id, id)?;
    if let Some(message) = source.secrets_error {
        return Err(AppError::Keychain(message)); // refuse to copy a half-readable environment
    }
    let created = create(root, &format!("{} copy", source.name))?;
    save(
        root,
        secrets,
        workspace_id,
        Environment {
            variables: source.variables,
            ..created
        },
    )
}

pub fn delete(
    root: &Path,
    secrets: &dyn SecretStore,
    workspace_id: &str,
    id: &str,
) -> AppResult<()> {
    let (path, file) = find(root, id)?;
    std::fs::remove_file(&path)?;
    for v in file.variables.iter().filter(|v| v.secret) {
        let _ = secrets.delete(&account(workspace_id, &file.id, v.key.trim())); // best effort
    }
    Ok(())
}
