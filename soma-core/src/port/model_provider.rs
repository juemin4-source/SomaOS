use async_trait::async_trait;
use soma_model::types::{SomaModelEvent, SomaModelRequest};
use tokio::sync::mpsc;

/// A provider that can stream model completion events.
///
/// Implementations should send events through the `sender` channel
/// and return `Ok(())` when done. The caller reads events from the
/// receiver end of the channel to process text deltas, tool calls,
/// and completion signals.
#[async_trait]
pub trait ModelProvider: Send + Sync {
    /// Initiate a model request, emitting events through the sender.
    ///
    /// The implementation sends events (TextDelta, ToolCallStarted, etc.)
    /// through the channel. When all events have been sent, the sender
    /// is dropped and the function returns `Ok(())`. The caller processes
    /// events from the receiver end.
    async fn complete_stream(
        &self,
        request: SomaModelRequest,
        sender: mpsc::Sender<SomaModelEvent>,
    ) -> Result<(), String>;
}
