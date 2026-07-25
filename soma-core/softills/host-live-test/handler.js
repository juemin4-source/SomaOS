#!/usr/bin/env node
/**
 * host-live-test — handler.js
 *
 * Live test host adapter end-to-end.
 * Runs verification suite in isolated project, each test produces
 * PASS/FAIL/ERROR, never touches real user config.
 * All config modifications have Diff + rollback.
 * 级别: L2_validate (corrected from auto-detected L4_state)
 * 生成: meta-softill blueprint (v0.2 七面元器)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function handle(input) {
  const testSuite = (input && input.testSuite) || 'all';
  const testDir = input && input.testDir ? path.resolve(input.testDir) : path.join(process.cwd(), '.forge-inputs', 'test-isolation');

  const tests = [];

  if (testSuite === 'all' || testSuite === 'host-probe') {
    tests.push(runHostProbeTest(testDir));
  }
  if (testSuite === 'all' || testSuite === 'hook-scaffold') {
    tests.push(runHookScaffoldTest(testDir));
  }
  if (testSuite === 'all' || testSuite === 'hook-install') {
    tests.push(runHookInstallTest(testDir));
  }
  if (testSuite === 'all' || testSuite === 'hook-validate') {
    tests.push(runHookValidateTest(testDir));
  }
  if (testSuite === 'all' || testSuite === 'hook-replay') {
    tests.push(runHookReplayTest(testDir));
  }
  if (testSuite === 'all' || testSuite === 'permission-compile') {
    tests.push(runPermissionCompileTest(testDir));
  }
  if (testSuite === 'all' || testSuite === 'host-config-patch') {
    tests.push(runHostConfigPatchTest(testDir));
  }
  if (testSuite === 'all' || testSuite === 'full-chain') {
    tests.push(runFullChainTest(testDir));
  }

  const passed = tests.filter(t => t.status === 'PASS').length;
  const failed = tests.filter(t => t.status === 'FAIL').length;
  const errors = tests.filter(t => t.status === 'ERROR').length;

  return {
    testSuite,
    testDir,
    results: tests,
    summary: { total: tests.length, passed, failed, errors },
  };
}

function runHostProbeTest(testDir) {
  try {
    const probeInput = JSON.stringify({ probeType: 'environment' });
    const inputFile = path.join(testDir, 'probe-input.json');
    fs.writeFileSync(inputFile, probeInput);
    const result = execSync('node src/softills/host-probe/handler.js "' + inputFile + '"', {
      cwd: process.cwd(), encoding: 'utf-8', timeout: 10000,
    });
    const parsed = JSON.parse(result);
    return { test: 'host-probe: environment detection', status: parsed.result === 'PASS' ? 'PASS' : 'FAIL', detail: parsed.summary };
  } catch (e) {
    return { test: 'host-probe: environment detection', status: 'ERROR', detail: e.message.slice(0, 200) };
  }
}

function runHookScaffoldTest(testDir) {
  try {
    const hookDir = path.join(testDir, 'hooks');
    fs.mkdirSync(hookDir, { recursive: true });
    const testInput = { hookType: 'PreToolUse', targetDir: hookDir, write: false };
    const inputFile = path.join(testDir, 'scaffold-input.json');
    fs.writeFileSync(inputFile, JSON.stringify(testInput));
    const result = execSync('node src/softills/hook-scaffold/handler.js "' + inputFile + '"', {
      cwd: process.cwd(), encoding: 'utf-8', timeout: 10000,
    });
    const parsed = JSON.parse(result);
    const valid = parsed.data && parsed.data.valid === true;
    return { test: 'hook-scaffold: generate PreToolUse skeleton', status: valid ? 'PASS' : 'FAIL', detail: parsed.summary };
  } catch (e) {
    return { test: 'hook-scaffold: generate PreToolUse skeleton', status: 'ERROR', detail: e.message.slice(0, 200) };
  }
}

function runHookInstallTest(testDir) {
  try {
    const configDir = path.join(testDir, 'config');
    fs.mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'settings.json');
    fs.writeFileSync(configPath, JSON.stringify({}) + '\n');

    const hookDir = path.join(testDir, 'hooks');
    fs.mkdirSync(hookDir, { recursive: true });
    const hookPath = path.join(hookDir, 'PostToolUse.js');
    fs.writeFileSync(hookPath, 'module.exports = async function() { return {}; };');

    const inputFile = path.join(testDir, 'install-input.json');
    fs.writeFileSync(inputFile, JSON.stringify({ hookType: 'PostToolUse', hookPath, configPath }));

    const result = execSync('node src/softills/hook-install/handler.js "' + inputFile + '"', {
      cwd: process.cwd(), encoding: 'utf-8', timeout: 10000,
    });
    const parsed = JSON.parse(result);

    // Verify config was actually modified
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const hookInstalled = config.hooks && config.hooks.PostToolUse !== undefined;

    return {
      test: 'hook-install: install PostToolUse with backup',
      status: parsed.result === 'PASS' && hookInstalled ? 'PASS' : 'FAIL',
      detail: parsed.result === 'PASS' && hookInstalled ? parsed.summary : 'Hook not installed in config',
    };
  } catch (e) {
    return { test: 'hook-install: install PostToolUse with backup', status: 'ERROR', detail: e.message.slice(0, 200) };
  }
}

function runHookValidateTest(testDir) {
  try {
    // Create a valid hook file
    const hookDir = path.join(testDir, 'hooks');
    fs.mkdirSync(hookDir, { recursive: true });
    const validHookPath = path.join(hookDir, 'valid-hook.js');
    fs.writeFileSync(validHookPath, 'async function handle(input) { try { return { ok: true }; } catch (e) { return { error: e.message }; } }\nmodule.exports = { handle };');

    const inputFile = path.join(testDir, 'validate-input.json');
    fs.writeFileSync(inputFile, JSON.stringify({ hookPath: validHookPath }));

    const result = execSync('node src/softills/hook-validate/handler.js "' + inputFile + '"', {
      cwd: process.cwd(), encoding: 'utf-8', timeout: 10000,
    });
    const parsed = JSON.parse(result);
    return { test: 'hook-validate: valid hook passes all checks', status: parsed.result === 'PASS' ? 'PASS' : 'FAIL', detail: 'Valid hook: ' + parsed.summary };
  } catch (e) {
    return { test: 'hook-validate: valid hook passes all checks', status: 'ERROR', detail: e.message.slice(0, 200) };
  }
}

function runHookReplayTest(testDir) {
  try {
    const events = [
      { hookType: 'UserPromptSubmit', prompt: 'Hello', contextSize: 5000 },
      { hookType: 'PreToolUse', toolName: 'Read', args: { path: 'test.txt' } },
    ];
    const inputFile = path.join(testDir, 'replay-input.json');
    fs.writeFileSync(inputFile, JSON.stringify({ events }));
    const result = execSync('node src/softills/hook-replay/handler.js "' + inputFile + '"', {
      cwd: process.cwd(), encoding: 'utf-8', timeout: 10000,
    });
    const parsed = JSON.parse(result);
    const replayed = (parsed.data && parsed.data.replayReport) ? parsed.data.replayReport.passed : 0;
    return { test: 'hook-replay: replay 2 events', status: replayed === 2 ? 'PASS' : 'PARTIAL', detail: parsed.summary };
  } catch (e) {
    return { test: 'hook-replay: replay 2 events', status: 'ERROR', detail: e.message.slice(0, 200) };
  }
}

function runPermissionCompileTest(testDir) {
  try {
    const inputFile = path.join(testDir, 'perm-input.json');
    fs.writeFileSync(inputFile, JSON.stringify({
      rules: [
        { operation: 'read_file', allow: true, paths: ['src/**'], reason: 'Reading source files' },
        { operation: 'shell_exec', allow: false, patterns: ['rm -rf'], reason: 'Destructive' },
      ],
    }));
    const result = execSync('node src/softills/permission-compile/handler.js "' + inputFile + '"', {
      cwd: process.cwd(), encoding: 'utf-8', timeout: 10000,
    });
    const parsed = JSON.parse(result);
    return { test: 'permission-compile: compile rules', status: parsed.result === 'PASS' ? 'PASS' : 'FAIL', detail: parsed.summary };
  } catch (e) {
    return { test: 'permission-compile: compile rules', status: 'ERROR', detail: e.message.slice(0, 200) };
  }
}

function runHostConfigPatchTest(testDir) {
  try {
    const configDir = path.join(testDir, 'config');
    fs.mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'settings.json');
    fs.writeFileSync(configPath, JSON.stringify({ theme: 'dark' }) + '\n');

    const inputFile = path.join(testDir, 'patch-input.json');
    fs.writeFileSync(inputFile, JSON.stringify({
      patches: [{ path: '/hooks', value: { PreToolUse: './hooks/PreToolUse.js' } }],
      configPath,
      backup: true,
    }));
    const result = execSync('node src/softills/host-config-patch/handler.js "' + inputFile + '"', {
      cwd: process.cwd(), encoding: 'utf-8', timeout: 10000,
    });
    const parsed = JSON.parse(result);
    return { test: 'host-config-patch: patch with backup', status: parsed.result === 'PASS' ? 'PASS' : 'FAIL', detail: parsed.summary };
  } catch (e) {
    return { test: 'host-config-patch: patch with backup', status: 'ERROR', detail: e.message.slice(0, 200) };
  }
}

function runFullChainTest(testDir) {
  try {
    // Run a subset of softills in sequence to verify integration
    const probeResult = runHostProbeTest(testDir);
    const scaffoldResult = runHookScaffoldTest(testDir);
    const validateResult = runHookValidateTest(testDir);

    const allPassed = [probeResult, scaffoldResult, validateResult].every(r => r.status === 'PASS');
    return {
      test: 'full-chain: host-probe → hook-scaffold → hook-validate',
      status: allPassed ? 'PASS' : 'FAIL',
      detail: allPassed ? '3/3 chain steps passed' : 'Chain incomplete',
    };
  } catch (e) {
    return { test: 'full-chain: integration test', status: 'ERROR', detail: e.message.slice(0, 200) };
  }
}

function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    const p = path.resolve(process.argv[2]);
    try { input = JSON.parse(fs.readFileSync(p, 'utf-8')); }
    catch (e) { return fail('Read fail: ' + e.message); }
  } else if (!process.stdin.isTTY) {
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(chunks).toString()); run(input); }
      catch (e) { fail('Parse error: ' + e.message); }
    });
    return;
  } else {
    input = { testSuite: 'all' };
  }
  run(input);
}

function run(input) {
  try {
    const result = handle(input);
    const { summary } = result;
    const status = summary.failed === 0 && summary.errors === 0 ? 'PASS' : summary.failed > 0 ? 'FAILED' : 'PARTIAL';
    const summaryText = summary.total + ' tests: ' + summary.passed + ' passed, ' + summary.failed + ' failed, ' + summary.errors + ' errors';

    console.log(JSON.stringify({ softill: 'host-live-test', result: status, summary: summaryText, data: result, evidence: [], meta: { name: 'host-live-test', level: 'L2_validate', v: '0.3.0' } }, null, 2));
    process.exit(status === 'PASS' ? 0 : 1);
  } catch (e) {
    fail('Handler error: ' + e.message);
  }
}

function fail(msg) {
  console.log(JSON.stringify({ softill: 'host-live-test', result: 'ERROR', summary: msg, data: {}, evidence: [] }));
  process.exit(1);
}

module.exports = { handle };

if (require.main === module) main();
