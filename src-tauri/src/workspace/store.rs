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

// ---------- path helpers ----------

fn depth_of(rel: &str) -> usize {
    Path::new(rel).components().count()
}

fn is_request(rel: &str) -> bool {
    rel.ends_with(REQUEST_SUFFIX)
}

/// Parent of a node path; "" is the workspace itself (parent of collections).
fn parent_rel(rel: &str) -> String {
    match rel.rsplit_once('/') {
        Some((parent, _)) if parent != COLLECTIONS_DIR => parent.to_string(),
        _ => String::new(),
    }
}

/// Anything inside collections/: a collection, folder or request.
fn ensure_node(rel: &str) -> AppResult<()> {
    if depth_of(rel) >= 2 && rel.starts_with("collections/") {
        Ok(())
    } else {
        Err(AppError::InvalidInput(format!(
            "not a collection item: {rel}"
        )))
    }
}

/// Metadata file of a container: "" is the workspace, `collections/x` a collection, deeper a folder.
fn container_meta(root: &Path, rel: &str) -> AppResult<PathBuf> {
    let dir = safe_join(root, rel)?;
    match depth_of(rel) {
        0 => Ok(dir.join(WORKSPACE_FILE)),
        1 => Err(AppError::InvalidInput(format!("invalid container: {rel}"))),
        2 => {
            ensure_node(rel)?;
            Ok(dir.join(COLLECTION_FILE))
        }
        _ => {
            ensure_node(rel)?;
            Ok(dir.join(FOLDER_FILE))
        }
    }
}

/// Only collections and folders can hold folders and requests.
fn parent_container(root: &Path, rel: &str) -> AppResult<PathBuf> {
    if depth_of(rel) < 2 {
        return Err(AppError::InvalidInput(
            "choose a collection or folder".into(),
        ));
    }
    container_meta(root, rel)
}

fn node_id(root: &Path, rel: &str) -> AppResult<String> {
    ensure_node(rel)?;
    if is_request(rel) {
        Ok(read_request(&safe_join(root, rel)?)?.id)
    } else {
        Ok(read_container(&container_meta(root, rel)?)?.id)
    }
}

fn update_container(path: &Path, change: impl FnOnce(&mut ContainerFile)) -> AppResult<()> {
    let mut container = read_container(path)?;
    change(&mut container);
    write_json(path, &container)
}

fn append_order(meta: &Path, id: &str) -> AppResult<()> {
    update_container(meta, |c| {
        c.order.retain(|x| x != id);
        c.order.push(id.to_string());
    })
}

// ---------- create ----------

pub fn create_collection(root: &Path, name: &str) -> AppResult<String> {
    let name = clean_name(name)?;
    let dir = unique_path(&root.join(COLLECTIONS_DIR), &slugify(&name), "");
    std::fs::create_dir_all(&dir)?;
    let collection = ContainerFile::new(&name);
    write_json(&dir.join(COLLECTION_FILE), &collection)?;
    append_order(&root.join(WORKSPACE_FILE), &collection.id)?;
    Ok(to_rel(root, &dir))
}

pub fn create_folder(root: &Path, parent: &str, name: &str) -> AppResult<String> {
    let name = clean_name(name)?;
    let parent_meta = parent_container(root, parent)?;
    let dir = unique_path(&safe_join(root, parent)?, &slugify(&name), "");
    std::fs::create_dir_all(&dir)?;
    let folder = ContainerFile::new(&name);
    write_json(&dir.join(FOLDER_FILE), &folder)?;
    append_order(&parent_meta, &folder.id)?;
    Ok(to_rel(root, &dir))
}

/// Always assigns a fresh id; the id in `request` is ignored.
pub fn create_request(root: &Path, parent: &str, mut request: RequestFile) -> AppResult<String> {
    let name = clean_name(&request.name)?;
    let parent_meta = parent_container(root, parent)?;
    let path = unique_path(&safe_join(root, parent)?, &slugify(&name), REQUEST_SUFFIX);
    request.name = name;
    request.id = new_id();
    request.schema_version = SCHEMA_VERSION;
    write_json(&path, &request)?;
    append_order(&parent_meta, &request.id)?;
    Ok(to_rel(root, &path))
}

// ---------- read / save a request ----------

pub fn load_request(root: &Path, rel: &str) -> AppResult<RequestFile> {
    ensure_node(rel)?;
    read_request(&safe_join(root, rel)?)
}

/// Overwrites an existing request file. Its id never changes.
pub fn save_request(root: &Path, rel: &str, mut request: RequestFile) -> AppResult<()> {
    ensure_node(rel)?;
    if !is_request(rel) {
        return Err(AppError::InvalidInput(format!("not a request file: {rel}")));
    }
    let abs = safe_join(root, rel)?;
    request.id = match read_request(&abs) {
        Ok(existing) => existing.id,
        Err(AppError::NotFound(p)) => return Err(AppError::NotFound(p)), // deleted behind our back
        Err(_) => new_id(), // corrupt file: allow overwriting it
    };
    request.schema_version = SCHEMA_VERSION;
    write_json(&abs, &request)
}

// ---------- rename / delete / duplicate ----------

pub fn rename_node(root: &Path, rel: &str, new_name: &str) -> AppResult<String> {
    ensure_node(rel)?;
    let new_name = clean_name(new_name)?;
    let abs = safe_join(root, rel)?;
    let parent = abs
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| root.to_path_buf());
    let file_name = abs
        .file_name()
        .map(|f| f.to_string_lossy().into_owned())
        .unwrap_or_default();

    let (suffix, current_stem) = if is_request(rel) {
        let mut request = read_request(&abs)?;
        request.name = new_name.clone();
        write_json(&abs, &request)?;
        (
            REQUEST_SUFFIX,
            file_name.trim_end_matches(REQUEST_SUFFIX).to_string(),
        )
    } else {
        update_container(&container_meta(root, rel)?, |c| c.name = new_name.clone())?;
        ("", file_name)
    };

    let slug = slugify(&new_name);
    if slug == current_stem {
        return Ok(rel.to_string()); // only the display name changed
    }
    let target = unique_path(&parent, &slug, suffix);
    std::fs::rename(&abs, &target)?;
    Ok(to_rel(root, &target))
}

pub fn delete_node(root: &Path, rel: &str) -> AppResult<()> {
    ensure_node(rel)?;
    let abs = safe_join(root, rel)?;
    let id = node_id(root, rel)?;
    if abs.is_dir() {
        std::fs::remove_dir_all(&abs)?;
    } else {
        std::fs::remove_file(&abs)?;
    }
    let parent_meta = container_meta(root, &parent_rel(rel))?;
    update_container(&parent_meta, |c| c.order.retain(|x| *x != id))
}

/// Copies a folder or collection, giving every node inside a fresh id.
fn copy_tree(
    src: &Path,
    dst: &Path,
    ids: &mut std::collections::HashMap<String, String>,
) -> AppResult<()> {
    std::fs::create_dir_all(dst)?;
    let mut meta: Option<(PathBuf, ContainerFile)> = None;
    for entry in std::fs::read_dir(src)?.flatten() {
        let from = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let to = dst.join(&name);
        if from.is_dir() {
            copy_tree(&from, &to, ids)?;
        } else if name.ends_with(REQUEST_SUFFIX) {
            let mut request = read_request(&from)?;
            let id = new_id();
            ids.insert(request.id.clone(), id.clone());
            request.id = id;
            write_json(&to, &request)?;
        } else if name == COLLECTION_FILE || name == FOLDER_FILE {
            meta = Some((to, read_container(&from)?));
        }
    }
    // Metadata last, so `order` can be remapped to the children's new ids.
    if let Some((path, mut container)) = meta {
        let id = new_id();
        ids.insert(container.id.clone(), id.clone());
        container.id = id;
        container.order = container
            .order
            .iter()
            .filter_map(|old| ids.get(old).cloned())
            .collect();
        write_json(&path, &container)?;
    }
    Ok(())
}

pub fn duplicate_node(root: &Path, rel: &str) -> AppResult<String> {
    ensure_node(rel)?;
    let abs = safe_join(root, rel)?;
    let parent_abs = abs
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| root.to_path_buf());
    let parent_meta = container_meta(root, &parent_rel(rel))?;
    let original_id = node_id(root, rel)?;

    let (target, copy_id) = if is_request(rel) {
        let mut request = read_request(&abs)?;
        request.id = new_id();
        request.name = format!("{} copy", request.name);
        let target = unique_path(&parent_abs, &slugify(&request.name), REQUEST_SUFFIX);
        write_json(&target, &request)?;
        (target, request.id)
    } else {
        let name = format!("{} copy", read_container(&container_meta(root, rel)?)?.name);
        let target = unique_path(&parent_abs, &slugify(&name), "");
        copy_tree(&abs, &target, &mut std::collections::HashMap::new())?;
        let meta = container_meta(root, &to_rel(root, &target))?;
        update_container(&meta, |c| c.name = name)?;
        let id = read_container(&meta)?.id;
        (target, id)
    };

    // Place the copy right after the original.
    update_container(&parent_meta, |c| {
        let at = c
            .order
            .iter()
            .position(|x| *x == original_id)
            .map_or(c.order.len(), |i| i + 1);
        c.order.insert(at, copy_id);
    })?;
    Ok(to_rel(root, &target))
}

/// Moves `rel` under `new_parent` ("" = top level, for reordering collections) and sets the
/// parent's child order to `order` (full list of child ids, including the moved node).
/// Returns the node's new path.
pub fn move_node(root: &Path, rel: &str, new_parent: &str, order: &[String]) -> AppResult<String> {
    ensure_node(rel)?;
    let abs = safe_join(root, rel)?;
    let old_parent = parent_rel(rel);
    let id = node_id(root, rel)?;
    let new_parent_meta = container_meta(root, new_parent)?; // also validates new_parent
    let mut new_rel = rel.to_string();

    if old_parent != new_parent {
        let is_collection = !is_request(rel) && depth_of(rel) == 2;
        if is_collection || new_parent.is_empty() {
            return Err(AppError::InvalidInput(
                "collections can only be reordered, and folders and requests must live in a collection".into(),
            ));
        }
        let new_dir = safe_join(root, new_parent)?;
        if new_dir.starts_with(&abs) {
            return Err(AppError::InvalidInput(
                "a folder can't be moved into itself".into(),
            ));
        }
        let file_name = abs
            .file_name()
            .map(|f| f.to_string_lossy().into_owned())
            .unwrap_or_default();
        let target = if is_request(rel) {
            unique_path(
                &new_dir,
                file_name.trim_end_matches(REQUEST_SUFFIX),
                REQUEST_SUFFIX,
            )
        } else {
            unique_path(&new_dir, &file_name, "")
        };
        std::fs::rename(&abs, &target)?;
        new_rel = to_rel(root, &target);
        update_container(&container_meta(root, &old_parent)?, |c| {
            c.order.retain(|x| *x != id)
        })?;
    }

    let order = order.to_vec();
    update_container(&new_parent_meta, |c| c.order = order)?;
    Ok(new_rel)
}
