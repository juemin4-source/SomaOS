// WorkspacePage — 主工作区（Figma frame 3:2）
// Conversation + Composer + Task Header

import type { ConversationState } from "../runtime/eventReducer";
import type { TaskSummary } from "../types/ui";
import { Conversation } from "../features/conversation/Conversation";
import { Composer } from "../features/conversation/Composer";

interface WorkspacePageProps {
  task: TaskSummary;
  conversation: ConversationState;
  isRunning: boolean;
  onSendMessage: (text: string) => void;
  onCancel: () => void;
  onShowDrawer: () => void;
  onShowChanges: () => void;
}

export function WorkspacePage({
  task, conversation, isRunning,
  onSendMessage, onCancel, onShowDrawer, onShowChanges,
}: WorkspacePageProps) {
  return (
    <div className="workspace">
      {/* Task Header */}
      <div className="task-header">
        <div className="task-identity">
          <h2>{task.title}</h2>
          <div className="task-meta">项目 · SomaOS</div>
        </div>
        <div className="task-actions">
          <div className="pill" onClick={onShowDrawer}>任务摘要</div>
          <div className="pill" onClick={onShowChanges}>改动 4</div>
          <div className="pill">验证</div>
          <div className="icon-btn">⋯</div>
          {isRunning && (
            <button className="cancel-btn" onClick={onCancel}>停止</button>
          )}
        </div>
      </div>

      {/* Conversation */}
      <Conversation messages={conversation.messages} isRunning={isRunning} />

      {/* Composer */}
      <Composer onSend={onSendMessage} disabled={isRunning} />
    </div>
  );
}
