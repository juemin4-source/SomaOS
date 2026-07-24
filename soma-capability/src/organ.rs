use async_trait::async_trait;
use serde_json::Value;

#[async_trait]
pub trait Organ: Send + Sync {
    async fn execute(&self, input: Value) -> Result<Value, String>;
}
