// ── SomaUiEvent — 桌面端 UI 事件类型 ──

export type SomaUiEvent =
  | { type: "assistant_delta"; taskId: string; text: string }
  | { type: "tool_started"; taskId: string; toolCallId: string; title: string }
  | { type: "tool_updated"; taskId: string; toolCallId: string; output: string; truncated: boolean }
  | { type: "tool_completed"; taskId: string; toolCallId: string; success: boolean }
  | { type: "artifact_created"; taskId: string; artifactId: string; kind: string }
  | { type: "work_state_changed"; taskId: string; combo: string; stage: string }
  | { type: "turn_started"; taskId: string }
  | { type: "turn_interrupted"; taskId: string }
  | { type: "turn_completed"; taskId: string }
  | { type: "error"; taskId: string; message: string };

// ── 接口类型 ──

export interface TaskSummary {
  id: string;
  title: string;
  status: "idle" | "running" | "completed" | "interrupted";
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetail extends TaskSummary {
  projectRoot: string;
  workState: Record<string, unknown>;
  artifacts: unknown[];
}

export interface SendMessageResult {
  taskId: string;
  turnId: string;
  accepted: boolean;
}

// ── Conversation 消息类型 ──

export type Message =
  | { role: "user"; text: string; timestamp: number }
  | { role: "assistant"; text: string; timestamp: number }
  | { role: "tool"; toolCallId: string; title: string; status: "running" | "completed" | "failed"; output?: string; timestamp: number };
