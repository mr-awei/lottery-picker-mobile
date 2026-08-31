/**
 * ocr-meta.js —— 从 OCR 文本中提取彩票票面元数据 (v1.9.6)
 * ------------------------------------------------------------
 * 解决的真实痛点：
 *  - 用户上传一张双色球的票，但当前 Tab 不是双色球；当前实现按 cfg 解析得错位
 *  - 票面常有明确的"销售期 / 开奖日期"，但核对时反而回溯 50 期，不是精确当期
 *  - 老票超出最近 50 期缓存，核对结果全是"未中奖"或乱串，但仍当当期展示
 *
 * 抽出三层信息：
 *  1. gameKey / gameName：彩种（识别彩种头部"双色球/大乐透/..."）
 *  2. issue / drawDate：期号/开奖日期（"销售期 2023013" / "开奖日期 2023-02-07"）
 *  3. playHint：玩法（单式/复式/胆拖），辅助选择合适 cfg
 *
 * 识别失败时返回全 null，由 FileCheck 决定走默认 cfg 路径 + 仍提示"非当期"
 * ------------------------------------------------------------
 */
import { GAME_CONFIG } from './game-config'

// 中文彩种名 → 内部 key（票面常用别名都收了）
const NAME_TO_KEY = {
  双色球: 'ssq',
  '超级大乐透': 'dlt',
  '中国体育彩票超级大乐透': 'dlt',
  大乐透: 'dlt',
  七乐彩: 'qlc',
  '七乐彩(单式)': 'qlc',
  '快乐8': 'kl8',
  '快乐8(中国福利彩票)': 'kl8',
  '快乐8(中国福利彩票发行管理中心)': 'kl8',
  '福彩3D': 'fc3d',
  '3D': 'fc3d',
  排列三: 'pl3',
  '排列3': 'pl3',
  '排列五': 'pl5',
  '排列5': 'pl5',
  '7星彩': 'qxc',
  '七星彩': 'qxc'
}

// 顺序匹配：优先匹配长名，避免"3D"截胡"7星彩"（不含 3D 字面所以安全）
const NAME_KEYS_SORTED = Object.keys(NAME_TO_KEY).sort((a, b) => b.length - a.length)

/**
 * 提取票面元数据。返回 { gameKey, gameName, issue, drawDate, playHint, raw, foundAny }
 *  - foundAny: 至少识别到 1 个字段就 true（用来决定 UI 是否显示"识别到..."卡片）
 */
export function extractTicketMeta(text) {
  const meta = {
    gameKey: null,
    gameName: null,
    issue: null,
    drawDate: null,
    playHint: null,
    raw: text || '',
    foundAny: false
  }
  if (!text) return meta
  const t = String(text)

  // 1. 彩种名（长前缀优先）
  for (const name of NAME_KEYS_SORTED) {
    if (t.indexOf(name) >= 0) {
      const key = NAME_TO_KEY[name]
      meta.gameKey = key
      meta.gameName = GAME_CONFIG[key] ? GAME_CONFIG[key].name : name
      meta.foundAny = true
      break
    }
  }

  // 2. 玩法暗示（"单式/复式/胆拖"）—— 票面标题行常见
  if (/单式/.test(t)) {
    meta.playHint = '单式'
    meta.foundAny = true
  } else if (/复式/.test(t)) {
    meta.playHint = '复式'
    meta.foundAny = true
  } else if (/胆拖/.test(t)) {
    meta.playHint = '胆拖'
    meta.foundAny = true
  }

  // 3. 期号（多渠道）
  //    "销售期:2023013" / "兑奖期:2023013" / "期号:2023013"
  let m = t.match(/(?:销售期|兑奖期|期号|期数)[：: ]\s*(\d{5,8})/)
  if (m) {
    meta.issue = m[1]
    meta.foundAny = true
  }
  //    "第 2023013 期" / "第2023013期"
  if (!meta.issue) {
    m = t.match(/第\s*(\d{5,8})\s*期/)
    if (m) {
      meta.issue = m[1]
      meta.foundAny = true
    }
  }
  //    兜底：行首的纯数字（如 double 红数字"2023013 中国福利..."中截取）
  if (!meta.issue) {
    m = t.match(/(?:^|\s)(\d{7})(?=\s|$)/m)
    if (m) {
      meta.issue = m[1]
      meta.foundAny = true
    }
  }

  // 4. 开奖日期（YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD 都兼容）
  m = t.match(/开奖日期[：: ]\s*(\d{4})[-./](\d{1,2})[-./](\d{1,2})/)
  if (m) {
    const pad = (n) => String(n).padStart(2, '0')
    meta.drawDate = `${m[1]}-${pad(m[2])}-${pad(m[3])}`
    meta.foundAny = true
  } else {
    m = t.match(/开奖[时间日期]{0,2}[：: ]\s*(\d{4})[-./](\d{1,2})[-./](\d{1,2})/)
    if (m) {
      const pad = (n) => String(n).padStart(2, '0')
      meta.drawDate = `${m[1]}-${pad(m[2])}-${pad(m[3])}`
      meta.foundAny = true
    }
  }

  return meta
}

/**
 * 在某彩种 draws 数组中找精确期号
 */
export function findDrawByIssue(draws, issue) {
  if (!draws || !draws.length || !issue) return null
  const want = String(issue).trim()
  return draws.find((d) => String(d.issue || '').trim() === want) || null
}

/**
 * 在某彩种 draws 数组中按开奖日期找
 */
export function findDrawByDate(draws, dateStr) {
  if (!draws || !draws.length || !dateStr) return null
  const want = String(dateStr).trim()
  return draws.find((d) => String(d.date || '').slice(0, 10) === want) || null
}

/**
 * 票面号码统计（用于 extractTickets 容错兜底）
 * 返回 "每个 label 出现的数字数量"
 */
export function countOcrLines(text) {
  if (!text) return 0
  // 找 [A-Z][:：]  的行 + 连续 6+ 个 01-33 范围的数字行
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let cnt = 0
  for (const line of lines) {
    // A:/B: 前缀
    if (/^[A-Z][:：]/.test(line)) {
      cnt++
      continue
    }
    // 编号前缀
    if (/^\d+[)\.、]/.test(line)) {
      cnt++
      continue
    }
    // 纯 6+ 数字
    const nums = (line.match(/\d+/g) || [])
      .filter((s) => s.length <= 2)
      .map(Number)
      .filter((n) => n >= 1 && n <= 35)
    if (nums.length >= 6) cnt++
  }
  return cnt
}
