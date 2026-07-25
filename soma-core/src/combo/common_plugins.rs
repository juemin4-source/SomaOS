/// 常用外部插件接入 — 开发者日常工具
///
/// 这些是行业通用的工具/服务，通过 Command 或 HttpApi 适配为 Softill。
/// 不需要安装额外的 agent 或 SDK——有 CLI 或 API 就能工作。

use super::softill::{Softill, SoftillInvocation};

// ── GitHub CLI 集成 ──
// 依赖: gh CLI (https://cli.github.com)

pub fn gh_pr_list_softill() -> Softill {
    Softill {
        id: "gh-pr-list".into(),
        name: "GitHub PR List".into(),
        description: "列出 GitHub 仓库的 Pull Request，支持按状态、标签、作者过滤。通过 gh CLI 获取结构化 PR 数据。".into(),
        invocation: SoftillInvocation::Command {
            command: "gh".into(),
            args_template: "pr list --json number,title,state,author,headRefName,createdAt,labels --limit {limit}".into(),
        },
        input_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "repo": {"type": "string", "description": "GitHub 仓库 (owner/repo)，默认当前目录关联的仓库"},
                "state": {"type": "string", "description": "PR 状态: open/closed/merged/all", "default": "open"},
                "limit": {"type": "number", "description": "最大返回数", "default": 10},
                "label": {"type": "string", "description": "按标签过滤"}
            }
        }),
        output_description: "PR 列表：每条包含 number, title, state, author, branch, createdAt, labels。JSON 数组格式。".into(),
        effect: "network-read-only".into(),
        tags: vec!["github".into(), "pr".into(), "pull-request".into(), "review".into(), "code-review".into()],
    }
}

pub fn gh_issue_create_softill() -> Softill {
    Softill {
        id: "gh-issue-create".into(),
        name: "GitHub Issue Create".into(),
        description: "在 GitHub 仓库中创建 Issue。支持标题、正文、标签、指派人。".into(),
        invocation: SoftillInvocation::Command {
            command: "gh".into(),
            args_template: "issue create --title \"{title}\" --body \"{body}\" --label \"{labels}\" --assignee \"{assignee}\"".into(),
        },
        input_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Issue 标题"},
                "body": {"type": "string", "description": "Issue 正文内容"},
                "labels": {"type": "string", "description": "逗号分隔的标签"},
                "assignee": {"type": "string", "description": "指派人 GitHub 用户名"}
            },
            "required": ["title"]
        }),
        output_description: "创建的 Issue URL。".into(),
        effect: "network-write".into(),
        tags: vec!["github".into(), "issue".into(), "create".into(), "tracking".into()],
    }
}

pub fn gh_release_create_softill() -> Softill {
    Softill {
        id: "gh-release-create".into(),
        name: "GitHub Release Create".into(),
        description: "创建 GitHub Release。支持版本号、标题、正文、附件。".into(),
        invocation: SoftillInvocation::Command {
            command: "gh".into(),
            args_template: "release create {tag} --title \"{title}\" --notes \"{notes}\" {files}".into(),
        },
        input_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "tag": {"type": "string", "description": "版本标签 (如 v1.0.0)"},
                "title": {"type": "string", "description": "Release 标题"},
                "notes": {"type": "string", "description": "Release 说明"},
                "files": {"type": "string", "description": "附件文件路径，空格分隔"}
            },
            "required": ["tag"]
        }),
        output_description: "Release URL。".into(),
        effect: "network-write".into(),
        tags: vec!["github".into(), "release".into(), "ship".into(), "version".into(), "publish".into()],
    }
}

// ── Docker 集成 ──
// 依赖: docker CLI

pub fn docker_ps_softill() -> Softill {
    Softill {
        id: "docker-ps".into(),
        name: "Docker PS".into(),
        description: "列出 Docker 容器，支持格式化和过滤。用于查看运行中或已停止的容器状态。".into(),
        invocation: SoftillInvocation::Command {
            command: "docker".into(),
            args_template: "ps --format \"{{.ID}}\\t{{.Image}}\\t{{.Status}}\\t{{.Names}}\" {extra}".into(),
        },
        input_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "all": {"type": "boolean", "description": "包括已停止的容器", "default": false},
                "filter": {"type": "string", "description": "过滤条件 (如 name=myapp)"}
            }
        }),
        output_description: "容器列表：ID, Image, Status, Names。制表符分隔。".into(),
        effect: "read-only".into(),
        tags: vec!["docker".into(), "container".into(), "ps".into(), "list".into(), "infra".into()],
    }
}

pub fn docker_build_softill() -> Softill {
    Softill {
        id: "docker-build".into(),
        name: "Docker Build".into(),
        description: "构建 Docker 镜像。支持 Dockerfile 路径、标签和构建参数。".into(),
        invocation: SoftillInvocation::Command {
            command: "docker".into(),
            args_template: "build -t {tag} -f {dockerfile} {context}".into(),
        },
        input_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "tag": {"type": "string", "description": "镜像标签 (如 myapp:latest)"},
                "dockerfile": {"type": "string", "description": "Dockerfile 路径", "default": "Dockerfile"},
                "context": {"type": "string", "description": "构建上下文目录", "default": "."}
            },
            "required": ["tag"]
        }),
        output_description: "构建日志。成功时输出镜像 ID。".into(),
        effect: "write-local".into(),
        tags: vec!["docker".into(), "build".into(), "image".into(), "container".into()],
    }
}

// ── Slack Webhook 通知 ──
// 依赖: 传入 Webhook URL（无需额外 CLI）

pub fn slack_notify_softill() -> Softill {
    Softill {
        id: "slack-notify".into(),
        name: "Slack Notify".into(),
        description: "通过 Webhook 发送 Slack 消息通知。用于构建完成、发布成功、错误告警等场景。".into(),
        invocation: SoftillInvocation::HttpApi {
            url_template: "{webhook_url}".into(),
            method: "POST".into(),
            headers: vec![("Content-Type".into(), "application/json".into())],
            body_template: Some(r#"{"text": "{message}", "username": "SomaOS", "icon_emoji": ":robot_face:"}"#.into()),
        },
        input_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "webhook_url": {"type": "string", "description": "Slack Incoming Webhook URL"},
                "message": {"type": "string", "description": "消息内容（支持 Slack 格式）"},
                "channel": {"type": "string", "description": "目标频道（可选，覆盖 webhook 默认频道）"}
            },
            "required": ["webhook_url", "message"]
        }),
        output_description: "HTTP 200 OK（成功）或错误信息。".into(),
        effect: "network-write".into(),
        tags: vec!["slack".into(), "notify".into(), "webhook".into(), "message".into(), "chat".into()],
    }
}

// ── 批量注册 ──

/// 返回所有常用插件 Softill
pub fn all_common_plugins() -> Vec<Softill> {
    vec![
        gh_pr_list_softill(),
        gh_issue_create_softill(),
        gh_release_create_softill(),
        docker_ps_softill(),
        docker_build_softill(),
        slack_notify_softill(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gh_pr_list_structure() {
        let s = gh_pr_list_softill();
        assert_eq!(s.id, "gh-pr-list");
        assert!(matches!(s.invocation, SoftillInvocation::Command { .. }));
        assert!(!s.tags.is_empty());
        assert!(s.tags.contains(&"github".to_string()));
    }

    #[test]
    fn test_gh_issue_create_has_required_schema() {
        let s = gh_issue_create_softill();
        assert!(s.input_schema["required"].as_array().unwrap().contains(&serde_json::json!("title")));
    }

    #[test]
    fn test_docker_ps_softill() {
        let s = docker_ps_softill();
        assert_eq!(s.id, "docker-ps");
        assert_eq!(s.effect, "read-only");
    }

    #[test]
    fn test_slack_notify_is_http_api() {
        let s = slack_notify_softill();
        assert!(matches!(s.invocation, SoftillInvocation::HttpApi { .. }));
        if let SoftillInvocation::HttpApi { method, .. } = &s.invocation {
            assert_eq!(method, "POST");
        }
    }

    #[test]
    fn test_all_plugins_count() {
        let plugins = all_common_plugins();
        assert_eq!(plugins.len(), 6);
    }

    #[test]
    fn test_each_plugin_has_tags() {
        for s in &all_common_plugins() {
            assert!(!s.tags.is_empty(), "Plugin {} missing tags", s.id);
        }
    }

    #[test]
    fn test_release_create_effect() {
        let s = gh_release_create_softill();
        assert_eq!(s.effect, "network-write");
    }

    #[test]
    fn test_docker_build_args_template() {
        let s = docker_build_softill();
        if let SoftillInvocation::Command { args_template, .. } = &s.invocation {
            assert!(args_template.contains("{tag}"));
            assert!(args_template.contains("{dockerfile}"));
        }
    }
}
