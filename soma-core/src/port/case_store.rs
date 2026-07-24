use async_trait::async_trait;

use crate::event::envelope::EventEnvelope;

#[async_trait]
pub trait CaseStore: Send + Sync {
    async fn append_event(&self, envelope: &EventEnvelope) -> Result<(), String>;
    fn replay(&self) -> Result<Vec<EventEnvelope>, String>;
}
