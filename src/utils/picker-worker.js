// picker-worker.js —— 选号计算内核（Web Worker 内运行）
// 目的：把 AiPicker 的"大量小运算"循环（AI 一直选 / 暴力模式，最多 10 万次）
// 从主线程挪到 Worker 线程，主线程 UI 完全不阻塞 = 真加速。
//
// 并行支持：主线程可起 N 个 Worker（按 navigator.hardwareConcurrency 自适应）
// 每个 Worker 跑自己区间 [from, to)，回传 best + freq，主线程汇总择优 + 合并频次。

import {
  createPickerEngine,
  createDirectPickerEngine,
  computeStats,
  generateDirect
} from './picker-engine'

let cancelled = false

// 复刻 picker-engine.buildPool（未导出，逻辑一致）：构建加权红球池
function buildPool(cfg, s, methods) {
  const useHot = (methods || []).includes('hot')
  const pool = []
  for (let n = 1; n <= cfg.redMax; n++) {
    let w = 2
    if (useHot && s.hot.includes(n)) w = 4
    if (useHot && s.cold.includes(n)) w = 1
    for (let i = 0; i < w; i++) pool.push(n)
  }
  return pool
}

// 频次统计：一注的红蓝球各加 1
function collectFreq(freq, cfg, ticket) {
  const lines = ticket.type === 'multi' && ticket.tickets ? ticket.tickets : (ticket.type === 'single' ? [ticket] : [])
  for (const ln of lines) {
    if (ln && Array.isArray(ln.red)) ln.red.forEach((v) => { const k = 'red_' + v; freq[k] = (freq[k] || 0) + 1 })
    if (ln && Array.isArray(ln.blue)) ln.blue.forEach((v) => { const k = 'blue_' + v; freq[k] = (freq[k] || 0) + 1 })
  }
}

// 普通乐透型（双色球/大乐透）—— 在 [from, to) 区间内选号
function runLotto(cfg, draws, play, methods, target, from, to, violent) {
  const engine = createPickerEngine(cfg, methods)
  const s = computeStats(cfg, draws)
  const pool = buildPool(cfg, s, methods)
  const freq = violent ? {} : null
  let best = null
  let hitOnce = false
  let stopped = false
  // 总次数 = to - from
  const total = to - from
  for (let k = 0; k < total; k++) {
    if (cancelled) { stopped = true; break }
    const i = from + k + 1 // attempts 与原版本对齐：1-based
    const r = engine.generatePlay(draws, play, s, pool)
    if (!r) break
    if (violent && freq) collectFreq(freq, cfg, r.ticket)
    if (!best || r.total > best.total) best = { ...r, attempts: i }
    if (r.total >= target) {
      r.attempts = i
      r.hitTarget = true
      hitOnce = true
      if (!violent) { return { ...r, stopped: false, from, to, runs: k + 1, rangeBest: best } }
    }
    if (k % 256 === 0) {
      postMessage({ type: 'progress', count: k + 1, total, from, to, bestTotal: best ? best.total : 0 })
    }
  }
  if (best) {
    if (!stopped) best.attempts = from + total
    if (!hitOnce) best.hitTarget = false
    if (stopped) best.stopped = true
    if (freq) best.freq = freq
  }
  return best
}

// 直位数字型（福彩3D/排列3/排列5/7星彩）—— 区间版
function runDirect(cfg, draws, play, target, from, to, violent) {
  const engine = createDirectPickerEngine(cfg)
  const n = play && play.type === 'multi' ? Math.max(1, Math.min(20, play.n || 3)) : 1
  // 性能修复（1.8.3）：stats 只算一次，generateDirect 复用，避免每轮全量统计
  const st = computeDirectStats(cfg, draws)
  let best = null
  let hitOnce = false
  let stopped = false
  const total = to - from
  for (let k = 0; k < total; k++) {
    if (cancelled) { stopped = true; break }
    const i = from + k + 1
    const lines = []
    for (let j = 0; j < n; j++) {
      const g = generateDirect(cfg, draws, { tries: 80, stats: st })
      if (g) lines.push(g)
    }
    if (!lines.length) break
    const avg = Math.round(lines.reduce((a, x) => a + x.score.total, 0) / lines.length)
    const ticket = n > 1
      ? { type: 'multi', tickets: lines.map((l) => ({ digits: l.digits, tail: l.tail })) }
      : { type: 'single', digits: lines[0].digits, tail: lines[0].tail }
    const r = { ticket, total: avg, count: n, stats: st }
    if (!best || avg > best.total) best = { ...r, attempts: i }
    if (avg >= target) {
      r.attempts = i
      r.hitTarget = true
      hitOnce = true
      if (!violent) { return { ...r, stopped: false, from, to, runs: k + 1, rangeBest: best } }
    }
    if (k % 256 === 0) {
      postMessage({ type: 'progress', count: k + 1, total, from, to, bestTotal: best ? best.total : 0 })
    }
  }
  if (best) {
    if (!stopped) best.attempts = from + total
    if (!hitOnce) best.hitTarget = false
    if (stopped) best.stopped = true
  }
  return best
}

self.onmessage = (e) => {
  const msg = e.data
  if (msg.type === 'cancel') { cancelled = true; return }
  if (msg.type === 'start') {
    cancelled = false
    const { cfg, draws, play, methods, target, from, to, violent } = msg
    try {
      const result = cfg.playMode === 'direct'
        ? runDirect(cfg, draws, play, target, from, to, violent)
        : runLotto(cfg, draws, play, methods, target, from, to, violent)
      postMessage({ type: 'done', result, from, to })
    } catch (err) {
      postMessage({ type: 'error', message: String((err && err.stack) || err) })
    }
  }
}
