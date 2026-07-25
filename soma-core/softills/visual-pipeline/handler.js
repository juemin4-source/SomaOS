#!/usr/bin/env node
/**
 * visual-pipeline — handler.js
 *
 * MAA 式视觉自动化管道：模板匹配 + 条件步骤 + 超时/重试/跳转。
 *
 * Pipeline JSON 格式:
 * {
 *   name: "开机自检",
 *   templates: "./templates/",      // 参考图片目录
 *   steps: [
 *     { action: "screenshot" },
 *     { action: "find", template: "logo.png", on_found: "click", timeout: 5000 },
 *     { action: "wait", ms: 1000 },
 *     { action: "find", template: "error.png", on_found: "goto", target: "handle_error" },
 *     { action: "type", text: "hello" },
 *     { action: "click", x: 100, y: 200 },
 *     { action: "loop", count: 3, steps: [...] },
 *   ],
 *   handlers: { handle_error: [...] }
 * }
 *
 * 动作:
 *   screenshot   截屏保存
 *   find         找图 (返回坐标/置信度/中心点)
 *   click        点坐标 或 点找到的图
 *   type         键盘输入
 *   key          按键
 *   wait         等待
 *   loop         循环
 *   goto         跳转到 handlers 中的标签
 *   condition    if/then/else
 *   scroll       滚动
 *
 * 用法: node handler.js <input-json> | cat input.json | node handler.js
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const AGENT_PATH = path.resolve(__dirname, '..', '..', 'soma', 'soma-agent.js');
const TEMPLATE_DIR = path.resolve(__dirname, '..', '..', 'soma', 'templates');

function main() {
  let i; const a = process.argv[2];
  if (a && a !== '--') { try { i = JSON.parse(fs.readFileSync(path.resolve(a), 'utf-8')); } catch (e) { return out('ERROR', 'Read: ' + e.message); } }
  else { const c = []; process.stdin.on('data', d => c.push(d)); process.stdin.on('end', () => { try { i = JSON.parse(Buffer.concat(c).toString()); h(i).catch(e => out('ERROR', e.message)); } catch (e) { out('ERROR', 'Parse: ' + e.message); } }); return; }
  h(i).catch(e => out('ERROR', e.message));
}

async function h(input) {
  const pipeline = input.pipeline || input;
  const steps = pipeline.steps || [];
  const handlers = pipeline.handlers || {};
  const templateDir = path.resolve(pipeline.templates || TEMPLATE_DIR);
  const results = [];
  let stepIndex = 0;

  if (steps.length === 0) return out('ERROR', 'pipeline.steps[] required');

  try {
    while (stepIndex < steps.length) {
      const step = steps[stepIndex];
      const r = await executeStep(step, stepIndex, templateDir, handlers, results);
      results.push(r);

      if (r.action === 'goto' && r.target) {
        const handlerSteps = handlers[r.target];
        if (handlerSteps) {
          for (let hi = 0; hi < handlerSteps.length; hi++) {
            const hr = await executeStep(handlerSteps[hi], `handler:${r.target}[${hi}]`, templateDir, handlers, results);
            results.push(hr);
          }
        }
      }

      stepIndex++;
    }
  } catch (e) {
    results.push({ error: e.message });
  }

  const passed = results.filter(r => r.status === 'PASS' || r.status === 'FOUND').length;
  const failed = results.filter(r => r.status === 'FAIL' || r.status === 'NOT_FOUND' || r.status === 'TIMEOUT').length;

  return out(failed > 0 ? 'PARTIAL' : 'PASS', `${results.length} steps: ${passed} pass, ${failed} fail`, {
    pipeline: pipeline.name || 'unnamed',
    steps: results,
    stepCount: results.length,
    passed,
    failed,
    templateDir,
  });
}

async function executeStep(step, index, templateDir, handlers, allResults) {
  const action = step.action || 'wait';
  const result = { action, index, status: 'PASS', details: {} };

  try {
    switch (action) {
      case 'screenshot': {
        const outDir = path.resolve(step.outputDir || '.soma-screenshots');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const fp = path.join(outDir, `pipeline_${Date.now()}.png`);
        const ps = `Add-Type -AssemblyName System.Drawing;Add-Type -AssemblyName System.Windows.Forms;$v=[System.Windows.Forms.SystemInformation]::VirtualScreen;$bm=New-Object System.Drawing.Bitmap $v.Width,$v.Height;$g=[System.Drawing.Graphics]::FromImage($bm);$g.CopyFromScreen($v.X,$v.Y,0,0,$v.Size);$bm.Save('${fp.replace(/\\/g, '\\\\')}');$g.Dispose();$bm.Dispose()`;
        execSync(`powershell -NoProfile -Command "${ps}"`, { timeout: 15000 });
        result.details.file = fp;
        result.details.size = fs.statSync(fp).size;
        break;
      }

      case 'find': {
        const template = step.template;
        if (!template) { result.status = 'FAIL'; result.error = 'template required'; break; }
        const tp = path.resolve(templateDir, template);
        if (!fs.existsSync(tp)) { result.status = 'FAIL'; result.error = `Template not found: ${tp}`; break; }

        const timeout = step.timeout || 5000;
        const start = Date.now();
        let found = false;

        while (Date.now() - start < timeout) {
          // Use screen-eye's find via agent
          const findResult = callAgent({ cmd: 'find', args: { image: tp } });
          if (findResult && findResult.result === 'PASS') {
            result.status = 'FOUND';
            result.details = findResult.data || findResult;
            found = true;
            break;
          }
          // Retry delay
          execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 500"', { timeout: 2000 });
        }

        if (!found) {
          result.status = 'TIMEOUT';
          result.error = `Image not found within ${timeout}ms: ${template}`;
          if (step.on_fail === 'goto' && step.target) { result.action = 'goto'; result.target = step.target; }
          if (step.on_fail === 'click' && step.fallbackX !== undefined) {
            callAgent({ cmd: 'click', args: { x: step.fallbackX, y: step.fallbackY } });
            result.status = 'FALLBACK_CLICK';
          }
          break;
        }

        // Auto-click if on_found is click
        if (step.on_found === 'click' || step.autoClick) {
          const cx = result.details.center?.x || result.details.x;
          const cy = result.details.center?.y || result.details.y;
          if (cx && cy) {
            callAgent({ cmd: 'click', args: { x: Math.round(cx), y: Math.round(cy) } });
            result.details.clicked = { x: Math.round(cx), y: Math.round(cy) };
          }
        }
        break;
                      }

      case 'click': {
        const x = step.x; const y = step.y;
        if (x === undefined) { result.status = 'FAIL'; result.error = 'x required'; break; }
        callAgent({ cmd: 'click', args: { x: Math.round(x), y: Math.round(y), button: step.button || 'left' } });
        result.details = { x: Math.round(x), y: Math.round(y) };
        break;
      }

      case 'type': {
        if (!step.text) { result.status = 'FAIL'; result.error = 'text required'; break; }
        callAgent({ cmd: 'type', args: { text: step.text } });
        result.details.text = step.text.slice(0, 100);
        break;
      }

      case 'key': {
        const key = step.key;
        if (!key) { result.status = 'FAIL'; result.error = 'key required'; break; }
        if (step.modifier) { callAgent({ cmd: 'type', args: { modifier: step.modifier, key } }); }
        else { callAgent({ cmd: 'type', args: { key } }); }
        result.details.key = key;
        break;
      }

      case 'wait': {
        const ms = step.ms || 1000;
        execSync(`powershell -NoProfile -Command "Start-Sleep -Milliseconds ${ms}"`, { timeout: ms + 2000 });
        result.details.ms = ms;
        break;
      }

      case 'spawn': {
        // 后台启动进程，不碰键盘前台
        const cmd = step.command || step.cmd;
        if (!cmd) { result.status = 'FAIL'; result.error = 'command required'; break; }
        const { spawn } = require('child_process');
        const child = spawn(cmd, (step.args || []), {
          cwd: step.cwd || process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: true,
        });
        let stdout = '', stderr = '';
        child.stdout.on('data', d => { stdout += d.toString(); if (stdout.length > 10000) child.stdout.destroy(); });
        child.stderr.on('data', d => { stderr += d.toString(); });
        if (step.input) { child.stdin.write(step.input); child.stdin.end(); }
        const exitCode = await new Promise(resolve => child.on('exit', resolve));
        result.details = { command: cmd, pid: child.pid, exitCode, stdout: stdout.slice(0, 1000), stderr: stderr.slice(0, 500), background: step.background || false };
        result.status = exitCode === 0 ? 'PASS' : 'FAIL';
        break;
      }

      case 'loop': {
        const count = step.count || 1;
        const loopSteps = step.steps || [];
        for (let li = 0; li < count; li++) {
          for (const ls of loopSteps) {
            const lr = await executeStep(ls, `${index}:${li}:${loopSteps.indexOf(ls)}`, templateDir, handlers, allResults);
            allResults.push(lr);
          }
        }
        result.details.loops = count;
        result.details.substeps = loopSteps.length;
        break;
      }

      case 'condition': {
        // Basic condition: check if a template exists on screen
        if (step.if_template) {
          const tp = path.resolve(templateDir, step.if_template);
          if (fs.existsSync(tp)) {
            const fr = callAgent({ cmd: 'find', args: { image: tp } });
            const met = fr && fr.result === 'PASS';
            result.details.condition = { template: step.if_template, met };
            if (met && step.then) { for (const ts of (step.then || [])) { allResults.push(await executeStep(ts, `${index}:then`, templateDir, handlers, allResults)); } }
            else if (!met && step.else) { for (const es of (step.else || [])) { allResults.push(await executeStep(es, `${index}:else`, templateDir, handlers, allResults)); } }
          }
        }
        break;
      }

      default:
        result.status = 'FAIL';
        result.error = `Unknown action: ${action}`;
    }
  } catch (e) {
    result.status = 'FAIL';
    result.error = e.message;
  }

  return result;
}

function callAgent(args) {
  try {
    const input = JSON.stringify({ cmd: args.cmd, args: args.args || args });
    const r = spawnSync('node', [AGENT_PATH], { input, encoding: 'utf-8', timeout: 30000 });
    const lines = r.stdout.trim().split('\n').filter(l => l.startsWith('{'));
    if (lines.length > 0) return JSON.parse(lines[lines.length - 1]);
    return null;
  } catch { return null; }
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'visual-pipeline', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }
if (require.main === module) main();
