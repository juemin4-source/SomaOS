//! state — 桌面端任务状态缓存
//!
//! 可选的状态缓存层，用于减少对 Runtime 的请求。
//! 初始骨架保持轻量——状态直接从 Runtime 查询，
//! 后续可基于 EventSink 通知增量更新缓存。

use std::sync::Arc;
use tokio::sync::Mutex;
use std::collections::HashMap;

/// 缓存中的任务摘要
#[derive(Debug, Clone)]
pub struct CachedTask {
    pub id: String,
    pub title: String,
    pub status: String,
}

/// 桌面状态管理器
pub struct DesktopState {
    tasks: HashMap<String, CachedTask>,
}

impl DesktopState {
    pub fn new() -> Self {
        Self {
            tasks: HashMap::new(),
        }
    }

    pub fn upsert_task(&mut self, id: &str, title: &str, status: &str) {
        self.tasks.insert(
            id.to_string(),
            CachedTask {
                id: id.to_string(),
                title: title.to_string(),
                status: status.to_string(),
            },
        );
    }

    pub fn remove_task(&mut self, id: &str) {
        self.tasks.remove(id);
    }

    pub fn get_task(&self, id: &str) -> Option<&CachedTask> {
        self.tasks.get(id)
    }

    pub fn all_tasks(&self) -> Vec<&CachedTask> {
        let mut tasks: Vec<&CachedTask> = self.tasks.values().collect();
        tasks.sort_by(|a, b| a.id.cmp(&b.id));
        tasks
    }

    pub fn clear(&mut self) {
        self.tasks.clear();
    }
}
