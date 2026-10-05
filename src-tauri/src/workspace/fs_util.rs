use std::io::Write;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;

use crate::error::{AppError, AppResult};

/// Writes to a temp file in the same directory, flushes it to disk, then renames over the target.
/// A crash mid-write leaves either the old file or the new one, never half a file.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let dir = path
        .parent()
        .ok_or_else(|| AppError::Internal(format!("{} has no parent folder", path.display())))?;
    let mut tmp = tempfile::NamedTempFile::new_in(dir)?;
    tmp.write_all(bytes)?;
    tmp.as_file().sync_all()?;
    tmp.persist(path)
        .map_err(|e| AppError::Io(e.error.to_string()))?;
    Ok(())
}

pub fn write_json<T: Serialize>(path: &Path, value: &T) -> AppResult<()> {
    let mut text = serde_json::to_string_pretty(value)
        .map_err(|e| AppError::Internal(format!("could not serialize {}: {e}", path.display())))?;
    text.push('\n'); // friendly to git and editors
    atomic_write(path, text.as_bytes())
}

/// File-system-safe name: lowercase, dashes between words, at most 60 chars, never a reserved Windows name.
pub fn slugify(name: &str) -> String {
    let mut slug = String::new();
    let mut pending_dash = false;
    for c in name.trim().chars() {
        if c.is_alphanumeric() {
            if pending_dash && !slug.is_empty() {
                slug.push('-');
            }
            pending_dash = false;
            slug.extend(c.to_lowercase());
        } else {
            pending_dash = true;
        }
    }
    let mut slug: String = slug.chars().take(60).collect();
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.is_empty() {
        slug = "untitled".into();
    }
    let reserved = matches!(slug.as_str(), "con" | "prn" | "aux" | "nul")
        || (slug.len() == 4
            && (slug.starts_with("com") || slug.starts_with("lpt"))
            && slug.ends_with(|c: char| c.is_ascii_digit()));
    if reserved {
        slug.push_str("-item");
    }
    slug
}

/// `dir/stem+suffix`, or `dir/stem-2+suffix`, `-3`, ... if taken.
pub fn unique_path(dir: &Path, stem: &str, suffix: &str) -> PathBuf {
    let first = dir.join(format!("{stem}{suffix}"));
    if !first.exists() {
        return first;
    }
    (2..)
        .map(|n| dir.join(format!("{stem}-{n}{suffix}")))
        .find(|p| !p.exists())
        .expect("unbounded range always yields a free name")
}

/// Joins a UI-supplied relative path onto the workspace root, rejecting `..` and absolute paths.
pub fn safe_join(root: &Path, rel: &str) -> AppResult<PathBuf> {
    let mut out = root.to_path_buf();
    for component in Path::new(rel).components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            _ => return Err(AppError::InvalidInput(format!("invalid path: {rel}"))),
        }
    }
    Ok(out)
}

/// Relative path with `/` separators, the form used across IPC.
pub fn to_rel(root: &Path, abs: &Path) -> String {
    abs.strip_prefix(root)
        .unwrap_or(abs)
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}
