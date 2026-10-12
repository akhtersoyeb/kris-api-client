use std::path::Path;
use std::time::Duration;

use rusqlite::Connection;

use crate::error::{AppError, AppResult};

/// Append-only: each entry is applied once, in order, and recorded in `PRAGMA user_version`.
pub const MIGRATIONS: &[&str] = &[];

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
