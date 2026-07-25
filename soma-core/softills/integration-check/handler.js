#!/usr/bin/env node
/**
 * integration-check — handler.js
 *
 * 集成就绪性检查。只检查，不自动修改。
 *
 * 检查维度：
 *   1. Asset Registry 可发现性  — asset-index.json / softill-registry.json
 *   2. Package Export 可达性    — handler 是否 export 了正确的 handle 函数
 *   3. Handler 是否存在         — handler 文件路径可用
 *   4. 依赖是否满足              — 注册的依赖是否都可发现
 *   5. Host 是否支持             — Runtime 版本 / 平台兼容
 *   6. 路径是否自包含            — 所有 import/require 在项目内
 *   7. 绝对路径逃逸              — 检测 __dirname / process.cwd / import.meta.url 滥用
 *
 * 输入: {
 *   target: string,           // 目标名称 (softill name / package name / combo name)
 *   type: 'softill' | 'combo' | 'package',
 *   hostVersion?: string,     // 目标 Runtime 版本, 默认 detected
 *   registryBase?: string,    // registry 路径覆盖
 *   projectRoot?: string,     // 项目根路径覆盖
 *   strict?: boolean          // 严格模式
 * }
 *
 * 输出: {
 *   result: 'PASS' | 'WARN' | 'FAIL' | 'ERROR',
 *   checkResults: [{
 *     dimension: string,
 *     status: 'pass' | 'warn' | 'fail',
 *     detail: string,
 *     evidence?: any
 *   }]
 * }
 *
 * 用法: node handler.js <input-json>
 */

const fs = require('fs');
const path = require('path');

// ─── Main Entry ───────────────────────────────────────────────────────────────

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

// ─── Path Resolution ───────────────────────────────────────────────────────────

function findProjectRoot(startDir) {
  let current = path.resolve(startDir);
  for (let i = 0; i < 64; i++) {
    const pkgPath = path.join(current, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === 'somaos-combo-lab') return current;
      } catch { /* skip */ }
    }
    const sessionPath = path.join(current, '.soma', 'session.json');
    if (fs.existsSync(sessionPath)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(process.cwd());
}

// ─── Registry Check ────────────────────────────────────────────────────────────

function checkRegistryDiscoverability(target, registryBase) {
  const checks = [];

  // 1. Check asset-index.json
  const projectRoot = registryBase ? path.resolve(registryBase) : findProjectRoot(process.cwd());
  const assetIndexPath = path.join(projectRoot, 'packages', 'assets', 'registry', 'asset-index.json');

  if (fs.existsSync(assetIndexPath)) {
    try {
      const index = JSON.parse(fs.readFileSync(assetIndexPath, 'utf-8'));
      const assets = index.assets || {};
      if (assets[target]) {
        const entry = assets[target];
        checks.push({
          dimension: 'asset_index_discoverability',
          status: 'pass',
          detail: `Target '${target}' found in asset-index.json (type: ${entry.type || 'unknown'}, status: ${entry.status || 'unknown'})`,
          evidence: { path: assetIndexPath, entry },
        });
      } else {
        // Check by name pattern (combo.xxx matches against type)
        const matches = Object.entries(assets).filter(([key, val]) =>
          key === target || val.id === target || key.includes(target)
        );
        if (matches.length > 0) {
          checks.push({
            dimension: 'asset_index_discoverability',
            status: 'warn',
            detail: `Target '${target}' not exact match in asset-index.json, but ${matches.length} partial match(es) found`,
            evidence: { path: assetIndexPath, matches: matches.map(([k]) => k) },
          });
        } else {
          checks.push({
            dimension: 'asset_index_discoverability',
            status: 'fail',
            detail: `Target '${target}' not found in asset-index.json at ${assetIndexPath}`,
            evidence: { path: assetIndexPath },
          });
        }
      }
    } catch (e) {
      checks.push({
        dimension: 'asset_index_discoverability',
        status: 'warn',
        detail: `asset-index.json exists but could not be parsed: ${e.message}`,
        evidence: { path: assetIndexPath },
      });
    }
  } else {
    checks.push({
      dimension: 'asset_index_discoverability',
      status: fail,
      detail: `asset-index.json not found at ${assetIndexPath}`,
    });
  }

  // 2. Check softill-registry.json
  const registryPaths = [
    path.join(projectRoot, 'packages', 'kernel', 'src', 'registry', 'softill-registry.json'),
    path.join(projectRoot, 'src', 'softills', 'softill-registry.json'),
  ];

  let foundInRegistry = false;
  for (const rp of registryPaths) {
    if (!fs.existsSync(rp)) continue;
    try {
      const reg = JSON.parse(fs.readFileSync(rp, 'utf-8'));
      const softills = reg.softills || {};
      if (softills[target]) {
        checks.push({
          dimension: 'registry_discoverability',
          status: 'pass',
          detail: `Target '${target}' found in registry: ${rp}`,
          evidence: { path: rp, level: softills[target].level, status: reg.status },
        });
        foundInRegistry = true;
        break;
      }
    } catch { /* skip unparseable */ }
  }

  if (!foundInRegistry) {
    checks.push({
      dimension: 'registry_discoverability',
      status: checks.some(c => c.dimension === 'asset_index_discoverability' && c.status === 'pass') ? 'warn' : 'fail',
      detail: `Target '${target}' not found in any softill registry (checked ${registryPaths.length} paths)`,
    });
  }

  return checks;
}

// ─── Handler Existence Check ───────────────────────────────────────────────────

function checkHandlerExistence(target, projectRoot) {
  const checks = [];
  const searchDirs = [
    path.join(projectRoot, 'packages', 'kernel', 'src', 'softills'),
    path.join(projectRoot, 'packages', 'assets', 'softills'),
    path.join(projectRoot, 'src', 'softills'),
  ];

  const handlerVariants = ['handler.mjs', 'handler.cjs', 'handler.js', 'handler.py'];
  let foundHandler = null;
  let foundDir = null;

  for (const dir of searchDirs) {
    const targetDir = path.join(dir, target);
    if (!fs.existsSync(targetDir)) continue;
    if (!fs.statSync(targetDir).isDirectory()) continue;
    foundDir = targetDir;

    for (const h of handlerVariants) {
      const hp = path.join(targetDir, h);
      if (fs.existsSync(hp)) {
        foundHandler = hp;
        break;
      }
    }
    if (foundHandler) break;
  }

  if (foundHandler) {
    const stat = fs.statSync(foundHandler);
    checks.push({
      dimension: 'handler_existence',
      status: 'pass',
      detail: `Handler found: ${foundHandler} (${stat.size} bytes, modified ${stat.mtime})`,
      evidence: { path: foundHandler, size: stat.size, handlerFile: path.basename(foundHandler) },
    });
  } else if (foundDir) {
    const dirContents = fs.readdirSync(foundDir);
    checks.push({
      dimension: 'handler_existence',
      status: 'fail',
      detail: `Target directory exists at ${foundDir} but no handler.{mjs,cjs,js,py} found. Contents: ${dirContents.slice(0, 10).join(', ')}`,
      evidence: { path: foundDir, contents: dirContents.slice(0, 20) },
    });
  } else {
    checks.push({
      dimension: 'handler_existence',
      status: 'fail',
      detail: `No directory found for '${target}' in any softill location (checked ${searchDirs.length} paths)`,
      evidence: { searchDirs },
    });
  }

  return checks;
}

// ─── Package Export Check ──────────────────────────────────────────────────────

function checkPackageExport(target, projectRoot) {
  const checks = [];

  // Search for handler files
  const searchDirs = [
    path.join(projectRoot, 'packages', 'kernel', 'src', 'softills'),
    path.join(projectRoot, 'packages', 'assets', 'softills'),
    path.join(projectRoot, 'src', 'softills'),
  ];

  let handlerPath = null;
  for (const dir of searchDirs) {
    const targetDir = path.join(dir, target);
    if (!fs.existsSync(targetDir)) continue;
    for (const h of ['handler.mjs', 'handler.cjs', 'handler.js']) {
      const hp = path.join(targetDir, h);
      if (fs.existsSync(hp)) { handlerPath = hp; break; }
    }
    if (handlerPath) break;
  }

  if (!handlerPath) {
    checks.push({
      dimension: 'package_export',
      status: 'fail',
      detail: `Cannot check export: no handler file found for '${target}'`,
    });
    return checks;
  }

  try {
    const content = fs.readFileSync(handlerPath, 'utf-8');

    // Check for ESM named export: export async function handle / export { handle }
    const hasEsmHandle = /export\s+(async\s+)?function\s+handle\b/.test(content)
      || /export\s*{\s*handle\s*}/.test(content)
      || /export\s+const\s+handle\s*=/.test(content);

    // Check for CJS export: module.exports = { handle } / exports.handle
    const hasCjsHandle = /module\.exports\s*=\s*\{[^}]*handle[^}]*}/.test(content)
      || /exports\.handle\s*=/.test(content);

    // Check for default export function
    const hasDefaultExport = /export\s+default\s+(async\s+)?function\s+handle\b/.test(content);

    if (hasEsmHandle) {
      checks.push({
        dimension: 'package_export',
        status: 'pass',
        detail: `Handler exports 'handle' as named ESM export (${handlerPath.endsWith('.mjs') ? 'ESM module' : 'CJS file with ESM syntax'})`,
        evidence: { handlerPath, exportStyle: 'esm_named' },
      });
    } else if (hasCjsHandle) {
      checks.push({
        dimension: 'package_export',
        status: 'pass',
        detail: `Handler exports 'handle' as CJS export (${handlerPath})`,
        evidence: { handlerPath, exportStyle: 'cjs' },
      });
    } else if (hasDefaultExport) {
      checks.push({
        dimension: 'package_export',
        status: 'warn',
        detail: `Handler uses 'export default function handle' — not compliant with Handler ABI v1 (named export required). See: packages/kernel/src/contracts/handler-abi-v1.md`,
        evidence: { handlerPath, exportStyle: 'esm_default' },
      });
    } else {
      // Check if any handle-like export exists
      const anyExport = content.match(/export\s+(.*?)\s*function\s+\w+/);
      checks.push({
        dimension: 'package_export',
        status: 'fail',
        detail: `Handler does not export 'handle' function. ${anyExport ? `Found export: ${anyExport[0].trim()}` : 'No named exports found'}`,
        evidence: { handlerPath, contentPreview: content.slice(0, 500) },
      });
    }
  } catch (e) {
    checks.push({
      dimension: 'package_export',
      status: 'error',
      detail: `Could not read handler file: ${e.message}`,
    });
  }

  return checks;
}

// ─── Dependency Satisfaction Check ─────────────────────────────────────────────

function checkDependencySatisfaction(target, projectRoot) {
  const checks = [];

  // Read the softill.json if it exists
  const searchDirs = [
    path.join(projectRoot, 'packages', 'kernel', 'src', 'softills'),
    path.join(projectRoot, 'packages', 'assets', 'softills'),
    path.join(projectRoot, 'src', 'softills'),
  ];

  let softillJson = null;
  for (const dir of searchDirs) {
    const sjPath = path.join(dir, target, 'softill.json');
    if (fs.existsSync(sjPath)) {
      try {
        softillJson = JSON.parse(fs.readFileSync(sjPath, 'utf-8'));
      } catch { /* skip */ }
      break;
    }
  }

  // Also check registry
  const registryPath = path.join(projectRoot, 'packages', 'kernel', 'src', 'registry', 'softill-registry.json');
  let registryEntry = null;
  if (fs.existsSync(registryPath)) {
    try {
      const reg = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      registryEntry = reg.softills?.[target] || null;
    } catch { /* skip */ }
  }

  // Collect dependency names from all sources
  const depNames = new Set();
  if (softillJson?.capabilities) {
    // Capabilities that reference other softills
    for (const [capName, capConfig] of Object.entries(softillJson.capabilities)) {
      if (typeof capConfig === 'object' && capConfig.required) {
        depNames.add(capName);
      }
    }
  }
  if (registryEntry?.depends) {
    for (const d of registryEntry.depends) depNames.add(d);
  }

  // Also check asset-index.json dependencies
  const assetIndexPath = path.join(projectRoot, 'packages', 'assets', 'registry', 'asset-index.json');
  if (fs.existsSync(assetIndexPath)) {
    try {
      const index = JSON.parse(fs.readFileSync(assetIndexPath, 'utf-8'));
      const assetEntry = index.assets?.[target];
      if (assetEntry?.dependencies) {
        for (const d of assetEntry.dependencies) depNames.add(d);
      }
    } catch { /* skip */ }
  }

  if (depNames.size === 0) {
    checks.push({
      dimension: 'dependency_satisfaction',
      status: 'pass',
      detail: 'No dependencies declared — nothing to check',
    });
    return checks;
  }

  // Check each dependency
  const assetIndexPath2 = path.join(projectRoot, 'packages', 'assets', 'registry', 'asset-index.json');
  const assetIndex = fs.existsSync(assetIndexPath2)
    ? JSON.parse(fs.readFileSync(assetIndexPath2, 'utf-8'))
    : { assets: {} };
  const assets = assetIndex.assets || {};

  let satisfied = 0;
  let unsatisfied = [];
  let unknown = [];

  for (const dep of depNames) {
    // Check asset index
    if (assets[dep]) {
      satisfied++;
      continue;
    }
    // Check if a directory exists
    let depExists = false;
    for (const dir of searchDirs) {
      if (fs.existsSync(path.join(dir, dep)) && fs.statSync(path.join(dir, dep)).isDirectory()) {
        depExists = true;
        break;
      }
    }
    if (depExists) {
      satisfied++;
    } else {
      unsatisfied.push(dep);
    }
  }

  if (unsatisfied.length === 0) {
    checks.push({
      dimension: 'dependency_satisfaction',
      status: 'pass',
      detail: `All ${depNames.size} dependenc${depNames.size === 1 ? 'y' : 'ies'} satisfied`,
      evidence: { total: depNames.size, satisfied },
    });
  } else {
    const failCount = unsatisfied.length;
    checks.push({
      dimension: 'dependency_satisfaction',
      status: 'fail',
      detail: `${failCount} dependenc${failCount === 1 ? 'y' : 'ies'} unsatisfied: ${unsatisfied.join(', ')}`,
      evidence: { total: depNames.size, satisfied, unsatisfied },
    });
  }

  return checks;
}

// ─── Host Support Check ────────────────────────────────────────────────────────

function checkHostSupport(target, hostVersion, projectRoot) {
  const checks = [];

  // Determine available runtime features
  const features = {
    hasOrganRuntime: fs.existsSync(path.join(projectRoot, 'packages', 'runtime', 'src', 'organ')),
    hasKernel: fs.existsSync(path.join(projectRoot, 'packages', 'kernel')),
    hasRegistry: fs.existsSync(path.join(projectRoot, 'packages', 'kernel', 'src', 'registry', 'softill-registry.json')),
    hasAssetIndex: fs.existsSync(path.join(projectRoot, 'packages', 'assets', 'registry', 'asset-index.json')),
    nodeVersion: process.version,
    platform: process.platform,
  };

  // Check softill.json for required capabilities
  const softillJsonPath = path.join(projectRoot, 'src', 'softills', target, 'softill.json');
  let requiredCapabilities = [];

  if (fs.existsSync(softillJsonPath)) {
    try {
      const sj = JSON.parse(fs.readFileSync(softillJsonPath, 'utf-8'));
      const caps = sj.capabilities || {};
      for (const [cap, config] of Object.entries(caps)) {
        if (typeof config === 'object' && config.required) {
          requiredCapabilities.push(cap);
        }
      }
    } catch { /* skip */ }
  }

  // Check Organ capabilities
  const organProfilesDir = path.join(projectRoot, 'packages', 'runtime', 'src', 'organ', 'profiles');
  const availableProfiles = [];
  if (fs.existsSync(organProfilesDir)) {
    for (const f of fs.readdirSync(organProfilesDir)) {
      if (f.endsWith('-profile.mjs') || f.endsWith('-profile.js')) {
        availableProfiles.push(f.replace(/-(profile\.mjs|profile\.js)$/, '').replace(/-/g, '.'));
      }
    }
  }

  // Check each required capability against available profiles
  if (requiredCapabilities.length > 0) {
    const missingCaps = requiredCapabilities.filter(cap =>
      !availableProfiles.some(p => cap.startsWith(p) || p.startsWith(cap))
    );

    if (missingCaps.length === 0) {
      checks.push({
        dimension: 'host_support',
        status: 'pass',
        detail: `All required capabilities (${requiredCapabilities.join(', ')}) supported by available profiles (${availableProfiles.length} total)`,
        evidence: { required: requiredCapabilities, available: availableProfiles, features },
      });
    } else {
      checks.push({
        dimension: 'host_support',
        status: 'fail',
        detail: `Missing required capabilities: ${missingCaps.join(', ')}. Available profiles: ${availableProfiles.join(', ')}`,
        evidence: { missing: missingCaps, available: availableProfiles, features },
      });
    }
  } else {
    // General capability check: report available profiles
    checks.push({
      dimension: 'host_support',
      status: 'pass',
      detail: `Host runtime: Node ${features.nodeVersion}, platform: ${features.platform}. ${availableProfiles.length} organ profiles available`,
      evidence: { features, availableProfiles },
    });
  }

  return checks;
}

// ─── Path Self-Containment Check ───────────────────────────────────────────────

function checkPathSelfContainment(target, projectRoot) {
  const checks = [];

  // Find handler file
  const searchDirs = [
    path.join(projectRoot, 'packages', 'kernel', 'src', 'softills'),
    path.join(projectRoot, 'packages', 'assets', 'softills'),
    path.join(projectRoot, 'src', 'softills'),
  ];

  let handlerPath = null;
  for (const dir of searchDirs) {
    const p = path.join(dir, target, 'handler.js');
    if (fs.existsSync(p)) { handlerPath = p; break; }
    const p2 = path.join(dir, target, 'handler.mjs');
    if (fs.existsSync(p2)) { handlerPath = p2; break; }
    const p3 = path.join(dir, target, 'handler.cjs');
    if (fs.existsSync(p3)) { handlerPath = p3; break; }
  }

  if (!handlerPath) {
    checks.push({
      dimension: 'path_self_containment',
      status: 'pass',
      detail: 'No handler file to scan',
    });
    return checks;
  }

  try {
    const content = fs.readFileSync(handlerPath, 'utf-8');
    const handlerDir = path.dirname(handlerPath);

    // Check require / import statements
    const importRegex = /(?:require\s*\(\s*['"])([^'"]+)(?:['"]\s*\))|(?:from\s+['"])([^'"]+)(?:['"])/g;
    const externalImports = [];
    const selfContained = [];
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1] || match[2];
      if (!importPath) continue;

      // Relative import (starts with ./ or ../)
      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        const resolved = path.resolve(handlerDir, importPath);
        if (resolved.startsWith(projectRoot)) {
          selfContained.push(importPath);
        } else {
          externalImports.push({ importPath, resolved, issue: 'Import resolves outside project root' });
        }
      }
      // Absolute import (starts with /)
      else if (importPath.startsWith('/')) {
        externalImports.push({ importPath, issue: 'Absolute path import' });
      }
      // Bare specifier — usually npm package, OK
      else if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
        selfContained.push(importPath); // npm package
      }
    }

    if (externalImports.length === 0) {
      checks.push({
        dimension: 'path_self_containment',
        status: 'pass',
        detail: `All ${selfContained.length} import${selfContained.length === 1 ? '' : 's'} are self-contained within the project`,
        evidence: { totalImports: selfContained.length, handlerPath },
      });
    } else {
      checks.push({
        dimension: 'path_self_containment',
        status: 'fail',
        detail: `${externalImports.length} import${externalImports.length === 1 ? '' : 's'} resolve outside the project root`,
        evidence: { handlerPath, externalImports },
      });
    }
  } catch (e) {
    checks.push({
      dimension: 'path_self_containment',
      status: 'error',
      detail: `Could not scan handler: ${e.message}`,
    });
  }

  return checks;
}

// ─── Absolute Path Escape Check ────────────────────────────────────────────────

function checkAbsolutePathEscape(target, projectRoot) {
  const checks = [];

  // Find handler file
  const searchDirs = [
    path.join(projectRoot, 'packages', 'kernel', 'src', 'softills'),
    path.join(projectRoot, 'packages', 'assets', 'softills'),
    path.join(projectRoot, 'src', 'softills'),
  ];

  let handlerPath = null;
  for (const dir of searchDirs) {
    for (const ext of ['handler.mjs', 'handler.cjs', 'handler.js']) {
      const p = path.join(dir, target, ext);
      if (fs.existsSync(p)) { handlerPath = p; break; }
    }
    if (handlerPath) break;
  }

  if (!handlerPath) {
    checks.push({
      dimension: 'absolute_path_escape',
      status: 'pass',
      detail: 'No handler file to scan',
    });
    return checks;
  }

  try {
    const content = fs.readFileSync(handlerPath, 'utf-8');

    // Patterns that indicate absolute path usage
    const escapePatterns = [
      { pattern: /__dirname/g, risk: 'high', detail: 'Uses __dirname for path derivation (bypasses root resolution)' },
      { pattern: /__filename/g, risk: 'high', detail: 'Uses __filename for path derivation (bypasses root resolution)' },
      { pattern: /process\.cwd\(\)/g, risk: 'high', detail: 'Uses process.cwd() for path derivation (runtime environment dependent)' },
      { pattern: /import\.meta\.url/g, risk: 'medium', detail: 'Uses import.meta.url for path derivation (alternative to __dirname)' },
      { pattern: /path\.resolve\(\s*['"]\//g, risk: 'high', detail: 'Uses path.resolve with absolute root reference' },
      { pattern: /fs\.readFileSync\(\s*['"]\//g, risk: 'high', detail: 'Uses fs.readFileSync with absolute path (no root-relative resolution)' },
      { pattern: /fs\.writeFileSync\(\s*['"]\//g, risk: 'high', detail: 'Uses fs.writeFileSync with absolute path (no root-relative resolution)' },
      { pattern: /require\(\s*['"]\//g, risk: 'high', detail: 'Require from absolute path (no root-relative resolution)' },
    ];

    const findings = [];
    for (const ep of escapePatterns) {
      const matches = content.match(ep.pattern);
      if (matches) {
        findings.push({ pattern: ep.pattern.source.slice(0, 40), count: matches.length, risk: ep.risk, detail: ep.detail });
      }
    }

    if (findings.length === 0) {
      checks.push({
        dimension: 'absolute_path_escape',
        status: 'pass',
        detail: 'No absolute path escape patterns detected',
        evidence: { handlerPath, patternsScanned: escapePatterns.length },
      });
    } else {
      const highRisk = findings.filter(f => f.risk === 'high');
      const mediumRisk = findings.filter(f => f.risk === 'medium');

      checks.push({
        dimension: 'absolute_path_escape',
        status: highRisk.length > 0 ? 'fail' : mediumRisk.length > 0 ? 'warn' : 'pass',
        detail: `${findings.length} absolute path pattern${findings.length === 1 ? '' : 's'} detected (${highRisk.length} high, ${mediumRisk.length} medium). ` +
          `Root resolver (root-resolver.mjs) should be used instead.`,
        evidence: { handlerPath, findings, totalHighRisk: highRisk.length, totalMediumRisk: mediumRisk.length },
      });
    }
  } catch (e) {
    checks.push({
      dimension: 'absolute_path_escape',
      status: 'error',
      detail: `Could not scan handler: ${e.message}`,
    });
  }

  return checks;
}

// ─── Main Handler ──────────────────────────────────────────────────────────────

function handle(input) {
  if (!input || !input.target) {
    return out('ERROR', 'target is required (softill name, combo name, or package name)');
  }

  const target = input.target;
  const projectRoot = input.projectRoot ? path.resolve(input.projectRoot) : findProjectRoot(process.cwd());
  const hostVersion = input.hostVersion || 'detected';
  const strict = input.strict !== false;

  // Run all check dimensions
  const allChecks = [];

  // 1. Asset Registry discoverability
  allChecks.push(...checkRegistryDiscoverability(target, projectRoot));

  // 2. Handler existence
  allChecks.push(...checkHandlerExistence(target, projectRoot));

  // 3. Package export reachability
  allChecks.push(...checkPackageExport(target, projectRoot));

  // 4. Dependency satisfaction
  allChecks.push(...checkDependencySatisfaction(target, projectRoot));

  // 5. Host support
  allChecks.push(...checkHostSupport(target, hostVersion, projectRoot));

  // 6. Path self-containment
  allChecks.push(...checkPathSelfContainment(target, projectRoot));

  // 7. Absolute path escape
  allChecks.push(...checkAbsolutePathEscape(target, projectRoot));

  // Aggregate results
  const totals = { pass: 0, warn: 0, fail: 0, error: 0 };
  for (const c of allChecks) {
    if (totals[c.status] !== undefined) totals[c.status]++;
  }

  const result = totals.fail > 0 ? 'FAIL'
    : totals.error > 0 ? 'ERROR'
    : totals.warn > 0 ? 'WARN'
    : 'PASS';

  const summary = `${result}: ${allChecks.length} check${allChecks.length === 1 ? '' : 's'} ` +
    `(${totals.pass} pass, ${totals.warn} warn, ${totals.fail} fail, ${totals.error} error)`;

  return out(result, summary, {
    target,
    type: input.type || 'auto',
    hostVersion,
    projectRoot,
    strict,
    checks: allChecks,
    stats: totals,
  });
}

// ─── Output ────────────────────────────────────────────────────────────────────

function out(result, summary, data) {
  console.log(JSON.stringify({
    softill: 'integration-check',
    result,
    summary,
    data: data || {},
    evidence: [
      {
        type: 'integration-check',
        timestamp: new Date().toISOString(),
        target: data?.target || '',
        stats: data?.stats || null,
      },
    ],
  }, null, 2));
  process.exit(result === 'ERROR' ? 1 : 0);
}

// ─── Exports (Handler ABI v1 compliant) ─────────────────────────────────────────

module.exports = {
  handle,
  checkRegistryDiscoverability,
  checkHandlerExistence,
  checkPackageExport,
  checkDependencySatisfaction,
  checkHostSupport,
  checkPathSelfContainment,
  checkAbsolutePathEscape,
};
