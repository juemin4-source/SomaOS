// ── 事件归约器 — SomaUiEvent → 应用状态更新 ──
//
// 将流式事件归约为 Conversation 消息列表和任务状态。

import type { SomaUiEvent, Message } from "../types/ui";

export interface ConversationState {
  messages: Message[];
  activeToolCalls: Map<string, number>; // toolCallId → message index
}

export function createInitialConversationState(): ConversationState {
  return {
    messages: [],
    activeToolCalls: new Map(),
  };
}

/**
 * 归约单个 SomaUiEvent 到 ConversationState
 * 返回新的 state（immutable 更新）
 */
export function reduceEvent(state: ConversationState, event: SomaUiEvent): ConversationState {
  const now = Date.now();

  switch (event.type) {
    case "turn_started":
      return state;

    case "assistant_delta": {
      const messages = [...state.messages];
      const lastMsg = messages[messages.length - 1];

      if (lastMsg?.role === "assistant") {
        // 追加到已有助手消息
        messages[messages.length - 1] = {
          ...lastMsg,
          text: lastMsg.text + event.text,
        };
      } else {
        // 新助手消息
        messages.push({
          role: "assistant",
          text: event.text,
          timestamp: now,
        });
      }
      return { ...state, messages };
    }

    case "tool_started": {
      const activeToolCalls = new Map(state.activeToolCalls);
      const messageIndex = state.messages.length;

      activeToolCalls.set(event.toolCallId, messageIndex);

      return {
        ...state,
        messages: [
          ...state.messages,
          {
            role: "tool",
            toolCallId: event.toolCallId,
            title: event.title,
            status: "running",
            timestamp: now,
          },
        ],
        activeToolCalls,
      };
    }

    case "tool_updated": {
      const messages = [...state.messages];
      const msgIndex = state.activeToolCalls.get(event.toolCallId);

      if (msgIndex !== undefined && messages[msgIndex]?.role === "tool") {
        messages[msgIndex] = {
          ...messages[msgIndex],
          output: (messages[msgIndex].output || "") + event.output,
        };
      }
      return { ...state, messages };
    }

    case "tool_completed": {
      const messages = [...state.messages];
      const msgIndex = state.activeToolCalls.get(event.toolCallId);

      if (msgIndex !== undefined && messages[msgIndex]?.role === "tool") {
        messages[msgIndex] = {
          ...messages[msgIndex],
          status: event.success ? "completed" : "failed",
        };
      }
      const activeToolCalls = new Map(state.activeToolCalls);
      activeToolCalls.delete(event.toolCallId);

      return { ...state, messages, activeToolCalls };
    }

    case "turn_completed":
    case "turn_interrupted":
    case "error":
      return state;

    default:
      return state;
  }
}
