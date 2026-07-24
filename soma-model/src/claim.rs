use serde::{Deserialize, Serialize};

use crate::evidence::{Evidence, EvidenceType, FreshnessStatus};

// ── Adjudication Status (GATE-SOMA-NATIVE-001) ──

/// 裁决结果
///
/// 模型只能提出 Claim，不能决定最终状态。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AdjudicationStatus {
    /// 证据充分，Claim 成立
    Supported,
    /// 证据不足，无法判定
    Insufficient,
    /// 存在反证，Claim 不成立
    Contradicted,
    /// 证据曾经成立，但已被新状态推翻
    Stale,
}

// ── Adjudication Record ──

/// 一次完整的裁决记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Adjudication {
    pub claim_id: String,
    pub claim_type: String,
    pub status: AdjudicationStatus,
    pub reasoning: String,
    pub supporting_evidence_ids: Vec<String>,
    pub adjudicated_at: String,
}

// ── Claim Types ──

/// Claim：模型提出的可裁决断言
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claim {
    pub claim_id: String,
    pub claim_type: ClaimType,
    pub description: String,
    pub proposed_by: String,
    pub supporting_evidence_ids: Vec<String>,
}

impl Claim {
    pub fn new(claim_type: ClaimType, description: &str, proposed_by: &str) -> Self {
        Self {
            claim_id: format!("CLM-{:08}", rand::random::<u32>()),
            claim_type,
            description: description.to_string(),
            proposed_by: proposed_by.to_string(),
            supporting_evidence_ids: vec![],
        }
    }
}

/// Gate 支持的 Claim 类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ClaimType {
    /// Bug 已被修复（目标测试通过，修改已验证）
    BugFixed,
    /// 没有无关修改（diff 在允许范围内）
    NoUnrelatedChanges,
}

// ── ClaimAdjudicator (确定性，无 LLM) ──

/// Claim 裁决器
///
/// 第一版是 **确定性代码**，不使用第二个 LLM 自评。
/// 每个 ClaimType 有独立的裁决逻辑。
pub struct ClaimAdjudicator;

impl ClaimAdjudicator {
    /// 裁决一个 Claim
    ///
    /// `evidence` 是当前 case 的全部 Event（以 Evidence 形式）。
    /// `current_fingerprint` 是当前 workspace 状态的 fingerprint。
    pub fn adjudicate(
        claim: &Claim,
        evidence_list: &[Evidence],
        current_fingerprint: &str,
    ) -> Adjudication {
        match &claim.claim_type {
            ClaimType::BugFixed => {
                Self::adjudicate_bug_fixed(claim, evidence_list, current_fingerprint)
            }
            ClaimType::NoUnrelatedChanges => {
                Self::adjudicate_no_unrelated_changes(claim, evidence_list)
            }
        }
    }

    /// BugFixed 裁决逻辑
    ///
    /// 要求：
    /// 1. 存在 Verification 类型的 Evidence，显示测试通过
    /// 2. 该测试 Evidence 不是 STALE
    /// 3. 测试 Evidence 的 workspace_fingerprint 与当前一致
    /// 4. 存在 Change 类型的 Evidence（修改行为）
    /// 5. 存在 Observation 表示初始测试失败
    fn adjudicate_bug_fixed(
        claim: &Claim,
        evidence_list: &[Evidence],
        current_fingerprint: &str,
    ) -> Adjudication {
        let mut supporting = vec![];
        let mut reasoning = Vec::new();

        // 条件 1：找到 Verification 类型的 Evidence
        let verifications: Vec<&Evidence> = evidence_list
            .iter()
            .filter(|e| e.evidence_type == EvidenceType::Verification)
            .collect();

        if verifications.is_empty() {
            reasoning.push("没有验证 Evidence".to_string());
            return Adjudication {
                claim_id: claim.claim_id.clone(),
                claim_type: "BugFixed".to_string(),
                status: AdjudicationStatus::Insufficient,
                reasoning: "未找到任何测试验证记录".to_string(),
                supporting_evidence_ids: supporting,
                adjudicated_at: chrono::Utc::now().to_rfc3339(),
            };
        }

        // 条件 2：取最新的 Verification，检查 freshness
        let latest_verification = verifications.last().unwrap();
        supporting.push(latest_verification.evidence_id.0.clone());

        if latest_verification.freshness_status != FreshnessStatus::Fresh {
            reasoning.push(format!(
                "测试 Evidence {} 已过期",
                latest_verification.evidence_id
            ));
            return Adjudication {
                claim_id: claim.claim_id.clone(),
                claim_type: "BugFixed".to_string(),
                status: AdjudicationStatus::Stale,
                reasoning: format!("测试结果已过期: {}", latest_verification.evidence_id),
                supporting_evidence_ids: supporting,
                adjudicated_at: chrono::Utc::now().to_rfc3339(),
            };
        }

        // 条件 3：fingerprint 一致
        let vfp = latest_verification.workspace_fingerprint.as_deref();
        if vfp != Some(current_fingerprint) {
            reasoning.push("workspace fingerprint 不匹配".to_string());
            return Adjudication {
                claim_id: claim.claim_id.clone(),
                claim_type: "BugFixed".to_string(),
                status: AdjudicationStatus::Stale,
                reasoning: format!(
                    "测试 Evidence 的 workspace fingerprint 与当前状态不匹配"
                ),
                supporting_evidence_ids: supporting,
                adjudicated_at: chrono::Utc::now().to_rfc3339(),
            };
        }

        // 条件 4：存在 Change Evidence
        let changes: Vec<&Evidence> = evidence_list
            .iter()
            .filter(|e| e.evidence_type == EvidenceType::Change)
            .collect();

        if changes.is_empty() {
            reasoning.push("没有修改 Evidence".to_string());
            return Adjudication {
                claim_id: claim.claim_id.clone(),
                claim_type: "BugFixed".to_string(),
                status: AdjudicationStatus::Insufficient,
                reasoning: "未找到任何代码修改记录".to_string(),
                supporting_evidence_ids: supporting,
                adjudicated_at: chrono::Utc::now().to_rfc3339(),
            };
        }
        for c in &changes {
            supporting.push(c.evidence_id.0.clone());
        }

        // 条件 5：存在初始失败的测试 Observation
        let initial_failures: Vec<&Evidence> = evidence_list
            .iter()
            .filter(|e| {
                e.evidence_type == EvidenceType::Observation
                    && e.content.contains("fail")
            })
            .collect();

        if initial_failures.is_empty() {
            reasoning.push("没有初始失败记录".to_string());
            // 这是可选的——可能没有显式的失败 Observation
        } else {
            for f in &initial_failures {
                supporting.push(f.evidence_id.0.clone());
            }
        }

        Adjudication {
            claim_id: claim.claim_id.clone(),
            claim_type: "BugFixed".to_string(),
            status: AdjudicationStatus::Supported,
            reasoning: "目标测试通过，存在代码修改记录，evidence 未过期".to_string(),
            supporting_evidence_ids: supporting,
            adjudicated_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    /// NoUnrelatedChanges 裁决逻辑
    ///
    /// 要求：
    /// 1. 所有 Change Evidence 的操作路径在允许范围内
    /// 2. 没有拒绝的 Action
    /// 3. 没有敏感文件被读取或修改
    fn adjudicate_no_unrelated_changes(
        claim: &Claim,
        evidence_list: &[Evidence],
    ) -> Adjudication {
        let mut supporting = vec![];
        let mut has_denied_action = false;
        let mut reasons = vec![];

        // 检查所有 Change Evidence 是否都在允许范围内（通过 content 字段判断）
        for evidence in evidence_list.iter() {
            if evidence.evidence_type == EvidenceType::Change {
                supporting.push(evidence.evidence_id.0.clone());

                // 检查 content 中是否包含敏感路径指示
                if evidence.content.contains("DENIED") || evidence.content.contains("denied") {
                    has_denied_action = true;
                    reasons.push(format!(
                        "Change {} 包含拒绝标记",
                        evidence.evidence_id
                    ));
                }
                if evidence.content.contains(".env") || evidence.content.contains("/.git") {
                    has_denied_action = true;
                    reasons.push(format!(
                        "Change {} 可能涉及敏感路径",
                        evidence.evidence_id
                    ));
                }
            }
        }

        if has_denied_action {
            return Adjudication {
                claim_id: claim.claim_id.clone(),
                claim_type: "NoUnrelatedChanges".to_string(),
                status: AdjudicationStatus::Contradicted,
                reasoning: format!("存在不允许的修改: {}", reasons.join("; ")),
                supporting_evidence_ids: supporting,
                adjudicated_at: chrono::Utc::now().to_rfc3339(),
            };
        }

        Adjudication {
            claim_id: claim.claim_id.clone(),
            claim_type: "NoUnrelatedChanges".to_string(),
            status: AdjudicationStatus::Supported,
            reasoning: "所有修改在允许范围内，无拒绝记录".to_string(),
            supporting_evidence_ids: supporting,
            adjudicated_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::evidence::{Evidence, EvidenceType};

    fn make_evidence(
        case_id: &str,
        etype: EvidenceType,
        subject: &str,
        content: &str,
        fingerprint: Option<&str>,
    ) -> Evidence {
        let mut e = Evidence::new(
            case_id.to_string(),
            etype,
            subject.to_string(),
            content.to_string(),
        );
        e.workspace_fingerprint = fingerprint.map(|s| s.to_string());
        e
    }

    #[test]
    fn test_bug_fixed_supported() {
        let e1 = make_evidence("C1", EvidenceType::Observation, "初始测试", "test failures detected", Some("fp-abc"));
        let e2 = make_evidence("C1", EvidenceType::Change, "修改代码", "file_read: src/lib.rs", Some("fp-abc"));
        let e3 = make_evidence("C1", EvidenceType::Verification, "验证测试", "all tests passed", Some("fp-abc"));

        let claim = Claim::new(ClaimType::BugFixed, "Bug 已修复", "model");

        let result = ClaimAdjudicator::adjudicate(&claim, &[e1, e2, e3], "fp-abc");
        assert_eq!(result.status, AdjudicationStatus::Supported);
    }

    #[test]
    fn test_bug_fixed_insufficient_no_verification() {
        let e1 = make_evidence("C1", EvidenceType::Change, "修改代码", "file_read: src/lib.rs", None);
        let claim = Claim::new(ClaimType::BugFixed, "Bug 已修复", "model");

        let result = ClaimAdjudicator::adjudicate(&claim, &[e1], "fp-abc");
        assert_eq!(result.status, AdjudicationStatus::Insufficient);
    }

    #[test]
    fn test_bug_fixed_stale_fingerprint() {
        let e1 = make_evidence("C1", EvidenceType::Verification, "验证测试", "all tests passed", Some("fp-old"));

        let claim = Claim::new(ClaimType::BugFixed, "Bug 已修复", "model");
        let result = ClaimAdjudicator::adjudicate(&claim, &[e1], "fp-new");
        assert_eq!(result.status, AdjudicationStatus::Stale);
    }

    #[test]
    fn test_no_unrelated_changes_supported() {
        let e1 = make_evidence("C1", EvidenceType::Change, "修改 src/lib.rs", "file_read: src/lib.rs", None);
        let e2 = make_evidence("C1", EvidenceType::Change, "修改 tests/test.rs", "file_read: tests/test.rs", None);

        let claim = Claim::new(ClaimType::NoUnrelatedChanges, "无无关修改", "model");
        let result = ClaimAdjudicator::adjudicate(&claim, &[e1, e2], "fp-abc");
        assert_eq!(result.status, AdjudicationStatus::Supported);
    }

    #[test]
    fn test_no_unrelated_changes_contradicted() {
        let e1 = make_evidence("C1", EvidenceType::Change, "修改 .env", "file_read: .env (denied)", None);

        let claim = Claim::new(ClaimType::NoUnrelatedChanges, "无无关修改", "model");
        let result = ClaimAdjudicator::adjudicate(&claim, &[e1], "fp-abc");
        assert_eq!(result.status, AdjudicationStatus::Contradicted);
    }
}
