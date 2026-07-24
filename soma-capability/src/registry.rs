use std::collections::HashMap;
use std::sync::Arc;

use serde_json::Value;

use crate::contract::CapabilityContract;
use crate::organ::Organ;
use soma_model::types::ToolDefinition;

/// 验证输入参数是否匹配 input_schema
///
/// 当前验证级别：检查 required 字段存在 + const 值匹配 + 类型正确
fn validate_params(input_schema: &Value, params: &Value) -> Result<(), String> {
    // 必须是 object 类型
    if input_schema.get("type").and_then(|v| v.as_str()) != Some("object") {
        return Ok(());  // 非 object schema 不做验证
    }

    let obj = params.as_object().ok_or_else(|| "params must be a JSON object".to_string())?;

    // 检查 required 字段
    if let Some(required) = input_schema.get("required").and_then(|v| v.as_array()) {
        for field in required {
            let field_name = field.as_str().ok_or_else(|| "required field name must be string".to_string())?;
            if !obj.contains_key(field_name) {
                return Err(format!("missing required field: {}", field_name));
            }
        }
    }

    // 逐字段检查（根据 schema 的 properties）
    if let Some(properties) = input_schema.get("properties").and_then(|v| v.as_object()) {
        for (field_name, field_schema) in properties {
            if let Some(param_value) = obj.get(field_name) {
                // const 约束：值必须精确匹配
                if let Some(const_val) = field_schema.get("const") {
                    if param_value != const_val {
                        return Err(format!(
                            "field '{}' must be {:?}, got {:?}",
                            field_name, const_val, param_value
                        ));
                    }
                }
                // type 约束
                if let Some(expected_type) = field_schema.get("type").and_then(|v| v.as_str()) {
                    match expected_type {
                        "string" => {
                            if !param_value.is_string() {
                                return Err(format!("field '{}' must be a string", field_name));
                            }
                        }
                        "integer" => {
                            if !param_value.is_i64() && !param_value.is_u64() {
                                return Err(format!("field '{}' must be an integer", field_name));
                            }
                        }
                        "boolean" => {
                            if !param_value.is_boolean() {
                                return Err(format!("field '{}' must be a boolean", field_name));
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    Ok(())
}

struct RegistryEntry {
    contract: CapabilityContract,
    organ: Arc<dyn Organ>,
}

/// 能力注册表：Organ 注册 → ToolDefinition 生成 → ToolCall 路由分派
///
/// 这是 SomaOS 控制面对外暴露的能力目录。CLI 在 composition root 中
/// 创建 Organ 实例并注册到此处，TurnEngine 通过 registry 将模型请求的
/// ToolCall 分派到对应 Organ 执行。
pub struct CapabilityRegistry {
    entries: HashMap<String, RegistryEntry>,
}

impl CapabilityRegistry {
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }

    /// 注册一项能力（从 Box）
    ///
    /// `capability_id` 必须唯一。重复注册会覆盖前一个。
    pub fn register(&mut self, contract: CapabilityContract, organ: Box<dyn Organ>) {
        self.register_arc(contract, Arc::from(organ));
    }

    /// 注册一项能力（从 Arc，用于多个 capability 共享同一个 Organ）
    ///
    /// 同一个 Organ 实例可以注册多个 capability_id（如 file.read + file.search 共享 FileOrgan）。
    pub fn register_arc(&mut self, contract: CapabilityContract, organ: Arc<dyn Organ>) {
        self.entries.insert(
            contract.capability_id.clone(),
            RegistryEntry { contract, organ },
        );
    }

    /// 生成所有已注册能力的 ToolDefinition 列表（供模型选择）
    pub fn tool_definitions(&self) -> Vec<ToolDefinition> {
        self.entries
            .values()
            .map(|entry| {
                let c = &entry.contract;
                ToolDefinition {
                    name: c.capability_id.clone(),
                    description: c.description.clone(),
                    parameters: c.input_schema.clone(),
                }
            })
            .collect()
    }

    /// 按 capability_id 执行对应 Organ 的 execute
    ///
    /// 执行前验证 params 是否匹配该 capability 的 input_schema。
    pub async fn execute(&self, capability_id: &str, params: Value) -> Result<Value, String> {
        let entry = self
            .entries
            .get(capability_id)
            .ok_or_else(|| format!("unknown capability: {}", capability_id))?;

        validate_params(&entry.contract.input_schema, &params)?;

        entry.organ.execute(params).await
    }

    /// 按 capability_id 查找对应的契约
    pub fn contract(&self, capability_id: &str) -> Option<&CapabilityContract> {
        self.entries.get(capability_id).map(|e| &e.contract)
    }

    /// 返回已注册的 capability_id 列表
    pub fn capability_ids(&self) -> Vec<String> {
        self.entries.keys().cloned().collect()
    }

    /// 返回已注册的能力数量
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// 是否为空
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

impl Default for CapabilityRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::EffectClass;
    use crate::organ::FileOrgan;
    use std::path::PathBuf;

    #[tokio::test]
    async fn test_empty_registry() {
        let reg = CapabilityRegistry::new();
        assert!(reg.is_empty());
        assert_eq!(reg.len(), 0);
        assert!(reg.tool_definitions().is_empty());
    }

    #[tokio::test]
    async fn test_register_and_tool_definitions() {
        let mut reg = CapabilityRegistry::new();

        reg.register(
            CapabilityContract::basic(
                "file.read",
                "读取文件内容",
                EffectClass::ReadOnly,
                serde_json::json!({
                    "type": "object",
                    "properties": {
                        "action": {"const": "read"},
                        "path": {"type": "string"}
                    },
                    "required": ["action", "path"]
                }),
            ),
            Box::new(FileOrgan::new(PathBuf::from("."))),
        );

        assert_eq!(reg.len(), 1);
        let defs = reg.tool_definitions();
        assert_eq!(defs.len(), 1);
        assert_eq!(defs[0].name, "file.read");
        assert_eq!(defs[0].description, "读取文件内容");
    }

    #[tokio::test]
    async fn test_execute_unknown_capability() {
        let reg = CapabilityRegistry::new();
        let result = reg.execute("nonexistent", serde_json::json!({})).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("unknown capability"));
    }

    #[tokio::test]
    async fn test_execute_file_read() {
        let dir = tempfile::tempdir().unwrap();
        let test_file = dir.path().join("test.txt");
        std::fs::write(&test_file, "hello from registry").unwrap();

        let mut reg = CapabilityRegistry::new();
        reg.register(
            CapabilityContract::basic(
                "file.read",
                "",
                EffectClass::ReadOnly,
                serde_json::json!({}),
            ),
            Box::new(FileOrgan::new(dir.path().to_path_buf())),
        );

        let result = reg
            .execute(
                "file.read",
                serde_json::json!({
                    "action": "read",
                    "path": "test.txt",
                }),
            )
            .await
            .unwrap();

        assert_eq!(result["content"], "hello from registry");
    }
}
