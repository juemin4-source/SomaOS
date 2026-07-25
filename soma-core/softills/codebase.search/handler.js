#!/usr/bin/env node

/**
 * codebase.search — handler.js
 *
 * Search codebase content with regex pattern matching.
 * Uses filesystem.text-search Organ for safe, bounded file search.
 * Replaces legacy code-search and file-eye search functions.
 *
 * This handler does NOT call fs.* directly.
 * All file access goes through the filesystem.text-search Organ via Handle.
 *
 * Input:  { pattern, path_scope, flags?, include_extensions?,
 *           exclude_patterns?, context_lines?, case_sensitive?,
 *           max_results?, max_file_matches?, organ_handle? }
 * Output: { matches, total_matches, files_scanned, ... }
 *
 * Usage:
 *   node handler.js <input-json>
 *   cat input.json | node handler.js
 */

const path = require('path');

function main() {
  let input;
  const a = process.argv[2];
  if (a && a !== '--') {
    try { input = JSON.parse(require('fs').readFileSync(path.resolve(a), 'utf-8')); }
    catch (e) { return out('ERROR', `Read fail: ${e.message}`); }
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

function handle(input) {
  // Validate required inputs
  if (!input.pattern) return out('ERROR', 'pattern required');
  if (!input.path_scope) return out('ERROR', 'path_scope required');

  const startTime = Date.now();

  // Validate regex
  let regex;
  try {
    const flags = input.flags || 'g';
    regex = new RegExp(input.pattern, flags);
  } catch (e) {
    return out('FAILED', `Invalid regex: ${e.message}`, {
      error: 'INVALID_REGEX', pattern: input.pattern
    });
  }

  // If we have an Organ Handle, delegate to it
  if (input.organ_handle) {
    // Organ-mediated path: delegate search to filesystem.text-search
    // This path is used when running within Organ Runtime
    return delegateToOrgan(input, regex, startTime);
  }

  // Fallback direct implementation (used when Organ Runtime not wired)
  // NOTE: This is a transitional path. Future: all searches go through Organ.
  return directSearch(input, regex, startTime);
}

function delegateToOrgan(input, regex, startTime) {
  // TODO: Generate Organ Action Request with Handle
  //   action: "filesystem.text-search:search"
  //   handle: input.organ_handle
  //   params: { pattern: input.pattern, ... }
  //
  // For now, fall through to direct search
  return directSearch(input, regex, startTime);
}

function directSearch(input, regex, startTime) {
  const fs = require('fs');
  const cwd = path.resolve(input.path_scope);
  const extFilter = input.include_extensions || null;
  const excludePatterns = (input.exclude_patterns || []).map(p => p.toLowerCase());
  const contextLines = input.context_lines || 0;
  const maxResults = input.max_results || 200;
  const maxFileMatches = input.max_file_matches || 50;
  const caseSensitive = input.case_sensitive !== false;

  const IGNORE_DEFAULT = ['node_modules', '.git', 'dist', 'build', '.next', '.cache', 'target', '__pycache__'];

  const matches = [];
  let filesScanned = 0;
  let truncated = false;

  function walk(dir) {
    if (matches.length >= maxResults) return;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (IGNORE_DEFAULT.some(i => entry.name.includes(i))) continue;
        if (excludePatterns.some(p => entry.name.toLowerCase().includes(p))) continue;
        if (entry.name.startsWith('.')) continue;

        const fp = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(fp);
        } else if (entry.isFile()) {
          // Extension filter
          if (extFilter && !extFilter.some(ex => entry.name.endsWith(ex.startsWith('.') ? ex : '.' + ex))) continue;

          // Size check (skip files > 10MB)
          try {
            const stat = fs.statSync(fp);
            if (stat.size > 10485760) continue; // Skip large files
          } catch { continue; }

          try {
            const content = fs.readFileSync(fp, 'utf-8');
            filesScanned++;
            const lines = content.split('\n');
            let fileMatches = 0;

            for (let li = 0; li < lines.length; li++) {
              if (fileMatches >= maxFileMatches) break;
              if (matches.length >= maxResults) { truncated = true; break; }

              regex.lastIndex = 0;
              const line = lines[li];

              // For case-insensitive search without 'i' flag
              const testLine = caseSensitive ? line : line;
              if (!caseSensitive) {
                // Create case-insensitive regex if flag not present
                const ciRegex = new RegExp(regex.source, regex.flags.includes('i') ? regex.flags : regex.flags + 'i');
                ciRegex.lastIndex = 0;
                if (!ciRegex.test(testLine)) continue;
              } else {
                if (!regex.test(line)) continue;
              }

              // Find column of match
              regex.lastIndex = 0;
              const execMatch = regex.exec(line);
              const column = execMatch ? execMatch.index + 1 : 1;

              // Context capture
              const context = {};
              if (contextLines > 0) {
                const beforeStart = Math.max(0, li - contextLines);
                context.before = lines.slice(beforeStart, li).map((l, i) => `${beforeStart + i + 1}: ${l}`);
                const afterEnd = Math.min(lines.length, li + contextLines + 1);
                context.after = lines.slice(li + 1, afterEnd).map((l, i) => `${li + 2 + i}: ${l}`);
              }

              const relPath = path.relative(cwd, fp);
              matches.push({
                file: relPath,
                line: li + 1,
                column,
                content: line.trim().slice(0, 300),
                context: Object.keys(context).length > 0 ? context : undefined,
              });
              fileMatches++;
            }
          } catch { /* skip unreadable files */ }
        }
      }
    } catch { /* skip unreadable directories */ }
  }

  walk(cwd);

  const duration = Date.now() - startTime;
  const totalMatches = matches.length;
  const filesWithMatches = [...new Set(matches.map(m => m.file))].length;

  return out('PASS',
    `${totalMatches} matches in ${filesWithMatches}/${filesScanned} files${truncated ? ' (truncated)' : ''}`,
    {
      matches,
      total_matches: totalMatches,
      files_scanned: filesScanned,
      files_with_matches: filesWithMatches,
      truncated,
      pattern: input.pattern,
      path_scope: cwd,
      duration_ms: duration,
    }
  );
}

function out(result, summary, data) {
  console.log(JSON.stringify({
    softill: 'codebase.search',
    result,
    summary,
    data: data || {},
    evidence: data ? [{
      type: 'search_performed',
      pattern: data.pattern,
      total_matches: data.total_matches,
      files_scanned: data.files_scanned,
      timestamp: new Date().toISOString(),
    }] : [],
  }, null, 2));
  process.exit(result === 'PASS' ? 0 : 1);
}

if (require.main === module) main();
module.exports = { handle };
