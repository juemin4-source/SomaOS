/// TaskManager — 管理任务生命周期
///
/// 多任务持久化 + 单 active turn 模型。
/// 每个任务有独立的工作状态，同一时间只有一个任务在执行。

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use soma_protocol::params::{TaskSummary, TaskCreateResult, TaskGetResult, TaskSendMessageResult, TaskCancelResult};

/// 任务状态
#[derive(Debug, Clone, PartialEq)]
pub enum TaskStatus {
    Idle,
    Running,
    Completed,
    Interrupted,
}

impl TaskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TaskStatus::Idle => "idle",
            TaskStatus::Running => "running",
            TaskStatus::Completed => "completed",
            TaskStatus::Interrupted => "interrupted",
        }
    }
}

/// 一个持久化任务
#[derive(Debug, Clone)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub status: TaskStatus,
    pub project_root: String,
    pub created_at: String,
    pub updated_at: String,
    pub work_state: Option<serde_json::Value>,
    pub artifacts: Vec<serde_json::Value>,
    pub active_turn_id: Option<String>,
}

impl Task {
    pub fn new(id: &str, title: &str, project_root: &str) -> Self {
        let now = timestamp();
        Self {
            id: id.to_string(),
            title: title.to_string(),
            status: TaskStatus::Idle,
            project_root: project_root.to_string(),
            created_at: now.clone(),
            updated_at: now,
            work_state: None,
            artifacts: Vec::new(),
            active_turn_id: None,
        }
    }

    pub fn to_summary(&self) -> TaskSummary {
        TaskSummary {
            id: self.id.clone(),
            title: self.title.clone(),
            status: self.status.as_str().to_string(),
            created_at: self.created_at.clone(),
            updated_at: self.updated_at.clone(),
        }
    }
}

/// 任务管理器
pub struct TaskManager {
    tasks: HashMap<String, Task>,
    next_id: u64,
}

impl TaskManager {
    pub fn new() -> Self {
        Self {
            tasks: HashMap::new(),
            next_id: 1,
        }
    }

    /// 创建任务
    pub fn create(&mut self, title: &str, project_root: &str) -> TaskCreateResult {
        let task_id = format!("task-{}", self.next_id);
        self.next_id += 1;
        let task = Task::new(&task_id, title, project_root);
        self.tasks.insert(task_id.clone(), task);
        TaskCreateResult { task_id }
    }

    /// 列出所有任务
    pub fn list(&self) -> Vec<TaskSummary> {
        let mut tasks: Vec<TaskSummary> = self.tasks.values()
            .map(|t| t.to_summary())
            .collect();
        tasks.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        tasks
    }

    /// 获取任务详情
    pub fn get(&self, task_id: &str) -> Option<TaskGetResult> {
        self.tasks.get(task_id).map(|t| TaskGetResult {
            id: t.id.clone(),
            title: t.title.clone(),
            status: t.status.as_str().to_string(),
            created_at: t.created_at.clone(),
            updated_at: t.updated_at.clone(),
            project_root: t.project_root.clone(),
            work_state: t.work_state.clone().unwrap_or(serde_json::json!({})),
            artifacts: t.artifacts.clone(),
        })
    }

    /// 开始处理一条消息（返回 turn_id 或拒绝）
    pub fn start_turn(&mut self, task_id: &str) -> Result<TaskSendMessageResult, String> {
        let task = self.tasks.get_mut(task_id)
            .ok_or_else(|| format!("task {} not found", task_id))?;

        if task.status == TaskStatus::Running {
            return Err(format!("task {} already has an active turn", task_id));
        }

        let turn_id = format!("{}-turn-{}", task_id, timestamp_compact());
        task.status = TaskStatus::Running;
        task.active_turn_id = Some(turn_id.clone());
        task.updated_at = timestamp();

        Ok(TaskSendMessageResult {
            task_id: task_id.to_string(),
            turn_id,
            accepted: true,
        })
    }

    /// 取消当前 Turn
    pub fn cancel_turn(&mut self, task_id: &str) -> Result<TaskCancelResult, String> {
        let task = self.tasks.get_mut(task_id)
            .ok_or_else(|| format!("task {} not found", task_id))?;

        if task.status != TaskStatus::Running {
            return Ok(TaskCancelResult {
                task_id: task_id.to_string(),
                cancelled: false,
            });
        }

        task.status = TaskStatus::Interrupted;
        task.active_turn_id = None;
        task.updated_at = timestamp();

        Ok(TaskCancelResult {
            task_id: task_id.to_string(),
            cancelled: true,
        })
    }

    /// 获取活跃任务的 task_id（如果有）
    pub fn active_task_id(&self) -> Option<String> {
        self.tasks.values()
            .find(|t| t.status == TaskStatus::Running)
            .map(|t| t.id.clone())
    }

    /// 获取指定任务的 active_turn_id（如果有）
    pub fn active_turn_id(&self, task_id: &str) -> Option<String> {
        self.tasks.get(task_id)
            .and_then(|t| t.active_turn_id.clone())
    }

    /// 更新任务的 WorkState
    pub fn update_work_state(&mut self, task_id: &str, state: serde_json::Value) {
        if let Some(task) = self.tasks.get_mut(task_id) {
            task.work_state = Some(state);
            task.updated_at = timestamp();
        }
    }

    /// 添加 Artifact
    pub fn add_artifact(&mut self, task_id: &str, artifact: serde_json::Value) {
        if let Some(task) = self.tasks.get_mut(task_id) {
            task.artifacts.push(artifact);
            task.updated_at = timestamp();
        }
    }

    /// 完成当前 Turn（标记为 Completed）
    pub fn complete_turn(&mut self, task_id: &str) {
        if let Some(task) = self.tasks.get_mut(task_id) {
            task.status = TaskStatus::Completed;
            task.active_turn_id = None;
            task.updated_at = timestamp();
        }
    }

    /// Turn 失败（标记为 Idle 以便后续重试）
    pub fn fail_turn(&mut self, task_id: &str) {
        if let Some(task) = self.tasks.get_mut(task_id) {
            task.status = TaskStatus::Idle;
            task.active_turn_id = None;
            task.updated_at = timestamp();
        }
    }
}

fn timestamp() -> String {
    let start = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", start.as_secs())
}

fn timestamp_compact() -> String {
    let start = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{:x}", start.as_nanos())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_and_list() {
        let mut tm = TaskManager::new();
        let r = tm.create("test task", "/tmp/project");
        assert!(r.task_id.starts_with("task-"));

        let list = tm.list();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "test task");
        assert_eq!(list[0].status, "idle");
    }

    #[test]
    fn test_start_turn() {
        let mut tm = TaskManager::new();
        let create = tm.create("test", "/tmp/p");
        let r = tm.start_turn(&create.task_id).unwrap();
        assert!(r.accepted);
        assert!(r.turn_id.contains(&create.task_id));
    }

    #[test]
    fn test_double_start_rejected() {
        let mut tm = TaskManager::new();
        let create = tm.create("test", "/tmp/p");
        tm.start_turn(&create.task_id).unwrap();
        let r = tm.start_turn(&create.task_id);
        assert!(r.is_err());
    }

    #[test]
    fn test_cancel_active_turn() {
        let mut tm = TaskManager::new();
        let create = tm.create("test", "/tmp/p");
        tm.start_turn(&create.task_id).unwrap();
        let r = tm.cancel_turn(&create.task_id).unwrap();
        assert!(r.cancelled);
    }

    #[test]
    fn test_active_task_id() {
        let mut tm = TaskManager::new();
        let c1 = tm.create("task1", "/tmp/p1");
        let c2 = tm.create("task2", "/tmp/p2");
        assert!(tm.active_task_id().is_none());

        tm.start_turn(&c1.task_id).unwrap();
        assert_eq!(tm.active_task_id().unwrap(), c1.task_id);

        tm.cancel_turn(&c1.task_id).unwrap();
        assert!(tm.active_task_id().is_none());
    }

    #[test]
    fn test_update_work_state() {
        let mut tm = TaskManager::new();
        let c = tm.create("test", "/tmp/p");
        tm.update_work_state(&c.task_id, serde_json::json!({"combo": "review", "stage": "Phase 1"}));
        let task = tm.get(&c.task_id).unwrap();
        assert_eq!(task.work_state["combo"], "review");
    }

    #[test]
    fn test_nonexistent_task() {
        let mut tm = TaskManager::new();
        assert!(tm.start_turn("nonexistent").is_err());
        assert!(tm.cancel_turn("nonexistent").is_err());
        assert!(tm.get("nonexistent").is_none());
    }
}
