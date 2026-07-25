// Component tests for Conversation rendering
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Conversation } from "../../features/conversation/Conversation";
import type { Message } from "../../types/ui";

describe("Conversation", () => {
  it("shows empty state when no messages", () => {
    render(<Conversation messages={[]} />);
    expect(screen.getByText("开始新对话")).toBeDefined();
  });

  it("renders user messages", () => {
    const messages: Message[] = [
      { role: "user", text: "Hello world", timestamp: 1 },
    ];
    render(<Conversation messages={messages} />);
    expect(screen.getByText("Hello world")).toBeDefined();
  });

  it("renders assistant messages", () => {
    const messages: Message[] = [
      { role: "assistant", text: "Hi there!", timestamp: 1 },
    ];
    render(<Conversation messages={messages} />);
    expect(screen.getByText("Hi there!")).toBeDefined();
  });

  it("renders tool messages", () => {
    const messages: Message[] = [
      { role: "tool", toolCallId: "c1", title: "file_read", status: "completed", timestamp: 1 },
    ];
    render(<Conversation messages={messages} />);
    expect(screen.getByText("file_read")).toBeDefined();
  });

  it("shows thinking indicator when running with messages", () => {
    const messages: Message[] = [
      { role: "user", text: "ping", timestamp: 1 },
    ];
    render(<Conversation messages={messages} isRunning={true} />);
    const dots = document.querySelectorAll(".thinking-dot");
    expect(dots.length).toBe(3);
  });

  it("hides thinking indicator when not running", () => {
    const messages: Message[] = [
      { role: "user", text: "ping", timestamp: 1 },
    ];
    render(<Conversation messages={messages} isRunning={false} />);
    const dots = document.querySelectorAll(".thinking-dot");
    expect(dots.length).toBe(0);
  });
});
