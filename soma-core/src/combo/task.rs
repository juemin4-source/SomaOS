use serde::{Deserialize, Serialize};

use super::investigate::DebugReport;
use super::review::{GateVerdict, ReviewReport};

/// 完整的调查修复任务状态机
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TaskState {
    /// 任务已创建，等待处理
    Open,
    /// 正在进行调查
    Investigating,
    /// 调查完成，准备修复
    InvestigationComplete,
    /// 正在修复
    Fixing,
    /// 修复完成，准备验证
    FixApplied,
    /// 正在验证
    Verifying,
    /// 已通过验证，准备 Review
    ReadyForReview,
    /// 正在进行 Review
    InReview,
    /// Review 通过
    ReviewPassed,
    /// Review 发现问题，需要修复
    ReviewFailed,
    /// Review 被阻塞
    ReviewBlocked,
}

/// 调查修复任务 — 完整的工作单元
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvestigationTask {
    pub state: TaskState,
    pub debug_report: Option<DebugReport>,
    pub review_report: Option<ReviewReport>,
    pub description: String,
}

impl InvestigationTask {
    pub fn new(description: &str) -> Self {
        Self {
            state: TaskState::Open,
            debug_report: None,
            review_report: None,
            description: description.to_string(),
        }
    }

    /// 调查完成，进入 Fixing 状态
    pub fn complete_investigation(&mut self, report: DebugReport) -> Result<(), String> {
        if self.state != TaskState::Investigating {
            return Err(format!("cannot complete investigation in state {:?}", self.state));
        }
        self.debug_report = Some(report);
        self.state = TaskState::InvestigationComplete;
        Ok(())
    }

    /// 开始修复
    pub fn start_fix(&mut self) -> Result<(), String> {
        if self.state != TaskState::InvestigationComplete {
            return Err(format!("cannot start fix in state {:?}", self.state));
        }
        self.state = TaskState::Fixing;
        Ok(())
    }

    /// 修复完成，准备 Review
    pub fn complete_fix(&mut self) -> Result<(), String> {
        if self.state != TaskState::Fixing {
            return Err(format!("cannot complete fix in state {:?}", self.state));
        }
        self.state = TaskState::ReadyForReview;
        Ok(())
    }

    /// 开始 Review
    pub fn start_review(&mut self) -> Result<(), String> {
        if self.state != TaskState::ReadyForReview {
            return Err(format!("cannot start review in state {:?}", self.state));
        }
        self.state = TaskState::InReview;
        Ok(())
    }

    /// 应用 Review 结果
    pub fn apply_review(&mut self, report: ReviewReport) -> Result<(), String> {
        if self.state != TaskState::InReview {
            return Err(format!("cannot apply review in state {:?}", self.state));
        }
        match report.gate {
            GateVerdict::Pass => self.state = TaskState::ReviewPassed,
            GateVerdict::Fail => self.state = TaskState::ReviewFailed,
            GateVerdict::Blocked => self.state = TaskState::ReviewBlocked,
        }
        self.review_report = Some(report);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combo::investigate::{DebugReport, InvestigationStatus};
    use crate::combo::review::{GateVerdict, ReviewReport};

    fn make_debug_report() -> DebugReport {
        DebugReport {
            symptom: "test fails".into(),
            root_cause: "wrong operator".into(),
            fix: "changed - to +".into(),
            evidence: "test passes".into(),
            regression_test: None,
            status: InvestigationStatus::Done,
        }
    }

    fn make_review_report(gate: GateVerdict) -> ReviewReport {
        ReviewReport {
            scope_check: None,
            findings: vec![],
            quality_score: 8.0,
            gate,
        }
    }

    #[test]
    fn test_full_chain() {
        let mut task = InvestigationTask::new("fix the add function");
        assert_eq!(task.state, TaskState::Open);

        // Open → Investigating
        task.state = TaskState::Investigating;
        task.complete_investigation(make_debug_report()).unwrap();
        assert_eq!(task.state, TaskState::InvestigationComplete);
        assert!(task.debug_report.is_some());

        // → Fixing → ReadyForReview
        task.start_fix().unwrap();
        assert_eq!(task.state, TaskState::Fixing);
        task.complete_fix().unwrap();
        assert_eq!(task.state, TaskState::ReadyForReview);

        // → InReview → ReviewPassed
        task.start_review().unwrap();
        assert_eq!(task.state, TaskState::InReview);
        task.apply_review(make_review_report(GateVerdict::Pass)).unwrap();
        assert_eq!(task.state, TaskState::ReviewPassed);
    }

    #[test]
    fn test_review_fail_returns_to_fix() {
        let mut task = InvestigationTask::new("fix bug");
        task.state = TaskState::ReadyForReview;
        task.start_review().unwrap();

        task.apply_review(make_review_report(GateVerdict::Fail)).unwrap();
        assert_eq!(task.state, TaskState::ReviewFailed);

        // Can go back to Fixing
        task.state = TaskState::Fixing;
        assert_eq!(task.state, TaskState::Fixing);
    }

    #[test]
    fn test_wrong_transition() {
        let mut task = InvestigationTask::new("test");
        // Can't complete investigation before starting
        let r = task.complete_investigation(make_debug_report());
        assert!(r.is_err());
    }
}
