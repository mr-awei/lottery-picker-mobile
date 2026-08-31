/**
 * 自选号指纹 / 去重检测
 *
 * 同号码「短时间内被连续保存两次」的根因防护工具。
 *
 * 设计要点：
 * 1. 只比较「票面内容」（号码 + 倍数 + 玩法模式），不比较 createStamp / savedAt / id
 *    —— 这样无论什么时间点、什么入口保存、什么 id 生成策略，都能识别出重复
 * 2. normalize：红球排序、蓝球取原值、复式多注内部按规则排序、外层按注内 fingerprint 排序
 *    —— 顺序差异不构成不同票
 * 3. 字段类型兼容：单式({red,blue,multiple}) / 复式({type:'multi',tickets:[]}) / 直选({digits,tail})
 */

function _normReds(red) {
  if (!Array.isArray(red)) return ''
  return red.slice().sort((a, b) => a - b).join(',')
}

/** 把单注归一为 fingerprint 字符串片段 */
function _fingerprintOne(t) {
  if (!t || typeof t !== 'object') return '?'
  // 直选：digits + tail（排列 3 / 5 等）
  if (t.digits != null) {
    return `d:${t.digits}|t:${t.tail ?? ''}|m:${t.multiple ?? 1}`
  }
  // 普通单式：红球 + 蓝球
  if (t.red || t.blue != null) {
    return `s:r${_normReds(t.red)}|b${t.blue ?? ''}|m:${t.multiple ?? 1}`
  }
  return '?'
}

/** 把整个 ticket 归一为总 fingerprint（含复式 + 单式兼容） */
export function fingerprintPick(ticketLike) {
  const t = ticketLike
  // 复式 multi
  if (t && t.type === 'multi' && Array.isArray(t.tickets)) {
    const inner = t.tickets.map(_fingerprintOne).sort()
    return `multi:${inner.join(';')}`
  }
  return 'one:' + _fingerprintOne(t)
}

/**
 * 检测「即将保存的票」是否与 localStorage 已有票重复
 * 仅比对最近 lookback 条历史（默认 5），足以覆盖「刚才那张一模一样的票」
 *
 * @param {Array} arr 已有 picks 数组
 * @param {Object} ticketLike 即将保存的 ticket
 * @param {number} [lookback=5] 向前查几条
 * @returns {boolean}
 */
export function isRecentDuplicate(arr, ticketLike, lookback = 5) {
  if (!Array.isArray(arr) || !arr.length) return false
  const target = fingerprintPick(ticketLike)
  const top = arr.slice(0, Math.max(1, lookback))
  for (const p of top) {
    if (p && p.ticket && fingerprintPick(p.ticket) === target) return true
  }
  return false
}
