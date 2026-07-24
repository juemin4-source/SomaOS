use serde::{Deserialize, Serialize};

/// Evidence 类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum EvidenceType {
    /// 模型观察到的原始事实（日志、代码内容、运行时行为）
    Observation,
    /// 模型对根因的判断
    Diagnosis,
    /// 代码修改记录
    Change,
    /// 验证执行的结果
    Verification,
    /// 外部确认（Owner 验收、第三方报告）
    ExternalConfirmation,
}

/// 新鲜度策略
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum FreshnessPolicy {
    /// 代码变化后失效（CHANGE / VERIFICATION 类型）
    StaleOnCodeChange,
    /// 永久有效（OBSERVATION / DIAGNOSIS / EXTERNAL_CONFIRMATION 类型）
    Persistent,
}

/// Evidence 新鲜度状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum FreshnessStatus {
    Fresh,
    Stale { staled_by_action_id: String },
}

/// 工作区快照（Evidence 记录时的代码状态）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSnapshot {
    pub commit_hash: Option<String>,
    pub file_paths: Vec<String>,
    pub content_hashes: Vec<(String, String)>, // (file_path, hash)
}

/// Evidence ID 新类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Hash, Eq)]
pub struct EvidenceId(pub String);

impl std::fmt::Display for EvidenceId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Evidence 实体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Evidence {
    pub evidence_id: EvidenceId,
    pub case_id: String,
    pub evidence_type: EvidenceType,
    pub subject: String,
    pub content: String,
    pub producer_action_id: Option<String>,
    pub workspace_snapshot: Option<WorkspaceSnapshot>,
    pub freshness_policy: FreshnessPolicy,
    pub freshness_status: FreshnessStatus,
    pub supports_claim: Option<String>,
}

impl Evidence {
    /// 创建新的 Evidence
    pub fn new(
        case_id: String,
        evidence_type: EvidenceType,
        subject: String,
        content: String,
    ) -> Self {
        let freshness_policy = match &evidence_type {
            EvidenceType::Change | EvidenceType::Verification => {
                FreshnessPolicy::StaleOnCodeChange
            }
            _ => FreshnessPolicy::Persistent,
        };
        let evidence_id = EvidenceId(format!("EV-{:08}", rand::random::<u32>()));

        Self {
            evidence_id,
            case_id,
            evidence_type,
            subject,
            content,
            producer_action_id: None,
            workspace_snapshot: None,
            freshness_policy,
            freshness_status: FreshnessStatus::Fresh,
            supports_claim: None,
        }
    }
}

/// 裁决状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AdjudicationStatus {
    Accepted,
    PartiallySupported,
    Rejected,
    Unverifiable,
}

/// 裁决结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Adjudication {
    pub claim_id: String,
    pub status: AdjudicationStatus,
    pub reasoning: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_evidence_new_observation() {
        let ev = Evidence::new(
            "CASE-001".into(),
            EvidenceType::Observation,
            "发现日志错误".into(),
            "请求返回了 404".into(),
        );
        assert_eq!(ev.freshness_policy, FreshnessPolicy::Persistent);
        assert_eq!(ev.freshness_status, FreshnessStatus::Fresh);
        assert!(ev.evidence_id.0.starts_with("EV-"));
    }

    #[test]
    fn test_evidence_new_change() {
        let ev = Evidence::new(
            "CASE-001".into(),
            EvidenceType::Change,
            "修复路径".into(),
            "已将路径从 /api/old 改为 /api/new".into(),
        );
        assert_eq!(ev.freshness_policy, FreshnessPolicy::StaleOnCodeChange);
    }

    #[test]
    fn test_evidence_new_verification() {
        let ev = Evidence::new(
            "CASE-001".into(),
            EvidenceType::Verification,
            "验证修复".into(),
            "测试通过".into(),
        );
        assert_eq!(ev.freshness_policy, FreshnessPolicy::StaleOnCodeChange);
    }

    #[test]
    fn test_evidence_new_diagnosis() {
        let ev = Evidence::new(
            "CASE-001".into(),
            EvidenceType::Diagnosis,
            "根因分析".into(),
            "路径前缀不匹配".into(),
        );
        assert_eq!(ev.freshness_policy, FreshnessPolicy::Persistent);
    }

    #[test]
    fn test_freshness_stale_transition() {
        let mut ev = Evidence::new(
            "CASE-001".into(),
            EvidenceType::Change,
            "test".into(),
            "content".into(),
        );
        ev.freshness_status = FreshnessStatus::Stale {
            staled_by_action_id: "ACT-001".into(),
        };
        assert_eq!(
            ev.freshness_status,
            FreshnessStatus::Stale {
                staled_by_action_id: "ACT-001".into()
            }
        );
    }
}
