/// TaskManager — 管理任务生命周期
///
/// 多任务持久化 + 单 active turn 模型。
/// 每个任务有独立的工作状态，同一时间只有一个任务在执行。

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use soma_protocol::params::{TaskSummary, TaskCreateResult, TaskGetResult, TaskSendMessageResult, TaskCancelResult};
use soma_store::sqlite::SqliteCaseStore;
use soma_store::task_store::{TaskRecord, upsert_task, load_all_tasks};
use tokio::task::JoinHandle;

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
    /// 对话历史（交替 user/assistant 消息）
    pub conversation: Vec<(String, String)>, // (role, content)
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
            conversation: Vec::new(),
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

/// 任务管理器（可选 SQLite 持久化）
pub struct TaskManager {
    tasks: HashMap<String, Task>,
    next_id: u64,
    store: Option<Arc<SqliteCaseStore>>,
    /// 活跃模型请求的 abort 句柄，用于真取消
    abort_handles: HashMap<String, tokio::task::JoinHandle<()>>,
    /// 取消信号通道发送端
    cancel_signals: HashMap<String, tokio::sync::watch::Sender<bool>>,
    /// 审批等待通道（approval_id → oneshot 回复）
    approval_waiters: HashMap<String, tokio::sync::oneshot::Sender<bool>>,
}

impl TaskManager {
    pub fn new() -> Self {
        Self {
            tasks: HashMap::new(),
            next_id: 1,
            store: None,
            abort_handles: HashMap::new(),
            cancel_signals: HashMap::new(),
            approval_waiters: HashMap::new(),
        }
    }

    /// 绑定持久化存储
    pub fn with_store(mut self, store: Arc<SqliteCaseStore>) -> Self {
        // 启动时从 SQLite 加载已有任务
        if let Ok(records) = load_all_tasks(&store.connection()) {
            for rec in records {
                let id_num: u64 = rec.id.strip_prefix("task-")
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
                self.next_id = self.next_id.max(id_num + 1);
                let task = Task {
                    id: rec.id,
                    title: rec.title,
                    status: match rec.status.as_str() {
                        "running" => TaskStatus::Running,
                        "completed" => TaskStatus::Completed,
                        "interrupted" => TaskStatus::Interrupted,
                        _ => TaskStatus::Idle,
                    },
                    project_root: rec.project_root,
                    created_at: rec.created_at,
                    updated_at: rec.updated_at,
                    work_state: rec.work_state.and_then(|s| serde_json::from_str(&s).ok()),
                    artifacts: Vec::new(),
                    active_turn_id: rec.active_turn_id,
                    conversation: Vec::new(),
                };
                self.tasks.insert(task.id.clone(), task);
            }
        }
        self.store = Some(store);
        self
    }

    /// 持久化当前状态到 SQLite
    fn persist(&self, task: &Task) {
        if let Some(ref store) = self.store {
            let record = TaskRecord {
                id: task.id.clone(),
                title: task.title.clone(),
                status: task.status.as_str().to_string(),
                project_root: task.project_root.clone(),
                created_at: task.created_at.clone(),
                updated_at: task.updated_at.clone(),
                work_state: task.work_state.as_ref().map(|v| v.to_string()),
                active_turn_id: task.active_turn_id.clone(),
            };
            let _ = upsert_task(&store.connection(), &record);
        }
    }

    /// 创建任务
    pub fn create(&mut self, title: &str, project_root: &str) -> TaskCreateResult {
        let task_id = format!("task-{}", self.next_id);
        self.next_id += 1;
        let task = Task::new(&task_id, title, project_root);
        self.persist(&task);
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
        let task_id = task_id.to_string();
        if let Some(t) = self.tasks.get(&task_id) {
            self.persist(t);
        }

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

        // 真取消：通过 watch channel 通知正在执行的模型请求
        if let Some(tx) = self.cancel_signals.remove(task_id) {
            let _ = tx.send(true);
        }
        // 同时也 abort tokio task（双重保障）
        if let Some(handle) = self.abort_handles.remove(task_id) {
            handle.abort();
        }

        task.status = TaskStatus::Interrupted;
        task.active_turn_id = None;
        task.updated_at = timestamp();
        let task_id = task_id.to_string();
        if let Some(t) = self.tasks.get(&task_id) {
            self.persist(t);
        }

        Ok(TaskCancelResult {
            task_id: task_id.to_string(),
            cancelled: true,
        })
    }

    /// 获取任务对话历史
    pub fn get_conversation(&self, task_id: &str) -> Vec<(String, String)> {
        self.tasks.get(task_id)
            .map(|t| t.conversation.clone())
            .unwrap_or_default()
    }

    /// 替换整个对话历史
    pub fn set_conversation(&mut self, task_id: &str, conv: Vec<(String, String)>) {
        if let Some(task) = self.tasks.get_mut(task_id) {
            task.conversation = conv;
            task.updated_at = timestamp();
        }
    }

    /// 追加一条对话记录
    pub fn append_conversation(&mut self, task_id: &str, role: &str, content: &str) {
        if let Some(task) = self.tasks.get_mut(task_id) {
            task.conversation.push((role.to_string(), content.to_string()));
            task.updated_at = timestamp();
        }
    }

    /// 注册模型请求的 JoinHandle（用于取消）
    pub fn register_abort_handle(&mut self, task_id: &str, handle: JoinHandle<()>) {
        self.abort_handles.insert(task_id.to_string(), handle);
    }

    /// 注册取消信号发送端
    pub fn register_cancel(&mut self, task_id: &str, tx: tokio::sync::watch::Sender<bool>) {
        self.cancel_signals.insert(task_id.to_string(), tx);
    }

    /// 注册审批等待通道（等待用户决策）
    pub fn register_approval(&mut self, approval_id: &str, tx: tokio::sync::oneshot::Sender<bool>) {
        self.approval_waiters.insert(approval_id.to_string(), tx);
    }

    /// 解析审批请求（返回 true=批准, false=拒绝或不存在）
    pub fn resolve_approval(&mut self, approval_id: &str, approved: bool) -> bool {
        if let Some(tx) = self.approval_waiters.remove(approval_id) {
            let _ = tx.send(approved);
            true
        } else {
            false
        }
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
        // 通过 clone 避免 borrow conflict
        if let Some(task) = self.tasks.get(task_id) {
            self.persist(task);
        }
    }

    /// Turn 失败（标记为 Idle 以便后续重试）
    pub fn fail_turn(&mut self, task_id: &str) {
        if let Some(task) = self.tasks.get_mut(task_id) {
            task.status = TaskStatus::Idle;
            task.active_turn_id = None;
            task.updated_at = timestamp();
        }
        if let Some(task) = self.tasks.get(task_id) {
            self.persist(task);
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
