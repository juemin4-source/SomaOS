import { useState } from "react";

// 设计：surface/raised bg, radius=12, 420px width

interface NewTaskDialogProps {
  onSubmit: (title: string) => void;
  onClose: () => void;
}

export function NewTaskDialog({ onSubmit, onClose }: NewTaskDialogProps) {
  const [title, setTitle] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onSubmit(title.trim());
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>新建任务</h3>
        <input
          type="text"
          placeholder="任务标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <button className="new-task-btn" type="submit" disabled={!title.trim()}>
          ＋ 新建任务
        </button>
      </form>
    </div>
  );
}
