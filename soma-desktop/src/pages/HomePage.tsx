// HomePage — Figma frame 6:2
// Hero: S glyph + "今天继续什么？"
// Mode Grid: 调查修复/构建新功能/审阅改动/继续未完成
// Recent Tasks + Composer

import type { TaskSummary } from "../types/ui";

interface HomePageProps {
  tasks: TaskSummary[];
  onSelectTask: (id: string) => void;
  onStartInvestigate: () => void;
  onSendText: (text: string) => void;
}

const MODES = [
  { icon: "⌕", title: "调查并修复问题", desc: "从症状定位根因，修改代码并完成审阅。" },
  { icon: "◇", title: "构建新功能", desc: "从方向、规格与计划开始，推进到交付。" },
  { icon: "⌘", title: "审阅当前改动", desc: "检查范围漂移、风险、测试与完成度。" },
  { icon: "↺", title: "继续未完成任务", desc: "恢复 WorkState、产物与待处理 Findings。" },
];

export function HomePage({ tasks, onSelectTask, onStartInvestigate, onSendText }: HomePageProps) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = (e.currentTarget.elements.namedItem("home-input") as HTMLInputElement)?.value;
    if (input?.trim()) {
      onSendText(input.trim());
      (e.currentTarget as HTMLFormElement).reset();
    }
  };

  return (
    <div className="workspace">
      {/* Home Top Bar */}
      <div className="home-top">
        <h2>新建任务</h2>
        <div className="home-top-actions">
          <div className="pill status-pill">Runtime 已连接</div>
          <div className="icon-btn">⋯</div>
        </div>
      </div>

      {/* Home Content */}
      <div className="home-content">
        {/* Hero */}
        <div className="home-hero">
          <div className="hero-glyph">S</div>
          <h1 className="hero-title">今天继续什么？</h1>
          <p className="hero-subtitle">描述目标，Soma 会选择合适的专业工作方式。</p>
        </div>

        {/* Mode Grid */}
        <div className="mode-grid">
          {MODES.map((mode) => (
            <div key={mode.title} className="mode-card" onClick={() => onStartInvestigate()}>
              <div className="mode-card-header">
                <div className="mode-card-icon">{mode.icon}</div>
                <span className="mode-card-arrow">↗</span>
              </div>
              <div className="mode-card-title">{mode.title}</div>
              <div className="mode-card-desc">{mode.desc}</div>
            </div>
          ))}
        </div>

        {/* Recent Tasks */}
        <div className="recent-section">
          <div className="recent-header">
            <span className="recent-label">最近任务</span>
            <span className="recent-view-all">查看全部</span>
          </div>
          {tasks.length === 0 && (
            <div className="empty-tasks">暂无最近任务</div>
          )}
          {tasks.slice(0, 3).map((task) => (
            <div key={task.id} className="recent-task" onClick={() => onSelectTask(task.id)}>
              <div className="recent-task-left">
                <div className={`recent-task-dot ${task.status}`}>●</div>
                <div className="recent-task-info">
                  <div className="recent-task-title">{task.title}</div>
                  <div className="recent-task-meta">
                    {task.status === "running" ? "正在实施" : task.status} · 4 个文件修改
                  </div>
                </div>
              </div>
              <span className="recent-task-link">继续 ↗</span>
            </div>
          ))}
        </div>
      </div>

      {/* Composer */}
      <div className="composer-area">
        <form className="composer home-composer" onSubmit={handleSubmit}>
          <input
            name="home-input"
            className="composer-input"
            placeholder="描述你想完成的任务…"
            autoFocus
          />
          <div className="composer-actions">
            <div className="composer-left">
              <div className="icon-btn small">＋</div>
              <div className="pill warning-pill">完全访问</div>
            </div>
            <div className="composer-right">
              <span className="auto-mode">自动选择</span>
              <span className="mode-selector">⌄</span>
              <button type="submit" className="send-icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 14L14 8L2 2v5l8 1-8 1v5z" fill="#090B0F"/>
                </svg>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
