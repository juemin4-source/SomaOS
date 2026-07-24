use async_trait::async_trait;

use crate::event::envelope::EventEnvelope;

#[async_trait]
pub trait EventCodec: Send + Sync {
    fn encode(&self, envelope: &EventEnvelope) -> Result<String, String>;
    fn decode(&self, data: &str) -> Result<EventEnvelope, String>;
}
