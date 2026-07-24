use std::sync::Mutex;

use rusqlite::{params, Connection, Result as SqlResult};

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

            CREATE TABLE IF NOT EXISTS metadata (
                key         TEXT PRIMARY KEY,
                value       TEXT NOT NULL
            );

            INSERT OR IGNORE INTO metadata (key, value) VALUES ('schema_version', '1');
            INSERT OR IGNORE INTO metadata (key, value) VALUES ('store_type', 'soma-sqlite');",
        )?;
        Ok(())
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
