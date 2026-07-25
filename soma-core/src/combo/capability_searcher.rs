/// 能力缺口搜索 — 0.85 Gate B
///
/// 当 Combo 需要能力时，按优先级搜索：
/// 1. softill_library（已有 Softill）
/// 2. MCP 工具（已连接的 MCP Server）
/// 3. CLI 工具（系统可用命令）
/// 4. HTTP API（已知外部服务）
///
/// 搜不到时才生成候选。防止盲目增殖。

use std::collections::HashMap;

// ── 能力来源 ─────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum CapabilitySource {
    /// SomaOS 自有 Softill（softill_library.rs）
    SoftillLibrary,
    /// MCP Server 暴露的工具
    McpTool(String),  // server name
    /// 本地 CLI 命令
    CliTool,
    /// HTTP API 服务
    HttpApi,
    /// 旧的未接入资产
    LegacyAsset,
}

impl CapabilitySource {
    pub fn label(&self) -> &str {
        match self {
            CapabilitySource::SoftillLibrary => "Softill",
            CapabilitySource::McpTool(_) => "MCP",
            CapabilitySource::CliTool => "CLI",
            CapabilitySource::HttpApi => "HTTP API",
            CapabilitySource::LegacyAsset => "Legacy",
        }
    }
}

// ── 匹配结果 ─────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct CapabilityMatch {
    pub name: String,
    pub description: String,
    pub source: CapabilitySource,
    /// 0.0 ~ 1.0 匹配置信度
    pub confidence: f32,
    /// 是否需要适配才能使用
    pub needs_adapter: bool,
}

// ── 搜索索引条目 ────────────────────────────────────────────

struct IndexEntry {
    name: String,
    description: String,
    source: CapabilitySource,
    keywords: Vec<String>,
    tags: Vec<String>,
}

// ── 能力搜索器 ──────────────────────────────────────────────

pub struct CapabilitySearcher {
    index: Vec<IndexEntry>,
}

impl CapabilitySearcher {
    /// 构建包含所有已知能力的搜索器
    pub fn build() -> Self {
        let mut index = Vec::new();

        // 1. 索引 softill_library 中的 Softill
        // 通过函数列表自动构建（运行时反射不可用，所以显式列举）
        Self::index_softill_library(&mut index);

        // 2. 索引已知 MCP 工具
        Self::index_mcp_tools(&mut index);

        // 3. 索引已知 CLI 工具
        Self::index_cli_tools(&mut index);

        // 4. 索引已知外部 API
        Self::index_external_apis(&mut index);

        Self { index }
    }

    /// 搜索能力缺口
    ///
    /// 返回按优先级排序的匹配结果 + 缺口描述。
    pub fn search(&self, query: &str) -> CapabilitySearchResult {
        let q = query.to_lowercase();
        let terms: Vec<&str> = q.split_whitespace().collect();

        let mut matches: Vec<CapabilityMatch> = Vec::new();

        for entry in &self.index {
            let mut score = 0.0f32;

            // 精确匹配名称
            if entry.name.to_lowercase() == q {
                score = 1.0;
            }
            // 名称包含查询
            else if entry.name.to_lowercase().contains(&q) {
                score = 0.9;
            }
            // 标签匹配（标签是人工精选的关键词，优先级高于描述）
            else if entry.tags.iter().any(|t| t.contains(&q)) {
                score = 0.85;
            }
            // 任意标签匹配任一搜索词
            else if terms.iter().any(|t| entry.tags.iter().any(|tag| tag.contains(t))) {
                score = 0.8;
            }
            // 描述包含查询
            else if entry.description.to_lowercase().contains(&q) {
                score = 0.7;
            }
            // 关键词匹配
            else {
                let kw_score: f32 = terms.iter()
                    .filter(|t| entry.keywords.iter().any(|kw| kw.contains(*t)))
                    .count() as f32 / terms.len() as f32;
                if kw_score > 0.0 {
                    score = 0.4 + kw_score * 0.3;
                }
            }

            if score > 0.0 {
                matches.push(CapabilityMatch {
                    name: entry.name.clone(),
                    description: entry.description.clone(),
                    source: entry.source.clone(),
                    confidence: (score * 100.0).round() / 100.0,
                    needs_adapter: matches!(&entry.source, CapabilitySource::McpTool(_) | CapabilitySource::HttpApi),
                });
            }
        }

        // 按优先级和置信度排序：Softill > MCP > CLI > HTTP
        matches.sort_by(|a, b| {
            let a_priority = source_priority(&a.source);
            let b_priority = source_priority(&b.source);
            b_priority.cmp(&a_priority)
                .then_with(|| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal))
        });

        let has_exact = matches.iter().any(|m| m.confidence >= 0.9);
        let has_partial = matches.iter().any(|m| m.confidence >= 0.5 && m.confidence < 0.9);

        let gap = if !has_exact && !has_partial {
            Some(format!("未找到与 '{}' 匹配的能力。可考虑从零生成候选 Softill。", query))
        } else if !has_exact {
            Some(format!("未找到精确匹配。以下能力接近但不完全满足需求："))
        } else {
            None
        };

        CapabilitySearchResult {
            query: query.to_string(),
            matches,
            has_exact_match: has_exact,
            has_partial_match: has_partial,
            gap_description: gap,
        }
    }

    // ── 索引构建 ──

    fn index_softill_library(index: &mut Vec<IndexEntry>) {
        // softill_library 中的所有 Softill 自动编入索引
        for s in &super::softill_library::all_softills() {
            Self::index_one_softill(index, s, CapabilitySource::SoftillLibrary);
        }
        // 常用插件也编入索引
        for s in &super::common_plugins::all_common_plugins() {
            Self::index_one_softill(index, s, CapabilitySource::SoftillLibrary);
        }
    }

    fn index_one_softill(index: &mut Vec<IndexEntry>, s: &super::softill::Softill, source: CapabilitySource) {
        let keywords = extract_keywords(&s.name);
        index.push(IndexEntry {
            name: s.id.clone(),
            description: s.description.clone(),
            source,
            keywords,
            tags: s.tags.clone(),
        });
    }

    fn index_mcp_tools(index: &mut Vec<IndexEntry>) {
        // 已知的 Foundry MCP 工具（从当前会话中已知的）
        let tools = vec![
            ("soma_repo_diff", "Git diff via MCP tool",
                vec!["diff", "git", "change", "改动", "差异"]),
            ("soma_repo_status", "Git status via MCP tool",
                vec!["status", "git", "state", "状态"]),
            ("soma_repo_log", "Git commit log via MCP tool",
                vec!["log", "git", "history", "commit", "历史"]),
            ("soma_repo_branch", "Git branch info via MCP tool",
                vec!["branch", "git", "分支"]),
            ("soma_file_search", "Search file contents via MCP tool",
                vec!["search", "file", "grep", "搜索", "文件"]),
            ("codebase_search", "Search codebase with regex pattern matching",
                vec!["search", "code", "regex", "pattern", "代码搜索"]),
            ("soma_repo_fetch", "Fetch remote repository to local cache",
                vec!["fetch", "remote", "clone", "下载"]),
            ("soma_repo_inspect", "Inspect remote repository metadata",
                vec!["inspect", "remote", "meta", "检查"]),
            ("soma_repo_verify", "Verify local resource integrity",
                vec!["verify", "check", "integrity", "验证"]),
            ("soma_feature_flag", "Feature flag management",
                vec!["feature", "flag", "toggle", "特性开关"]),
        ];

        for (name, desc, keywords) in tools {
            index.push(IndexEntry {
                name: name.to_string(),
                description: desc.to_string(),
                source: CapabilitySource::McpTool("foundry-soma-repo".into()),
                keywords: keywords.into_iter().map(|s| s.to_string()).collect(),
                tags: vec![],
            });
        }
    }

    fn index_cli_tools(index: &mut Vec<IndexEntry>) {
        // 已知的本地 CLI 工具
        let tools = vec![
            ("git", "Distributed version control system",
                vec!["vcs", "version", "commit", "diff", "版本控制"]),
            ("cargo", "Rust package manager and build tool",
                vec!["rust", "build", "compile", "package", "编译", "构建"]),
            ("node", "JavaScript runtime",
                vec!["js", "javascript", "runtime", "脚本"]),
            ("gstack-diff-scope", "Classify diff scope into project categories",
                vec!["diff", "scope", "classify", "影响范围"]),
            ("curl", "HTTP client for data transfer",
                vec!["http", "request", "api", "网络", "请求"]),
            ("gh", "GitHub CLI for issue, PR, and repo management",
                vec!["github", "pr", "issue", "repo"]),
        ];

        for (name, desc, keywords) in tools {
            index.push(IndexEntry {
                name: name.to_string(),
                description: desc.to_string(),
                source: CapabilitySource::CliTool,
                keywords: keywords.into_iter().map(|s| s.to_string()).collect(),
                tags: vec![],
            });
        }
    }

    fn index_external_apis(index: &mut Vec<IndexEntry>) {
        // 已知的外部 API 服务
        let apis = vec![
            ("figma-file-read", "Read Figma design file structure via REST API",
                vec!["figma", "design", "ui", "设计文件"]),
            ("figma-style-export", "Export design tokens from Figma via REST API",
                vec!["figma", "design", "token", "style", "样式"]),
        ];

        for (name, desc, keywords) in apis {
            index.push(IndexEntry {
                name: name.to_string(),
                description: desc.to_string(),
                source: CapabilitySource::HttpApi,
                keywords: keywords.into_iter().map(|s| s.to_string()).collect(),
                tags: vec![],
            });
        }
    }

    /// 列出所有可用的能力来源统计
    pub fn statistics(&self) -> HashMap<String, usize> {
        let mut stats = HashMap::new();
        for entry in &self.index {
            let label = entry.source.label().to_string();
            *stats.entry(label).or_insert(0) += 1;
        }
        stats
    }

    /// 列出缺口候选（未在任何来源中找到匹配的能力需求列表）
    pub fn known_gaps(&self) -> Vec<&str> {
        // 已知的常见缺口（从 0.8 全链 dogfood 中识别）
        vec![
            "plan-delivery-compare",  // 计划与实际交付比较
            "test-impact-analysis",   // 测试影响范围分析
        ]
    }
}

// ── 搜索结果 ─────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct CapabilitySearchResult {
    pub query: String,
    pub matches: Vec<CapabilityMatch>,
    pub has_exact_match: bool,
    pub has_partial_match: bool,
    pub gap_description: Option<String>,
}

impl CapabilitySearchResult {
    pub fn summary(&self) -> String {
        let mut out = String::new();
        out.push_str(&format!("🔍 搜索: {:?}\n", self.query));

        if self.matches.is_empty() {
            out.push_str("  未找到任何匹配的能力。\n");
            return out;
        }

        out.push_str(&format!("\n  匹配结果 ({} 项):\n", self.matches.len()));
        for m in &self.matches {
            let marker = if m.confidence >= 0.9 { "✅" }
                else if m.confidence >= 0.5 { "🔶" }
                else { "ℹ️ " };
            out.push_str(&format!(
                "  {} [{:.0}%] {} — {} ({})\n",
                marker, m.confidence * 100.0, m.name, m.description, m.source.label()
            ));
        }

        if let Some(ref gap) = self.gap_description {
            out.push_str(&format!("\n  ⛔ {}\n", gap));
        }

        out
    }
}

// ── Gap 渲染 ─────────────────────────────────────────────────

/// 渲染搜索结果用于 CLI 显示
pub fn render_gap_search(query: &str) -> String {
    let searcher = CapabilitySearcher::build();
    let result = searcher.search(query);
    let mut out = result.summary();

    if !result.has_exact_match {
        out.push_str("\n  💡 未找到精确匹配的能力。\n");
        out.push_str("     可以尝试: 调整搜索词，或使用 `soma gap propose <query>` 生成候选 Softill。\n");
    }

    out
}

// ── Softill 候选提议 ──────────────────────────────────────────

/// Softill 候选提议 — 当搜索确认缺口后，建议生成的新 Softill
#[derive(Debug, Clone)]
pub struct SoftillProposal {
    pub query: String,
    pub suggested_id: String,
    pub suggested_name: String,
    pub purpose: String,
    pub suggested_inputs: Vec<String>,
    pub suggested_outputs: Vec<String>,
    pub suggested_effect: String,
    pub handler_approach: String,
    pub similar_softills: Vec<String>,
}

/// 当搜索确认缺口后，生成 Softill 候选提议
pub fn propose_softill(query: &str) -> SoftillProposal {
    let q = query.to_lowercase();
    let id = query.replace(' ', "-").to_lowercase();
    let name = query.split_whitespace()
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                Some(first) => first.to_uppercase().to_string() + c.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ");

    let (purpose, effect, inputs, outputs, approach) = if q.contains("plan") && q.contains("delivery") {
        ("比较实施计划与实际代码交付之间的偏差。从 Plan Combo 的输出和实际 diff 中提取结构化的差异清单。".to_string(),
         "read-only",
         vec!["plan_path: String — 实施计划文件路径".into(), "diff: String — 实际代码变更 diff".into()],
         vec!["deviations: Vec<Deviation> — 偏差列表（计划 vs 实际）".into(), "verdict: 'aligned' | 'drifted' | 'missing'".into()],
         "读取 Plan 产物 → 解析 git diff → 逐条对比 → 输出结构化偏差报告")
    } else if q.contains("test") && q.contains("impact") {
        ("分析代码变更影响的测试范围。识别哪些测试需要运行，哪些可以跳过。".to_string(),
         "read-only",
         vec!["changed_files: Vec<String> — 变更文件列表".into(), "test_root: String — 测试根目录".into()],
         vec!["affected_tests: Vec<String> — 受影响测试列表".into(), "skip_tests: Vec<String> — 可跳过测试".into(), "coverage_gap: String — 未覆盖的变更区域".into()],
         "解析变更文件 → 分析模块依赖 → 匹配对应测试 → 输出影响范围")
    } else {
        (format!("为 '{}' 提供自动化能力。具体输入输出取决于实际场景。", query),
         "read-only",
         vec!["input: String — 输入参数".into()],
         vec!["result: String — 执行结果".into()],
         "分析需求 → 设计实现 → 编码 → 测试")
    };

    // 搜索相似的 Softill
    let searcher = CapabilitySearcher::build();
    let similar = searcher.search(query);
    let similar_names: Vec<String> = similar.matches.iter()
        .take(3)
        .map(|m| m.name.clone())
        .collect();

    SoftillProposal {
        query: query.to_string(),
        suggested_id: id,
        suggested_name: name,
        purpose: purpose.to_string(),
        suggested_inputs: inputs,
        suggested_outputs: outputs,
        suggested_effect: effect.to_string(),
        handler_approach: approach.to_string(),
        similar_softills: similar_names,
    }
}

/// 渲染候选提议用于 CLI 显示
pub fn render_proposal(proposal: &SoftillProposal) -> String {
    let mut out = String::new();
    out.push_str(&format!("📋 Softill 候选提议\n"));
    out.push_str(&format!("   基于: {:?}\n\n", proposal.query));
    out.push_str(&format!("  ID:   {}\n", proposal.suggested_id));
    out.push_str(&format!("  名称: {}\n", proposal.suggested_name));
    out.push_str(&format!("  用途: {}\n", proposal.purpose));
    out.push_str(&format!("  副作用: {}\n", proposal.suggested_effect));
    out.push_str("\n  建议输入:\n");
    for i in &proposal.suggested_inputs {
        out.push_str(&format!("    • {}\n", i));
    }
    out.push_str("\n  建议输出:\n");
    for o in &proposal.suggested_outputs {
        out.push_str(&format!("    • {}\n", o));
    }
    out.push_str(&format!("\n  实现思路:\n    {}\n", proposal.handler_approach));

    if !proposal.similar_softills.is_empty() {
        out.push_str("\n  相似已有能力:\n");
        for s in &proposal.similar_softills {
            out.push_str(&format!("    • {}（已有，可参考实现）\n", s));
        }
    }

    out.push_str("\n  验证建议:\n");
    out.push_str("    1. 在隔离沙箱中实现\n");
    out.push_str("    2. 编写至少 3 个测试用例\n");
    out.push_str("    3. 对照无此 Softill 的基线运行同一任务\n");
    out.push_str("    4. 比较输出质量、工具调用次数、人工介入需求\n");
    out.push_str("    5. 确认后被两个 Combo 复用 → 晋升为 available\n");

    out
}

// ── 辅助函数 ─────────────────────────────────────────────────

fn source_priority(source: &CapabilitySource) -> u8 {
    match source {
        CapabilitySource::SoftillLibrary => 5,
        CapabilitySource::McpTool(_) => 4,
        CapabilitySource::CliTool => 3,
        CapabilitySource::HttpApi => 2,
        CapabilitySource::LegacyAsset => 1,
    }
}

fn extract_keywords(name: &str) -> Vec<String> {
    let mut kw: Vec<String> = name.split(&['-', '_', '.'][..])
        .filter(|s| s.len() > 1)
        .map(|s| s.to_lowercase())
        .collect();
    kw.push(name.to_lowercase());
    kw
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_search_softill_exact_match() {
        let searcher = CapabilitySearcher::build();
        // Search something that should exist in softill_library
        let result = searcher.search("code-search");
        assert!(result.has_exact_match || result.has_partial_match,
            "Should find code-search in library");
    }

    #[test]
    fn test_search_mcp_tool() {
        let searcher = CapabilitySearcher::build();
        let result = searcher.search("git diff");
        assert!(result.has_exact_match || result.has_partial_match,
            "Should find git diff tools");
    }

    #[test]
    fn test_search_no_match() {
        let searcher = CapabilitySearcher::build();
        let result = searcher.search("xyznonexistent12345");
        assert!(!result.has_exact_match);
        assert!(!result.has_partial_match);
        assert!(result.gap_description.is_some());
        assert!(result.matches.is_empty());
    }

    #[test]
    fn test_search_priority_softill_over_cli() {
        let searcher = CapabilitySearcher::build();
        let result = searcher.search("diff");
        // Should find MCP/Softill matches before CLI matches
        if !result.matches.is_empty() {
            assert!(result.matches.iter().any(|m| matches!(m.source, CapabilitySource::McpTool(_))),
                "Should find MCP diff tools for 'diff' query");
        }
    }

    #[test]
    fn test_search_figma_api() {
        let searcher = CapabilitySearcher::build();
        let result = searcher.search("figma design");
        assert!(result.has_exact_match || result.has_partial_match,
            "Should find Figma API for 'figma design'");
    }

    #[test]
    fn test_search_finds_legacy_gap() {
        let searcher = CapabilitySearcher::build();
        // plan-delivery-compare is a known gap
        let result = searcher.search("plan delivery compare");
        assert!(!result.has_exact_match,
            "plan-delivery-compare is a known gap — should NOT have exact match");
    }

    #[test]
    fn test_statistics() {
        let searcher = CapabilitySearcher::build();
        let stats = searcher.statistics();
        assert!(stats.get("Softill").copied().unwrap_or(0) >= 100,
            "Should have 100+ Softill entries, got {:?}", stats);
        assert!(stats.get("MCP").copied().unwrap_or(0) >= 8,
            "Should have 8+ MCP entries");
    }

    #[test]
    fn test_known_gaps() {
        let searcher = CapabilitySearcher::build();
        let gaps = searcher.known_gaps();
        assert!(gaps.contains(&"plan-delivery-compare"));
        assert!(gaps.contains(&"test-impact-analysis"));
    }

    #[test]
    fn test_search_result_summary_not_empty() {
        let searcher = CapabilitySearcher::build();
        let result = searcher.search("code review");
        let summary = result.summary();
        assert!(!summary.is_empty());
        assert!(summary.contains("搜索"));
    }

    // ── 候选提议测试 ──

    #[test]
    fn test_propose_plan_delivery_compare() {
        let proposal = propose_softill("plan delivery compare");
        assert!(proposal.suggested_id.contains("plan"));
        assert!(proposal.suggested_name.contains("Plan"));
        assert!(!proposal.purpose.is_empty());
        assert!(proposal.suggested_inputs.len() >= 2);
        assert!(proposal.suggested_outputs.len() >= 1);
    }

    #[test]
    fn test_propose_test_impact_analysis() {
        let proposal = propose_softill("test impact analysis");
        assert!(proposal.suggested_id.contains("test"));
        assert!(!proposal.purpose.is_empty());
        assert!(proposal.suggested_inputs.len() >= 1);
    }

    #[test]
    fn test_propose_generic() {
        let proposal = propose_softill("custom data validation");
        assert!(!proposal.suggested_id.is_empty());
        assert!(!proposal.suggested_name.is_empty());
        // Should find some similar softills or return empty
        assert!(proposal.similar_softills.len() <= 3);
    }

    #[test]
    fn test_render_proposal() {
        let proposal = propose_softill("plan delivery compare");
        let rendered = render_proposal(&proposal);
        assert!(rendered.contains("Softill 候选提议"));
        assert!(rendered.contains("plan-delivery-compare"));
        assert!(rendered.contains("验证建议"));
    }

    #[test]
    fn test_render_gap_search() {
        let rendered = render_gap_search("plan delivery compare");
        assert!(rendered.contains("搜索"));
        assert!(rendered.contains("gap propose"));
    }

    #[test]
    fn test_proposal_effect_matches_purpose() {
        let proposal = propose_softill("plan delivery compare");
        assert_eq!(proposal.suggested_effect, "read-only");
    }
}
