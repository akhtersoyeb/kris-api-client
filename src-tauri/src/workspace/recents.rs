use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

use super::fs_util::write_json;
use crate::error::AppResult;

const FILE: &str = "recent-workspaces.json";
const MAX_RECENT: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RecentWorkspace {
    pub path: String,
    pub name: String,
}

pub fn load(app_dir: &Path) -> Vec<RecentWorkspace> {
    std::fs::read_to_string(app_dir.join(FILE))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save(app_dir: &Path, list: &[RecentWorkspace]) -> AppResult<()> {
    std::fs::create_dir_all(app_dir)?;
    write_json(&app_dir.join(FILE), &list)
}

/// Moves (or adds) a workspace to the front of the list.
pub fn touch(app_dir: &Path, path: &str, name: &str) -> AppResult<()> {
    let mut list = load(app_dir);
    list.retain(|r| r.path != path);
    list.insert(
        0,
        RecentWorkspace {
            path: path.into(),
            name: name.into(),
        },
    );
    list.truncate(MAX_RECENT);
    save(app_dir, &list)
}

pub fn forget(app_dir: &Path, path: &str) -> AppResult<()> {
    let mut list = load(app_dir);
    list.retain(|r| r.path != path);
    save(app_dir, &list)
}
