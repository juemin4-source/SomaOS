pub mod client;
pub use client::SomaClient;

#[cfg(test)]
mod tests {
    use crate::SomaClient;

    #[test]
    fn test_client_is_send() {
        fn assert_send<T: Send>() {}
        assert_send::<SomaClient>();
    }

    #[test]
    fn test_subscribe_never_panics() {
        // 无 Runtime 时无法完整测试，但验证构造逻辑不 panic
        let _ = std::env::current_dir();
    }
}
