use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

use tauri::AppHandle;

use super::watcher::{self, Watcher};
use crate::error::{AppError, AppResult};

struct Open {
    root: PathBuf,
    _watcher: Option<Watcher>, // kept alive for its Drop
}

#[derive(Default)]
pub struct WorkspaceState {
    current: Mutex<Option<Open>>,
}

impl WorkspaceState {
    pub fn root(&self) -> AppResult<PathBuf> {
        self.lock()
            .as_ref()
            .map(|open| open.root.clone())
            .ok_or_else(|| AppError::InvalidInput("no workspace is open".into()))
    }

    pub fn open(&self, app: &AppHandle, root: PathBuf) {
        // A watcher failure (for example hitting the OS inotify limit) shouldn't stop you opening a workspace.
        let watcher = watcher::start(app.clone(), root.clone())
            .map_err(|e| eprintln!("{e}"))
            .ok();
        *self.lock() = Some(Open {
            root,
            _watcher: watcher,
        });
    }

    pub fn close(&self) {
        *self.lock() = None; // dropping the watcher stops it
    }

    fn lock(&self) -> MutexGuard<'_, Option<Open>> {
        self.current.lock().unwrap_or_else(|e| e.into_inner())
    }
}
