use std::sync::Mutex;

use rusqlite::{params, Connection, Result as SqlResult};

use crate::run_store::RunRecord;
use crate::run_store::RunStore;
use crate::store::{CaseEvent, CaseStore};

pub struct SqliteCaseStore {
    conn: Mutex<Connection>,
}

impl SqliteCaseStore {
    pub fn new(path: &str) -> SqlResult<Self> {
        let conn = Connection::open(path)?;
        let store = Self {
            conn: Mutex::new(conn),
        };
        store.initialize_tables()?;
        Ok(store)
    }

    pub fn schema_version(&self) -> SqlResult<i64> {
        let conn = self.conn.lock().unwrap();
        let version: i64 = conn.query_row(
            "SELECT COALESCE(CAST(value AS INTEGER), 0) FROM metadata WHERE key = 'schema_version'",
            [],
            |row| row.get(0),
        )?;
        Ok(version)
    }

    fn initialize_tables(&self) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id     TEXT    NOT NULL,
                event_type  TEXT    NOT NULL,
                payload     TEXT    NOT NULL,
                version     INTEGER NOT NULL,
                created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS runs (
                run_id       TEXT PRIMARY KEY,
                case_id      TEXT NOT NULL,
                submitted_by TEXT NOT NULL DEFAULT '',
                status       TEXT NOT NULL DEFAULT 'ACCEPTED',
                started_at   TEXT NOT NULL,
                finished_at  TEXT,
                outcome      TEXT
            );

            CREATE TABLE IF NOT EXISTS metadata (
                key         TEXT PRIMARY KEY,
                value       TEXT NOT NULL
            );

            INSERT OR IGNORE INTO metadata (key, value) VALUES ('schema_version', '2');
            INSERT OR IGNORE INTO metadata (key, value) VALUES ('store_type', 'soma-sqlite');",
        )?;
        Ok(())
    }
}

impl RunStore for SqliteCaseStore {
    fn insert_run(&self, run: &RunRecord) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO runs (run_id, case_id, submitted_by, status, started_at, finished_at, outcome) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![run.run_id, run.case_id, run.submitted_by, run.status, run.started_at, run.finished_at, run.outcome],
        )
        .map_err(|e| format!("insert run: {}", e))?;
        Ok(())
    }

    fn update_run_status(&self, run_id: &str, status: &str, finished_at: Option<&str>, outcome: Option<&str>) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE runs SET status = ?1, finished_at = ?2, outcome = ?3 WHERE run_id = ?4",
            params![status, finished_at, outcome, run_id],
        )
        .map_err(|e| format!("update run: {}", e))?;
        Ok(())
    }

    fn get_run(&self, run_id: &str) -> Result<Option<RunRecord>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT run_id, case_id, submitted_by, status, started_at, finished_at, outcome FROM runs WHERE run_id = ?1")
            .map_err(|e| format!("prepare: {}", e))?;

        let mut rows = stmt
            .query_map(params![run_id], |row| {
                Ok(RunRecord {
                    run_id: row.get(0)?,
                    case_id: row.get(1)?,
                    submitted_by: row.get(2)?,
                    status: row.get(3)?,
                    started_at: row.get(4)?,
                    finished_at: row.get(5)?,
                    outcome: row.get(6)?,
                })
            })
            .map_err(|e| format!("query: {}", e))?;

        match rows.next() {
            Some(Ok(run)) => Ok(Some(run)),
            Some(Err(e)) => Err(format!("row: {}", e)),
            None => Ok(None),
        }
    }

    fn list_runs(&self, case_id: &str) -> Result<Vec<RunRecord>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT run_id, case_id, submitted_by, status, started_at, finished_at, outcome FROM runs WHERE case_id = ?1 ORDER BY started_at")
            .map_err(|e| format!("prepare: {}", e))?;

        let rows = stmt
            .query_map(params![case_id], |row| {
                Ok(RunRecord {
                    run_id: row.get(0)?,
                    case_id: row.get(1)?,
                    submitted_by: row.get(2)?,
                    status: row.get(3)?,
                    started_at: row.get(4)?,
                    finished_at: row.get(5)?,
                    outcome: row.get(6)?,
                })
            })
            .map_err(|e| format!("query: {}", e))?;

        let mut runs = Vec::new();
        for row in rows {
            runs.push(row.map_err(|e| format!("row: {}", e))?);
        }
        Ok(runs)
    }
}

impl CaseStore for SqliteCaseStore {
    fn append(&self, case_id: &str, event: &CaseEvent) -> Result<(), String> {
        let payload =
            serde_json::to_string(&event.payload).map_err(|e| format!("serialize: {}", e))?;
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO events (case_id, event_type, payload, version) VALUES (?1, ?2, ?3, ?4)",
            params![case_id, event.event_type, payload, event.version],
        )
        .map_err(|e| format!("insert: {}", e))?;
        Ok(())
    }

    fn replay(&self, case_id: &str) -> Result<Vec<CaseEvent>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT case_id, event_type, payload, version FROM events WHERE case_id = ?1 ORDER BY id")
            .map_err(|e| format!("prepare: {}", e))?;

        let rows = stmt
            .query_map(params![case_id], |row| {
                let case_id: String = row.get(0)?;
                let event_type: String = row.get(1)?;
                let payload_str: String = row.get(2)?;
                let version: u64 = row.get(3)?;
                let payload: serde_json::Value =
                    serde_json::from_str(&payload_str).unwrap_or(serde_json::Value::Null);
                Ok(CaseEvent {
                    case_id,
                    event_type,
                    payload,
                    version,
                })
            })
            .map_err(|e| format!("query: {}", e))?;

        let mut events = Vec::new();
        for row in rows {
            events.push(row.map_err(|e| format!("row: {}", e))?);
        }
        Ok(events)
    }
}
