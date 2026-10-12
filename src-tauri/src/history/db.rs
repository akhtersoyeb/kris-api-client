use std::path::Path;
use std::time::Duration;

use rusqlite::Connection;

use rusqlite::params;

use super::settings::HistorySettings;
use super::types::NewEntry;

use crate::error::{AppError, AppResult};

/// Append-only: each entry is applied once, in order, and recorded in `PRAGMA user_version`.
pub const MIGRATIONS: &[&str] = &[
    // v1
    r#"
    CREATE TABLE history (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        ts           INTEGER NOT NULL,
        method       TEXT NOT NULL,
        url          TEXT NOT NULL,
        status       INTEGER,
        duration_ms  INTEGER,
        size_bytes   INTEGER,
        error        TEXT,
        environment  TEXT,
        request_path TEXT,
        request_json TEXT NOT NULL
    );
    CREATE INDEX history_ts ON history (ts);

    -- Trigram tokenizer: any 3+ character substring of a URL, method, status... matches.
    CREATE VIRTUAL TABLE history_fts USING fts5(
        method, url, request_path, environment, status,
        content = 'history', content_rowid = 'id', tokenize = 'trigram'
    );
    CREATE TRIGGER history_ai AFTER INSERT ON history BEGIN
        INSERT INTO history_fts (rowid, method, url, request_path, environment, status)
        VALUES (new.id, new.method, new.url, new.request_path, new.environment, new.status);
    END;
    CREATE TRIGGER history_ad AFTER DELETE ON history BEGIN
        INSERT INTO history_fts (history_fts, rowid, method, url, request_path, environment, status)
        VALUES ('delete', old.id, old.method, old.url, old.request_path, old.environment, old.status);
    END;
    "#,
];

pub fn migrate(conn: &mut Connection) -> AppResult<()> {
    let current: u32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if current as usize > MIGRATIONS.len() {
        return Err(AppError::Unsupported(
            "the history database was created by a newer version of the app".into(),
        ));
    }
    for (index, sql) in MIGRATIONS.iter().enumerate().skip(current as usize) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", index as u32 + 1)?;
        tx.commit()?;
    }
    Ok(())
}

/// Opens (creating if needed) the history database of one workspace and brings it up to date.
pub fn open(app_dir: &Path, workspace_id: &str) -> AppResult<Connection> {
    // The id becomes a file name, so allow only characters that can't escape the folder.
    let valid = !workspace_id.is_empty()
        && workspace_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-');
    if !valid {
        return Err(AppError::InvalidInput("invalid workspace id".into()));
    }
    let dir = app_dir.join("history");
    std::fs::create_dir_all(&dir)?;
    let mut conn = Connection::open(dir.join(format!("{workspace_id}.db")))?;
    conn.busy_timeout(Duration::from_secs(5))?;
    conn.query_row("PRAGMA journal_mode = WAL", [], |_| Ok(()))?; // returns a row, so not execute_batch
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    migrate(&mut conn)?;
    Ok(conn)
}

pub fn insert(conn: &Connection, entry: &NewEntry) -> AppResult<()> {
    let json = serde_json::to_string(&entry.spec)
        .map_err(|e| AppError::Internal(format!("could not serialize request: {e}")))?;
    conn.execute(
        "INSERT INTO history (ts, method, url, status, duration_ms, size_bytes, error, environment, request_path, request_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            entry.ts_ms,
            entry.spec.method,
            entry.spec.url,
            entry.status,
            entry.duration_ms,
            entry.size_bytes,
            entry.error,
            entry.environment,
            entry.request_path,
            json
        ],
    )?;
    Ok(())
}

/// Applies retention: entries older than `retention_days` (0 = no age limit) and anything beyond `max_entries`.
pub fn prune(conn: &Connection, settings: &HistorySettings, now_ms: i64) -> AppResult<()> {
    if settings.retention_days > 0 {
        let cutoff = now_ms - i64::from(settings.retention_days) * 86_400_000;
        conn.execute("DELETE FROM history WHERE ts < ?1", [cutoff])?;
    }
    conn.execute(
        "DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT ?1)",
        [settings.max_entries],
    )?;
    Ok(())
}
