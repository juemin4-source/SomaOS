#!/usr/bin/env node
/**
 * task-ledger — handler.js
 *
 * 任务账本 softill。创建 / 更新 task-state，追踪每个任务的完整生命周期。
 *
 * 输入: { action, taskId, ... }
 *
 * action:
 *   create     创建新 task
 *   read       读取 task
 *   setStatus  设置状态 (OPEN/BLOCKED/DONE/PARTIAL)
 *   appendCmd  记录执行的命令
 *   appendEv   追加 evidence
 *   appendRead 记录读取的文件
 *   appendWrite记录写入的文件
 *   appendVerif追加验证结果
 *   appendPipe 添加 pipeline 步骤
 *   close      关闭 task（设 status=DONE + endedAt）
 *   list       列出所有 task
 *
 * 用法:
 *   node handler.js <input-json>
 *   cat input.json | node handler.js
 */

const fs = require('fs');
const path = require('path');

const TASKS_DIR = path.resolve(__dirname, '..', '..', 'soma', 'tasks');

function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    const p = path.resolve(process.argv[2]);
    try { input = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { return out('ERROR', `Read fail: ${e.message}`); }
  } else {
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(chunks).toString()); handle(input); }
      catch (e) { out('ERROR', `Parse error: ${e.message}`); }
    });
    return;
  }
  handle(input);
}

function taskPath(taskId) {
  return path.join(TASKS_DIR, `${taskId}.json`);
}

function loadTask(taskId) {
  const fp = taskPath(taskId);
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, 'utf-8'));
}

function saveTask(taskId, data) {
  if (!fs.existsSync(TASKS_DIR)) fs.mkdirSync(TASKS_DIR, { recursive: true });
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(taskPath(taskId), JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function handle(input) {
  const action = input.action || 'read';
  const taskId = input.taskId;
  const ensure = input.ensureDir !== false;

  if (ensure && !fs.existsSync(TASKS_DIR)) fs.mkdirSync(TASKS_DIR, { recursive: true });

  switch (action) {
    case 'create': {
      if (!taskId) return out('ERROR', 'taskId required');
      const existing = loadTask(taskId);
      if (existing) return out('ERROR', `Task already exists: ${taskId}`);

      const task = {
        taskId,
        task: input.task || '',
        goal: input.goal || '',
        taskType: input.taskType || 'script',
        allowedRead: input.allowedRead || [],
        allowedWrite: input.allowedWrite || [],
        pipeline: input.pipeline || [],
        status: 'OPEN',
        evidence: [],
        commandsRun: [],
        filesRead: [],
        filesWritten: [],
        verificationResults: [],
        startedAt: new Date().toISOString(),
        endedAt: null,
        lastUpdated: new Date().toISOString(),
      };
      saveTask(taskId, task);
      return out('PASS', `Task created: ${taskId}`, { action: 'create', taskId, task });
    }

    case 'read': {
      if (!taskId) return out('ERROR', 'taskId required');
      const task = loadTask(taskId);
      if (!task) return out('ERROR', `Task not found: ${taskId}`);
      return out('PASS', `Task read: ${taskId}`, { action: 'read', taskId, task });
    }

    case 'setStatus': {
      if (!taskId) return out('ERROR', 'taskId required');
      const validStatuses = ['OPEN', 'BLOCKED', 'DONE', 'PARTIAL'];
      if (!validStatuses.includes(input.status)) return out('ERROR', `Invalid status: ${input.status}. Valid: ${validStatuses.join(', ')}`);
      const task = loadTask(taskId);
      if (!task) return out('ERROR', `Task not found: ${taskId}`);
      task.status = input.status;
      if (input.status === 'DONE' && !task.endedAt) task.endedAt = new Date().toISOString();
      saveTask(taskId, task);
      return out('PASS', `Task ${taskId} → ${input.status}`, { action: 'setStatus', taskId, status: input.status, task });
    }

    case 'appendCmd': {
      if (!taskId) return out('ERROR', 'taskId required');
      if (!input.command) return out('ERROR', 'command required');
      const task = loadTask(taskId);
      if (!task) return out('ERROR', `Task not found: ${taskId}`);
      if (!task.commandsRun) task.commandsRun = [];
      task.commandsRun.push({ command: input.command, timestamp: new Date().toISOString(), result: input.result || '?' });
      saveTask(taskId, task);
      return out('PASS', 'Command recorded', { action: 'appendCmd', taskId });
    }

    case 'appendEv': {
      if (!taskId) return out('ERROR', 'taskId required');
      if (!input.evidence) return out('ERROR', 'evidence required');
      const task = loadTask(taskId);
      if (!task) return out('ERROR', `Task not found: ${taskId}`);
      if (!task.evidence) task.evidence = [];
      task.evidence.push(input.evidence);
      saveTask(taskId, task);
      return out('PASS', 'Evidence recorded', { action: 'appendEv', taskId, evidenceCount: task.evidence.length });
    }

    case 'appendRead': {
      if (!taskId) return out('ERROR', 'taskId required');
      const task = loadTask(taskId);
      if (!task) return out('ERROR', `Task not found: ${taskId}`);
      if (!task.filesRead) task.filesRead = [];
      const files = Array.isArray(input.file) ? input.file : [input.file];
      for (const f of files) { if (f && !task.filesRead.includes(f)) task.filesRead.push(f); }
      saveTask(taskId, task);
      return out('PASS', `${files.length} file(s) read recorded`, { action: 'appendRead', taskId, fileCount: task.filesRead.length });
    }

    case 'appendWrite': {
      if (!taskId) return out('ERROR', 'taskId required');
      const task = loadTask(taskId);
      if (!task) return out('ERROR', `Task not found: ${taskId}`);
      if (!task.filesWritten) task.filesWritten = [];
      const files = Array.isArray(input.file) ? input.file : [input.file];
      for (const f of files) { if (f && !task.filesWritten.includes(f)) task.filesWritten.push(f); }
      saveTask(taskId, task);
      return out('PASS', `${files.length} file(s) write recorded`, { action: 'appendWrite', taskId, fileCount: task.filesWritten.length });
    }

    case 'appendVerif': {
      if (!taskId) return out('ERROR', 'taskId required');
      if (!input.result) return out('ERROR', 'result required');
      const task = loadTask(taskId);
      if (!task) return out('ERROR', `Task not found: ${taskId}`);
      if (!task.verificationResults) task.verificationResults = [];
      task.verificationResults.push({
        type: input.type || 'general',
        result: input.result,
        summary: input.summary || '',
        timestamp: new Date().toISOString(),
      });
      saveTask(taskId, task);
      return out('PASS', 'Verification recorded', { action: 'appendVerif', taskId, verificationCount: task.verificationResults.length });
    }

    case 'appendPipe': {
      if (!taskId) return out('ERROR', 'taskId required');
      if (!input.step) return out('ERROR', 'step required');
      const task = loadTask(taskId);
      if (!task) return out('ERROR', `Task not found: ${taskId}`);
      if (!task.pipeline) task.pipeline = [];
      task.pipeline.push(input.step);
      saveTask(taskId, task);
      return out('PASS', 'Pipeline step added', { action: 'appendPipe', taskId, pipelineLength: task.pipeline.length });
    }

    case 'close': {
      if (!taskId) return out('ERROR', 'taskId required');
      const task = loadTask(taskId);
      if (!task) return out('ERROR', `Task not found: ${taskId}`);
      task.status = 'DONE';
      task.endedAt = new Date().toISOString();
      saveTask(taskId, task);
      return out('PASS', `Task closed: ${taskId}`, { action: 'close', taskId, task });
    }

    case 'list': {
      if (!fs.existsSync(TASKS_DIR)) return out('PASS', 'No tasks', { action: 'list', tasks: [] });
      const files = fs.readdirSync(TASKS_DIR).filter(f => f.endsWith('.json'));
      const tasks = files.map(f => {
        try { const d = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, f), 'utf-8')); return { taskId: d.taskId, task: d.task?.slice(0, 80), status: d.status, startedAt: d.startedAt }; }
        catch { return null; }
      }).filter(Boolean);
      tasks.sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
      return out('PASS', `${tasks.length} task(s)`, { action: 'list', tasks });
    }

    default:
      return out('ERROR', `Unknown action: ${action}. Valid: create, read, setStatus, appendCmd, appendEv, appendRead, appendWrite, appendVerif, appendPipe, close, list`);
  }
}

function out(result, summary, data) {
  console.log(JSON.stringify({ softill: 'task-ledger', result, summary, data: data || {}, evidence: [] }, null, 2));
  process.exit(result === 'PASS' ? 0 : 1);
}

if (require.main === module) main();
