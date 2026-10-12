#![allow(dead_code)] // removed in R5, once everything is wired up

pub mod db;
pub mod recorder;
pub mod redact;
pub mod settings;
pub mod types;

pub use settings::{AppSettings, HistorySettings, SettingsState};
pub use types::{HistoryEntry, NewEntry};
