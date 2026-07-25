/// Pipeline 显示渲染 — 供 CLI 和 Runtime 使用
///
/// 将 Pipeline + Router 结构化为人类可读的文本输出。
use super::pipeline::*;
use super::routing::*;

/// 渲染管线描述（pipeline describe 命令的输出）
pub fn render_describe(query: &str) -> String {
    let q = query.to_lowercase();

    // 检测 Bug 修复查询 → 使用短路路由
    if q.contains("bug") || q.contains("fix") || q.contains("investigate") || q.contains("调查") {
        return render_bug_fix_describe(query);
    }

    // 检测"需求明确"查询 → 跳过 office-hours
    let skip_office_hours = q.contains("clear") || q.contains("spec") || q.contains("明确");

    let _pipeline = main_product_chain();
    let router = default_main_chain_router();
    let _artifacts = ArtifactStore::new();

    let mut output = String::new();
    output.push_str(&format!("Pipeline: {}\n", _pipeline.description));
    output.push_str(&format!("Query: {:?}\n\n", query));

    for (i, stage) in _pipeline.stages().iter().enumerate() {
        let decision = router.decide(&stage.combo_id, &_artifacts, None, None);
        let stage_num = i + 1;

        let (icon, action) = if skip_office_hours && stage.combo_id == "office-hours" {
            ("⏭", "Skip (需求明确)".to_string())
        } else if q.contains("small") && (stage.combo_id == "office-hours" || stage.combo_id == "spec" || stage.combo_id == "plan") {
            ("⏭", "Skip (小型修改)".to_string())
        } else {
            match &decision {
                RouteDecision::Enter(_) => ("▶ ", "Enter".to_string()),
                RouteDecision::Skip(_) => ("⏭", "Skip".to_string()),
                RouteDecision::Fallback(_) => ("↩ ", "Fallback".to_string()),
                RouteDecision::Blocked(reason) => ("⛔", format!("Blocked: {}", reason)),
                RouteDecision::Complete => ("✅", "Complete".to_string()),
            }
        };

        output.push_str(&format!(" {}. {:<14} {} {}\n",
            stage_num, stage.combo_id, icon, action));
    }

    output
}

/// Bug 修复管道路由显示
fn render_bug_fix_describe(query: &str) -> String {
    let pipeline = bug_fix_chain();
    let router = bug_fix_shortcut_router();

    let mut output = String::new();
    output.push_str("Pipeline: Bug 修复短路管线\n");
    output.push_str(&format!("Query: {:?}\n\n", query));
    output.push_str("  ℹ️ 跳过 office-hours / spec / plan（直接进入调查）\n\n");

    // 沿管线阶段递增产物，展示每个阶段的预期路径
    let mut artifacts = ArtifactStore::new();

    for (i, stage) in pipeline.stages().iter().enumerate() {
        let decision = router.decide(&stage.combo_id, &artifacts, None, None);
        let (icon, action) = describe_decision(&decision);

        // 根据阶段选择产出 artifact
        let combo_id: &str = &stage.combo_id;
        let output_note = match combo_id {
            "investigate" => "→ 产出: debug_report",
            "implement" => "→ 产出: code_changes",
            _ => "",
        };

        output.push_str(&format!(" {}. {:<14} {} {} {}\n",
            i + 1, stage.combo_id, icon, action, output_note));

        // 存储产物供后续阶段路由使用
        match combo_id {
            "investigate" => {
                artifacts.store(Artifact::new(ARTIFACT_DEBUG, "investigate",
                    serde_json::json!({}), "root cause identified"));
            }
            "implement" => {
                artifacts.store(Artifact::new("code_changes", "implement",
                    serde_json::json!({}), "fix applied"));
            }
            _ => {}
        }
    }

    // 最后一步审阅通过时注明完成
    output.push_str("  review 完成后 → Gate 通过即修复完成\n");

    output
}

fn describe_decision(decision: &RouteDecision) -> (&'static str, String) {
    match decision {
        RouteDecision::Enter(_) => ("▶ ", "Enter".to_string()),
        RouteDecision::Skip(_) => ("⏭", "Skip".to_string()),
        RouteDecision::Fallback(_) => ("↩ ", "Fallback".to_string()),
        RouteDecision::Blocked(reason) => ("▶ ", format!("Enter (anticipate: {})", reason)),
        RouteDecision::Complete => ("✅", "Complete".to_string()),
    }
}

/// 渲染管线状态（pipeline status 命令的输出）
pub fn render_status(state_path: &std::path::Path) -> String {
    use super::work_state::WorkState;

    if !state_path.exists() {
        return format!(
            "No active pipeline state.\n\
             Start a task with `soma investigate` or create {} to begin.",
            state_path.display()
        );
    }

    match WorkState::load(&state_path.to_path_buf()) {
        Ok(state) => {
            let mut output = String::new();
            output.push_str(&format!("Task: {}\n", state.task_goal));
            output.push_str(&format!("Current Combo: {}\n", state.current_combo));
            output.push_str(&format!("Current Stage: {}\n", state.current_stage));

            let artifacts = &state.pipeline_artifacts;
            let artifact_list = artifacts.list_types();
            output.push_str(&format!("Artifacts: {}\n", if artifact_list.is_empty() {
                "none".to_string()
            } else {
                artifact_list.join(", ")
            }));

            if !state.suggested_next.is_empty() {
                output.push_str(&format!("Next: {}\n", state.suggested_next));
            }

            output
        }
        Err(e) => format!("Error reading pipeline state: {}", e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_describe_normal() {
        let output = render_describe("add a new feature");
        assert!(output.contains("Pipeline:"));
        assert!(output.contains("office-hours"));
        assert!(output.contains("spec"));
        assert!(output.contains("plan"));
        assert!(output.contains("ship"));
    }

    #[test]
    fn test_render_describe_bug_fix() {
        let output = render_describe("fix the login bug");
        assert!(output.contains("Bug 修复"));
        assert!(output.contains("investigate"));
        // Bug 修复管线不含 office-hours/spec/plan 作为阶段
        // 但在提示信息中会提到"跳过"它们
        assert!(output.contains("跳过 office-hours / spec / plan"));
    }

    #[test]
    fn test_render_describe_bug_fix_keywords() {
        for kw in &["bug", "fix", "调查"] {
            let output = render_describe(kw);
            assert!(output.contains("Bug 修复"), "Keyword '{}' should trigger bug fix path", kw);
        }
        // "investigate" 既是英文关键词也是阶段名，不纳入
    }

    #[test]
    fn test_render_status_no_state() {
        let path = std::path::Path::new("/tmp/nonexistent/somaos-state.json");
        let output = render_status(path);
        assert!(output.contains("No active pipeline state"));
    }

    #[test]
    fn test_render_describe_not_empty() {
        let output = render_describe("build a new API endpoint");
        assert!(!output.is_empty());
        assert!(output.lines().count() >= 6); // header + 8 stages minimum
    }

    #[test]
    fn test_render_status_with_valid_state() {
        // 创建临时状态文件
        let dir = std::env::temp_dir();
        let path = dir.join("test-somaos-pipeline-status.json");
        let pb = path.clone();

        let mut state = super::super::work_state::WorkState::new("test task");
        state.set_combo("investigate", "Phase 1");
        state.save(&pb).unwrap();

        let output = render_status(&path);
        assert!(output.contains("test task"));
        assert!(output.contains("investigate"));

        std::fs::remove_file(&path).ok();
    }
}
