use std::path::{Path, PathBuf};
use std::time::Duration;

use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::error::{AppError, AppResult};

pub type Watcher = Debouncer<RecommendedWatcher>;

#[derive(Clone, Serialize)]
struct WorkspaceChanged {
    /// Workspace-relative paths, `/` separated.
    paths: Vec<String>,
}

fn is_noise(rel: &Path) -> bool {
    rel.components()
        .any(|c| c.as_os_str().to_string_lossy().starts_with('.'))
}

/// Emits a `workspace-changed` event (debounced) whenever something under `root` changes.
/// Our own writes trigger it too. The UI decides whether anything actually differs.
pub fn start(app: AppHandle, root: PathBuf) -> AppResult<Watcher> {
    let base = root.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(300),
        move |result: DebounceEventResult| {
            let Ok(events) = result else { return };
            let mut paths: Vec<String> = events
                .iter()
                .filter_map(|e| e.path.strip_prefix(&base).ok())
                .filter(|rel| !is_noise(rel))
                .map(|rel| rel.to_string_lossy().replace('\\', "/"))
                .collect();
            paths.sort();
            paths.dedup();
            if !paths.is_empty() {
                let _ = app.emit("workspace-changed", WorkspaceChanged { paths });
            }
        },
    )
    .map_err(|e| AppError::Internal(format!("file watcher: {e}")))?;

    debouncer
        .watcher()
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| AppError::Internal(format!("file watcher: {e}")))?;
    Ok(debouncer)
}
