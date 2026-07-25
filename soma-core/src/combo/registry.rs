use std::collections::HashMap;

use super::combo::Combo;

/// Combo 注册表 — Soma 发现和选择 Combo 的入口
#[derive(Debug, Clone)]
pub struct ComboRegistry {
    combos: HashMap<String, Combo>,
}

impl ComboRegistry {
    pub fn new() -> Self {
        Self {
            combos: HashMap::new(),
        }
    }

    /// 注册一个 Combo
    pub fn register(&mut self, combo: Combo) {
        self.combos.insert(combo.id.clone(), combo);
    }

    /// 按 ID 查找 Combo
    pub fn get(&self, id: &str) -> Option<&Combo> {
        self.combos.get(id)
    }

    /// 列出所有已注册的 Combo
    pub fn list(&self) -> Vec<&Combo> {
        self.combos.values().collect()
    }

    /// 搜索匹配场景描述的 Combo
    pub fn search(&self, query: &str) -> Vec<&Combo> {
        let q = query.to_lowercase();
        self.combos.values()
            .filter(|c| {
                c.name.to_lowercase().contains(&q)
                    || c.description.to_lowercase().contains(&q)
                    || c.when_to_use.iter().any(|w| w.to_lowercase().contains(&q))
            })
            .collect()
    }
}

impl Default for ComboRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_registry() {
        let reg = ComboRegistry::new();
        assert!(reg.list().is_empty());
    }

    #[test]
    fn test_register_and_find() {
        let mut reg = ComboRegistry::new();
        let c = Combo::new("review", "Code Review", "Review code changes");
        reg.register(c);
        assert_eq!(reg.list().len(), 1);
        assert!(reg.get("review").is_some());
        assert!(reg.get("nonexistent").is_none());
    }

    #[test]
    fn test_search_by_keyword() {
        let mut reg = ComboRegistry::new();
        let mut c = Combo::new("review", "Code Review", "Review code changes before merging");
        c.when_to_use = vec!["need a code review".into(), "check my diff".into()];
        reg.register(c);
        assert_eq!(reg.search("code review").len(), 1);
        assert_eq!(reg.search("diff").len(), 1);
        assert_eq!(reg.search("ship").len(), 0);
    }
}
