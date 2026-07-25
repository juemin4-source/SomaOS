// Composer — 设计：bg=#171C23, radius=20, 带动作栏

import { useState, useRef, useEffect } from "react";

interface ComposerProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

export function Composer({ onSend, disabled }: ComposerProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus();
    }
  }, [disabled]);

  const handleSubmit = () => {
    if (text.trim() && !disabled) {
      onSend(text.trim());
      setText("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 80) + "px";
  };

  return (
    <div className="composer-area">
      <div className="composer">
        <textarea
          ref={textareaRef}
          className="composer-input"
          placeholder={disabled ? "等待当前任务完成…" : "输入消息…"}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
        />
        <div className="composer-actions">
          <button
            className="composer-btn"
            onClick={handleSubmit}
            disabled={disabled || !text.trim()}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
