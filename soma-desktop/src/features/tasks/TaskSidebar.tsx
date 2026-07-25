// TaskSidebar — 设计稿结构：
// Sidebar Header (Brand + Search)
// New Task (button, surface/raised bg, radius=12)
// Quick Nav (待我处理/Pill, 项目, 能力)
// "项目" label
// Project · SomaOS (Project Header + Task Items)
// Profile (User + Settings)

import type { TaskSummary } from "../../types/ui";

interface TaskSidebarProps {
  tasks: TaskSummary[];
  activeTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onCreateTask: () => void;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "running":
      return <span className="status-icon running">●</span>;
    case "completed":
    case "interrupted":
      return <span className="status-icon completed">✓</span>;
    default:
      return <span className="status-icon idle">○</span>;
  }
}

export function TaskSidebar({ tasks, activeTaskId, onSelectTask, onCreateTask }: TaskSidebarProps) {
  return (
    <aside className="sidebar">
      {/* Sidebar Header */}
      <div className="sidebar-header">
        <div className="brand">
          <div className="brand-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect width="20" height="20" rx="10" fill="#1C222B" />
              <polygon points="10,4 17,16 3,16" fill="#8DE2C4" />
            </svg>
          </div>
          <span className="brand-name">SomaOS</span>
        </div>
        <div className="search-icon">⌕</div>
      </div>

      {/* New Task */}
      <button className="sidebar-new-task" onClick={onCreateTask}>
        <span className="plus-icon">＋</span>
        <span>新建任务</span>
      </button>

      {/* Quick Nav */}
      <div className="quick-nav">
        <div className="nav-item active">
          <span className="nav-label">待我处理</span>
          <span className="nav-pill">3</span>
        </div>
        <div className="nav-item">
          <span className="nav-label">项目</span>
        </div>
        <div className="nav-item">
          <span className="nav-label">能力</span>
        </div>
      </div>

      {/* Project Section */}
      <div className="section-label">项目</div>

      <div className="project-section">
        <div className="project-header">
          <span className="project-toggle">▾</span>
          <span className="project-name">SomaOS</span>
        </div>

        <div className="task-list">
          {tasks.length === 0 && (
            <div className="empty-tasks">暂无任务</div>
          )}
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`task-item ${activeTaskId === task.id ? "active" : ""}`}
              onClick={() => onSelectTask(task.id)}
            >
              <StatusIcon status={task.status} />
              <div className="task-item-content">
                <div className="task-item-title">{task.title}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Profile */}
      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="user-avatar">羽</div>
          <div className="user-info">
            <div className="user-name">梨安</div>
            <div className="user-role">主认知体</div>
          </div>
        </div>
        <div className="settings-icon">⚙</div>
      </div>
    </aside>
  );
}
