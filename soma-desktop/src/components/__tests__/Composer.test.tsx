// Component tests for Composer
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Composer } from "../../features/conversation/Composer";

describe("Composer", () => {
  it("renders input and send button", () => {
    render(<Composer onSend={() => {}} disabled={false} />);
    expect(screen.getByPlaceholderText("输入消息…")).toBeDefined();
    expect(screen.getByText("发送")).toBeDefined();
  });

  it("calls onSend when submitting", () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} />);
    const input = screen.getByPlaceholderText("输入消息…");
    fireEvent.change(input, { target: { value: "test message" } });
    fireEvent.click(screen.getByText("发送"));
    expect(onSend).toHaveBeenCalledWith("test message");
  });

  it("disables send button when disabled", () => {
    render(<Composer onSend={() => {}} disabled={true} />);
    const btn = screen.getByText("发送") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("does not call onSend when input is empty", () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} />);
    fireEvent.click(screen.getByText("发送"));
    expect(onSend).not.toHaveBeenCalled();
  });
});
