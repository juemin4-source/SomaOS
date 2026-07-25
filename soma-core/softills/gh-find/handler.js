#!/usr/bin/env node
/**
 * gh-find — handler.js
 *
 * 从 GitHub/npm 扒小工具并快速评估的 softill。
 * 不搜索（由 Chancellor 用 WebSearch 找），只做试装+探针。
 *
 * 输入: { pkg: string, action: "probe" | "install" | "test" }
 *
 * 用法:
 *   node handler.js <input-json>
 *   cat input.json | node handler.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SOFTILLS_DIR = path.resolve(__dirname, '..');

function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    const p = path.resolve(process.argv[2]);
    try { input = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { return out('ERROR', `Read fail: ${e.message}`); }
  } else {
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(chunks).toString()); handle(input); } catch (e) { out('ERROR', `Parse error: ${e.message}`); }
    });
    return;
  }
  handle(input);
}

function handle(input) {
  const action = input.action || 'probe';

  // analyze doesn't need pkg
  if (action === 'analyze') return analyzeCli(input.cli || input.pkg || input.name, input);

  const pkg = input.pkg;
  if (!pkg) return out('ERROR', 'pkg required (npm package name)');

  const pkgDir = path.join(SOFTILLS_DIR, 'node_modules', pkg);
  const installed = fs.existsSync(pkgDir) && fs.existsSync(path.join(pkgDir, 'package.json'));

  switch (action) {
    case 'probe':
      return probe(pkg, pkgDir, installed);
    case 'install':
      return installPkg(pkg, pkgDir, installed);
    case 'test':
      return testPkg(pkg, pkgDir, installed);
    default:
      return out('ERROR', `Unknown action: ${action}`);
  }
}

function probe(pkg, pkgDir, installed) {
  if (!installed) return out('PASS', `"${pkg}" not installed. Run with action:install first.`, { installed: false, pkg });

  const pj = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8'));
  let exports = [];
  let probeOk = false;

  try {
    const mod = require(pkg);
    if (mod && typeof mod === 'object') exports = Object.keys(mod).slice(0, 30);
    else if (typeof mod === 'function') exports = ['[function]'];
    probeOk = true;
  } catch (e) {
    try {
      const mod = require(path.join(pkgDir, pj.main || 'index.js'));
      if (mod && typeof mod === 'object') exports = Object.keys(mod).slice(0, 30);
      probeOk = true;
    } catch (e2) {
      exports = [`probe failed: ${e2.message.slice(0, 80)}`];
    }
  }

  return out('PASS', `"${pkg}" v${pj.version}`, {
    installed: true,
    pkg,
    version: pj.version,
    description: pj.description?.slice(0, 200),
    entry: pj.main || 'index.js',
    dependencies: Object.keys(pj.dependencies || {}).length,
    exports,
    probeOk,
    license: pj.license,
  });
}

function installPkg(pkg, pkgDir, installed) {
  if (installed) return out('PASS', `"${pkg}" already installed`, { installed: true, pkg });

  try {
    execSync(`npm install ${pkg}`, { cwd: SOFTILLS_DIR, stdio: 'pipe', timeout: 60000 });
    return out('PASS', `"${pkg}" installed`, { installed: true, pkg, action: 'installed' });
  } catch (e) {
    return out('ERROR', `Install failed: ${e.message.slice(0, 200)}`);
  }
}

function testPkg(pkg, pkgDir, installed) {
  if (!installed) return installPkg(pkg, pkgDir, false);

  // Probe first, then run a basic require
  const probeResult = probe(pkg, pkgDir, true);
  try {
    const mod = require(pkg);
    const hasFunction = typeof mod === 'function' || (typeof mod === 'object' && Object.values(mod).some(v => typeof v === 'function'));
    return out('PASS', `"${pkg}" loads and${hasFunction ? ' has' : ' has no'} callable exports`, {
      pkg,
      loads: true,
      hasCallable: hasFunction,
      exportCount: typeof mod === 'object' ? Object.keys(mod).length : 1,
    });
  } catch (e) {
    return out('ERROR', `"${pkg}" load test failed: ${e.message.slice(0, 200)}`);
  }
}

function out(result, summary, data) {
  const output = { softill: 'gh-find', result, summary, data: data || {}, evidence: [] };
  console.log(JSON.stringify(output, null, 2));
  process.exit(result === 'PASS' ? 0 : 1);
}

// ═══════════════════════════════════════════════════════════════════
// CLI-Anything style: analyze a CLI tool and generate adapter handler
// ═══════════════════════════════════════════════════════════════════

function analyzeCli(cliName, input) {
  if (!cliName) return out('ERROR', 'cli name required (e.g. "jq", "ag", "rg")');

  const softillName = input.as || `${cliName.replace(/[^a-z0-9-]/g, '-')}-eye`;
  const targetDir = path.join(SOFTILLS_DIR, softillName);

  if (fs.existsSync(targetDir)) return out('ERROR', `Softill already exists: ${softillName}`);

  // 1. Probe the CLI
  let helpText = '';
  let versionText = '';
  let cliPath = '';

  try {
    const which = execSync(`where ${cliName} 2>nul || which ${cliName} 2>/dev/null || echo ""`, { encoding: 'utf-8', timeout: 5000 }).trim();
    cliPath = which.split('\n')[0].trim();
  } catch {}

  // Try multiple help flag patterns, capture both stdout and stderr
  const helpFlags = ['--help', '-h', '/?', 'help'];
  for (const flag of helpFlags) {
    if (helpText) break;
    try {
      const r = execSync(`${cliPath || cliName} ${flag}`, { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
      helpText = (r.stdout || r.stderr || '').trim();
    } catch (e) {
      helpText = (e.stdout || e.stderr || '').trim();
    }
  }

  // Version
  try { versionText = execSync(`${cliPath || cliName} --version`, { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }).stdout.trim(); } catch {}
  if (!versionText) try { versionText = execSync(`${cliPath || cliName} version`, { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }).stdout.trim(); } catch {}

  if (!helpText) return out('ERROR', `Cannot get help for: ${cliName}`);

  // 2. Analyze help text
  const lines = helpText.split('\n');
  const subcommands = [];
  const flags = [];
  const usage = [];
  let description = '';

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('usage:') || t.startsWith('Usage:') || t.startsWith('USAGE:')) usage.push(t);
    else if (t.startsWith('description:') || t.startsWith('Description:')) description = t.replace(/^[^:]+:\s*/, '');
    // Detect subcommands: lines starting with word at position 0
    if (/^\w/.test(t) && t.length < 30 && !t.startsWith('-') && !t.includes(' ') && lines.indexOf(line) > 5) subcommands.push(t);
    // Detect flags: --word or -w
    const fm = t.match(/^\s{2,}(-\w)(?:,(\s*--[\w-]+))?/);
    if (fm) {
      const shortFlag = fm[1];
      const longFlag = fm[2] || '';
      const desc = t.replace(/^[-,|\s\w]+/, '').trim();
      flags.push({ short: shortFlag, long: longFlag.trim(), description: desc.slice(0, 100) });
    }
    // Also detect --word-only flags
    const lm = t.match(/^\s{2,}(--[\w-]+)\s*/);
    if (lm && !flags.some(f => f.long === lm[1])) {
      const desc = t.replace(lm[1], '').trim();
      flags.push({ short: '', long: lm[1], description: desc.slice(0, 100) });
    }
  }

  const hasJsonFlag = flags.some(f => f.long === '--json' || f.long === '--json-output');
  const hasInput = flags.some(f => f.long === '--input' || f.long === '--file' || f.long === '-i' || f.long === '-f');
  const hasOutput = flags.some(f => f.long === '--output' || f.long === '--out' || f.long === '-o');

  // 3. Infer level
  const isReadTool = /search|find|list|show|get|read|cat|view|query|grep/.test(cliName);
  const isWriteTool = /write|create|edit|patch|set|put|post|delete|rm/.test(cliName);
  const isTransform = /convert|format|transform|parse|render/.test(cliName);
  const level = isWriteTool ? 'L3_write' : isTransform ? 'L1_transform' : isReadTool ? 'L0_read_probe' : 'L0_read_probe';

  // 4. Generate handler.js code
  const hasSubcommands = subcommands.length > 0;

  const handlerCode = `#!/usr/bin/env node
/**
 * ${softillName} — handler.js
 * Auto-generated by gh-find analyze from: ${cliName}
 *
 * CLI path: ${cliPath || '(in PATH)'}
 * ${description ? 'Description: ' + description : ''}
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function main() {
  let i; const a = process.argv[2];
  if (a && a !== '--') { try { i = JSON.parse(fs.readFileSync(path.resolve(a), 'utf-8')); } catch (e) { return out('ERROR', 'Read: ' + e.message); } }
  else { const c = []; process.stdin.on('data', d => c.push(d)); process.stdin.on('end', () => { try { i = JSON.parse(Buffer.concat(c).toString()); h(i); } catch (e) { out('ERROR', 'Parse: ' + e.message); } }); return; }
  h(i);
}

function h(input) {
  const args = [];
${hasSubcommands ? `  const cmd = input.subcommand || '${subcommands[0] || ''}';
  if (cmd) args.push(cmd);
` : ''}
${flags.map(f => {
  const flagName = f.long.replace(/^--/, '') || f.short.replace(/^-/, '');
  const key = flagName.replace(/-/g, '');
  return `  if (input['${key}'] !== undefined || input['${flagName}'] !== undefined) { args.push('${f.long || f.short}'); args.push(input['${key}'] || input['${flagName}']); }`;
}).join('\n')}
  if (input.args) args.push(...(Array.isArray(input.args) ? input.args : [input.args]));
  if (input._) args.push(...(Array.isArray(input._) ? input._ : []));
  if (input.pattern !== undefined) args.push(input.pattern);
  if (input.file) args.push(input.file);
  if (input.directory || input.dir) args.push(input.directory || input.dir);
${hasJsonFlag ? "  args.push('--json');\n" : "  // Add --json if supported\n  // if (input.json) args.push('--json');\n"}

  const cmd = '${cliName} ' + args.join(' ');

  try {
    const stdout = execSync(cmd, { encoding: 'utf-8', timeout: input.timeout || 30000, maxBuffer: 1024 * 1024 });
    const result = ${hasJsonFlag ? "try { return out('PASS', 'Executed', JSON.parse(stdout)); } catch {}" : "{}"};
    return out('PASS', \`OK (\${stdout.split('\\n').length} lines)\`, { stdout: stdout.slice(0, 2000), truncated: stdout.length > 2000 });
  } catch (e) {
    return out('ERROR', e.message.slice(0, 200), { stderr: (e.stderr || e.stdout || '').slice(0, 1000) });
  }
}

function out(r, s, d) { console.log(JSON.stringify({ softill: '${softillName}', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }
if (require.main === module) main();
`;

  // 5. Write handler.js
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'handler.js'), handlerCode, 'utf-8');

  return out('PASS',
    `Generated ${softillName} ← ${cliName} (${subcommands.length} subcmds, ${flags.length} flags, ${level})`,
    {
      softill: softillName,
      source: cliName,
      level,
      cliPath: cliPath || '(in PATH)',
      subcommands,
      flags: flags.slice(0, 20),
      handlerSize: handlerCode.length,
      handlerPath: path.join(targetDir, 'handler.js'),
      hasJsonFlag,
      hasSubcommands,
      description: description.slice(0, 200) || versionText.slice(0, 200),
      suggestedRegistry: {
        name: softillName, level,
        writesSource: level === 'L3_write',
        writesSomaState: false,
        requiresBeforeWrite: level === 'L3_write',
        sideEffects: level === 'L3_write' ? ['write_file'] : ['read_file'],
        allowedRuntimeStages: level === 'L0_read_probe' ? ['context_compile'] : ['execute'],
        defaultCost: 'low',
        outputContract: 'softill_result',
      },
    }
  );
}

if (require.main === module) main();
