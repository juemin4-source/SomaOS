use serde::{Deserialize, Serialize};

/// Run 状态机
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RunStatus {
    /// 已接受，等待执行
    Accepted,
    /// 正在执行
    Running,
    /// 已让出（等待外部输入）
    Yielded,
    /// 成功完成
    Completed,
    /// 失败
    Failed,
    /// 已取消
    Cancelled,
}

impl RunStatus {
    pub fn is_terminal(&self) -> bool {
        matches!(self, RunStatus::Completed | RunStatus::Failed | RunStatus::Cancelled)
    }
}

/// Run 实体 — 一次多 Turn 执行尝试
///
/// 层级: Case → Run → Turn → Action
/// Run 是持久边界：COMPLETED / FAILED / CANCELLED 后不再变化。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Run {
    pub run_id: String,
    pub case_id: String,
    pub submitted_by: String,
    pub status: RunStatus,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub outcome: Option<String>,
}

impl Run {
    pub fn new(case_id: &str, submitted_by: &str) -> Self {
        Self {
            run_id: uuid::Uuid::new_v4().to_string(),
            case_id: case_id.to_string(),
            submitted_by: submitted_by.to_string(),
            status: RunStatus::Accepted,
            started_at: chrono::Utc::now().to_rfc3339(),
            finished_at: None,
            outcome: None,
        }
    }

    pub fn transition(&mut self, new_status: RunStatus) {
        self.status = new_status;
        if new_status.is_terminal() {
            self.finished_at = Some(chrono::Utc::now().to_rfc3339());
        }
    }

    pub fn set_outcome(&mut self, outcome: &str) {
        self.outcome = Some(outcome.to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_run_creation() {
        let r = Run::new("case-001", "cli");
        assert_eq!(r.case_id, "case-001");
        assert_eq!(r.submitted_by, "cli");
        assert_eq!(r.status, RunStatus::Accepted);
        assert!(r.finished_at.is_none());
        assert!(r.outcome.is_none());
    }

    #[test]
    fn test_transition_to_terminal_sets_finished_at() {
        let mut r = Run::new("case-001", "cli");
        assert!(r.finished_at.is_none());
        r.transition(RunStatus::Running);
        assert!(r.finished_at.is_none());  // not terminal
        r.transition(RunStatus::Completed);
        assert!(r.finished_at.is_some());
    }

    #[test]
    fn test_is_terminal() {
        assert!(!RunStatus::Accepted.is_terminal());
        assert!(!RunStatus::Running.is_terminal());
        assert!(!RunStatus::Yielded.is_terminal());
        assert!(RunStatus::Completed.is_terminal());
        assert!(RunStatus::Failed.is_terminal());
        assert!(RunStatus::Cancelled.is_terminal());
    }

    #[test]
    fn test_outcome() {
        let mut r = Run::new("case-002", "test");
        r.set_outcome("fixed the bug");
        assert_eq!(r.outcome.as_deref(), Some("fixed the bug"));
    }

    #[test]
    fn test_run_id_unique() {
        let r1 = Run::new("c1", "u1");
        let r2 = Run::new("c1", "u1");
        assert_ne!(r1.run_id, r2.run_id);
    }
}
