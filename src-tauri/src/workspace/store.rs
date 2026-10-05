use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde::Serialize;
use specta::Type;

use super::fs_util::{safe_join, slugify, to_rel, unique_path, write_json};
use super::schema::*;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum NodeKind {
    Collection,
    Folder,
    Request,
}

/// One row of the flattened, depth-first tree.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NodeEntry {
    pub kind: NodeKind,
    pub id: String,
    pub name: String,
    /// Relative to the workspace root, `/` separated.
    pub path: String,
    pub parent_path: Option<String>,
    pub depth: u32,
    pub method: Option<String>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub id: String,
    pub root: String,
    pub name: String,
    pub nodes: Vec<NodeEntry>,
    /// Files that were skipped (invalid JSON, newer schema, ...).
    pub warnings: Vec<String>,
}

/// Result of a tree mutation: the affected node's (new) path plus a fresh tree.
#[derive(Debug, Clone, Serialize, Type)]
pub struct Mutation {
    pub path: String,
    pub info: WorkspaceInfo,
}

// ---------- reading ----------

fn label(path: &Path) -> String {
    path.file_name()
        .map(|f| f.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn read_checked(path: &Path) -> AppResult<serde_json::Value> {
    let text = std::fs::read_to_string(path).map_err(|e| match e.kind() {
        ErrorKind::NotFound => AppError::NotFound(path.display().to_string()),
        _ => AppError::Io(format!("{}: {e}", path.display())),
    })?;
    let value: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| AppError::InvalidInput(format!("{} is not valid JSON: {e}", label(path))))?;
    let version = value
        .get("schemaVersion")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    if version > u64::from(SCHEMA_VERSION) {
        return Err(AppError::Unsupported(format!(
            "{} was saved by a newer version of the app",
            label(path)
        )));
    }
    // Future: migrate older versions here before deserializing.
    Ok(value)
}

pub fn read_container(path: &Path) -> AppResult<ContainerFile> {
    serde_json::from_value(read_checked(path)?)
        .map_err(|e| AppError::InvalidInput(format!("{}: {e}", label(path))))
}

pub fn read_request(path: &Path) -> AppResult<RequestFile> {
    serde_json::from_value(read_checked(path)?)
        .map_err(|e| AppError::InvalidInput(format!("{}: {e}", label(path))))
}

struct Child {
    entry: NodeEntry,
    dir: Option<PathBuf>,
    order: Vec<String>,
}

pub fn scan(root: &Path) -> AppResult<WorkspaceInfo> {
    let workspace = read_container(&root.join(WORKSPACE_FILE)).map_err(|e| match e {
        AppError::NotFound(_) => AppError::InvalidInput(
            "This folder isn't a workspace (workspace.json not found).".into(),
        ),
        other => other,
    })?;
    let mut nodes = Vec::new();
    let mut warnings = Vec::new();
    scan_dir(
        root,
        &root.join(COLLECTIONS_DIR),
        &workspace.order,
        0,
        None,
        &mut nodes,
        &mut warnings,
    );
    Ok(WorkspaceInfo {
        id: workspace.id,
        root: root.to_string_lossy().into_owned(),
        name: workspace.name,
        nodes,
        warnings,
    })
}

fn scan_dir(
    root: &Path,
    dir: &Path,
    order: &[String],
    depth: u32,
    parent: Option<&str>,
    nodes: &mut Vec<NodeEntry>,
    warnings: &mut Vec<String>,
) {
    let Ok(read) = std::fs::read_dir(dir) else {
        return;
    };
    let mut children: Vec<Child> = Vec::new();

    for item in read.flatten() {
        let path = item.path();
        let name = item.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue; // .git, temp files, ...
        }
        let rel = to_rel(root, &path);
        let parent_path = parent.map(str::to_string);

        if path.is_dir() {
            let meta = path.join(if depth == 0 {
                COLLECTION_FILE
            } else {
                FOLDER_FILE
            });
            match read_container(&meta) {
                Ok(c) => children.push(Child {
                    entry: NodeEntry {
                        kind: if depth == 0 {
                            NodeKind::Collection
                        } else {
                            NodeKind::Folder
                        },
                        id: c.id,
                        name: c.name,
                        path: rel,
                        parent_path,
                        depth,
                        method: None,
                    },
                    dir: Some(path),
                    order: c.order,
                }),
                Err(e) => warnings.push(format!("{rel}: {e}")),
            }
        } else if depth > 0 && name.ends_with(REQUEST_SUFFIX) {
            match read_request(&path) {
                Ok(r) => children.push(Child {
                    entry: NodeEntry {
                        kind: NodeKind::Request,
                        id: r.id,
                        name: r.name,
                        path: rel,
                        parent_path,
                        depth,
                        method: Some(r.method),
                    },
                    dir: None,
                    order: Vec::new(),
                }),
                Err(e) => warnings.push(format!("{rel}: {e}")),
            }
        }
    }

    children.sort_by(|a, b| {
        let position = |c: &Child| {
            order
                .iter()
                .position(|id| *id == c.entry.id)
                .unwrap_or(usize::MAX)
        };
        position(a).cmp(&position(b)).then_with(|| {
            a.entry
                .name
                .to_lowercase()
                .cmp(&b.entry.name.to_lowercase())
        })
    });

    for child in children {
        let path = child.entry.path.clone();
        nodes.push(child.entry);
        if let Some(sub) = child.dir {
            scan_dir(
                root,
                &sub,
                &child.order,
                depth + 1,
                Some(&path),
                nodes,
                warnings,
            );
        }
    }
}

// ---------- creating a workspace ----------

pub(crate) fn clean_name(name: &str) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() {
        Err(AppError::InvalidInput("the name must not be empty".into()))
    } else {
        Ok(name.to_string())
    }
}

pub fn create_workspace(parent: &Path, name: &str) -> AppResult<PathBuf> {
    let name = clean_name(name)?;
    if !parent.is_dir() {
        return Err(AppError::NotFound(format!(
            "folder not found: {}",
            parent.display()
        )));
    }
    let root = unique_path(parent, &slugify(&name), "");
    std::fs::create_dir_all(root.join(COLLECTIONS_DIR))?;
    write_json(&root.join(WORKSPACE_FILE), &ContainerFile::new(&name))?;
    Ok(root)
}
