// Conversation — 设计稿消息流
// User Message Bubble → Assistant Intro (S icon + answer + progress)
// → Tool Card (header + divider + file list)
// → Finding (✓ icon)
// → Result Cards (Artifact Card + Change Card)
// → Verification Row (test status + passed pill)

import { useEffect, useRef } from "react";
import type { Message } from "../../types/ui";

// ── Sub-components per Figma design ──

function UserBubble({ text }: { text: string }) {
  return (
    <div className="msg-user">
      <div className="user-bubble">{text}</div>
    </div>
  );
}

function AssistantIntro({ text }: { text: string }) {
  return (
    <div className="msg-assistant-intro">
      <div className="assistant-icon">S</div>
      <div className="assistant-answer">
        <div className="answer-text">{text}</div>
        <div className="answer-progress">
          <span className="pill">正在构建插件适配层</span>
          <span className="progress-time">已运行 1m 42s</span>
        </div>
      </div>
    </div>
  );
}

function ToolCard({ title, status, output }: { title: string; status: string; output?: string }) {
  return (
    <div className="msg-tool-card">
      <div className="tool-card-header">
        <div className="tool-card-title">
          <div className="tool-card-icon">⌕</div>
          <span>{title}</span>
        </div>
        <div className={`tool-card-status ${status}`}>
          {status === "running" ? "执行中…" : status === "completed" ? "完成" : "失败"}
        </div>
      </div>
      <div className="tool-card-divider" />
      {output && (
        <div className="tool-card-output">
          <pre className="tool-card-file">{output}</pre>
        </div>
      )}
    </div>
  );
}

// ── Main Conversation ──

interface ConversationProps {
  messages: Message[];
  isRunning?: boolean;
}

export function Conversation({ messages, isRunning }: ConversationProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="conversation">
        <div className="empty-state">
          <h3>开始新对话</h3>
          <p>输入消息开始调查或代码分析</p>
        </div>
      </div>
    );
  }

  return (
    <div className="conversation">
      {messages.map((msg, i) => (
        <MessageBubble key={i} message={msg} />
      ))}

      {isRunning && (
        <div className="msg-thinking">
          <span className="thinking-dot" />
          <span className="thinking-dot" />
          <span className="thinking-dot" />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  switch (message.role) {
    case "user":
      return <UserBubble text={message.text} />;

    case "assistant":
      return <AssistantIntro text={message.text} />;

    case "tool":
      return (
        <ToolCard
          title={message.title}
          status={message.status}
          output={message.output}
        />
      );
  }
}
