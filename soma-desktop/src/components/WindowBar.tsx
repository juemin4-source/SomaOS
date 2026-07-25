// Window Bar — 顶栏：身份 + 标题 + 窗口控制
// 设计：fill=#090B0F, 42px height

interface WindowBarProps {
  title?: string;
}

export function WindowBar({ title }: WindowBarProps) {
  return (
    <div className="window-bar">
      <div className="window-identity">
        <div className="window-icon">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <polygon points="6,0 12,12 0,12" fill="#E6FFF6" />
          </svg>
        </div>
        <span className="window-brand">SomaOS</span>
      </div>
      <div className="window-title">
        {title || "选择任务开始工作"}
      </div>
      <div className="window-controls">
        <div className="window-dot" />
        <div className="window-dot" />
        <div className="window-dot" />
      </div>
    </div>
  );
}
