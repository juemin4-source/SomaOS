#!/usr/bin/env node
/**
 * contract-diff — handler.js
 *
 * 比对前后端契约一致性。
 * 输入: { backend: { endpoints: [...] }, frontend: { apiUsages: [...] }, strict?: boolean }
 * 输出: PASS / WARN / FAIL + 所有差异
 *
 * 用法: node handler.js <input-json> | cat input.json | node handler.js
 */

const fs = require('fs');
const path = require('path');

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
  const backend = input.backend;
  const frontend = input.frontend;
  const strict = input.strict !== false;

  if (!backend && !frontend) return out('ERROR', 'Need backend (api-contract-extractor output) or frontend (frontend-api-usage-scanner output)');
  if (backend && !backend.endpoints && !backend.apiUsages) return out('ERROR', 'backend should contain endpoints[]');
  if (frontend && !frontend.apiUsages) return out('ERROR', 'frontend should contain apiUsages[]');

  const findings = [];
  let severity = 'PASS';

  const backendEndpoints = buildEndpointMap(backend?.endpoints || backend?.apiUsages || []);
  const frontendUsages = buildEndpointMap(frontend?.apiUsages || []);

  // 1. Frontend calls endpoint that doesn't exist in backend
  for (const [key, usage] of Object.entries(frontendUsages)) {
    if (!backendEndpoints[key]) {
      findings.push({ type: 'FRONTEND_ORPHAN', severity: 'warn', endpoint: key, detail: `Frontend uses but no backend endpoint found`, files: usage.files });
    }
  }

  // 2. Backend endpoint with no frontend usage
  for (const [key, ep] of Object.entries(backendEndpoints)) {
    if (!frontendUsages[key]) {
      findings.push({ type: 'BACKEND_ORPHAN', severity: 'info', endpoint: key, detail: `Backend defines but no frontend usage found`, handler: ep.handlers });
    }
  }

  // 3. Field name mismatches (if both sides provide field info)
  if (backend?.endpoints && frontend?.apiUsages) {
    for (const bep of backend.endpoints) {
      const key = `${bep.method} /${bep.path.replace(/^\/+/, '')}`;
      const usage = frontendUsages[key];
      if (!usage) continue;

      // Check auth mismatch
      if (bep.authRequired && !usage.usesAuth) {
        findings.push({ type: 'AUTH_MISMATCH', severity: 'warn', endpoint: key, detail: `Backend requires auth but frontend doesn't send auth headers` });
      }
    }
  }

  // 4. Response field access patterns
  if (backend?.endpoints && frontend?.apiUsages) {
    for (const fUsage of frontend.apiUsages) {
      const bep = backendEndpoints[fUsage.endpoint];
      if (!bep || !fUsage.responseFields?.length) continue;
      // Common response fields that frontend often assumes
      const commonFields = ['data', 'items', 'list', 'result'];
      for (const field of commonFields) {
        if (fUsage.responseFields.includes(field)) continue;
        // Not all endpoints return all fields - this is informational only
      }
    }
  }

  // 5. Endpoint naming convention checks
  const namingIssues = [];
  for (const [key] of Object.entries(backendEndpoints)) {
    const [method, p] = key.split(' ');
    if (method === 'GET' && (p.includes('delete') || p.includes('remove'))) namingIssues.push({ endpoint: key, issue: 'GET should not contain delete/remove' });
    if (method === 'DELETE' && (p.includes('create') || p.includes('add'))) namingIssues.push({ endpoint: key, issue: 'DELETE should not contain create/add' });
    if (p.includes('//')) namingIssues.push({ endpoint: key, issue: 'Double slash in path' });
  }
  if (namingIssues.length > 0) findings.push({ type: 'NAMING_ISSUE', severity: 'info', detail: `${namingIssues.length} naming convention issues`, namingIssues });

  // Determine overall severity
  const errors = findings.filter(f => f.severity === 'error').length;
  const warnings = findings.filter(f => f.severity === 'warn').length;
  if (errors > 0) severity = 'FAIL';
  else if (warnings > 0) severity = 'WARN';

  const backendCount = Object.keys(backendEndpoints).length;
  const frontendCount = Object.keys(frontendUsages).length;
  const orphanFrontend = findings.filter(f => f.type === 'FRONTEND_ORPHAN').length;
  const orphanBackend = findings.filter(f => f.type === 'BACKEND_ORPHAN').length;

  return out(severity, `${severity}: ${findings.length} findings (${orphanFrontend} frontend-orphan, ${orphanBackend} backend-orphan, ${warnings} warnings)`, {
    findings,
    findingCount: findings.length,
    errorCount: errors,
    warnCount: warnings,
    infoCount: findings.filter(f => f.severity === 'info').length,
    backendEndpointCount: backendCount,
    frontendUsageCount: frontendCount,
    overlapCount: Math.min(backendCount, frontendCount) - orphanFrontend,
    recommendedNextAction: severity === 'FAIL' ? 'fix-errors-first' : severity === 'WARN' ? 'review-warnings' : 'aligned',
  });
}

function buildEndpointMap(items) {
  const map = {};
  if (!items) return map;
  for (const item of items) {
    const method = item.method || 'GET';
    const p = item.path || item.endpoint || '';
    const key = p.includes(' ') ? p : `${method} /${p.replace(/^\/+/, '')}`;
    if (!map[key]) map[key] = { methods: [], files: [], handlers: [], responseFields: new Set(), usesAuth: false };
    map[key].methods.push(method);
    if (item.usedBy) item.usedBy.forEach(u => { if (!map[key].files.includes(u.file || u)) map[key].files.push(u.file || u); });
    if (item.handler) map[key].handlers.push(item.handler);
    if (item.authRequired) map[key].usesAuth = true;
    if (item.responseFields) item.responseFields.forEach(f => map[key].responseFields.add(f));
    if (item.requestFields) item.requestFields.forEach(f => map[key].requestFields = map[key].requestFields || new Set());
  }
  return map;
}

function out(result, summary, data) {
  console.log(JSON.stringify({ softill: 'contract-diff', result, summary, data: data || {}, evidence: [] }, null, 2));
  process.exit(result === 'PASS' ? 0 : result === 'WARN' ? 0 : 1);
}

if (require.main === module) main();
