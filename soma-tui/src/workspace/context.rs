//! # WorkspaceContext — 工作区启动上下文
//!
//! 定义 detect_workspace() 返回的类型集合，用于 TUI 启动摘要渲染。

use std::path::PathBuf;

/// 已变更的文件
#[derive(Debug, Clone)]
pub struct ChangedFile {
    pub path: String,
    /// Git 状态标识: M(修改), A(新增), D(删除), ??(未跟踪), 等
    pub status: String,
}

/// 检测到的项目类型
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProjectKind {
    Rust,
    TypeScript,
    JavaScript,
    Python,
    Go,
    Other(String),
}

impl std::fmt::Display for ProjectKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProjectKind::Rust => write!(f, "Rust"),
            ProjectKind::TypeScript => write!(f, "TypeScript"),
            ProjectKind::JavaScript => write!(f, "JavaScript"),
            ProjectKind::Python => write!(f, "Python"),
            ProjectKind::Go => write!(f, "Go"),
            ProjectKind::Other(s) => write!(f, "{}", s),
        }
    }
}

/// 检测到的构建工具
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BuildTool {
    Cargo,
    Npm,
    Yarn,
    Pnpm,
    Pip,
    GoMod,
    Other(String),
}

impl std::fmt::Display for BuildTool {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BuildTool::Cargo => write!(f, "Cargo"),
            BuildTool::Npm => write!(f, "npm"),
            BuildTool::Yarn => write!(f, "Yarn"),
            BuildTool::Pnpm => write!(f, "pnpm"),
            BuildTool::Pip => write!(f, "pip"),
            BuildTool::GoMod => write!(f, "Go modules"),
            BuildTool::Other(s) => write!(f, "{}", s),
        }
    }
}

/// 权限模式
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionMode {
    /// 完全信任的工作区，不请求审批
    TrustedWorkspace,
    /// 写操作需要询问
    AskOnWrite,
    /// 只读模式
    ReadOnly,
}

impl PermissionMode {
    /// 从环境变量 SOMA_PERMISSION_MODE 解析权限模式
    pub fn from_env() -> Self {
        match std::env::var("SOMA_PERMISSION_MODE")
            .as_deref()
        {
            Ok("ask_on_write") => PermissionMode::AskOnWrite,
            Ok("read_only") => PermissionMode::ReadOnly,
            _ => PermissionMode::TrustedWorkspace,
        }
    }
}

impl std::fmt::Display for PermissionMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PermissionMode::TrustedWorkspace => write!(f, "trusted"),
            PermissionMode::AskOnWrite => write!(f, "ask_on_write"),
            PermissionMode::ReadOnly => write!(f, "read_only"),
        }
    }
}

/// 最近会话摘要（用于恢复提示）
#[derive(Debug, Clone)]
pub struct SessionSummary {
    pub task_id: String,
    pub title: String,
    pub status: String,
    pub updated_at: String,
}

/// 工作区启动上下文
#[derive(Debug, Clone)]
pub struct WorkspaceContext {
    /// 工作区根目录的绝对路径
    pub root: PathBuf,
    /// 目录名（用于显示）
    pub name: String,
    /// Git 仓库根目录（如果检测到 git）
    pub git_root: Option<PathBuf>,
    /// 当前 Git 分支名
    pub branch: Option<String>,
    /// 已变更的文件列表
    pub changed_files: Vec<ChangedFile>,
    /// 检测到的项目类型列表
    pub project_kinds: Vec<ProjectKind>,
    /// 检测到的构建工具列表
    pub build_tools: Vec<BuildTool>,
    /// 权限模式
    pub permission_mode: PermissionMode,
    /// 最近会话（用于恢复提示）
    pub recent_session: Option<SessionSummary>,
}

impl WorkspaceContext {
    /// 创建工作区上下文（主要用于测试或最小启动）
    ///
    /// 注意：permission_mode 默认 TrustedWorkspace，
    /// `detect_workspace()` 会从环境变量覆盖此值。
    pub fn new(root: PathBuf) -> Self {
        let name = root
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "?".to_string());
        Self {
            root,
            name,
            git_root: None,
            branch: None,
            changed_files: Vec::new(),
            project_kinds: Vec::new(),
            build_tools: Vec::new(),
            permission_mode: PermissionMode::TrustedWorkspace,
            recent_session: None,
        }
    }
}
