use serde::{Deserialize, Serialize};

use super::review::{GateVerdict, ReviewReport};

/// 任务状态机 — Review Combo 的结果可以改变这个状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TaskState {
    /// 任务已创建，等待处理
    Open,
    /// 正在进行 Review
    InReview,
    /// Review 通过，可以进入下一阶段
    ReviewPassed,
    /// Review 发现问题，需要修复
    ReviewFailed,
    /// Review 被阻塞，需要澄清或补充信息
    ReviewBlocked,
}

/// 应用 Review 结果到任务状态
pub fn apply_review_result(state: &TaskState, report: &ReviewReport) -> Result<TaskState, String> {
    // 只能在 InReview 状态下应用 Review 结果
    if *state != TaskState::InReview {
        return Err(format!("cannot apply review result in state {:?}", state));
    }

    match report.gate {
        GateVerdict::Pass => Ok(TaskState::ReviewPassed),
        GateVerdict::Fail => Ok(TaskState::ReviewFailed),
        GateVerdict::Blocked => Ok(TaskState::ReviewBlocked),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combo::review::{Finding, GateVerdict, ReviewReport};

    fn make_report(gate: GateVerdict) -> ReviewReport {
        ReviewReport {
            scope_check: None,
            findings: vec![],
            quality_score: 7.5,
            gate,
        }
    }

    #[test]
    fn test_pass_transition() {
        let state = TaskState::InReview;
        let report = make_report(GateVerdict::Pass);
        let result = apply_review_result(&state, &report).unwrap();
        assert_eq!(result, TaskState::ReviewPassed);
    }

    #[test]
    fn test_fail_transition() {
        let state = TaskState::InReview;
        let report = make_report(GateVerdict::Fail);
        let result = apply_review_result(&state, &report).unwrap();
        assert_eq!(result, TaskState::ReviewFailed);
    }

    #[test]
    fn test_blocked_transition() {
        let state = TaskState::InReview;
        let report = make_report(GateVerdict::Blocked);
        let result = apply_review_result(&state, &report).unwrap();
        assert_eq!(result, TaskState::ReviewBlocked);
    }

    #[test]
    fn test_wrong_state() {
        let state = TaskState::Open;
        let report = make_report(GateVerdict::Pass);
        let result = apply_review_result(&state, &report);
        assert!(result.is_err());
    }
}
