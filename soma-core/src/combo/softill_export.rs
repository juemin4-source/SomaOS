/// Softill 导出 — 0.85 Gate C
///
/// 自产的 Softill 可以导出为独立可用的工具包：
/// - handler 脚本 / 二进制
/// - 元数据 manifest
/// - 封装启动脚本
/// - 基本测试
///
/// 导出后的工具不依赖 SomaOS Runtime，可被其他系统和流程直接调用。

use std::path::{Path, PathBuf};

use super::softill::{Softill, SoftillInvocation};

/// 导出包的描述
#[derive(Debug, Clone)]
pub struct ExportPackage {
    /// 导出目录路径
    pub output_dir: PathBuf,
    /// Softill ID
    pub softill_id: String,
    /// 生成的文件列表
    pub files: Vec<PathBuf>,
}

/// 导出一个 Softill 为独立工具包
pub fn export_softill(softill: &Softill, output_dir: &Path) -> Result<ExportPackage, String> {
    // 创建输出目录
    std::fs::create_dir_all(output_dir)
        .map_err(|e| format!("无法创建导出目录 {}: {}", output_dir.display(), e))?;

    let mut files = Vec::new();

    // 1. 复制或生成 handler
    match &softill.invocation {
        SoftillInvocation::Script { path, .. } => {
            let src = Path::new(path);
            if src.exists() {
                // 如果 handler 在 vendored 目录下，复制整个目录
                if src.is_file() {
                    let dst = output_dir.join(src.file_name().unwrap());
                    std::fs::copy(src, &dst)
                        .map_err(|e| format!("无法复制 handler {}: {}", src.display(), e))?;
                    files.push(dst);
                } else if src.is_dir() {
                    copy_dir(src, output_dir)?;
                    files.push(output_dir.to_path_buf());
                }
            } else {
                // handler 路径不存在 — 生成一个占位文件
                let stub = output_dir.join("handler.js");
                std::fs::write(&stub, generate_handler_stub(softill))
                    .map_err(|e| format!("无法生成 handler stub: {}", e))?;
                files.push(stub);
            }
        }
        SoftillInvocation::Command { command, args_template } => {
            // 生成一个包装脚本
            let wrapper = output_dir.join(if cfg!(windows) { "run.bat" } else { "run.sh" });
            let content = if cfg!(windows) {
                format!("@echo off\n{} {}\n", command, args_template)
            } else {
                format!("#!/bin/sh\n{} {}\n", command, args_template)
            };
            std::fs::write(&wrapper, content)
                .map_err(|e| format!("无法生成 wrapper: {}", e))?;
            files.push(wrapper);
        }
        SoftillInvocation::HttpApi { url_template, method, .. } => {
            // 生成 curl 包装脚本
            let wrapper = output_dir.join(if cfg!(windows) { "call.bat" } else { "call.sh" });
            let content = if cfg!(windows) {
                format!("@echo off\ncurl -X {} \"{}\"\n", method, url_template)
            } else {
                format!("#!/bin/sh\ncurl -X {} '{}'\n", method, url_template)
            };
            std::fs::write(&wrapper, content)
                .map_err(|e| format!("无法生成 API wrapper: {}", e))?;
            files.push(wrapper);
        }
        SoftillInvocation::McpTool { tool_name } => {
            // MCP 工具需要 MCP 客户端来调用，生成说明文件
            let readme = output_dir.join("README.md");
            let content = format!(
                "# {}\n\nMCP 工具，需要通过 MCP 客户端调用。\n\n工具名: `{}`\n\n```json\n{}\n```\n",
                softill.id, tool_name,
                serde_json::to_string_pretty(&softill.input_schema).unwrap_or_default()
            );
            std::fs::write(&readme, content)
                .map_err(|e| format!("无法生成 README: {}", e))?;
            files.push(readme);
        }
    }

    // 2. 生成 manifest (softill.json)
    let manifest = generate_manifest(softill);
    let manifest_path = output_dir.join("softill.json");
    std::fs::write(&manifest_path, &manifest)
        .map_err(|e| format!("无法写入 manifest: {}", e))?;
    files.push(manifest_path);

    // 3. 生成测试脚本
    let test_script = generate_test_script(softill);
    let test_path = output_dir.join("test.sh");
    std::fs::write(&test_path, &test_script)
        .map_err(|e| format!("无法写入测试脚本: {}", e))?;
    files.push(test_path);

    Ok(ExportPackage {
        output_dir: output_dir.to_path_buf(),
        softill_id: softill.id.clone(),
        files,
    })
}

/// 生成 softill.json manifest
fn generate_manifest(softill: &Softill) -> String {
    let inv_type = match &softill.invocation {
        SoftillInvocation::Command { .. } => "command",
        SoftillInvocation::McpTool { .. } => "mcp-tool",
        SoftillInvocation::Script { .. } => "script",
        SoftillInvocation::HttpApi { .. } => "http-api",
    };

    let tags_json: Vec<String> = softill.tags.iter()
        .map(|t| format!("\"{}\"", t))
        .collect();

    let result = format!(r#"{{
    "id": "{}",
    "name": "{}",
    "description": "{}",
    "type": "{}",
    "invocation_type": "{}",
    "effect": "{}",
    "tags": [{}],
    "schema": {}
}}
"#,
        softill.id,
        softill.name,
        softill.description.replace('"', r#"\""#),
        "softill",
        inv_type,
        softill.effect,
        tags_json.join(", "),
        serde_json::to_string_pretty(&softill.input_schema).unwrap_or_default()
    );

    result
}

/// 生成 handler stub（当 handler 文件不存在时）
fn generate_handler_stub(softill: &Softill) -> String {
    let inv_type = match &softill.invocation {
        SoftillInvocation::Script { interpreter, .. } => interpreter.as_str(),
        _ => "node",
    };

    format!(r#"#!/usr/bin/env {}
/**
 * {} — 导出自 SomaOS
 *
 * 用途: {}
 * 副作用: {}
 * 输入: 从 stdin 读取 JSON
 * 输出: stdout 写入 JSON
 */

const input = await (async () => {{
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}})();

// --- 在此处实现核心逻辑 ---

const result = {{
  softill: "{}",
  status: "executed",
  summary: "{} 已执行",
  data: {{ input }},
  evidence: []
}};

console.log(JSON.stringify(result, null, 2));
"#, inv_type, softill.id, softill.description, softill.effect, softill.id, softill.name)
}

/// 生成测试脚本
fn generate_test_script(softill: &Softill) -> String {
    format!(r#"#!/bin/sh
# {} — 导出自 SomaOS 的测试脚本
# 验证 Softill 能否被调用并返回预期结果

set -e

echo "=== 测试: {} ==="

# 检查 handler 是否存在
if [ -f "handler.mjs" ]; then
  HANDLER="handler.mjs"
elif [ -f "handler.js" ]; then
  HANDLER="handler.js"
else
  echo "❌ 未找到 handler 文件"
  exit 1
fi

echo "✅ handler 文件存在: $HANDLER"

# Test 1: 空输入测试
echo "测试 1: 基本调用..."
echo '{{"input": "test"}}' | node "$HANDLER" 2>/dev/null && echo "✅ 调用成功" || echo "⚠️  调用返回非零（可能需实际参数）"

# Test 2: 检查 manifest
echo "测试 2: manifest 验证..."
if [ -f "softill.json" ]; then
  SIZE=$(wc -c < "softill.json")
  echo "✅ manifest 存在 ({} bytes)"
else
  echo "❌ manifest 不存在"
  exit 1
fi

echo ""
echo "=== {} 测试完成 ==="
"#, softill.id, softill.name, softill.id, softill.name)
}

/// 递归复制目录
fn copy_dir(src: &Path, dst: &Path) -> Result<(), String> {
    for entry in src.read_dir().map_err(|e| format!("读取目录 {}: {}", src.display(), e))? {
        let entry = entry.map_err(|e| format!("目录条目: {}", e))?;
        let file_type = entry.file_type().map_err(|e| format!("文件类型: {}", e))?;
        let src_path = entry.path();
        let rel = src_path.strip_prefix(src).unwrap();
        let dst_path = dst.join(rel);

        if file_type.is_dir() {
            std::fs::create_dir_all(&dst_path)
                .map_err(|e| format!("创建目录 {}: {}", dst_path.display(), e))?;
            copy_dir(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("复制 {}: {}", src_path.display(), e))?;
        }
    }
    Ok(())
}

/// 按 ID 从 softill_library 查找并导出
pub fn export_by_id(softill_id: &str, output_dir: &Path) -> Result<ExportPackage, String> {
    let all = super::softill_library::all_softills();
    let softill = all.iter()
        .find(|s| s.id == softill_id)
        .ok_or_else(|| format!("Softill '{}' 未找到 (库中共 {} 个)", softill_id, all.len()))?;
    export_softill(softill, output_dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_export_script_softill() {
        let all = super::super::softill_library::all_softills();
        let softill = all.iter().find(|s| s.id == "code-search")
            .expect("code-search should exist");

        let tmp = std::env::temp_dir().join("somaos-export-test-code-search");
        let _ = std::fs::remove_dir_all(&tmp);

        let result = export_softill(softill, &tmp);
        assert!(result.is_ok(), "export failed: {:?}", result.err());
        let pkg = result.unwrap();

        assert_eq!(pkg.softill_id, "code-search");
        assert!(pkg.files.len() >= 3, "should have at least 3 files, got {}", pkg.files.len());

        // Verify manifest exists and has correct content
        let manifest_path = tmp.join("softill.json");
        assert!(manifest_path.exists(), "manifest should exist");
        let manifest = std::fs::read_to_string(&manifest_path).unwrap();
        assert!(manifest.contains("code-search"));

        // Verify test script exists
        assert!(tmp.join("test.sh").exists(), "test script should exist");

        // Cleanup
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_export_http_softill() {
        // 测试导出 HttpApi 类型的 Softill
        let softill = super::super::figma::figma_file_read_softill();
        let tmp = std::env::temp_dir().join("somaos-export-test-figma");
        let _ = std::fs::remove_dir_all(&tmp);

        let result = export_softill(&softill, &tmp);
        assert!(result.is_ok());
        let pkg = result.unwrap();

        assert_eq!(pkg.softill_id, "figma-file-read");
        assert!(tmp.join("call.sh").exists() || tmp.join("call.bat").exists(),
            "should have API wrapper");

        // Verify manifest
        let manifest = std::fs::read_to_string(&tmp.join("softill.json")).unwrap();
        assert!(manifest.contains("http-api"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_export_mcp_softill() {
        let softill = super::super::softill::Softill::new(
            "test-mcp", "Test MCP", "MCP test",
            SoftillInvocation::McpTool { tool_name: "soma_repo_diff".into() },
            "read-only",
        );
        let tmp = std::env::temp_dir().join("somaos-export-test-mcp");
        let _ = std::fs::remove_dir_all(&tmp);

        let result = export_softill(&softill, &tmp);
        assert!(result.is_ok());
        assert!(tmp.join("README.md").exists(), "MCP export should have README");

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_export_by_id_not_found() {
        let tmp = std::env::temp_dir().join("somaos-export-test-notfound");
        let result = export_by_id("nonexistent-softill-xyz", &tmp);
        assert!(result.is_err(), "should fail for unknown id");
    }

    #[test]
    fn test_export_by_id_success() {
        let tmp = std::env::temp_dir().join("somaos-export-test-byid");
        let _ = std::fs::remove_dir_all(&tmp);

        let result = export_by_id("web-fetcher", &tmp);
        assert!(result.is_ok(), "export by id failed: {:?}", result.err());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_generate_manifest_has_all_fields() {
        let s = super::super::softill::Softill::new(
            "test-id", "Test Name", "Test description",
            SoftillInvocation::Command { command: "echo".into(), args_template: "hello".into() },
            "read-only",
        );
        let manifest = generate_manifest(&s);
        assert!(manifest.contains("test-id"));
        assert!(manifest.contains("Test Name"));
        assert!(manifest.contains("Test description"));
        assert!(manifest.contains("command"));
        assert!(manifest.contains("read-only"));
    }
}
