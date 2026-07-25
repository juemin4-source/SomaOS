//! # 跨会话恢复 —— 持久化 CellBuffer + 任务状态
//!
//! 每次 Turn 完成后或退出时，将当前对话状态写入文件。
//! 下次启动时读取，恢复对话历史。

use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use soma_ui_protocol::{Cell, CellBuffer};

/// 持久化的会话状态
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SessionState {
    /// 任务 ID
    pub task_id: String,
    /// 当前项目根目录
    pub project_root: String,
    /// 已提交 + 活跃的 cell
    pub cells: Vec<Cell>,
    /// 保存时间
    pub saved_at: String,
}

/// 会话文件路径
fn session_path() -> PathBuf {
    let mut path = PathBuf::from(".somaos");
    path.push("tui-session.json");
    path
}

/// 保存当前会话到文件
pub fn save_session(task_id: &str, project_root: &str, cell_buffer: &CellBuffer) -> Result<(), String> {
    let path = session_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }

    let state = SessionState {
        task_id: task_id.to_string(),
        project_root: project_root.to_string(),
        cells: cell_buffer.cells().to_vec(),
        saved_at: {
            let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
            format!("{:?}", d)
        },
    };

    let json = serde_json::to_string_pretty(&state).map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("写入文件失败: {}", e))?;

    Ok(())
}

/// 从文件加载会话
#[allow(dead_code)]
pub fn load_session() -> Option<SessionState> {
    let path = session_path();
    if !path.exists() {
        return None;
    }

    let json = match fs::read_to_string(&path) {
        Ok(j) => j,
        Err(e) => {
            tracing::warn!(error = %e, path = %path.display(), "Failed to read session file");
            return None;
        }
    };
    let state: SessionState = match serde_json::from_str(&json) {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!(error = %e, path = %path.display(), "Corrupt session file, ignoring");
            return None;
        }
    };
    Some(state)
}

/// 清除已保存的会话
#[allow(dead_code)]
pub fn clear_session() {
    let path = session_path();
    let _ = fs::remove_file(&path);
}

#[cfg(test)]
mod tests {
    use super::*;
    use soma_ui_protocol::{CellKind, CellState};

    #[test]
    fn test_session_roundtrip() {
        let mut buffer = CellBuffer::new();
        buffer.push_cell(Cell {
            kind: CellKind::AssistantMessage {
                committed_text: "hello".into(),
                pending_text: String::new(),
            },
            state: CellState::Committed,
            task_id: "t1".into(),
            turn_id: "t1-1".into(),
            created_at: 0,
        });

        // 使用临时目录
        let test_path = std::env::temp_dir().join("soma-tui-test-session.json");
        let _ = fs::remove_file(&test_path);

        // 保存
        let state = SessionState {
            task_id: "t1".into(),
            project_root: "/tmp".into(),
            cells: buffer.cells().to_vec(),
            saved_at: "now".into(),
        };
        let json = serde_json::to_string_pretty(&state).unwrap();
        fs::write(&test_path, &json).unwrap();

        // 读取
        let json_read = fs::read_to_string(&test_path).unwrap();
        let restored: SessionState = serde_json::from_str(&json_read).unwrap();

        assert_eq!(restored.task_id, "t1");
        assert_eq!(restored.cells.len(), 1);

        let _ = fs::remove_file(&test_path);
    }

    #[test]
    fn test_save_load_roundtrip() {
        let mut buffer = CellBuffer::new();
        buffer.push_cell(Cell {
            kind: CellKind::UserMessage { text: "test".into() },
            state: CellState::Committed,
            task_id: "t1".into(),
            turn_id: "t1-1".into(),
            created_at: 0,
        });

        let result = save_session("task-1", "/test", &buffer);
        assert!(result.is_ok());

        let loaded = load_session();
        assert!(loaded.is_some());
        if let Some(state) = loaded {
            assert_eq!(state.task_id, "task-1");
            assert_eq!(state.cells.len(), 1);
        }

        clear_session();
        assert!(load_session().is_none());
    }
}
