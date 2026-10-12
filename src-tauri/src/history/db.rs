use std::path::Path;
use std::time::Duration;

use rusqlite::Connection;

use rusqlite::params;

use super::settings::HistorySettings;
use super::types::NewEntry;

use crate::error::{AppError, AppResult};

use rusqlite::Row;

use super::types::HistoryEntry;
use crate::http_engine::RequestSpec;

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

const COLUMNS: &str =
    "id, ts, method, url, status, duration_ms, size_bytes, error, environment, request_path";

fn entry(row: &Row<'_>) -> rusqlite::Result<HistoryEntry> {
    Ok(HistoryEntry {
        id: row.get(0)?,
        ts: row.get::<_, i64>(1)? as f64,
        method: row.get(2)?,
        url: row.get(3)?,
        status: row.get(4)?,
        duration_ms: row.get(5)?,
        size_bytes: row.get(6)?,
        error: row.get(7)?,
        environment: row.get(8)?,
        request_path: row.get(9)?,
    })
}

/// Newest first.
pub fn list(conn: &Connection, limit: u32, offset: u32) -> AppResult<Vec<HistoryEntry>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLUMNS} FROM history ORDER BY id DESC LIMIT ?1 OFFSET ?2"
    ))?;
    let rows = stmt.query_map([limit, offset], entry)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn like_pattern(word: &str) -> String {
    let escaped = word
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    format!("%{escaped}%")
}

/// Every word must match somewhere in method, URL, status, environment or saved-request path.
/// Words of 3+ characters use the FTS5 trigram index; shorter ones fall back to LIKE (trigrams need 3).
pub fn search(conn: &Connection, query: &str, limit: u32) -> AppResult<Vec<HistoryEntry>> {
    let words: Vec<&str> = query.split_whitespace().collect();
    if words.is_empty() {
        return list(conn, limit, 0);
    }

    if words.iter().all(|w| w.chars().count() >= 3) {
        let expression = words
            .iter()
            .map(|w| format!("\"{}\"", w.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" AND ");
        let columns = COLUMNS
            .split(", ")
            .map(|c| format!("h.{c}"))
            .collect::<Vec<_>>()
            .join(", ");
        let mut stmt = conn.prepare(&format!(
            "SELECT {columns} FROM history h JOIN history_fts f ON f.rowid = h.id
             WHERE history_fts MATCH ?1 ORDER BY h.id DESC LIMIT ?2"
        ))?;
        let rows = stmt.query_map(rusqlite::params![expression, limit], entry)?;
        return Ok(rows.collect::<Result<Vec<_>, _>>()?);
    }

    let mut sql = format!("SELECT {COLUMNS} FROM history WHERE 1 = 1");
    let mut patterns: Vec<String> = Vec::new();
    for word in &words {
        patterns.push(like_pattern(word));
        let n = patterns.len();
        sql.push_str(&format!(
            " AND (url LIKE ?{n} ESCAPE '\\' OR method LIKE ?{n} ESCAPE '\\'
               OR IFNULL(request_path, '') LIKE ?{n} ESCAPE '\\' OR IFNULL(environment, '') LIKE ?{n} ESCAPE '\\'
               OR IFNULL(CAST(status AS TEXT), '') LIKE ?{n} ESCAPE '\\')"
        ));
    }
    sql.push_str(&format!(" ORDER BY id DESC LIMIT {limit}"));
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(patterns.iter()), entry)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_request(conn: &Connection, id: u32) -> AppResult<RequestSpec> {
    let json: String = conn
        .query_row(
            "SELECT request_json FROM history WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound(format!("history entry {id}"))
            }
            other => AppError::from(other),
        })?;
    serde_json::from_str(&json)
        .map_err(|e| AppError::Internal(format!("corrupt history entry: {e}")))
}

pub fn delete(conn: &Connection, id: u32) -> AppResult<()> {
    conn.execute("DELETE FROM history WHERE id = ?1", [id])?;
    Ok(())
}

pub fn clear(conn: &Connection) -> AppResult<()> {
    conn.execute("DELETE FROM history", [])?;
    Ok(())
}
