#!/usr/bin/env node
/**
 * hook-replay — handler.js
 *
 * Replay hook event logs.
 * Reads recorded events from a log file, re-adapts per event taxonomy,
 * verifies adaptation correctness, generates replay report.
 * 级别: L1_transform (corrected from auto-detected L4_state)
 * 生成: meta-softill blueprint (v0.2 七面元器)
 */

const fs = require('fs');
const path = require('path');

const ADAPTER_EVENT_MAP = {
  UserPromptSubmit: 'session_start',
  PreToolUse: 'tool_preamble',
  PostToolUse: 'tool_result',
  PostToolUseFailure: 'tool_error',
  Stop: 'session_stop',
  PreCompact: 'context_before_trim',
};

const REQUIRED_OUTPUT_FIELDS = ['eventId', 'timestamp', 'payload', 'source'];

function handle(input) {
  if (!input) return { error: 'Input is required', valid: false };

  let events = [];
  if (input.eventLog) {
    if (typeof input.eventLog === 'string') {
      const logPath = path.resolve(input.eventLog);
      if (!fs.existsSync(logPath)) return { error: 'Event log not found: ' + logPath, valid: false };
      try {
        const raw = fs.readFileSync(logPath, 'utf-8');
        events = JSON.parse(raw);
        if (!Array.isArray(events)) events = [events];
      } catch (e) {
        return { error: 'Event log parse error: ' + e.message, valid: false };
      }
    } else if (Array.isArray(input.eventLog)) {
      events = input.eventLog;
    } else {
      events = [input.eventLog];
    }
  } else if (Array.isArray(input.events)) {
    events = input.events;
  } else {
    return { error: 'No events provided', valid: false };
  }

  const replayResults = [];
  let passed = 0, failed = 0, errors = 0;

  for (let i = 0; i < events.length; i++) {
    const result = replayEvent(events[i], i);
    replayResults.push(result);
    if (result.status === 'PASS') passed++;
    else if (result.status === 'FAIL') failed++;
    else errors++;
  }

  const replayReport = {
    totalEvents: events.length, passed, failed, errors,
    timestamp: new Date().toISOString(),
    passRate: events.length > 0 ? Math.round((passed / events.length) * 100) : 0,
  };

  return { events: replayResults, replayReport, valid: errors === 0 };
}

function replayEvent(event, index) {
  const result = { index, originalEventId: event.eventId || event.source || 'event_' + index, status: 'PASS', checks: [] };

  if (event.eventId || event.hookType) {
    result.checks.push({ name: 'has_identifier', passed: true, detail: 'Event ID: ' + (event.eventId || event.hookType) });
  } else {
    result.checks.push({ name: 'has_identifier', passed: false, detail: 'Missing event identifier' });
  }

  const adapted = mapToAdapterEvent(event);
  if (adapted) {
    result.adaptedPayload = adapted;
    result.checks.push({ name: 'adapter_mapping', passed: true, detail: 'Mapped to: ' + adapted.eventId });
  } else {
    result.checks.push({ name: 'adapter_mapping', passed: false, detail: 'Could not map to adapter event' });
  }

  if (adapted) {
    const missing = REQUIRED_OUTPUT_FIELDS.filter(f => adapted[f] === undefined);
    if (missing.length === 0) {
      result.checks.push({ name: 'output_format', passed: true, detail: 'All required fields present' });
    } else {
      result.checks.push({ name: 'output_format', passed: false, detail: 'Missing fields: ' + missing.join(', ') });
    }
  }

  if (adapted && adapted.payload) {
    const payloadStr = JSON.stringify(adapted.payload);
    const hostNames = Object.values(ADAPTER_EVENT_MAP);
    const leaked = hostNames.filter(n => payloadStr.includes(n) && n !== adapted.eventId);
    if (leaked.length === 0) {
      result.checks.push({ name: 'no_host_names', passed: true, detail: 'No host-specific names leaked' });
    } else {
      result.checks.push({ name: 'no_host_names', passed: false, detail: 'Leaked names: ' + leaked.join(', ') });
    }
  }

  if (!result.checks.every(c => c.passed)) result.status = 'FAIL';
  return result;
}

function mapToAdapterEvent(event) {
  if (!event) return null;
  let hookType = event.hookType || event.source || event.eventId || '';
  let adapterEventId = ADAPTER_EVENT_MAP[hookType];

  if (!adapterEventId) {
    if (event.prompt !== undefined) hookType = 'UserPromptSubmit';
    else if (event.toolName !== undefined && event.args !== undefined) hookType = 'PreToolUse';
    else if (event.toolName !== undefined && event.result !== undefined) hookType = 'PostToolUse';
    else if (event.toolName !== undefined && event.error !== undefined) hookType = 'PostToolUseFailure';
    else if (event.reason !== undefined) hookType = 'Stop';
    else if (event.contextSize !== undefined) hookType = 'PreCompact';
    else return null;
    adapterEventId = ADAPTER_EVENT_MAP[hookType] || 'unknown_event';
  }

  return {
    eventId: adapterEventId,
    timestamp: event.timestamp || new Date().toISOString(),
    payload: sanitizePayload(event),
    source: hookType,
  };
}

function sanitizePayload(event) {
  const payload = Object.assign({}, event);
  delete payload.eventId; delete payload.hookType; delete payload.source; delete payload.timestamp;
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'string' && value.length > 500) payload[key] = value.slice(0, 500) + '...';
  }
  return payload;
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
    return fail('Input required: provide { eventLog: path | array | events }');
  }
  run(input);
}

function run(input) {
  try {
    const result = handle(input);
    const replayReport = result.replayReport || { totalEvents: 0, passed: 0, failed: 0, errors: 0, passRate: 0 };
    const status = result.valid && replayReport.failed === 0 ? 'PASS' : 'PARTIAL';
    const summary = 'Replayed ' + replayReport.totalEvents + ' events: ' + replayReport.passed + ' passed, ' + replayReport.failed + ' failed, ' + replayReport.errors + ' errors (' + replayReport.passRate + '%)';
    console.log(JSON.stringify({ softill: 'hook-replay', result: status, summary, data: result, evidence: [], meta: { name: 'hook-replay', level: 'L1_transform', v: '0.3.0' } }, null, 2));
    process.exit(status === 'PASS' ? 0 : status === 'PARTIAL' ? 0 : 1);
  } catch (e) {
    fail('Handler error: ' + e.message);
  }
}

function fail(msg) {
  console.log(JSON.stringify({ softill: 'hook-replay', result: 'ERROR', summary: msg, data: {}, evidence: [] }));
  process.exit(1);
}

module.exports = { handle };

if (require.main === module) main();
