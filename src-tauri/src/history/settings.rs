use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::AppResult;
use crate::workspace::fs_util::write_json;

const FILE: &str = "settings.json";

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct HistorySettings {
    pub enabled: bool,
    /// Mask secrets in headers, URL credentials, sensitive query parameters and form fields.
    pub redact_secrets: bool,
    /// Keep JSON/raw/form bodies so entries can be reopened exactly.
    pub store_bodies: bool,
    /// 0 keeps entries until the count limit removes them.
    pub retention_days: u32,
    pub max_entries: u32,
}

impl Default for HistorySettings {
    fn default() -> Self {
        Self {
            enabled: true,
            redact_secrets: true,
            store_bodies: true,
            retention_days: 90,
            max_entries: 1000,
        }
    }
}

impl HistorySettings {
    pub fn sanitized(mut self) -> Self {
        self.max_entries = self.max_entries.clamp(50, 100_000);
        self.retention_days = self.retention_days.min(3650);
        self
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub history: HistorySettings,
}

/// App-wide settings, kept in memory and mirrored to `settings.json` in the app data folder.
pub struct SettingsState {
    path: PathBuf,
    current: Mutex<AppSettings>,
}

impl SettingsState {
    pub fn load(dir: PathBuf) -> Self {
        let path = dir.join(FILE);
        let loaded = std::fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str::<AppSettings>(&text).ok())
            .unwrap_or_default();
        Self {
            path,
            current: Mutex::new(AppSettings {
                history: loaded.history.sanitized(),
            }),
        }
    }

    pub fn get(&self) -> AppSettings {
        self.lock().clone()
    }

    pub fn history(&self) -> HistorySettings {
        self.lock().history.clone()
    }

    pub fn set(&self, settings: AppSettings) -> AppResult<AppSettings> {
        let clean = AppSettings {
            history: settings.history.sanitized(),
        };
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        write_json(&self.path, &clean)?;
        *self.lock() = clean.clone();
        Ok(clean)
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, AppSettings> {
        self.current.lock().unwrap_or_else(|e| e.into_inner())
    }
}
