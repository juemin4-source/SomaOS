use async_trait::async_trait;
use serde_json::Value;

#[async_trait]
pub trait CapabilityRuntime: Send + Sync {
    async fn execute(&self, capability_id: &str, input: Value) -> Result<Value, String>;
}
