// Domain event writer — records business-significant domain events for audit/replay.
pub trait DomainEventWriter {}

// Operational log — records low-level runtime operations (invocations, latencies, errors).
pub trait OperationalLog {}

// Client output — abstract interface for streaming model responses to a client.
pub trait ClientOutput {}
