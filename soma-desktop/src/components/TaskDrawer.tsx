// Task Summary Drawer — Figma frame 7:2
// 右侧覆盖层：状态、目标、进度清单、Findings、产物、操作按钮

interface TaskDrawerProps {
  onClose: () => void;
}

const PROGRESS_ITEMS = [
  { label: "确认现有能力入口", done: true },
  { label: "建立 Adapter Contract", done: true },
  { label: "实现 Runtime 桥接", done: false },
  { label: "补充隔离验证", done: false },
  { label: "进入 Review", done: false },
];

export function TaskDrawer({ onClose }: TaskDrawerProps) {
  return (
    <>
      {/* Dimmed overlay */}
      <div className="drawer-overlay" onClick={onClose} />

      {/* Drawer panel */}
      <div className="task-drawer">
        {/* Header */}
        <div className="drawer-header">
          <h3>任务摘要</h3>
          <div className="icon-btn" onClick={onClose}>✕</div>
        </div>

        {/* Status */}
        <div className="drawer-status">
          <span className="status-active">● 正在实施</span>
          <div className="pill">0.85</div>
        </div>

        {/* Goal */}
        <div className="drawer-section">
          <div className="drawer-section-label">目标</div>
          <div className="goal-card">
            将 CLI、MCP 和 HTTP 插件接进 Softill 统一层。
          </div>
        </div>

        {/* Progress */}
        <div className="drawer-section">
          <div className="drawer-section-label">进度</div>
          {PROGRESS_ITEMS.map((item, i) => (
            <div key={i} className={`progress-item ${item.done ? "done" : ""}`}>
              <span className="progress-check">{item.done ? "✓" : "○"}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        {/* Findings */}
        <div className="drawer-section">
          <div className="drawer-section-label">Findings</div>
          <div className="finding-card">
            <div className="finding-card-dot" />
            <div className="finding-card-text">
              <div className="finding-card-title">统一 Adapter Contract</div>
              <div className="finding-card-desc">CLI / MCP / HTTP 共用一套能力契约</div>
            </div>
          </div>
        </div>

        {/* Artifacts */}
        <div className="drawer-section">
          <div className="drawer-section-label">产物与事实</div>
          <div className="artifact-row">Softill Adapter Contract</div>
          <div className="artifact-row">4 个文件修改</div>
          <div className="artifact-row">验证结果</div>
        </div>

        {/* Actions */}
        <div className="drawer-actions">
          <button className="drawer-btn secondary">取消任务</button>
          <button className="drawer-btn primary">继续实施</button>
        </div>
      </div>
    </>
  );
}
