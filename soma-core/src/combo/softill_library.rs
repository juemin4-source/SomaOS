/// 集中式 Softill 库 — 125 个 vendored JS Script Softill
///
/// 自动生成于 SomaOS 旧资产批量接入。
/// 每个 Softill 有完整 id、name、description、invocation 和 effect。
/// input_schema 为最小占位，tags 从名称和描述自动提取，可根据实际场景补充细化。

// 集中式 Softill 库 — 所有 vendored JS Script Softill
// 自动生成。补充 input_schema 和 output_description 时编辑此文件。

use super::softill::{Softill, SoftillInvocation};

// ═══════════════════════════════════════════════
// 开发能力
// ═══════════════════════════════════════════════

// ── api-client-generator
pub fn api_client_generator_softill() -> Softill {
    Softill {
        id: "api-client-generator".into(),
        name: "api-client-generator".into(),
        description: "[开发] Generate API client code from contracts".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/api-client-generator/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["api".into(), "client".into(), "code".into(), "contracts".into(), "from".into(), "generate".into(), "generator".into()],
        output_description: "[开发] Generate API client code from contracts 的执行结果。".into(),
        effect: "network-read-only".into(),
    }
}

// ── api-contract-extractor
pub fn api_contract_extractor_softill() -> Softill {
    Softill {
        id: "api-contract-extractor".into(),
        name: "api-contract-extractor".into(),
        description: "[开发] Extract API contracts from source code".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/api-contract-extractor/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["api".into(), "code".into(), "contract".into(), "contracts".into(), "extract".into(), "extractor".into(), "from".into(), "source".into()],
        output_description: "[开发] Extract API contracts from source code 的执行结果。".into(),
        effect: "network-read-only".into(),
    }
}

// ── auth-policy-map
pub fn auth_policy_map_softill() -> Softill {
    Softill {
        id: "auth-policy-map".into(),
        name: "auth-policy-map".into(),
        description: "[开发] Map authentication and authorization policies".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/auth-policy-map/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "auth".into(), "authentication".into(), "authorization".into(), "map".into(), "policies".into(), "policy".into()],
        output_description: "[开发] Map authentication and authorization policies 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── backend-route-map
pub fn backend_route_map_softill() -> Softill {
    Softill {
        id: "backend-route-map".into(),
        name: "backend-route-map".into(),
        description: "[开发] Map backend routes and handlers".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/backend-route-map/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "backend".into(), "handlers".into(), "map".into(), "route".into(), "routes".into()],
        output_description: "[开发] Map backend routes and handlers 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── build-eye
pub fn build_eye_softill() -> Softill {
    Softill {
        id: "build-eye".into(),
        name: "build-eye".into(),
        description: "[开发] Inspect build output and structure".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/build-eye/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "build".into(), "eye".into(), "inspect".into(), "output".into(), "structure".into()],
        output_description: "[开发] Inspect build output and structure 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── cache-manager
pub fn cache_manager_softill() -> Softill {
    Softill {
        id: "cache-manager".into(),
        name: "cache-manager".into(),
        description: "[开发] Manage caches and temporary data".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/cache-manager/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "cache".into(), "caches".into(), "data".into(), "manage".into(), "manager".into(), "temporary".into()],
        output_description: "[开发] Manage caches and temporary data 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── code-review-diff-reader
pub fn code_review_diff_reader_softill() -> Softill {
    Softill {
        id: "code-review-diff-reader".into(),
        name: "code-review-diff-reader".into(),
        description: "[开发] Read and structure git diff for code review".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/code-review-diff-reader/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "code".into(), "diff".into(), "for".into(), "git".into(), "read".into(), "reader".into(), "review".into()],
        output_description: "[开发] Read and structure git diff for code review 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── code-review-evidence-collector
pub fn code_review_evidence_collector_softill() -> Softill {
    Softill {
        id: "code-review-evidence-collector".into(),
        name: "code-review-evidence-collector".into(),
        description: "[开发] Collect and organize code review evidence".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/code-review-evidence-collector/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "code".into(), "collect".into(), "collector".into(), "evidence".into(), "organize".into(), "review".into()],
        output_description: "[开发] Collect and organize code review evidence 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── code-review-pattern-matcher
pub fn code_review_pattern_matcher_softill() -> Softill {
    Softill {
        id: "code-review-pattern-matcher".into(),
        name: "code-review-pattern-matcher".into(),
        description: "[开发] Match code patterns during code review".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/code-review-pattern-matcher/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["code".into(), "during".into(), "match".into(), "matcher".into(), "pattern".into(), "patterns".into(), "review".into()],
        output_description: "[开发] Match code patterns during code review 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── code-review-report-generator
pub fn code_review_report_generator_softill() -> Softill {
    Softill {
        id: "code-review-report-generator".into(),
        name: "code-review-report-generator".into(),
        description: "[开发] Generate structured code review reports".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/code-review-report-generator/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["code".into(), "generate".into(), "generator".into(), "report".into(), "reports".into(), "review".into(), "structured".into()],
        output_description: "[开发] Generate structured code review reports 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── code-search
pub fn code_search_softill() -> Softill {
    Softill {
        id: "code-search".into(),
        name: "code-search".into(),
        description: "[开发] Search codebase for patterns and symbols".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/code-search/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "code".into(), "codebase".into(), "for".into(), "patterns".into(), "search".into(), "symbols".into()],
        output_description: "[开发] Search codebase for patterns and symbols 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── codebase.search
pub fn codebase_search_softill() -> Softill {
    Softill {
        id: "codebase.search".into(),
        name: "codebase.search".into(),
        description: "[开发] Search codebase content with regex pattern matching".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/codebase.search/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["codebase".into(), "codebase.search".into(), "content".into(), "matching".into(), "pattern".into(), "regex".into(), "search".into(), "with".into()],
        output_description: "[开发] Search codebase content with regex pattern matching 的执行结果。handler 包含输入/输出说明。".into(),
        effect: "read-only".into(),
    }
}

// ── component-inventory
pub fn component_inventory_softill() -> Softill {
    Softill {
        id: "component-inventory".into(),
        name: "component-inventory".into(),
        description: "[开发] Scan and catalog project structure by file type".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/component-inventory/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "catalog".into(), "component".into(), "file".into(), "inventory".into(), "project".into(), "scan".into(), "structure".into()],
        output_description: "[开发] Scan and catalog project structure by file type 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── computer-hand
pub fn computer_hand_softill() -> Softill {
    Softill {
        id: "computer-hand".into(),
        name: "computer-hand".into(),
        description: "[开发] Control keyboard and mouse programmatically".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/computer-hand/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "computer".into(), "control".into(), "hand".into(), "keyboard".into(), "mouse".into(), "programmatically".into()],
        output_description: "[开发] Control keyboard and mouse programmatically 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── contract-diff
pub fn contract_diff_softill() -> Softill {
    Softill {
        id: "contract-diff".into(),
        name: "contract-diff".into(),
        description: "[开发] Compare API contracts for breaking changes".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/contract-diff/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["api".into(), "breaking".into(), "changes".into(), "compare".into(), "contract".into(), "contracts".into(), "diff".into(), "for".into()],
        output_description: "[开发] Compare API contracts for breaking changes 的执行结果。".into(),
        effect: "network-read-only".into(),
    }
}

// ── db-crud
pub fn db_crud_softill() -> Softill {
    Softill {
        id: "db-crud".into(),
        name: "db-crud".into(),
        description: "[开发] Perform database CRUD operations".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/db-crud/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["crud".into(), "database".into(), "operations".into(), "perform".into()],
        output_description: "[开发] Perform database CRUD operations 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── db-schema-map
pub fn db_schema_map_softill() -> Softill {
    Softill {
        id: "db-schema-map".into(),
        name: "db-schema-map".into(),
        description: "[开发] Map database schema and relationships".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/db-schema-map/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "database".into(), "map".into(), "relationships".into(), "schema".into()],
        output_description: "[开发] Map database schema and relationships 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── diff-review
pub fn diff_review_softill() -> Softill {
    Softill {
        id: "diff-review".into(),
        name: "diff-review".into(),
        description: "[开发] Review git diff and detect scope changes and risks".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/diff-review/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "changes".into(), "detect".into(), "diff".into(), "git".into(), "review".into(), "risks".into(), "scope".into()],
        output_description: "[开发] Review git diff and detect scope changes and risks 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── endpoint-smoke-tester
pub fn endpoint_smoke_tester_softill() -> Softill {
    Softill {
        id: "endpoint-smoke-tester".into(),
        name: "endpoint-smoke-tester".into(),
        description: "[开发] Smoke test API endpoints".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/endpoint-smoke-tester/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["api".into(), "endpoint".into(), "endpoints".into(), "smoke".into(), "test".into(), "tester".into()],
        output_description: "[开发] Smoke test API endpoints 的执行结果。".into(),
        effect: "network-read-only".into(),
    }
}

// ── env-requirements-checker
pub fn env_requirements_checker_softill() -> Softill {
    Softill {
        id: "env-requirements-checker".into(),
        name: "env-requirements-checker".into(),
        description: "[开发] Check environment requirements".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/env-requirements-checker/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["check".into(), "checker".into(), "env".into(), "environment".into(), "requirements".into()],
        output_description: "[开发] Check environment requirements 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── error-contract-extractor
pub fn error_contract_extractor_softill() -> Softill {
    Softill {
        id: "error-contract-extractor".into(),
        name: "error-contract-extractor".into(),
        description: "[开发] Extract error contracts from code".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/error-contract-extractor/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["code".into(), "contract".into(), "contracts".into(), "error".into(), "extract".into(), "extractor".into(), "from".into()],
        output_description: "[开发] Extract error contracts from code 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── file-patch
pub fn file_patch_softill() -> Softill {
    Softill {
        id: "file-patch".into(),
        name: "file-patch".into(),
        description: "[开发] Apply precise file modifications with dry-run support".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/file-patch/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["apply".into(), "dry-run".into(), "file".into(), "modifications".into(), "patch".into(), "precise".into(), "support".into(), "with".into()],
        output_description: "[开发] Apply precise file modifications with dry-run support 的执行结果。handler 包含输入/输出说明。".into(),
        effect: "read-only".into(),
    }
}

// ── fixture-sync
pub fn fixture_sync_softill() -> Softill {
    Softill {
        id: "fixture-sync".into(),
        name: "fixture-sync".into(),
        description: "[开发] Sync test fixtures with source".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/fixture-sync/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["fixture".into(), "fixtures".into(), "source".into(), "sync".into(), "test".into(), "with".into()],
        output_description: "[开发] Sync test fixtures with source 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── format-code
pub fn format_code_softill() -> Softill {
    Softill {
        id: "format-code".into(),
        name: "format-code".into(),
        description: "[开发] Format source code with language-specific tools".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/format-code/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["code".into(), "format".into(), "language-specific".into(), "source".into(), "tools".into(), "with".into()],
        output_description: "[开发] Format source code with language-specific tools 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── formula-engine
pub fn formula_engine_softill() -> Softill {
    Softill {
        id: "formula-engine".into(),
        name: "formula-engine".into(),
        description: "[开发] Evaluate mathematical formulas and expressions".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/formula-engine/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "engine".into(), "evaluate".into(), "expressions".into(), "formula".into(), "formulas".into(), "mathematical".into()],
        output_description: "[开发] Evaluate mathematical formulas and expressions 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── frontend-api-usage-scanner
pub fn frontend_api_usage_scanner_softill() -> Softill {
    Softill {
        id: "frontend-api-usage-scanner".into(),
        name: "frontend-api-usage-scanner".into(),
        description: "[开发] Scan frontend code for API usage patterns".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/frontend-api-usage-scanner/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["api".into(), "code".into(), "for".into(), "frontend".into(), "patterns".into(), "scan".into(), "scanner".into(), "usage".into()],
        output_description: "[开发] Scan frontend code for API usage patterns 的执行结果。".into(),
        effect: "network-read-only".into(),
    }
}

// ── frontend-route-map
pub fn frontend_route_map_softill() -> Softill {
    Softill {
        id: "frontend-route-map".into(),
        name: "frontend-route-map".into(),
        description: "[开发] Map frontend routes and navigation".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/frontend-route-map/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "frontend".into(), "map".into(), "navigation".into(), "route".into(), "routes".into()],
        output_description: "[开发] Map frontend routes and navigation 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── fullstack-map
pub fn fullstack_map_softill() -> Softill {
    Softill {
        id: "fullstack-map".into(),
        name: "fullstack-map".into(),
        description: "[开发] Generate fullstack architecture map".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/fullstack-map/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["architecture".into(), "fullstack".into(), "generate".into(), "map".into()],
        output_description: "[开发] Generate fullstack architecture map 的执行结果。handler 包含输入/输出说明。".into(),
        effect: "read-only".into(),
    }
}

// ── html-parse
pub fn html_parse_softill() -> Softill {
    Softill {
        id: "html-parse".into(),
        name: "html-parse".into(),
        description: "[开发] Parse and extract structured data from HTML".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/html-parse/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "data".into(), "extract".into(), "from".into(), "html".into(), "parse".into(), "structured".into()],
        output_description: "[开发] Parse and extract structured data from HTML 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── integration-check
pub fn integration_check_softill() -> Softill {
    Softill {
        id: "integration-check".into(),
        name: "integration-check".into(),
        description: "[开发] Check component integration readiness".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/integration-check/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["check".into(), "component".into(), "integration".into(), "readiness".into()],
        output_description: "[开发] Check component integration readiness 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── json-query
pub fn json_query_softill() -> Softill {
    Softill {
        id: "json-query".into(),
        name: "json-query".into(),
        description: "[开发] Query and transform JSON data".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/json-query/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "data".into(), "json".into(), "query".into(), "transform".into()],
        output_description: "[开发] Query and transform JSON data 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── keymouse-adapter
pub fn keymouse_adapter_softill() -> Softill {
    Softill {
        id: "keymouse-adapter".into(),
        name: "keymouse-adapter".into(),
        description: "[开发] Adapter for keyboard/mouse input simulation".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/keymouse-adapter/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["adapter".into(), "for".into(), "input".into(), "keyboard/mouse".into(), "keymouse".into(), "simulation".into()],
        output_description: "[开发] Adapter for keyboard/mouse input simulation 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── migration-safety-checker
pub fn migration_safety_checker_softill() -> Softill {
    Softill {
        id: "migration-safety-checker".into(),
        name: "migration-safety-checker".into(),
        description: "[开发] Check migration safety and impact".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/migration-safety-checker/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "check".into(), "checker".into(), "impact".into(), "migration".into(), "safety".into()],
        output_description: "[开发] Check migration safety and impact 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── mock-data-generator
pub fn mock_data_generator_softill() -> Softill {
    Softill {
        id: "mock-data-generator".into(),
        name: "mock-data-generator".into(),
        description: "[开发] Generate mock data from schema".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/mock-data-generator/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["data".into(), "from".into(), "generate".into(), "generator".into(), "mock".into(), "schema".into()],
        output_description: "[开发] Generate mock data from schema 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── pipe-runner
pub fn pipe_runner_softill() -> Softill {
    Softill {
        id: "pipe-runner".into(),
        name: "pipe-runner".into(),
        description: "[开发] Execute DAG-based pipeline of softills".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/pipe-runner/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["dag-based".into(), "execute".into(), "pipe".into(), "pipeline".into(), "runner".into(), "softills".into()],
        output_description: "[开发] Execute DAG-based pipeline of softills 的执行结果。handler 包含输入/输出说明。".into(),
        effect: "read-only".into(),
    }
}

// ── props-contract-extractor
pub fn props_contract_extractor_softill() -> Softill {
    Softill {
        id: "props-contract-extractor".into(),
        name: "props-contract-extractor".into(),
        description: "[开发] Extract component props contracts".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/props-contract-extractor/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["component".into(), "contract".into(), "contracts".into(), "extract".into(), "extractor".into(), "props".into()],
        output_description: "[开发] Extract component props contracts 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── safe-rename
pub fn safe_rename_softill() -> Softill {
    Softill {
        id: "safe-rename".into(),
        name: "safe-rename".into(),
        description: "[开发] Safely rename symbols across codebase".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/safe-rename/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["across".into(), "codebase".into(), "rename".into(), "safe".into(), "safely".into(), "symbols".into()],
        output_description: "[开发] Safely rename symbols across codebase 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── schema-validator
pub fn schema_validator_softill() -> Softill {
    Softill {
        id: "schema-validator".into(),
        name: "schema-validator".into(),
        description: "[开发] Validate JSON data against structural schema".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/schema-validator/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["against".into(), "data".into(), "json".into(), "schema".into(), "structural".into(), "validate".into(), "validator".into()],
        output_description: "[开发] Validate JSON data against structural schema 的执行结果。handler 包含输入/输出说明。".into(),
        effect: "read-only".into(),
    }
}

// ── scoring-engine
pub fn scoring_engine_softill() -> Softill {
    Softill {
        id: "scoring-engine".into(),
        name: "scoring-engine".into(),
        description: "[开发] Score and rank items by criteria".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/scoring-engine/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "criteria".into(), "engine".into(), "items".into(), "rank".into(), "score".into(), "scoring".into()],
        output_description: "[开发] Score and rank items by criteria 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── service-dependency-map
pub fn service_dependency_map_softill() -> Softill {
    Softill {
        id: "service-dependency-map".into(),
        name: "service-dependency-map".into(),
        description: "[开发] Map service dependencies".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/service-dependency-map/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["dependencies".into(), "dependency".into(), "map".into(), "service".into()],
        output_description: "[开发] Map service dependencies 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── shell-hand
pub fn shell_hand_softill() -> Softill {
    Softill {
        id: "shell-hand".into(),
        name: "shell-hand".into(),
        description: "[开发] Execute shell commands safely".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/shell-hand/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["commands".into(), "execute".into(), "hand".into(), "safely".into(), "shell".into()],
        output_description: "[开发] Execute shell commands safely 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── stale-context-detector
pub fn stale_context_detector_softill() -> Softill {
    Softill {
        id: "stale-context-detector".into(),
        name: "stale-context-detector".into(),
        description: "[开发] Detect stale or outdated context".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/stale-context-detector/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["context".into(), "detect".into(), "detector".into(), "outdated".into(), "stale".into()],
        output_description: "[开发] Detect stale or outdated context 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── state-flow-scanner
pub fn state_flow_scanner_softill() -> Softill {
    Softill {
        id: "state-flow-scanner".into(),
        name: "state-flow-scanner".into(),
        description: "[开发] Scan and analyze state flow".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/state-flow-scanner/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["analyze".into(), "and".into(), "flow".into(), "scan".into(), "scanner".into(), "state".into()],
        output_description: "[开发] Scan and analyze state flow 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── task-ledger
pub fn task_ledger_softill() -> Softill {
    Softill {
        id: "task-ledger".into(),
        name: "task-ledger".into(),
        description: "[开发] Track task state with 11 CRUD operations".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/task-ledger/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["crud".into(), "ledger".into(), "operations".into(), "state".into(), "task".into(), "track".into(), "with".into()],
        output_description: "[开发] Track task state with 11 CRUD operations 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── test-selector
pub fn test_selector_softill() -> Softill {
    Softill {
        id: "test-selector".into(),
        name: "test-selector".into(),
        description: "[开发] Select and prioritize relevant tests".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/test-selector/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "prioritize".into(), "relevant".into(), "select".into(), "selector".into(), "test".into(), "tests".into()],
        output_description: "[开发] Select and prioritize relevant tests 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── token-counter
pub fn token_counter_softill() -> Softill {
    Softill {
        id: "token-counter".into(),
        name: "token-counter".into(),
        description: "[开发] Count tokens in text or files".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/token-counter/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["count".into(), "counter".into(), "files".into(), "text".into(), "token".into(), "tokens".into()],
        output_description: "[开发] Count tokens in text or files 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── visual-pipeline
pub fn visual_pipeline_softill() -> Softill {
    Softill {
        id: "visual-pipeline".into(),
        name: "visual-pipeline".into(),
        description: "[开发] Visual automation pipeline with branching".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/visual-pipeline/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["automation".into(), "branching".into(), "pipeline".into(), "visual".into(), "with".into()],
        output_description: "[开发] Visual automation pipeline with branching 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ═══════════════════════════════════════════════
// 产品能力
// ═══════════════════════════════════════════════

// ── collect-context
pub fn collect_context_softill() -> Softill {
    Softill {
        id: "collect-context".into(),
        name: "collect-context".into(),
        description: "[产品] Collect project context for handoff".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/collect-context/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["collect".into(), "context".into(), "for".into(), "handoff".into(), "project".into()],
        output_description: "[产品] Collect project context for handoff 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── combo-init
pub fn combo_init_softill() -> Softill {
    Softill {
        id: "combo-init".into(),
        name: "combo-init".into(),
        description: "[产品] Initialize combo orchestration plans".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/combo-init/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["combo".into(), "init".into(), "initialize".into(), "orchestration".into(), "plans".into()],
        output_description: "[产品] Initialize combo orchestration plans 的执行结果。handler 包含输入/输出说明。".into(),
        effect: "read-only".into(),
    }
}

// ── e2e-summary
pub fn e2e_summary_softill() -> Softill {
    Softill {
        id: "e2e-summary".into(),
        name: "e2e-summary".into(),
        description: "[产品] Summarize E2E test results".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/e2e-summary/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["e2e".into(), "results".into(), "summarize".into(), "summary".into(), "test".into()],
        output_description: "[产品] Summarize E2E test results 的执行结果。handler 包含输入/输出说明。".into(),
        effect: "read-only".into(),
    }
}

// ── handoff-writer
pub fn handoff_writer_softill() -> Softill {
    Softill {
        id: "handoff-writer".into(),
        name: "handoff-writer".into(),
        description: "[产品] Write structured handoff documents".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/handoff-writer/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["documents".into(), "handoff".into(), "structured".into(), "write".into(), "writer".into()],
        output_description: "[产品] Write structured handoff documents 的执行结果。".into(),
        effect: "write-local".into(),
    }
}

// ── prd-slicer
pub fn prd_slicer_softill() -> Softill {
    Softill {
        id: "prd-slicer".into(),
        name: "prd-slicer".into(),
        description: "[产品] Slice PRD into version-scoped chunks".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/prd-slicer/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["chunks".into(), "into".into(), "prd".into(), "slice".into(), "slicer".into(), "version-scoped".into()],
        output_description: "[产品] Slice PRD into version-scoped chunks 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── project-baseline
pub fn project_baseline_softill() -> Softill {
    Softill {
        id: "project-baseline".into(),
        name: "project-baseline".into(),
        description: "[产品] Establish and compare project baselines".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/project-baseline/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "baseline".into(), "baselines".into(), "compare".into(), "establish".into(), "project".into()],
        output_description: "[产品] Establish and compare project baselines 的执行结果。handler 包含输入/输出说明。".into(),
        effect: "read-only".into(),
    }
}

// ── project-state-manager
pub fn project_state_manager_softill() -> Softill {
    Softill {
        id: "project-state-manager".into(),
        name: "project-state-manager".into(),
        description: "[产品] Track and manage project state".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/project-state-manager/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "manage".into(), "manager".into(), "project".into(), "state".into(), "track".into()],
        output_description: "[产品] Track and manage project state 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── receipt-collect
pub fn receipt_collect_softill() -> Softill {
    Softill {
        id: "receipt-collect".into(),
        name: "receipt-collect".into(),
        description: "[产品] Collect execution receipt and evidence after task completion".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/receipt-collect/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["after".into(), "and".into(), "collect".into(), "completion".into(), "evidence".into(), "execution".into(), "receipt".into(), "task".into()],
        output_description: "[产品] Collect execution receipt and evidence after task completion 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── register
pub fn register_softill() -> Softill {
    Softill {
        id: "register".into(),
        name: "register".into(),
        description: "[产品] Register softill or asset to registry".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/register/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["asset".into(), "register".into(), "registry".into(), "softill".into()],
        output_description: "[产品] Register softill or asset to registry 的执行结果。handler 包含输入/输出说明。".into(),
        effect: "read-only".into(),
    }
}

// ── report-stitch
pub fn report_stitch_softill() -> Softill {
    Softill {
        id: "report-stitch".into(),
        name: "report-stitch".into(),
        description: "[产品] Stitch multiple reports into summary".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/report-stitch/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["into".into(), "multiple".into(), "report".into(), "reports".into(), "stitch".into(), "summary".into()],
        output_description: "[产品] Stitch multiple reports into summary 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── research-manager
pub fn research_manager_softill() -> Softill {
    Softill {
        id: "research-manager".into(),
        name: "research-manager".into(),
        description: "[产品] Manage research traces and findings".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/research-manager/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "findings".into(), "manage".into(), "manager".into(), "research".into(), "traces".into()],
        output_description: "[产品] Manage research traces and findings 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── runtime-report-writer
pub fn runtime_report_writer_softill() -> Softill {
    Softill {
        id: "runtime-report-writer".into(),
        name: "runtime-report-writer".into(),
        description: "[产品] Generate runtime execution reports".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/runtime-report-writer/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["execution".into(), "generate".into(), "report".into(), "reports".into(), "runtime".into(), "writer".into()],
        output_description: "[产品] Generate runtime execution reports 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── scaffold
pub fn scaffold_softill() -> Softill {
    Softill {
        id: "scaffold".into(),
        name: "scaffold".into(),
        description: "[产品] Generate scaffold/skeleton for new assets".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/scaffold/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["assets".into(), "for".into(), "generate".into(), "new".into(), "scaffold".into(), "scaffold/skeleton".into()],
        output_description: "[产品] Generate scaffold/skeleton for new assets 的执行结果。handler 包含输入/输出说明。".into(),
        effect: "read-only".into(),
    }
}

// ── softill-doctor
pub fn softill_doctor_softill() -> Softill {
    Softill {
        id: "softill-doctor".into(),
        name: "softill-doctor".into(),
        description: "[产品] Diagnose and fix softill issues".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/softill-doctor/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "diagnose".into(), "doctor".into(), "fix".into(), "issues".into(), "softill".into()],
        output_description: "[产品] Diagnose and fix softill issues 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── softill-init
pub fn softill_init_softill() -> Softill {
    Softill {
        id: "softill-init".into(),
        name: "softill-init".into(),
        description: "[产品] Initialize new softill scaffold".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/softill-init/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["init".into(), "initialize".into(), "new".into(), "scaffold".into(), "softill".into()],
        output_description: "[产品] Initialize new softill scaffold 的执行结果。handler 包含输入/输出说明。".into(),
        effect: "read-only".into(),
    }
}

// ── task-card-issue
pub fn task_card_issue_softill() -> Softill {
    Softill {
        id: "task-card-issue".into(),
        name: "task-card-issue".into(),
        description: "[产品] Create and issue a task card with lifecycle management".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/task-card-issue/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "card".into(), "create".into(), "issue".into(), "lifecycle".into(), "management".into(), "task".into(), "with".into()],
        output_description: "[产品] Create and issue a task card with lifecycle management 的执行结果。".into(),
        effect: "write-local".into(),
    }
}

// ── template-fill
pub fn template_fill_softill() -> Softill {
    Softill {
        id: "template-fill".into(),
        name: "template-fill".into(),
        description: "[产品] Fill templates with variable data".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/template-fill/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["data".into(), "fill".into(), "template".into(), "templates".into(), "variable".into(), "with".into()],
        output_description: "[产品] Fill templates with variable data 的执行结果。handler 包含输入/输出说明。".into(),
        effect: "read-only".into(),
    }
}

// ── worker-spawn
pub fn worker_spawn_softill() -> Softill {
    Softill {
        id: "worker-spawn".into(),
        name: "worker-spawn".into(),
        description: "[产品] Spawn an external worker Claude Code session (no worktree, no inline agent)".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/worker-spawn/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["agent".into(), "claude".into(), "code".into(), "external".into(), "inline".into(), "session".into(), "spawn".into(), "worker".into()],
        output_description: "[产品] Spawn an external worker Claude Code session (no worktree, no inline agent) 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── worktree-create
pub fn worktree_create_softill() -> Softill {
    Softill {
        id: "worktree-create".into(),
        name: "worktree-create".into(),
        description: "[产品] Create git worktree for task isolation".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/worktree-create/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["create".into(), "for".into(), "git".into(), "isolation".into(), "task".into(), "worktree".into()],
        output_description: "[产品] Create git worktree for task isolation 的执行结果。".into(),
        effect: "write-local".into(),
    }
}

// ═══════════════════════════════════════════════
// 设计能力
// ═══════════════════════════════════════════════

// ── balance-eye
pub fn balance_eye_softill() -> Softill {
    Softill {
        id: "balance-eye".into(),
        name: "balance-eye".into(),
        description: "[设计] Analyze visual balance and composition".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/balance-eye/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["analyze".into(), "and".into(), "balance".into(), "composition".into(), "eye".into(), "visual".into()],
        output_description: "[设计] Analyze visual balance and composition 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── design-eye
pub fn design_eye_softill() -> Softill {
    Softill {
        id: "design-eye".into(),
        name: "design-eye".into(),
        description: "[设计] Analyze design references and extract visual tokens".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/design-eye/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["analyze".into(), "and".into(), "design".into(), "extract".into(), "eye".into(), "references".into(), "tokens".into(), "visual".into()],
        output_description: "[设计] Analyze design references and extract visual tokens 的执行结果。handler 包含输入/输出说明。".into(),
        effect: "read-only".into(),
    }
}

// ── design-thief
pub fn design_thief_softill() -> Softill {
    Softill {
        id: "design-thief".into(),
        name: "design-thief".into(),
        description: "[设计] Extract design tokens from visuals and screenshots".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/design-thief/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "design".into(), "extract".into(), "from".into(), "screenshots".into(), "thief".into(), "tokens".into(), "visuals".into()],
        output_description: "[设计] Extract design tokens from visuals and screenshots 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── design-token-auditor
pub fn design_token_auditor_softill() -> Softill {
    Softill {
        id: "design-token-auditor".into(),
        name: "design-token-auditor".into(),
        description: "[设计] Audit design token usage and consistency".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/design-token-auditor/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "audit".into(), "auditor".into(), "consistency".into(), "design".into(), "token".into(), "usage".into()],
        output_description: "[设计] Audit design token usage and consistency 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── image-eye
pub fn image_eye_softill() -> Softill {
    Softill {
        id: "image-eye".into(),
        name: "image-eye".into(),
        description: "[设计] Analyze image content and metadata".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/image-eye/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["analyze".into(), "and".into(), "content".into(), "eye".into(), "image".into(), "metadata".into()],
        output_description: "[设计] Analyze image content and metadata 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── screen-eye
pub fn screen_eye_softill() -> Softill {
    Softill {
        id: "screen-eye".into(),
        name: "screen-eye".into(),
        description: "[设计] Capture and analyze screen content".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/screen-eye/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["analyze".into(), "and".into(), "capture".into(), "content".into(), "eye".into(), "screen".into()],
        output_description: "[设计] Capture and analyze screen content 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── shadcn-pattern
pub fn shadcn_pattern_softill() -> Softill {
    Softill {
        id: "shadcn-pattern".into(),
        name: "shadcn-pattern".into(),
        description: "[设计] Generate and apply shadcn UI component patterns".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/shadcn-pattern/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "apply".into(), "component".into(), "generate".into(), "pattern".into(), "patterns".into(), "shadcn".into()],
        output_description: "[设计] Generate and apply shadcn UI component patterns 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── ui-screenshot-runner
pub fn ui_screenshot_runner_softill() -> Softill {
    Softill {
        id: "ui-screenshot-runner".into(),
        name: "ui-screenshot-runner".into(),
        description: "[设计] Run automated UI screenshot tests".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/ui-screenshot-runner/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["automated".into(), "run".into(), "runner".into(), "screenshot".into(), "tests".into()],
        output_description: "[设计] Run automated UI screenshot tests 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── visual-diff-checker
pub fn visual_diff_checker_softill() -> Softill {
    Softill {
        id: "visual-diff-checker".into(),
        name: "visual-diff-checker".into(),
        description: "[设计] Compare screenshots and detect visual differences".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/visual-diff-checker/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "checker".into(), "compare".into(), "detect".into(), "diff".into(), "differences".into(), "screenshots".into(), "visual".into()],
        output_description: "[设计] Compare screenshots and detect visual differences 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ═══════════════════════════════════════════════
// 通用能力
// ═══════════════════════════════════════════════

// ── capcut-draft
pub fn capcut_draft_softill() -> Softill {
    Softill {
        id: "capcut-draft".into(),
        name: "capcut-draft".into(),
        description: "[通用] Generate CapCut video drafts".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/capcut-draft/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["capcut".into(), "draft".into(), "drafts".into(), "generate".into(), "video".into()],
        output_description: "[通用] Generate CapCut video drafts 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── combo-runner
pub fn combo_runner_softill() -> Softill {
    Softill {
        id: "combo-runner".into(),
        name: "combo-runner".into(),
        description: "combo-runner".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/combo-runner/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["combo".into(), "combo-runner".into(), "runner".into()],
        output_description: "combo-runner 的执行结果。handler 包含输入/输出说明。".into(),
        effect: "read-only".into(),
    }
}

// ── comfy-eye
pub fn comfy_eye_softill() -> Softill {
    Softill {
        id: "comfy-eye".into(),
        name: "comfy-eye".into(),
        description: "[通用] ComfyUI workflow integration".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/comfy-eye/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["comfy".into(), "comfyui".into(), "eye".into(), "integration".into(), "workflow".into()],
        output_description: "[通用] ComfyUI workflow integration 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── contract-compare
pub fn contract_compare_softill() -> Softill {
    Softill {
        id: "contract-compare".into(),
        name: "contract-compare".into(),
        description: "[通用] Compare two interface contracts for compatibility".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/contract-compare/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["compare".into(), "compatibility".into(), "contract".into(), "contracts".into(), "for".into(), "interface".into(), "two".into()],
        output_description: "[通用] Compare two interface contracts for compatibility 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── country-eye
pub fn country_eye_softill() -> Softill {
    Softill {
        id: "country-eye".into(),
        name: "country-eye".into(),
        description: "[通用] Look up country data and information".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/country-eye/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "country".into(), "data".into(), "eye".into(), "information".into(), "look".into()],
        output_description: "[通用] Look up country data and information 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── creative-writing-combo
pub fn creative_writing_combo_softill() -> Softill {
    Softill {
        id: "creative-writing-combo".into(),
        name: "creative-writing-combo".into(),
        description: "[通用] Creative writing generation".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/creative-writing-combo/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["combo".into(), "creative".into(), "generation".into(), "writing".into()],
        output_description: "[通用] Creative writing generation 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── crypto-eye
pub fn crypto_eye_softill() -> Softill {
    Softill {
        id: "crypto-eye".into(),
        name: "crypto-eye".into(),
        description: "[通用] Query cryptocurrency prices and data".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/crypto-eye/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "crypto".into(), "cryptocurrency".into(), "data".into(), "eye".into(), "prices".into(), "query".into()],
        output_description: "[通用] Query cryptocurrency prices and data 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── desktop-native
pub fn desktop_native_softill() -> Softill {
    Softill {
        id: "desktop-native".into(),
        name: "desktop-native".into(),
        description: "[通用] Desktop native OS operations".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/desktop-native/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["desktop".into(), "native".into(), "operations".into()],
        output_description: "[通用] Desktop native OS operations 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── dict-eye
pub fn dict_eye_softill() -> Softill {
    Softill {
        id: "dict-eye".into(),
        name: "dict-eye".into(),
        description: "[通用] Look up word definitions and translations".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/dict-eye/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "definitions".into(), "dict".into(), "eye".into(), "look".into(), "translations".into(), "word".into()],
        output_description: "[通用] Look up word definitions and translations 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── file-to-md
pub fn file_to_md_softill() -> Softill {
    Softill {
        id: "file-to-md".into(),
        name: "file-to-md".into(),
        description: "[通用] Convert files to markdown format".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/file-to-md/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["convert".into(), "file".into(), "files".into(), "format".into(), "markdown".into()],
        output_description: "[通用] Convert files to markdown format 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── fish-tts
pub fn fish_tts_softill() -> Softill {
    Softill {
        id: "fish-tts".into(),
        name: "fish-tts".into(),
        description: "[通用] Text-to-speech via Fish Audio".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/fish-tts/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["audio".into(), "fish".into(), "text-to-speech".into(), "tts".into(), "via".into()],
        output_description: "[通用] Text-to-speech via Fish Audio 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── flue-eye
pub fn flue_eye_softill() -> Softill {
    Softill {
        id: "flue-eye".into(),
        name: "flue-eye".into(),
        description: "[通用] 通过 Flue 桥接层操控桌面软件（Photoshop、Audition、Blender、Office 等）。支持 COM / AppleScript / CEP HTTP 三种桥接。".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/flue-eye/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["applescript".into(), "cep".into(), "com".into(), "eye".into(), "flue".into(), "http".into(), "三种桥接".into(), "桥接层操控桌面软件（photoshop、audition、blender、office".into()],
        output_description: "[通用] 通过 Flue 桥接层操控桌面软件（Photoshop、Audition、Blender、Office 等）。支持 COM / AppleScript / CEP HTTP 三种桥接。 的执行结果。".into(),
        effect: "network-read-only".into(),
    }
}

// ── forge
pub fn forge_softill() -> Softill {
    Softill {
        id: "forge".into(),
        name: "forge".into(),
        description: "[通用] Forge and craft new capabilities from traces".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/forge/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "capabilities".into(), "craft".into(), "forge".into(), "from".into(), "new".into(), "traces".into()],
        output_description: "[通用] Forge and craft new capabilities from traces 的执行结果。handler 包含输入/输出说明。".into(),
        effect: "read-only".into(),
    }
}

// ── gh-find
pub fn gh_find_softill() -> Softill {
    Softill {
        id: "gh-find".into(),
        name: "gh-find".into(),
        description: "[通用] Search GitHub repositories and code".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/gh-find/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "code".into(), "find".into(), "github".into(), "repositories".into(), "search".into()],
        output_description: "[通用] Search GitHub repositories and code 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── github-eye
pub fn github_eye_softill() -> Softill {
    Softill {
        id: "github-eye".into(),
        name: "github-eye".into(),
        description: "[通用] Inspect GitHub repository metadata".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/github-eye/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["eye".into(), "github".into(), "inspect".into(), "metadata".into(), "repository".into()],
        output_description: "[通用] Inspect GitHub repository metadata 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── hn-eye
pub fn hn_eye_softill() -> Softill {
    Softill {
        id: "hn-eye".into(),
        name: "hn-eye".into(),
        description: "[通用] Browse Hacker News stories and comments".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/hn-eye/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "browse".into(), "comments".into(), "eye".into(), "hacker".into(), "news".into(), "stories".into()],
        output_description: "[通用] Browse Hacker News stories and comments 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── hook-install
pub fn hook_install_softill() -> Softill {
    Softill {
        id: "hook-install".into(),
        name: "hook-install".into(),
        description: "[通用] Install Soma event hooks".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/hook-install/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["event".into(), "hook".into(), "hooks".into(), "install".into(), "soma".into()],
        output_description: "[通用] Install Soma event hooks 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── hook-replay
pub fn hook_replay_softill() -> Softill {
    Softill {
        id: "hook-replay".into(),
        name: "hook-replay".into(),
        description: "[通用] Replay recorded hook events".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/hook-replay/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["events".into(), "hook".into(), "recorded".into(), "replay".into()],
        output_description: "[通用] Replay recorded hook events 的执行结果。handler 包含输入/输出说明。".into(),
        effect: "read-only".into(),
    }
}

// ── hook-scaffold
pub fn hook_scaffold_softill() -> Softill {
    Softill {
        id: "hook-scaffold".into(),
        name: "hook-scaffold".into(),
        description: "[通用] Generate hook skeleton code".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/hook-scaffold/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["code".into(), "generate".into(), "hook".into(), "scaffold".into(), "skeleton".into()],
        output_description: "[通用] Generate hook skeleton code 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── hook-validate
pub fn hook_validate_softill() -> Softill {
    Softill {
        id: "hook-validate".into(),
        name: "hook-validate".into(),
        description: "[通用] Validate hook configuration".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/hook-validate/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["configuration".into(), "hook".into(), "validate".into()],
        output_description: "[通用] Validate hook configuration 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── host-config-patch
pub fn host_config_patch_softill() -> Softill {
    Softill {
        id: "host-config-patch".into(),
        name: "host-config-patch".into(),
        description: "[通用] Apply configuration patches to host environment".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/host-config-patch/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["apply".into(), "config".into(), "configuration".into(), "environment".into(), "host".into(), "patch".into(), "patches".into()],
        output_description: "[通用] Apply configuration patches to host environment 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── host-live-test
pub fn host_live_test_softill() -> Softill {
    Softill {
        id: "host-live-test".into(),
        name: "host-live-test".into(),
        description: "[通用] Run live tests on host environment".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/host-live-test/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["environment".into(), "host".into(), "live".into(), "run".into(), "test".into(), "tests".into()],
        output_description: "[通用] Run live tests on host environment 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── host-probe
pub fn host_probe_softill() -> Softill {
    Softill {
        id: "host-probe".into(),
        name: "host-probe".into(),
        description: "[通用] Probe and inspect host environment".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/host-probe/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "environment".into(), "host".into(), "inspect".into(), "probe".into()],
        output_description: "[通用] Probe and inspect host environment 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── llm-call
pub fn llm_call_softill() -> Softill {
    Softill {
        id: "llm-call".into(),
        name: "llm-call".into(),
        description: "[通用] Call LLM with structured prompts".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/llm-call/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["call".into(), "llm".into(), "prompts".into(), "structured".into(), "with".into()],
        output_description: "[通用] Call LLM with structured prompts 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── load-prompt
pub fn load_prompt_softill() -> Softill {
    Softill {
        id: "load-prompt".into(),
        name: "load-prompt".into(),
        description: "[通用] Load and manage prompt templates".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/load-prompt/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "load".into(), "manage".into(), "prompt".into(), "templates".into()],
        output_description: "[通用] Load and manage prompt templates 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── maker-scoring
pub fn maker_scoring_softill() -> Softill {
    Softill {
        id: "maker-scoring".into(),
        name: "maker-scoring".into(),
        description: "[通用] 造物公式评分引擎 — 接收 8 变量返回 W 得分及杠杆分析".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/maker-scoring/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["maker".into(), "scoring".into(), "变量返回".into(), "得分及杠杆分析".into(), "造物公式评分引擎".into()],
        output_description: "[通用] 造物公式评分引擎 — 接收 8 变量返回 W 得分及杠杆分析 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── md-process
pub fn md_process_softill() -> Softill {
    Softill {
        id: "md-process".into(),
        name: "md-process".into(),
        description: "[通用] Process and transform markdown content".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/md-process/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "content".into(), "markdown".into(), "process".into(), "transform".into()],
        output_description: "[通用] Process and transform markdown content 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── memory-eye
pub fn memory_eye_softill() -> Softill {
    Softill {
        id: "memory-eye".into(),
        name: "memory-eye".into(),
        description: "[通用] Inspect and manage AI memory state".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/memory-eye/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "eye".into(), "inspect".into(), "manage".into(), "memory".into(), "state".into()],
        output_description: "[通用] Inspect and manage AI memory state 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── meta-softill
pub fn meta_softill_softill() -> Softill {
    Softill {
        id: "meta-softill".into(),
        name: "meta-softill".into(),
        description: "[通用] 元 softill：管理其他 softill 和 combo 的工具。blueprint 模式生成新 softill 骨架（含 handler + 输入验证 + try/catch + evidence），combo-scaffold 模式生成新 combo 定义（combo.yaml + SKILL.md），combo-list 列出所有 combo。audit 审查 softill 健康，discover 扫描发现，register 注册。需要创建/修改 softill 或 combo 时用这个工具。".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/meta-softill/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["combo".into(), "combo。audit".into(), "evidence），combo-scaffold".into(), "handler".into(), "meta".into(), "skill.md），combo-list".into(), "softill".into(), "softill：管理其他".into()],
        output_description: "[通用] 元 softill：管理其他 softill 和 combo 的工具。blueprint 模式生成新 softill 骨架（含 handler + 输入验证 + try/catch + evidence），combo-scaffold 模式生成新 combo 定义（combo.yaml + SKILL.md），combo-list 列出所有 combo。audit 审查 softill 健康，discover 扫描发现，register 注册。需要创建/修改 softill 或 combo 时用这个工具。 的执行结果。".into(),
        effect: "write-local".into(),
    }
}

// ── mingli-bazi
pub fn mingli_bazi_softill() -> Softill {
    Softill {
        id: "mingli-bazi".into(),
        name: "mingli-bazi".into(),
        description: "[通用] Chinese BaZi fortune analysis".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/mingli-bazi/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["analysis".into(), "bazi".into(), "chinese".into(), "fortune".into(), "mingli".into()],
        output_description: "[通用] Chinese BaZi fortune analysis 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── mingli-ziwei
pub fn mingli_ziwei_softill() -> Softill {
    Softill {
        id: "mingli-ziwei".into(),
        name: "mingli-ziwei".into(),
        description: "[通用] Chinese ZiWei fortune analysis".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/mingli-ziwei/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["analysis".into(), "chinese".into(), "fortune".into(), "mingli".into(), "ziwei".into()],
        output_description: "[通用] Chinese ZiWei fortune analysis 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── ocr-adapter
pub fn ocr_adapter_softill() -> Softill {
    Softill {
        id: "ocr-adapter".into(),
        name: "ocr-adapter".into(),
        description: "[通用] OCR text extraction from images".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/ocr-adapter/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["adapter".into(), "extraction".into(), "from".into(), "images".into(), "ocr".into(), "text".into()],
        output_description: "[通用] OCR text extraction from images 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── parse-output
pub fn parse_output_softill() -> Softill {
    Softill {
        id: "parse-output".into(),
        name: "parse-output".into(),
        description: "[通用] Parse structured output from text".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/parse-output/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["from".into(), "output".into(), "parse".into(), "structured".into(), "text".into()],
        output_description: "[通用] Parse structured output from text 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── pattern-research
pub fn pattern_research_softill() -> Softill {
    Softill {
        id: "pattern-research".into(),
        name: "pattern-research".into(),
        description: "[通用] Research and document patterns".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/pattern-research/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "document".into(), "pattern".into(), "patterns".into(), "research".into()],
        output_description: "[通用] Research and document patterns 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── permission-compile
pub fn permission_compile_softill() -> Softill {
    Softill {
        id: "permission-compile".into(),
        name: "permission-compile".into(),
        description: "[通用] Compile and validate permission configurations".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/permission-compile/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "compile".into(), "configurations".into(), "permission".into(), "validate".into()],
        output_description: "[通用] Compile and validate permission configurations 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── poetry-eye
pub fn poetry_eye_softill() -> Softill {
    Softill {
        id: "poetry-eye".into(),
        name: "poetry-eye".into(),
        description: "[通用] Browse and retrieve poetry".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/poetry-eye/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "browse".into(), "eye".into(), "poetry".into(), "retrieve".into()],
        output_description: "[通用] Browse and retrieve poetry 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── quote-eye
pub fn quote_eye_softill() -> Softill {
    Softill {
        id: "quote-eye".into(),
        name: "quote-eye".into(),
        description: "[通用] Retrieve quotes and sayings".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/quote-eye/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "eye".into(), "quote".into(), "quotes".into(), "retrieve".into(), "sayings".into()],
        output_description: "[通用] Retrieve quotes and sayings 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── skylos-adapter
pub fn skylos_adapter_softill() -> Softill {
    Softill {
        id: "skylos-adapter".into(),
        name: "skylos-adapter".into(),
        description: "[通用] Skylos platform adapter".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/skylos-adapter/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["adapter".into(), "platform".into(), "skylos".into()],
        output_description: "[通用] Skylos platform adapter 的执行结果。handler 包含输入/输出说明。".into(),
        effect: "read-only".into(),
    }
}

// ── social-content-converter
pub fn social_content_converter_softill() -> Softill {
    Softill {
        id: "social-content-converter".into(),
        name: "social-content-converter".into(),
        description: "[通用] Convert content between social platforms".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/social-content-converter/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["between".into(), "content".into(), "convert".into(), "converter".into(), "platforms".into(), "social".into()],
        output_description: "[通用] Convert content between social platforms 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── state-normalizer
pub fn state_normalizer_softill() -> Softill {
    Softill {
        id: "state-normalizer".into(),
        name: "state-normalizer".into(),
        description: "[通用] Normalize state values to [0,1] range".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/state-normalizer/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["0,1".into(), "normalize".into(), "normalizer".into(), "range".into(), "state".into(), "values".into()],
        output_description: "[通用] Normalize state values to [0,1] range 的执行结果。handler 包含输入/输出说明。".into(),
        effect: "read-only".into(),
    }
}

// ── threshold-registry
pub fn threshold_registry_softill() -> Softill {
    Softill {
        id: "threshold-registry".into(),
        name: "threshold-registry".into(),
        description: "[通用] Manage threshold configurations".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/threshold-registry/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["configurations".into(), "manage".into(), "registry".into(), "threshold".into()],
        output_description: "[通用] Manage threshold configurations 的执行结果。handler 包含输入/输出说明。".into(),
        effect: "read-only".into(),
    }
}

// ── video-script-writer
pub fn video_script_writer_softill() -> Softill {
    Softill {
        id: "video-script-writer".into(),
        name: "video-script-writer".into(),
        description: "[通用] Write structured video scripts".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/video-script-writer/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["script".into(), "scripts".into(), "structured".into(), "video".into(), "write".into(), "writer".into()],
        output_description: "[通用] Write structured video scripts 的执行结果。".into(),
        effect: "write-local".into(),
    }
}

// ── weather-eye
pub fn weather_eye_softill() -> Softill {
    Softill {
        id: "weather-eye".into(),
        name: "weather-eye".into(),
        description: "[通用] Get weather information by location".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/weather-eye/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["eye".into(), "get".into(), "information".into(), "location".into(), "weather".into()],
        output_description: "[通用] Get weather information by location 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── web-fetcher
pub fn web_fetcher_softill() -> Softill {
    Softill {
        id: "web-fetcher".into(),
        name: "web-fetcher".into(),
        description: "[通用] Fetch and extract content from web pages".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/web-fetcher/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "content".into(), "extract".into(), "fetch".into(), "fetcher".into(), "from".into(), "pages".into(), "web".into()],
        output_description: "[通用] Fetch and extract content from web pages 的执行结果。".into(),
        effect: "network-read-only".into(),
    }
}

// ── wechat-eye
pub fn wechat_eye_softill() -> Softill {
    Softill {
        id: "wechat-eye".into(),
        name: "wechat-eye".into(),
        description: "[通用] WeChat integration and data access".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/wechat-eye/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["access".into(), "and".into(), "data".into(), "eye".into(), "integration".into(), "wechat".into()],
        output_description: "[通用] WeChat integration and data access 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── writing-combo
pub fn writing_combo_softill() -> Softill {
    Softill {
        id: "writing-combo".into(),
        name: "writing-combo".into(),
        description: "[通用] Multi-step writing workflow".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/writing-combo/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["combo".into(), "multi-step".into(), "workflow".into(), "writing".into()],
        output_description: "[通用] Multi-step writing workflow 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── xberg-adapter
pub fn xberg_adapter_softill() -> Softill {
    Softill {
        id: "xberg-adapter".into(),
        name: "xberg-adapter".into(),
        description: "[通用] Platform integration adapter".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/xberg-adapter/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["adapter".into(), "integration".into(), "platform".into(), "xberg".into()],
        output_description: "[通用] Platform integration adapter 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── zlib-eye
pub fn zlib_eye_softill() -> Softill {
    Softill {
        id: "zlib-eye".into(),
        name: "zlib-eye".into(),
        description: "[通用] 搜索、定位和下载 Z-Library 离线种子档案中的书籍。支持 search / locate / download / download_http 四种模式。".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/zlib-eye/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["download".into(), "download_http".into(), "eye".into(), "locate".into(), "search".into(), "z-library".into(), "zlib".into(), "四种模式".into()],
        output_description: "[通用] 搜索、定位和下载 Z-Library 离线种子档案中的书籍。支持 search / locate / download / download_http 四种模式。 的执行结果。".into(),
        effect: "network-read-only".into(),
    }
}

// ═══════════════════════════════════════════════
// 已弃用
// ═══════════════════════════════════════════════

// ── file-eye
pub fn file_eye_softill() -> Softill {
    Softill {
        id: "file-eye".into(),
        name: "file-eye".into(),
        description: "[DEPRECATED] 请使用 soma_file_search MCP 工具代替。原功能：Fast file system search and inspection".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/file-eye/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["and".into(), "deprecated".into(), "eye".into(), "file".into(), "inspection".into(), "mcp".into(), "search".into(), "soma_file_search".into()],
        output_description: "[DEPRECATED] 请使用 soma_file_search MCP 工具代替。原功能：Fast file system search and inspection 的执行结果。".into(),
        effect: "read-only".into(),
    }
}

// ── git-tools
pub fn git_tools_softill() -> Softill {
    Softill {
        id: "git-tools".into(),
        name: "git-tools".into(),
        description: "[DEPRECATED] 请使用 repo transport 中的 soma_repo_status/log/diff/branch MCP 工具代替。原功能：Git status/diff/log/branch with structured JSON output".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/git-tools/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({}),
        tags: vec!["deprecated".into(), "git".into(), "json".into(), "mcp".into(), "output".into(), "repo".into(), "soma_repo_status/log/diff/branch".into(), "status/diff/log/branch".into()],
        output_description: "[DEPRECATED] 请使用 repo transport 中的 soma_repo_status/log/diff/branch MCP 工具代替。原功能：Git status/diff/log/branch with structured JSON output 的执行结果。handler 包含输入/输出说明。".into(),
        effect: "read-only".into(),
    }
}



/// Return all Softill instances from this library
pub fn all_softills() -> Vec<Softill> {
    build_all_softills()
}

fn build_all_softills() -> Vec<Softill> {
    vec![
        api_client_generator_softill(),
        api_contract_extractor_softill(),
        auth_policy_map_softill(),
        backend_route_map_softill(),
        build_eye_softill(),
        cache_manager_softill(),
        code_review_diff_reader_softill(),
        code_review_evidence_collector_softill(),
        code_review_pattern_matcher_softill(),
        code_review_report_generator_softill(),
        code_search_softill(),
        codebase_search_softill(),
        component_inventory_softill(),
        computer_hand_softill(),
        contract_diff_softill(),
        db_crud_softill(),
        db_schema_map_softill(),
        diff_review_softill(),
        endpoint_smoke_tester_softill(),
        env_requirements_checker_softill(),
        error_contract_extractor_softill(),
        file_patch_softill(),
        fixture_sync_softill(),
        format_code_softill(),
        formula_engine_softill(),
        frontend_api_usage_scanner_softill(),
        frontend_route_map_softill(),
        fullstack_map_softill(),
        html_parse_softill(),
        integration_check_softill(),
        json_query_softill(),
        keymouse_adapter_softill(),
        migration_safety_checker_softill(),
        mock_data_generator_softill(),
        pipe_runner_softill(),
        props_contract_extractor_softill(),
        safe_rename_softill(),
        schema_validator_softill(),
        scoring_engine_softill(),
        service_dependency_map_softill(),
        shell_hand_softill(),
        stale_context_detector_softill(),
        state_flow_scanner_softill(),
        task_ledger_softill(),
        test_selector_softill(),
        token_counter_softill(),
        visual_pipeline_softill(),
        collect_context_softill(),
        combo_init_softill(),
        e2e_summary_softill(),
        handoff_writer_softill(),
        prd_slicer_softill(),
        project_baseline_softill(),
        project_state_manager_softill(),
        receipt_collect_softill(),
        register_softill(),
        report_stitch_softill(),
        research_manager_softill(),
        runtime_report_writer_softill(),
        scaffold_softill(),
        softill_doctor_softill(),
        softill_init_softill(),
        task_card_issue_softill(),
        template_fill_softill(),
        worker_spawn_softill(),
        worktree_create_softill(),
        balance_eye_softill(),
        design_eye_softill(),
        design_thief_softill(),
        design_token_auditor_softill(),
        image_eye_softill(),
        screen_eye_softill(),
        shadcn_pattern_softill(),
        ui_screenshot_runner_softill(),
        visual_diff_checker_softill(),
        capcut_draft_softill(),
        combo_runner_softill(),
        comfy_eye_softill(),
        contract_compare_softill(),
        country_eye_softill(),
        creative_writing_combo_softill(),
        crypto_eye_softill(),
        desktop_native_softill(),
        dict_eye_softill(),
        file_to_md_softill(),
        fish_tts_softill(),
        flue_eye_softill(),
        forge_softill(),
        gh_find_softill(),
        github_eye_softill(),
        hn_eye_softill(),
        hook_install_softill(),
        hook_replay_softill(),
        hook_scaffold_softill(),
        hook_validate_softill(),
        host_config_patch_softill(),
        host_live_test_softill(),
        host_probe_softill(),
        llm_call_softill(),
        load_prompt_softill(),
        maker_scoring_softill(),
        md_process_softill(),
        memory_eye_softill(),
        meta_softill_softill(),
        mingli_bazi_softill(),
        mingli_ziwei_softill(),
        ocr_adapter_softill(),
        parse_output_softill(),
        pattern_research_softill(),
        permission_compile_softill(),
        poetry_eye_softill(),
        quote_eye_softill(),
        skylos_adapter_softill(),
        social_content_converter_softill(),
        state_normalizer_softill(),
        threshold_registry_softill(),
        video_script_writer_softill(),
        weather_eye_softill(),
        web_fetcher_softill(),
        wechat_eye_softill(),
        writing_combo_softill(),
        xberg_adapter_softill(),
        zlib_eye_softill(),
        file_eye_softill(),
        git_tools_softill(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_softill_count() {
        let softills = all_softills();
        assert_eq!(softills.len(), 125, "all softills count");
    }

    #[test]
    fn test_each_softill_has_required_fields() {
        for s in &all_softills() {
            assert!(!s.id.is_empty(), "id empty");
            assert!(!s.name.is_empty(), "name empty for {}", s.id);
            assert!(!s.description.is_empty(), "desc empty for {}", s.id);
            assert!(!s.effect.is_empty(), "effect empty for {}", s.id);
        }
    }
}
