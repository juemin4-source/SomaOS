// ── HTTP API 封装 — 替换 Tauri invoke
//
// 通过 HTTP POST 发送 JSON-RPC 请求到 soma-runtime --http :8080

import type { TaskSummary, TaskDetail, SendMessageResult } from "../types/ui";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: { code: number; message: string };
}

let requestId = 1;

async function rpc(method: string, params: Record<string, unknown>): Promise<any> {
  const id = requestId++;
  const res = await fetch(`${API_BASE}/api`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

  const data: JsonRpcResponse = await res.json();
  if (data.error) throw new Error(`RPC error ${data.error.code}: ${data.error.message}`);
  return data.result;
}

export async function createTask(projectRoot: string, title: string): Promise<TaskSummary> {
  const result = await rpc("task/create", { project_root: projectRoot, title });
  // 创建后获取详情
  const detail = await rpc("task/get", { task_id: result.task_id });
  return {
    id: detail.id,
    title: detail.title,
    status: detail.status,
    createdAt: detail.createdAt ?? detail.created_at,
    updatedAt: detail.updatedAt ?? detail.updated_at,
  };
}

export async function listTasks(): Promise<TaskSummary[]> {
  const result = await rpc("task/list", {});
  return (result.tasks || []).map((t: any) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    createdAt: t.createdAt ?? t.created_at,
    updatedAt: t.updatedAt ?? t.updated_at,
  }));
}

export async function getTask(taskId: string): Promise<TaskDetail> {
  const result = await rpc("task/get", { task_id: taskId });
  return {
    id: result.id,
    title: result.title,
    status: result.status,
    createdAt: result.createdAt ?? result.created_at,
    updatedAt: result.updatedAt ?? result.updated_at,
    projectRoot: result.projectRoot ?? result.project_root,
    workState: result.work_state ?? {},
    artifacts: result.artifacts ?? [],
  };
}

export async function sendMessage(taskId: string, text: string): Promise<SendMessageResult> {
  const result = await rpc("task/send_message", { task_id: taskId, text });
  return {
    taskId: result.taskId ?? result.task_id,
    turnId: result.turnId ?? result.turn_id,
    accepted: result.accepted,
  };
}

export async function cancelTurn(taskId: string): Promise<boolean> {
  const result = await rpc("task/cancel", { task_id: taskId });
  return result.cancelled ?? false;
}

