//! TaskStore — 任务持久化（SQLite）
//!
//! TaskManager 不再依赖内存 HashMap 存储任务，
//! 改为通过此模块读写 SQLite。

use rusqlite::{Connection, params};

/// 持久化的任务记录
#[derive(Debug, Clone)]
pub struct TaskRecord {
    pub id: String,
    pub title: String,
    pub status: String,
    pub project_root: String,
    pub created_at: String,
    pub updated_at: String,
    pub work_state: Option<String>,
    pub active_turn_id: Option<String>,
}

/// 初始化 tasks 表（从 SqliteCaseStore 的 initialize_tables 调用）
pub fn init_tasks_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS tasks (
            id            TEXT PRIMARY KEY,
            title         TEXT NOT NULL,
            status        TEXT NOT NULL DEFAULT 'idle',
            project_root  TEXT NOT NULL DEFAULT '.',
            created_at    TEXT NOT NULL,
            updated_at    TEXT NOT NULL,
            work_state    TEXT,
            active_turn_id TEXT
        );"
    ).map_err(|e| format!("create tasks table: {}", e))?;
    Ok(())
}

/// 插入或替换一条任务
pub fn upsert_task(conn: &Connection, task: &TaskRecord) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO tasks (id, title, status, project_root, created_at, updated_at, work_state, active_turn_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            task.id, task.title, task.status, task.project_root,
            task.created_at, task.updated_at, task.work_state, task.active_turn_id,
        ],
    ).map_err(|e| format!("upsert task: {}", e))?;
    Ok(())
}

/// 加载所有任务
pub fn load_all_tasks(conn: &Connection) -> Result<Vec<TaskRecord>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, title, status, project_root, created_at, updated_at, work_state, active_turn_id FROM tasks ORDER BY created_at"
    ).map_err(|e| format!("prepare: {}", e))?;

    let rows = stmt.query_map([], |row| {
        Ok(TaskRecord {
            id: row.get(0)?,
            title: row.get(1)?,
            status: row.get(2)?,
            project_root: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
            work_state: row.get(6)?,
            active_turn_id: row.get(7)?,
        })
    }).map_err(|e| format!("query: {}", e))?;

    let mut tasks = Vec::new();
    for row in rows {
        tasks.push(row.map_err(|e| format!("row: {}", e))?);
    }
    Ok(tasks)
}

/// 根据 ID 加载任务
pub fn load_task(conn: &Connection, id: &str) -> Result<Option<TaskRecord>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, title, status, project_root, created_at, updated_at, work_state, active_turn_id FROM tasks WHERE id = ?1"
    ).map_err(|e| format!("prepare: {}", e))?;

    let mut rows = stmt.query_map(params![id], |row| {
        Ok(TaskRecord {
            id: row.get(0)?,
            title: row.get(1)?,
            status: row.get(2)?,
            project_root: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
            work_state: row.get(6)?,
            active_turn_id: row.get(7)?,
        })
    }).map_err(|e| format!("query: {}", e))?;

    match rows.next() {
        Some(Ok(task)) => Ok(Some(task)),
        Some(Err(e)) => Err(format!("row: {}", e)),
        None => Ok(None),
    }
}

/// 删除任务
pub fn delete_task(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])
        .map_err(|e| format!("delete task: {}", e))?;
    Ok(())
}
