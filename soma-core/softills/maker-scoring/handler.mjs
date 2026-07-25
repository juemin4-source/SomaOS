#!/usr/bin/env node
/**
 * maker-scoring — handler.mjs
 *
 * 造物公式评分引擎。接收 8 个变量值，返回 W 得分 + 区间分类 + 杠杆分析。
 * 领域无关——T/A/B/η/R/S/ξ/θ 的含义由调用方定义。
 *
 * == 输入 ==
 *   {
 *     T: 1-5,        // 信任度
 *     A: 1-5,        // 入口/可发现性
 *     B: 1-5,        // 价值密度
 *     η: 0-1,        // 转化/理解率
 *     R: 1-5,        // 阻力（越低越好）
 *     S1: 0-100,     // 内耗-子维度1
 *     S2: 0-100,     // 内耗-子维度2
 *     S3: 0-100,     // 内耗-子维度3
 *     ξ: 1-5,        // 心气/维护意愿
 *     θ: -1~1,       // 方向/架构匹配度
 *     domain?: string, // 领域标签（仅用于报告）
 *     evidence?: object, // 各变量的数据来源证据
 *   }
 *
 * == 输出 ==
 *   {
 *     result: "PASS",
 *     summary: "W=12.34 — 发达期",
 *     data: { W, range, label, leverage analysis, variable detail }
 *   }
 */

function score(input) {
  // ξ mapping — 兼容 1-3 和 1-5 两种输入
  const XI_MAP = { 1.5: 2, 2.5: 4, 1: 1, 2: 3, 3: 5 };
  function mapXi(xi) {
    if (xi >= 1 && xi <= 5 && Number.isInteger(xi * 2)) {
      const mapped = XI_MAP[xi];
      if (mapped !== undefined) return mapped;
    }
    const clamped = Math.max(1, Math.min(5, xi));
    return XI_MAP[Math.round(clamped * 2) / 2] || Math.round(clamped * 2) / 2;
  }

  const T = Math.max(1, Math.min(5, input.T || 3));
  const A = Math.max(1, Math.min(5, input.A || 3));
  const B = Math.max(1, Math.min(5, input.B || 3));
  const eta = Math.max(0, Math.min(1, input.η || input.eta || 0.5));
  const R = Math.max(1, Math.min(5, input.R || 3));
  const S1 = Math.max(0, Math.min(100, input.S1 || input.s1 || 0));
  const S2 = Math.max(0, Math.min(100, input.S2 || input.s2 || 0));
  const S3 = Math.max(0, Math.min(100, input.S3 || input.s3 || 0));
  const xi = mapXi(input.ξ || input.xi || 3);
  const theta = Math.max(-1, Math.min(1, input.θ || input.theta || 0));

  // S 综合计算 + 惩罚
  let S = 0.4 * S1 + 0.3 * S2 + 0.3 * S3;
  const maxS = Math.max(S1, S2, S3);
  if (maxS > 60) S = S * (1 + (maxS - 60) / 100);

  // W 公式
  const base = (T * A * B * eta) / Math.sqrt(R);
  const morale = Math.exp((xi - 1) / 4);
  const direction = 0.3 + 0.7 * Math.cos(((1 - theta) * 90 * Math.PI) / 180);
  const W = (base * morale * direction - S) * 10;

  // 区间分类
  const RANGES = [
    { min: 25,  label: '神话期', desc: '绝少数完美系统，珍惜但警惕系统性风险' },
    { min: 15,  label: '优秀期', desc: '效率高，能量正向循环，可适度扩张' },
    { min: 8,   label: '发达期', desc: '正向运行，有积累能力，稳住基本盘' },
    { min: 4,   label: '健康期', desc: '勉强平衡，不要盲目扩张，优先降本增效' },
    { min: 1,   label: '生存期', desc: '能活但脆弱，优先优化最大短板' },
    { min: -2,  label: '挣扎期', desc: '持续亏损，靠存量或心气硬撑' },
    { min: -8,  label: '危险期', desc: '严重失血，立即止损，重新评估生存可能' },
    { min: -Infinity, label: '崩溃期', desc: '系统已死或濒死，回天乏术' },
  ];
  const range = RANGES.find(r => W >= r.min) || RANGES[RANGES.length - 1];

  // 杠杆分析 — 用内联公式计算各变量变化对 W 的影响
  function calcW(t, a, b, e, r, s1v, s2v, s3v, x, th) {
    const s = (0.4 * s1v + 0.3 * s2v + 0.3 * s3v) * (Math.max(s1v,s2v,s3v) > 60 ? (1 + (Math.max(s1v,s2v,s3v)-60)/100) : 1);
    const xiM = (x >= 1 && x <= 5 && Number.isInteger(x*2)) ? (XI_MAP[x] || x) : Math.max(1,Math.min(5,x));
    return ((t * a * b * e) / Math.sqrt(r) * Math.exp((xiM-1)/4) * (0.3 + 0.7*Math.cos(((1-th)*90*Math.PI)/180)) - s) * 10;
  }

  const baseW = W;
  const deltas = [
    { var: 'T (信任)', delta: calcW(Math.min(5,T+1),A,B,eta,R,S1,S2,S3,xi,theta) - baseW, action: '增加信任度' },
    { var: 'A (入口)', delta: calcW(T,Math.min(5,A+1),B,eta,R,S1,S2,S3,xi,theta) - baseW, action: '提升可发现性' },
    { var: 'B (价值密度)', delta: calcW(T,A,Math.min(5,B+1),eta,R,S1,S2,S3,xi,theta) - baseW, action: '提高价值密度' },
    { var: 'η (转化率)', delta: calcW(T,A,B,Math.min(1,eta+0.2),R,S1,S2,S3,xi,theta) - baseW, action: '改善理解转化率' },
    { var: 'R (阻力)', delta: calcW(T,A,B,eta,Math.max(1,R-1),S1,S2,S3,xi,theta) - baseW, action: '降低修改阻力' },
    { var: 'S (内耗)', delta: calcW(T,A,B,eta,R,Math.max(0,S1-20),Math.max(0,S2-20),Math.max(0,S3-20),xi,theta) - baseW, action: '清理技术债务' },
    { var: 'ξ (心气)', delta: calcW(T,A,B,eta,R,S1,S2,S3,Math.min(5,xi+1),theta) - baseW, action: '提升维护意愿' },
    { var: 'θ (方向)', delta: calcW(T,A,B,eta,R,S1,S2,S3,xi,Math.min(1,theta+0.5)) - baseW, action: '校准架构匹配度' },
  ];
  deltas.sort((a, b) => b.delta - a.delta);
  const leverage = deltas.map(d => ({
    variable: d.var,
    w_improvement: Math.round(d.delta * 100) / 100,
    suggested_action: d.action,
  }));

  return {
    result: 'PASS',
    summary: `W=${Math.round(W * 100) / 100} — ${range.label}`,
    data: {
      W: Math.round(W * 100) / 100,
      range: range.label,
      range_description: range.desc,
      raw_input: { T, A, B, η: eta, R, S1, S2, S3, ξ: xi, θ: theta },
      derived: { S: Math.round(S * 100) / 100 },
      leverage_analysis: leverage.slice(0, 3),
      domain: input.domain || 'generic',
    },
    evidence: input.evidence ? [{
      type: '造物公式评分',
      result: 'PASS',
      summary: `${input.evidence.sources || 'manual'} → W=${Math.round(W * 100) / 100}`,
      data: input.evidence,
    }] : [],
  };
}

// ─── CLI Entry ───
const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const out = score(input);
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  } catch (e) {
    console.log(JSON.stringify({ result: 'ERROR', summary: e.message, data: {} }));
    process.exit(1);
  }
});
