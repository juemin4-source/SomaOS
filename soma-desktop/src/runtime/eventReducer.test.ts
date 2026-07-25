import { describe, it, expect } from "vitest";
import { reduceEvent, createInitialConversationState } from "./eventReducer";
import type { SomaUiEvent, Message } from "../types/ui";

describe("eventReducer", () => {
  it("starts with empty state", () => {
    const state = createInitialConversationState();
    expect(state.messages).toEqual([]);
    expect(state.activeToolCalls.size).toBe(0);
  });

  it("handles assistant_delta: appends to existing assistant message", () => {
    const state = createInitialConversationState();
    const firstDelta: SomaUiEvent = { type: "assistant_delta", taskId: "task-1", text: "Hello " };
    const s1 = reduceEvent(state, firstDelta);
    expect(s1.messages).toHaveLength(1);
    expect((s1.messages[0] as Message & { role: "assistant" }).text).toBe("Hello ");

    const s2 = reduceEvent(s1, { type: "assistant_delta", taskId: "task-1", text: "world!" });
    expect(s2.messages).toHaveLength(1);
    expect((s2.messages[0] as Message & { role: "assistant" }).text).toBe("Hello world!");
  });

  it("handles tool_started: adds a tool message", () => {
    const state = createInitialConversationState();
    const next = reduceEvent(state, { type: "tool_started", taskId: "task-1", toolCallId: "call-1", title: "file_read" });
    expect(next.messages).toHaveLength(1);
    const msg = next.messages[0] as Message & { role: "tool" };
    expect(msg.toolCallId).toBe("call-1");
    expect(msg.status).toBe("running");
    expect(next.activeToolCalls.has("call-1")).toBe(true);
  });

  it("handles tool_completed: marks tool as completed", () => {
    const s1 = reduceEvent(createInitialConversationState(), { type: "tool_started", taskId: "t", toolCallId: "c1", title: "r" });
    const s2 = reduceEvent(s1, { type: "tool_completed", taskId: "t", toolCallId: "c1", success: true });
    expect((s2.messages[0] as Message & { role: "tool" }).status).toBe("completed");
    expect(s2.activeToolCalls.has("c1")).toBe(false);
  });

  it("handles tool_completed with failure", () => {
    const s1 = reduceEvent(createInitialConversationState(), { type: "tool_started", taskId: "t", toolCallId: "c2", title: "p" });
    const s2 = reduceEvent(s1, { type: "tool_completed", taskId: "t", toolCallId: "c2", success: false });
    expect((s2.messages[0] as Message & { role: "tool" }).status).toBe("failed");
  });

  it("handles tool_updated: appends to tool output", () => {
    const s1 = reduceEvent(createInitialConversationState(), { type: "tool_started", taskId: "t", toolCallId: "c1", title: "s" });
    const s2 = reduceEvent(s1, { type: "tool_updated", taskId: "t", toolCallId: "c1", output: "found 3 results\n", truncated: false });
    expect((s2.messages[0] as Message & { role: "tool" }).output).toBe("found 3 results\n");
  });

  it("handles assistant_delta: creates new message after user message", () => {
    const withUser = { ...createInitialConversationState(), messages: [{ role: "user" as const, text: "hi", timestamp: 1 }] };
    const next = reduceEvent(withUser, { type: "assistant_delta", taskId: "t", text: "Hello!" });
    expect(next.messages).toHaveLength(2);
    expect(next.messages[1].role).toBe("assistant");
    expect((next.messages[1] as Message & { role: "assistant" }).text).toBe("Hello!");
  });

  it("handles turn_started without changing messages", () => {
    const next = reduceEvent(createInitialConversationState(), { type: "turn_started", taskId: "t" });
    expect(next.messages).toEqual([]);
  });

  it("handles turn_completed without changing messages", () => {
    const next = reduceEvent(createInitialConversationState(), { type: "turn_completed", taskId: "t" });
    expect(next.messages).toEqual([]);
  });
});
