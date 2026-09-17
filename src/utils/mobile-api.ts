/**
 * 移动端数据层：替代桌面端 Electron IPC（window.lotteryAPI）
 * - 请求：Capacitor Http 原生网络栈（绕过 WebView CORS），浏览器开发模式回退 fetch
 * - 兜底：v1.9.4 起，远程失败/被 CORS 拦截时自动回退 dist 内置的 8 彩种 JSON 快照
 * - 缓存：IndexedDB（store=draws，key: lp-data-{game}），24 小时新鲜度，至少 MAX_DRAWS 期（v1.9.7 起由 localStorage 迁移）
 * - 接口签名与桌面 preload 一致：get / refresh / status
 * - 彩种：双色球 / 大乐透 / 七乐彩 / 快乐8 / 福彩3D / 排列3 / 排列5 / 7星彩（对齐桌面端 data-fetcher）
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import type { ApiDataResult, Draw, DrawWinner } from './types'
import { get, set, checkQuota, STORE_DRAWS } from './db'

const UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

const MAX_DRAWS = 200
const FRESH_HOURS = 24
const CACHE_PREFIX = 'lp-data-'

/** v1.9.4：跨域/网络失败时回退本地快照 —— 解决 devtools 看不到 fetch 的 "Failed to fetch"（cwl/sporttery 不发 ACAO，被浏览器拦截）。模块级变量暴露最近一次来源。 */
let _lastReqFromSnapshot = false
export function lastRequestFromSnapshot(): boolean {
  return _lastReqFromSnapshot
}

/** 从 URL 推导本地快照文件名（仅匹配已知端点）：
 *  https://www.cwl.gov.cn/...?...name=ssq → "cwl-ssq"
 *  https://webapi.sporttery.cn/...?...gameNo=85 → "sp-85" */
function detectSnapshotKey(url: string): string | null {
  const m1 = url.match(/cwl\.gov\.cn[^?]*\?[^&]*name=(\w+)/)
  if (m1) return `cwl-${m1[1]}`
  const m2 = url.match(/sporttery\.cn[^?]*\?[^&]*gameNo=(\d+)/)
  if (m2) return `sp-${m2[1]}`
  return null
}

/** 拉本地快照（dist 内置，浏览器 fetch 直接同源，APK file:// 也同源 —— 两条路径都不受 CORS 限制） */
async function fetchLocalSnapshot(key: string): Promise<string> {
  const r = await fetch(`./snapshots/${key}.json`, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return await r.text()
}

/**
 * 原生环境走 CapacitorHttp（无 CORS），浏览器 dev 回退 fetch；失败自动重试。
 * 关键坑：部分接口（如 cwl.gov.cn）返回 Content-Type 为 text/json 而非 application/json，
 * CapacitorHttp 会原样把响应体作为「字符串」返回（见原生 HttpRequestHandler.readData），
 * 直接取 json.state 会得到 undefined。因此拿到响应后统一 JSON.parse：
 * 已是对象则直接返回，是字符串则解析，避免「接口返回结构异常」。
 *
 * v1.9.4 重构：主路径失败 → 自动回退本地快照（dist 内置 JSON）。
 *  - 浏览器模式 fetch cwl/sporttery 会因 ACAO 缺失被 CORS 拦截（"Failed to fetch"，devtools 不显示）
 *  - 原生 CapacitorHttp 也可能在弱网/官方 CDN 故障时失败
 *  - 浏览器模式下"快照"和"实时"两条路径都尝试，让用户/开发都能在 Edge / WebView 看到数据
 */
async function requestJson(url: string, referer: string, retries = 3): Promise<unknown> {
  const toJson = (data: unknown): unknown => {
    if (typeof data === 'string') {
      const t = data.trim()
      if (!t) throw new Error('接口返回为空')
      try {
        return JSON.parse(t)
      } catch {
        throw new Error('接口返回不是合法 JSON')
      }
    }
    return data
  }

  const headers: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    ...(referer ? { Referer: referer } : {})
  }

  const snapKey = detectSnapshotKey(url)

  const doRequest = async (): Promise<unknown> => {
    // 1) 主路径：原生 CapacitorHttp；浏览器 fetch
    let primaryStatus: number | null = null
    let primaryData: unknown = null
    let primaryErr: Error | null = null
    try {
      if (Capacitor.isNativePlatform()) {
        const r = await CapacitorHttp.get({
          url,
          headers,
          connectTimeout: 30000,
          readTimeout: 30000
        })
        primaryStatus = r.status
        primaryData = r.data
      } else {
        const r = await fetch(url, { headers })
        primaryStatus = r.status
        primaryData = await r.text()
      }
      if (primaryStatus !== 200) throw new Error(`HTTP ${primaryStatus}`)
      _lastReqFromSnapshot = false
      return toJson(primaryData)
    } catch (e) {
      primaryErr = e as Error
    }

    // 2) 兜底：本地快照（已知端点 cwl/sporttery）
    if (snapKey) {
      try {
        const msg = (primaryErr && primaryErr.message) || 'unknown'
        console.warn(`[mobile-api] ${url} 远程失败（${msg}），回退本地快照 ${snapKey}`)
        const snap = await fetchLocalSnapshot(snapKey)
        _lastReqFromSnapshot = true
        return toJson(snap)
      } catch (e2) {
        throw new Error(`远程失败（${primaryErr!.message}）；本地快照也不可用（${(e2 as Error).message}）`)
      }
    }
    throw primaryErr
  }

  let lastErr: Error | unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await doRequest()
    } catch (e) {
      lastErr = e
      if (attempt < retries) {
        // 指数退避：1s / 2s / 4s，缓解偶发网络抖动（如体彩 CDN 超时/Connection reset）
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }
    }
  }
  throw new Error(lastErr && (lastErr as Error).message ? (lastErr as Error).message : '网络请求失败，请检查网络连接后重试')
}

/** 把省份映射为标准名（处理直辖市/自治区简称） */
function normalizeProvince(name: string): string | null {
  const map: Record<string, string> = {
    北京: '北京', 上海: '上海', 天津: '天津', 重庆: '重庆',
    内蒙古: '内蒙古', 广西: '广西', 西藏: '西藏', 宁夏: '宁夏', 新疆: '新疆'
  }
  let n = name.trim()
  n = n.replace(/省$/, '').replace(/市$/, '').replace(/自治区$/, '').replace(/壮族$/, '').replace(/回族$/, '').replace(/维吾尔$/, '')
  if (map[n]) return map[n]
  if (/^(黑龙江|吉林|辽宁|河北|山西|陕西|甘肃|青海|山东|江苏|安徽|浙江|福建|江西|河南|湖北|湖南|广东|海南|四川|贵州|云南|台湾|香港|澳门)$/.test(n)) return n
  return null
}

/** 解析开奖公告文字中的省级中奖分布，如 "北京3注，安徽1注，共4注。" */
function parseProvinceContent(content: string): DrawWinner[] {
  if (!content || typeof content !== 'string') return []
  const out: DrawWinner[] = []
  const re = /([\u4e00-\u9fa5]{2,6}?)(\d+)注/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const raw = m[1]
    if (/^(共|单|合计|其中)/.test(raw)) continue
    const province = normalizeProvince(raw)
    if (!province) continue
    const count = Math.max(1, Number(m[2]) || 1)
    for (let i = 0; i < count; i++) {
      out.push({ province, city: null, siteNo: '', amount: null })
    }
  }
  return out
}

interface CwlRow {
  code?: string
  date?: string
  red?: string
  blue?: string | number
  sales?: string | number
  poolmoney?: string | number
  content?: string
  prizegrades?: Array<{ type?: string | number; typemoney?: string | number; typenum?: string | number }>
}

interface CwlOpts {
  hasBlue?: boolean
  firstType?: string | number
}

/** 福彩通用解析：red 逗号分隔数字串；blue 可空；prizegrades 构建 prizeMap */
function parseCwlRows(rows: CwlRow[], opts: CwlOpts = {}): Draw[] {
  return rows.map((r) => {
    const red = String(r.red || '').split(',').filter(Boolean).map(Number)
    const prizeMap: Record<string, number> = {}
    if (Array.isArray(r.prizegrades)) {
      r.prizegrades.forEach((p) => {
        const amt = String(p.typemoney || '').replace(/,/g, '')
        if (p.type !== undefined && p.type !== '' && amt !== '' && Number(amt) > 0) {
          prizeMap[String(p.type)] = Number(amt)
        }
      })
    }
    const blueRaw = r.blue !== undefined && r.blue !== '' ? Number(r.blue) : null
    const hasBlue = opts.hasBlue !== false && blueRaw != null && !isNaN(blueRaw)
    return {
      issue: String(r.code || ''),
      date: String(r.date || '').replace(/\(.*\)$/, '').trim(),
      red,
      blue: hasBlue ? blueRaw : null,
      blue2: null,
      firstPrizePerBet: opts.firstType != null && prizeMap[String(opts.firstType)] != null ? prizeMap[String(opts.firstType)] : null,
      firstPrizeCount: opts.firstType != null && r.prizegrades ? (() => {
        const p = (r.prizegrades || []).find((g) => String(g.type) === String(opts.firstType))
        const c = p && p.typenum !== undefined && p.typenum !== '' ? Number(p.typenum) : null
        return c
      })() : null,
      sales: r.sales ? Number(r.sales) : null,
      pool: r.poolmoney ? Number(r.poolmoney) : null,
      winners: parseProvinceContent(r.content || ''),
      maxPersonalWin: null,
      maxPersonalWinNote: '',
      prizeMap
    }
  })
}

interface PrizeLevelEntry {
  prizeLevel?: string
  stakeAmountFormat?: string
  stakeCount?: string | number
}

interface SportteryRow {
  lotteryDrawNum?: string
  lotteryDrawTime?: string
  lotteryDrawResult?: string
  totalSaleAmount?: string | number
  prizeLevelList?: PrizeLevelEntry[]
}

/** 体彩通用解析：result 空格分隔数字串 */
function parseSportteryRows(rows: SportteryRow[]): Draw[] {
  return rows.map((r) => {
    const nums = String(r.lotteryDrawResult || '').trim().split(/\s+/).filter(Boolean).map(Number)
    const prizeMap: Record<string, number> = {}
    const list = Array.isArray(r.prizeLevelList) ? r.prizeLevelList : []
    let first: PrizeLevelEntry | null = null
    list.forEach((p) => {
      const amt = String(p.stakeAmountFormat || '').replace(/,/g, '')
      if (amt !== '' && Number(amt) > 0) prizeMap[String(p.prizeLevel || '')] = Number(amt)
      if (!first && /一等奖/.test(String(p.prizeLevel || ''))) first = p
    })
    return {
      issue: String(r.lotteryDrawNum || ''),
      date: r.lotteryDrawTime || '',
      red: nums,
      blue: null,
      blue2: null,
      firstPrizePerBet: first ? Number(String(first.stakeAmountFormat || '').replace(/,/g, '')) || null : null,
      firstPrizeCount: first ? Number(first.stakeCount) || null : null,
      sales: r.totalSaleAmount ? Number(String(r.totalSaleAmount).replace(/,/g, '')) : null,
      pool: null,
      winners: [],
      maxPersonalWin: null,
      maxPersonalWinNote: '',
      prizeMap
    }
  })
}

/** 双色球：福彩官网 cwl.gov.cn */
async function fetchSSQ(count = MAX_DRAWS): Promise<Draw[]> {
  const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&issueCount=${count}&issueStart=&issueEnd=&dayStart=&dayEnd=`
  const json = await requestJson(url, '')
  const j = json as { state?: number; result?: CwlRow[] }
  if (!json || j.state !== 0 || !Array.isArray(j.result)) {
    throw new Error('双色球接口返回结构异常')
  }
  return parseCwlRows(j.result, { firstType: 1 })
}

/** 七乐彩：福彩官网，red=7 基本号，blue=特别号 */
async function fetchQLC(count = MAX_DRAWS): Promise<Draw[]> {
  const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=qlc&issueCount=${count}&issueStart=&issueEnd=&dayStart=&dayEnd=`
  const json = await requestJson(url, '')
  const j = json as { state?: number; result?: CwlRow[] }
  if (!json || j.state !== 0 || !Array.isArray(j.result)) {
    throw new Error('七乐彩接口返回结构异常')
  }
  return parseCwlRows(j.result, { firstType: 1 })
}

/** 快乐8：福彩官网，red=20 个开奖号，prizegrades 为 x1z1~x10z10 全玩法 */
async function fetchKL8(count = MAX_DRAWS): Promise<Draw[]> {
  const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=kl8&issueCount=${count}&issueStart=&issueEnd=&dayStart=&dayEnd=`
  const json = await requestJson(url, '')
  const j = json as { state?: number; result?: CwlRow[] }
  if (!json || j.state !== 0 || !Array.isArray(j.result)) {
    throw new Error('快乐8接口返回结构异常')
  }
  return parseCwlRows(j.result, { firstType: 'x10z10' })
}

/** 福彩3D：福彩官网，red 为逗号分隔的 3 位数字 */
async function fetchFC3D(count = MAX_DRAWS): Promise<Draw[]> {
  const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=3d&issueCount=${count}&issueStart=&issueEnd=&dayStart=&dayEnd=`
  const json = await requestJson(url, '')
  const j = json as { state?: number; result?: CwlRow[] }
  if (!json || j.state !== 0 || !Array.isArray(j.result)) {
    throw new Error('福彩3D接口返回结构异常')
  }
  return parseCwlRows(j.result, { hasBlue: false }).map((d) => ({
    ...d,
    blue: null,
    blue2: null,
    digits: d.red.slice(0, 3), // 百十个位
    red: [],
    tail: null
  }))
}

/** 排列3：体彩 gameNo=35，result 3 位 */
async function fetchPL3(count = MAX_DRAWS): Promise<Draw[]> {
  const url = `https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=35&provinceId=0&pageSize=${count}&isVerify=1&pageNo=1`
  const json = await requestJson(url, 'https://static.sporttery.cn/')
  const j = json as { errorCode?: string; value?: { list?: SportteryRow[] } }
  if (!json || j.errorCode !== '0' || !j.value || !Array.isArray(j.value.list)) {
    throw new Error('排列3接口返回结构异常')
  }
  return parseSportteryRows(j.value.list).map((d) => ({
    ...d,
    digits: d.red.slice(0, 3),
    tail: null
  }))
}

/** 排列5：体彩 gameNo=350133，result 5 位 */
async function fetchPL5(count = MAX_DRAWS): Promise<Draw[]> {
  const url = `https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=350133&provinceId=0&pageSize=${count}&isVerify=1&pageNo=1`
  const json = await requestJson(url, 'https://static.sporttery.cn/')
  const j = json as { errorCode?: string; value?: { list?: SportteryRow[] } }
  if (!json || j.errorCode !== '0' || !j.value || !Array.isArray(j.value.list)) {
    throw new Error('排列5接口返回结构异常')
  }
  return parseSportteryRows(j.value.list).map((d) => ({
    ...d,
    digits: d.red.slice(0, 5),
    tail: null
  }))
}

/** 7星彩：体彩 gameNo=04，result 前 6 位 + 尾位(0-14) */
async function fetchQXC(count = MAX_DRAWS): Promise<Draw[]> {
  const url = `https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=04&provinceId=0&pageSize=${count}&isVerify=1&pageNo=1`
  const json = await requestJson(url, 'https://static.sporttery.cn/')
  const j = json as { errorCode?: string; value?: { list?: SportteryRow[] } }
  if (!json || j.errorCode !== '0' || !j.value || !Array.isArray(j.value.list)) {
    throw new Error('7星彩接口返回结构异常')
  }
  return parseSportteryRows(j.value.list).map((d) => ({
    ...d,
    digits: d.red.slice(0, 6),
    tail: d.red.length > 6 ? d.red[6] : null
  }))
}

/** 大乐透：体彩官网 webapi.sporttery.cn */
async function fetchDLT(count = MAX_DRAWS): Promise<Draw[]> {
  const url = `https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=85&provinceId=0&pageSize=${count}&isVerify=1&pageNo=1`
  const json = await requestJson(url, 'https://static.sporttery.cn/')
  const j = json as { errorCode?: string; value?: { list?: SportteryRow[] } }
  if (!json || j.errorCode !== '0' || !j.value || !Array.isArray(j.value.list)) {
    throw new Error('大乐透接口返回结构异常')
  }
  return parseSportteryRows(j.value.list).map((d) => {
    const nums = d.red
    return {
      ...d,
      red: nums.slice(0, 5),
      blue: nums.length > 5 ? nums[5] : null,
      blue2: nums.length > 6 ? nums[6] : null,
      pool: d.pool
    }
  })
}

const FETCHERS: Record<string, (count?: number) => Promise<Draw[]>> = {
  ssq: fetchSSQ,
  dlt: fetchDLT,
  qlc: fetchQLC,
  kl8: fetchKL8,
  fc3d: fetchFC3D,
  pl3: fetchPL3,
  pl5: fetchPL5,
  qxc: fetchQXC
}

/** 本地缓存读写（IndexedDB，store=draws；key 沿用原 localStorage 的 lp-data-{game}） */
function cacheKey(game: string): string {
  return CACHE_PREFIX + game
}

interface CacheShape {
  game?: string
  updatedAt?: string
  source?: string
  draws?: Draw[]
  error?: string
}

async function readCache(game: string): Promise<CacheShape | null> {
  try {
    const v = await get<CacheShape>(STORE_DRAWS, cacheKey(game))
    return v ?? null
  } catch {
    return null
  }
}

async function writeCache(game: string, data: CacheShape): Promise<void> {
  try {
    await set(STORE_DRAWS, cacheKey(game), data)
    // 写入成功后顺手探测配额（不足内部 console.warn）
    checkQuota()
  } catch (e) {
    /* 存储满/不可用时忽略，不影响本次数据返回 */
    console.warn('[mobile-api] 开奖缓存写入 IndexedDB 失败', e)
  }
}

function isFresh(cache: CacheShape | null): boolean {
  if (!cache || !Array.isArray(cache.draws) || cache.draws.length === 0) return false
  if (!cache.updatedAt) return false
  const age = Date.now() - new Date(cache.updatedAt).getTime()
  return age >= 0 && age < FRESH_HOURS * 3600 * 1000
}

async function ensureData(game: string, force: boolean): Promise<ApiDataResult> {
  const cache = await readCache(game)
  if (!force && isFresh(cache)) {
    return { ok: true, source: 'cache', ...(cache as ApiDataResult) }
  }
  const fn = FETCHERS[game]
  if (!fn) throw new Error(`未知彩种: ${game}`)
  // v1.9.4：进入 fn 之前重置"快照标记"（fn 内部走 requestJson，主路径失败时会回退到本地快照并置 true）
  _lastReqFromSnapshot = false
  try {
    const draws = await fn()
    const dataSource = _lastReqFromSnapshot ? 'snapshot' : 'fetch'
    const data: CacheShape = { game, updatedAt: new Date().toISOString(), source: dataSource, draws }
    await writeCache(game, data)
    return { ok: true, source: dataSource, ...(data as ApiDataResult) }
  } catch (e) {
    if (cache && Array.isArray(cache.draws) && cache.draws.length > 0) {
      return { ok: true, source: 'cache-stale', error: (e as Error).message, ...(cache as ApiDataResult) }
    }
    throw e
  }
}

/** 与桌面 preload 相同的对外接口 */
export const lotteryApi = {
  async get(game: string): Promise<ApiDataResult> {
    try {
      return { ok: true, ...(await ensureData(game, false)) }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  },
  async refresh(game: string): Promise<ApiDataResult> {
    try {
      return { ok: true, ...(await ensureData(game, true)) }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  },
  async status(game: string): Promise<{ ok: boolean; updatedAt: string | null; count: number; missingWinners: number }> {
    const cache = await readCache(game)
    if (!cache || !Array.isArray(cache.draws)) {
      return { ok: true, updatedAt: null, count: 0, missingWinners: 0 }
    }
    const missingWinners = cache.draws.filter((d) => !d.winners || (d.winners as unknown[]).length === 0).length
    return {
      ok: true,
      updatedAt: cache.updatedAt || null,
      count: cache.draws.length,
      missingWinners
    }
  },
  /**
   * v1.9.6：精确匹配某一期（OCR 识别到"销售期 2023013"后调用）。
   * 流程：先查 cache 找到 → 返回；找不到时强制 refresh 再找；都没有则返回 null。
   * 找到的 draw 含完整开奖号码 (issue/date/red/blue/...)，供 FileCheck 单期核对。
   */
  async lookupByIssue(
    game: string,
    issue: string | number
  ): Promise<{ ok: boolean; source?: string; draw?: Draw | null; miss?: string; error?: string } | null> {
    if (!game || !issue) return null
    const want = String(issue).trim()
    // 1. cache 命中
    const cache = await readCache(game)
    if (cache && Array.isArray(cache.draws)) {
      const hit = cache.draws.find((d) => String(d.issue || '').trim() === want)
      if (hit) return { ok: true, source: 'cache', draw: hit }
    }
    // 2. 强制 refresh（90 期够覆盖近 2-3 月，再老就拉不到；这种情况返回 miss 让 UI 提示）
    const refreshMax = MAX_DRAWS
    try {
      const r = await ensureData(game, true)
      const hit = (r.draws || []).find((d) => String(d.issue || '').trim() === want)
      if (hit) return { ok: true, source: r.source || 'fetch', draw: hit }
      return { ok: true, source: r.source || 'fetch', draw: null, miss: 'no such issue in ' + refreshMax + ' draws' }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }
}
