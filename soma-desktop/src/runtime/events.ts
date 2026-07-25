// ── SSE 事件监听 — 替换 Tauri event listener
//
// 通过 EventSource 连接 soma-runtime --http :8080 的 SSE 端点

import { useEffect, useRef } from "react";
import type { SomaUiEvent } from "../types/ui";

const SSE_URL = "http://localhost:8080/api/events";

type EventCallback = (event: SomaUiEvent) => void;

/**
 * 订阅 SSE 事件的 Hook
 * @param callback 每次收到 SomaUiEvent 时调用
 */
export function useSomaEvents(callback: EventCallback) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const eventSource = new EventSource(SSE_URL);

    eventSource.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data);
        // raw 是 RuntimeEventEnvelope 格式: { kind, task_id, turn_id, sequence, payload }
        const uiEvent = toUiEvent(raw);
        if (uiEvent) {
          callbackRef.current(uiEvent);
        }
      } catch (err) {
        console.error("Failed to parse SSE event:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE connection error:", err);
    };

    return () => {
      eventSource.close();
    };
  }, []);
}

/** 将 RuntimeEventEnvelope 转换为 SomaUiEvent */
function toUiEvent(raw: any): SomaUiEvent | null {
  if (!raw || !raw.kind || !raw.task_id) return null;

  const taskId: string = raw.task_id;
  const payload: Record<string, any> = raw.payload || {};

  switch (raw.kind) {
    case "TurnStarted":
      return { type: "turn_started", taskId };

    case "AssistantDelta":
      return { type: "assistant_delta", taskId, text: payload.text ?? "" };

    case "ToolStarted":
      return {
        type: "tool_started",
        taskId,
        toolCallId: payload.tool_call_id ?? "",
        title: payload.capability_id ?? "",
      };

    case "ToolUpdated":
      return {
        type: "tool_updated",
        taskId,
        toolCallId: payload.tool_call_id ?? "",
        output: payload.output ?? "",
        truncated: payload.truncated ?? false,
      };

    case "ToolCompleted":
      return {
        type: "tool_completed",
        taskId,
        toolCallId: payload.tool_call_id ?? "",
        success: payload.success ?? false,
      };

    case "ArtifactCreated":
      return {
        type: "artifact_created",
        taskId,
        artifactId: payload.artifact_id ?? "",
        kind: payload.kind ?? "unknown",
      };

    case "WorkStateChanged":
      return {
        type: "work_state_changed",
        taskId,
        combo: payload.combo ?? "",
        stage: payload.stage ?? "",
      };

    case "TurnInterrupted":
      return { type: "turn_interrupted", taskId };

    case "TurnCompleted":
      return { type: "turn_completed", taskId };

    case "TurnFailed":
      return { type: "error", taskId, message: payload.error ?? "Turn failed" };

    default:
      return null;
  }
}
