#!/usr/bin/env node
/**
 * skylos-adapter — handler.js
 *
 * Skylos PR scanner wrapper：死代码 + 安全 + 秘密 + 质量 + AI 错误检测。
 * 作为 after_write guard 的补充验证层。
 *
 * 输入: { file?, diff?, mode: "verify" | "scan" | "audit", cwd: "." }
 * 输出: { findings: [{ type, severity, file, line, message }], pass: bool }
 *
 * 依赖: pip install skylos
 * 用法: node handler.js <input-json>
 */

const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');

function main() {
  let i; const a = process.argv[2];
  if (a && a !== '--') { try { i = JSON.parse(fs.readFileSync(path.resolve(a), 'utf-8')); } catch (e) { return out('ERROR', 'Read: ' + e.message); } }
  else { const c = []; process.stdin.on('data', d => c.push(d)); process.stdin.on('end', () => { try { i = JSON.parse(Buffer.concat(c).toString()); h(i); } catch (e) { out('ERROR', 'Parse: ' + e.message); } }); return; }
  h(i);
}

function h(input) {
  const cwd = path.resolve(input.cwd || process.cwd());
  const mode = input.mode || 'verify';
  const file = input.file;
  const range = input.range; // e.g. "40:75"

  // 1. Check if skylos is available
  try { execSync('skylos --version 2>&1', { stdio: 'pipe', timeout: 5000 }); }
  catch (e) { return out('ERROR', 'skylos not installed. Run: pip install skylos', { installHint: 'pip install skylos' }); }

  try {
    let findings = [];
    let rawOutput = '';

    switch (mode) {
      case 'verify': {
        // skylos verify: designed for AI coding loop
        let cmd = `skylos verify "${cwd}"`;
        if (file) cmd += ` --file "${file}"`;
        if (range) cmd += ` --range ${range}`;
        cmd += ' --project-context';
        try {
          rawOutput = execSync(cmd, { encoding: 'utf-8', timeout: 60000, stdio: 'pipe' });
        } catch (e) { rawOutput = e.stdout || e.stderr || e.message; }
        findings = parseSkylosOutput(rawOutput);
        break;
      }

      case 'scan': {
        // Basic scan
        const cmd = `skylos "${cwd}"`;
        try { rawOutput = execSync(cmd, { encoding: 'utf-8', timeout: 120000, stdio: 'pipe' }); }
        catch (e) { rawOutput = e.stdout || e.stderr || e.message; }
        findings = parseSkylosOutput(rawOutput);
        break;
      }

      case 'audit': {
        // Full audit
        const cmd = `skylos "${cwd}" -a`;
        try { rawOutput = execSync(cmd, { encoding: 'utf-8', timeout: 180000, stdio: 'pipe' }); }
        catch (e) { rawOutput = e.stdout || e.stderr || e.message; }
        findings = parseSkylosOutput(rawOutput);
        break;
      }

      default:
        return out('ERROR', `Unknown mode: ${mode}`);
    }

    const blockers = findings.filter(f => f.severity === 'error' || f.severity === 'critical');
    const warnings = findings.filter(f => f.severity === 'warning');
    const infos = findings.filter(f => f.severity === 'info' || f.severity === 'style');
    const pass = blockers.length === 0;

    return out(pass ? 'PASS' : 'WARN',
      `${findings.length} findings (${blockers.length} blockers, ${warnings.length} warnings, ${infos.length} info)`,
      { mode, findings, findingCount: findings.length, blockerCount: blockers.length, warningCount: warnings.length, pass, rawOutput: rawOutput.slice(0, 1000) }
    );
  } catch (e) {
    return out('ERROR', e.message.slice(0, 200));
  }
}

function parseSkylosOutput(output) {
  const findings = [];
  const lines = output.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Pattern: file:line:severity: message
    const m1 = trimmed.match(/^([^:]+):(\d+):(\w+):\s*(.+)$/);
    if (m1) {
      findings.push({ file: m1[1], line: parseInt(m1[2]), severity: m1[3].toLowerCase(), message: m1[4].slice(0, 200), type: inferType(m1[4]) });
      continue;
    }

    // Pattern: [severity] file:line: message
    const m2 = trimmed.match(/^\[(\w+)\]\s+([^:]+):(\d+):\s*(.+)$/);
    if (m2) {
      findings.push({ file: m2[2], line: parseInt(m2[3]), severity: m2[1].toLowerCase(), message: m2[4].slice(0, 200), type: inferType(m2[4]) });
      continue;
    }

    // Pattern: skylos standard output format
    const m3 = trimmed.match(/^(.+?)\s+\[(\w+)\]\s+at\s+(.+?):(\d+)/);
    if (m3) {
      findings.push({ file: m3[3], line: parseInt(m3[4]), severity: m3[2].toLowerCase(), message: m3[1].slice(0, 200), type: inferType(m3[1]) });
    }
  }

  return findings.slice(0, 100);
}

function inferType(message) {
  const m = message.toLowerCase();
  if (m.includes('security') || m.includes('sqli') || m.includes('xss') || m.includes('ssrf') || m.includes('injection')) return 'security';
  if (m.includes('secret') || m.includes('api_key') || m.includes('password') || m.includes('token') || m.includes('credential')) return 'secret';
  if (m.includes('dead') || m.includes('unused') || m.includes('orphan')) return 'dead_code';
  if (m.includes('complexity') || m.includes('nesting') || m.includes('duplicate')) return 'quality';
  if (m.includes('hallucinat') || m.includes('imaginary') || m.includes('nonexistent') || m.includes('ai')) return 'ai_error';
  if (m.includes('cve') || m.includes('dependency') || m.includes('vulnerability')) return 'dependency';
  if (m.includes('config') || m.includes('ci') || m.includes('cd')) return 'configuration';
  return 'general';
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'skylos-adapter', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }
if (require.main === module) main();
