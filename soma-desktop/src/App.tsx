// SomaOS Desktop — Spatial Workbench
// 多页面路由：Home / Workspace / Changes
// 覆盖层：Task Summary Drawer

import { useState, useCallback, useEffect } from "react";
import type { TaskSummary, SomaUiEvent } from "./types/ui";
import { WindowBar } from "./components/WindowBar";
import { NewTaskDialog } from "./components/NewTaskDialog";
import { TaskDrawer } from "./components/TaskDrawer";
import { TaskSidebar } from "./features/tasks/TaskSidebar";
import { HomePage } from "./pages/HomePage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { ChangesPage } from "./pages/ChangesPage";
import { useSomaEvents } from "./runtime/events";
import { reduceEvent, createInitialConversationState, type ConversationState } from "./runtime/eventReducer";
import { createTask, sendMessage, cancelTurn, listTasks } from "./runtime/commands";

type View = "home" | "workspace" | "changes";

export default function App() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Record<string, ConversationState>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [currentView, setCurrentView] = useState<View>("home");

  // Load tasks on mount
  useEffect(() => {
    listTasks().then(setTasks).catch(() => {});
  }, []);

  // Event handler
  const handleEvent = useCallback((event: SomaUiEvent) => {
    const taskId = "taskId" in event ? (event as any).taskId : "";
    setConversations((prev) => {
      const conv = prev[taskId] || createInitialConversationState();
      const next = reduceEvent(conv, event);
      return { ...prev, [taskId]: next };
    });
    if (event.type === "turn_started") setIsRunning(true);
    else if (event.type === "turn_completed" || event.type === "turn_interrupted") {
      setIsRunning(false);
      listTasks().then(setTasks).catch(() => {});
    }
  }, []);

  useSomaEvents(handleEvent);

  // Navigation helpers
  const activeTask = activeTaskId ? tasks.find((t) => t.id === activeTaskId) : null;
  const activeConversation = activeTaskId
    ? conversations[activeTaskId] || createInitialConversationState()
    : null;

  const goToTask = useCallback((taskId: string) => {
    setActiveTaskId(taskId);
    setCurrentView("workspace");
  }, []);

  // Send message
  const handleSendMessage = useCallback(async (text: string) => {
    if (!activeTaskId) return;
    setConversations((prev) => {
      const conv = prev[activeTaskId] || createInitialConversationState();
      return {
        ...prev,
        [activeTaskId]: {
          ...conv,
          messages: [...conv.messages, { role: "user" as const, text, timestamp: Date.now() }],
        },
      };
    });
    try {
      const result = await sendMessage(activeTaskId, text);
      if (result.accepted) setIsRunning(true);
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  }, [activeTaskId]);

  // Send from home composer (creates task + sends)
  const handleHomeSend = useCallback(async (text: string) => {
    try {
      const title = text.length > 60 ? text.substring(0, 57) + "…" : text;
      const task = await createTask(".", title);
      setTasks((prev) => [...prev, task]);
      setActiveTaskId(task.id);
      setCurrentView("workspace");
      // Send message to new task
      const result = await sendMessage(task.id, text);
      if (result.accepted) setIsRunning(true);
    } catch (err) {
      console.error("Failed:", err);
    }
  }, []);

  const handleCancel = useCallback(async () => {
    if (!activeTaskId) return;
    try { await cancelTurn(activeTaskId); } catch {}
  }, [activeTaskId]);

  const handleCreateTask = useCallback(async (title: string) => {
    try {
      const task = await createTask(".", title);
      setTasks((prev) => [...prev, task]);
      setActiveTaskId(task.id);
      setCurrentView("workspace");
      setShowNewTaskDialog(false);
    } catch (err) {
      console.error("Failed to create task:", err);
    }
  }, []);

  // Render the main content area (right side)
  const renderContent = () => {
    switch (currentView) {
      case "home":
        return (
          <HomePage
            tasks={tasks}
            onSelectTask={goToTask}
            onStartInvestigate={() => setShowNewTaskDialog(true)}
            onSendText={handleHomeSend}
          />
        );

      case "workspace":
        return activeTask && activeConversation ? (
          <WorkspacePage
            task={activeTask}
            conversation={activeConversation}
            isRunning={isRunning}
            onSendMessage={handleSendMessage}
            onCancel={handleCancel}
            onShowDrawer={() => setShowDrawer((v) => !v)}
            onShowChanges={() => setCurrentView("changes")}
          />
        ) : (
          <div className="workspace">
            <div className="workspace-empty">
              <div className="empty-state">
                <h3>选择任务开始</h3>
                <p>从侧栏选择一个现有任务</p>
              </div>
            </div>
          </div>
        );

      case "changes":
        return <ChangesPage onBack={() => setCurrentView("workspace")} />;
    }
  };

  return (
    <>
      <WindowBar title={currentView === "changes" ? "Changes" : activeTask?.title} />

      <div className="app-body">
        {currentView !== "changes" && (
          <TaskSidebar
            tasks={tasks}
            activeTaskId={activeTaskId}
            onSelectTask={goToTask}
            onCreateTask={() => setShowNewTaskDialog(true)}
          />
        )}
        {renderContent()}
      </div>

      {/* Task Summary Drawer */}
      {showDrawer && <TaskDrawer onClose={() => setShowDrawer(false)} />}

      {/* New Task Dialog */}
      {showNewTaskDialog && (
        <NewTaskDialog
          onSubmit={handleCreateTask}
          onClose={() => setShowNewTaskDialog(false)}
        />
      )}
    </>
  );
}
