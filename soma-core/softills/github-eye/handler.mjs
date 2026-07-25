#!/usr/bin/env node
/**
 * github-eye — handler.mjs
 * GitHub API 查询（rate-limit、仓库、issues、PRs、commits、代码搜索）
 */
import { get } from '../_shared/connector.mjs';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

function main() {
  let input;
  const a = process.argv[2];
  if (a && a !== '--') {
    try { input = JSON.parse(readFileSync(resolve(a), 'utf-8')); }
    catch (e) { return out('ERROR', 'Read: ' + e.message); }
  } else {
    const c = [];
    process.stdin.on('data', d => c.push(d));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(c).toString()); handle(input); }
      catch (e) { out('ERROR', 'Parse: ' + e.message); }
    });
    return;
  }
  handle(input);
}

async function handle(input) {
  const token = input.token || input.GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const action = input.action || 'rate-limit';
  const owner = input.owner || input.repo?.split('/')[0] || '';
  const repo = input.repo || (owner ? '' : '');
  const headers = { 'Accept': 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const BASE = 'https://api.github.com';

  try {
    switch (action) {
      case 'rate-limit': {
        const data = await get(`${BASE}/rate_limit`, headers);
        const core = data?.resources?.core;
        return out('PASS', `GitHub API: ${core?.remaining}/${core?.limit} remaining`, { remaining: core?.remaining, limit: core?.limit, reset: new Date(core?.reset * 1000).toISOString(), hasToken: !!token });
      }
      case 'repos':
      case 'repo': {
        if (!input.fullName && !(owner && repo)) return out('ERROR', 'repo required (full_name or owner/name)');
        const full = input.fullName || `${owner}/${repo}`;
        const data = await get(`${BASE}/repos/${full}`, headers);
        return out('PASS', `${data.full_name}: ${data.description?.slice(0, 60) || data.language || 'ok'}`, {
          name: data.full_name, stars: data.stargazers_count, language: data.language, description: data.description?.slice(0, 200),
          forks: data.forks_count, issues: data.open_issues_count, url: data.html_url, defaultBranch: data.default_branch,
        });
      }
      case 'issues': {
        if (!(owner && repo)) return out('ERROR', 'owner and repo required');
        const state = input.state || 'open';
        const data = await get(`${BASE}/repos/${owner}/${repo}/issues?state=${state}&per_page=${input.limit || 10}`, headers);
        const issues = (Array.isArray(data) ? data : []).map(i => ({ number: i.number, title: i.title?.slice(0, 100), state: i.state, user: i.user?.login, labels: i.labels?.map(l => l.name), url: i.html_url }));
        return out('PASS', `${issues.length} ${state} issues`, { issues, count: issues.length });
      }
      case 'pulls':
      case 'prs': {
        if (!(owner && repo)) return out('ERROR', 'owner and repo required');
        const state = input.state || 'open';
        const data = await get(`${BASE}/repos/${owner}/${repo}/pulls?state=${state}&per_page=${input.limit || 10}`, headers);
        const prs = (Array.isArray(data) ? data : []).map(p => ({ number: p.number, title: p.title?.slice(0, 100), state: p.state, user: p.user?.login, comments: p.comments, url: p.html_url }));
        return out('PASS', `${prs.length} ${state} PRs`, { pulls: prs, count: prs.length });
      }
      case 'commits': {
        if (!(owner && repo)) return out('ERROR', 'owner and repo required');
        const data = await get(`${BASE}/repos/${owner}/${repo}/commits?per_page=${input.limit || 10}`, headers);
        const commits = (Array.isArray(data) ? data : []).map(c => ({ sha: c.sha?.slice(0, 7), message: c.commit?.message?.split('\n')[0]?.slice(0, 100), author: c.commit?.author?.name, date: c.commit?.author?.date }));
        return out('PASS', `${commits.length} commits`, { commits });
      }
      case 'search': {
        if (!input.query) return out('ERROR', 'query required');
        const data = await get(`${BASE}/search/code?q=${encodeURIComponent(input.query)}&per_page=${input.limit || 5}`, headers);
        const items = (data?.items || []).map(i => ({ repo: i.repository?.full_name, path: i.path, url: i.html_url }));
        return out('PASS', `${data?.total_count || 0} results for "${input.query}"`, { totalCount: data?.total_count, items, truncated: (data?.items || []).length > 5 });
      }
      default:
        return out('ERROR', `Unknown action: ${action}`);
    }
  } catch (e) { return out('ERROR', e.message.slice(0, 200)); }
}

function out(r, s, d) {
  console.log(JSON.stringify({ softill: 'github-eye', result: r, summary: s, data: d || {}, evidence: [] }, null, 2));
  process.exit(r === 'PASS' ? 0 : 1);
}

const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();
