/**
 * 轻量 IndexedDB 封装（无第三方库）
 *
 * - 数据库：lottery-picker，version 2
 * - stores：
 *   - draws  开奖缓存（key = 原 localStorage key `lp-data-{game}`，value = 缓存对象）
 *   - picks  自选号（key = 原 localStorage key `lottery-picker-mypicks-{game}`，value = 票数组）
 * - API：openDB / get / set / getAll / del / clear（全部 Promise 化）
 * - 迁移：migrateFromLocal() 启动时把旧 localStorage 数据搬进 IndexedDB，幂等
 * - 配额：checkQuota() 用 navigator.storage.estimate() 检测剩余空间，不足时 console.warn
 *
 * 可靠性设计（v2 修复）：
 * 1. 写操作只在「事务 oncomplete（真正提交）」后才算成功；事务 abort/error 一律 reject。
 *    —— 旧实现只监听 req.onsuccess，而 put 的 req.onsuccess 早于事务提交，
 *       提交阶段失败（配额/中止）会被误判为保存成功 → 静默丢数据。
 * 2. IndexedDB 打开失败 / 事务失败时，get/set 自动降级到 localStorage 兜底，
 *    保证在个别 WebView 上 IndexedDB 不可用时「保存了就能读到」，不再出现空结果。
 * 3. DB 版本 1→2：onupgradeneeded 幂等补建 store，自愈历史遗留的缺表 DB。
 * 4. set 落库前用 JSON 往返把值剥离成纯对象：修复「Vue reactive Proxy 无法被结构化克隆」
 *    导致的 DOMException(DataError: could not be cloned)——这是「保存后查看为空」的真凶。
 *
 * 注意：设置项（主题 / AI 设置 / 加速开关 / 兑奖弹窗已标记）仍留在 localStorage，不在此处迁移。
 */

const DB_NAME = 'lottery-picker'
const DB_VERSION = 2

export const STORE_DRAWS = 'draws'
export const STORE_PICKS = 'picks'

/** localStorage 迁移版本号：未设置 = v0（纯 localStorage）；当前版本 = '1'（已迁 IndexedDB） */
const SCHEMA_KEY = 'lp-schema-version'
const SCHEMA_VERSION = '1'

/** 旧 localStorage key 前缀（迁移来源） */
const DRAW_PREFIX = 'lp-data-'
const PICKS_PREFIX = 'lottery-picker-mypicks-'

/** IndexedDB 不可用时的兜底 key 前缀（与迁移来源前缀区分，避免被 migrate 误删） */
const FALLBACK_PREFIX = 'lp-kv-fallback:'

let dbPromise: Promise<IDBDatabase> | null = null

/** 打开（或首次创建）IndexedDB； stores 在 upgradeneeded 中按需建 */
export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  if (typeof indexedDB === 'undefined') {
    dbPromise = Promise.reject(new Error('当前环境不支持 IndexedDB'))
  } else {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        // 幂等补建：历史 DB 可能缺 store（同版本不会触发 upgrade，故用版本号 +2 自愈）
        if (!db.objectStoreNames.contains(STORE_DRAWS)) db.createObjectStore(STORE_DRAWS)
        if (!db.objectStoreNames.contains(STORE_PICKS)) db.createObjectStore(STORE_PICKS)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'))
      req.onblocked = () => reject(new Error('IndexedDB 被其它连接阻塞'))
    })
  }
  // 失败后允许下次重试：清掉缓存的 reject，避免永久 stuck
  dbPromise.catch(() => {
    dbPromise = null
  })
  return dbPromise
}

// ---------------------------------------------------------------------------
// localStorage 兜底（IndexedDB 不可用/写入失败时保证数据可存取）
// ---------------------------------------------------------------------------
function fbKey(store: string, key: string): string {
  return FALLBACK_PREFIX + store + ':' + key
}

function fbGet<T>(store: string, key: string): T | undefined {
  try {
    if (typeof localStorage === 'undefined') return undefined
    const raw = localStorage.getItem(fbKey(store, key))
    return raw == null ? undefined : (JSON.parse(raw) as T)
  } catch {
    return undefined
  }
}

function fbSet(store: string, key: string, value: unknown): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.setItem(fbKey(store, key), JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

function fbDel(store: string, key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(fbKey(store, key))
  } catch {
    /* ignore */
  }
}

function fbClearStore(store: string): void {
  try {
    if (typeof localStorage === 'undefined') return
    const prefix = FALLBACK_PREFIX + store + ':'
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) keys.push(k)
    }
    keys.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// 通用单请求事务封装（以「事务提交」为成功判定）
// ---------------------------------------------------------------------------
type TxMode = 'readonly' | 'readwrite' | 'versionchange'

function withRequest<T>(store: string, mode: TxMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let tx: IDBTransaction
        try {
          tx = db.transaction(store, mode)
        } catch (e) {
          reject(e)
          return
        }
        let result: unknown
        let req: IDBRequest
        try {
          req = run(tx.objectStore(store))
        } catch (e) {
          reject(e)
          return
        }
        req.onsuccess = () => {
          result = req.result
        }
        req.onerror = () => reject(req.error || new Error('IndexedDB 请求失败'))
        // 关键修复：写操作必须等事务真正提交才 resolve；abort/error 一律 reject，
        // 避免「请求成功但提交失败」被当成保存成功（静默丢数据）。
        tx.onabort = () => reject(tx.error || new Error('IndexedDB 事务中止'))
        tx.onerror = () => reject(tx.error || new Error('IndexedDB 事务错误'))
        tx.oncomplete = () => resolve(result as T)
      })
  )
}

/** 读一条；不存在返回 undefined（IndexedDB 不可用时回落到 localStorage 兜底） */
export async function get<T = unknown>(store: string, key: string): Promise<T | undefined> {
  try {
    const v = await withRequest<T | undefined>(store, 'readonly', (s) => s.get(key))
    if (v !== undefined) {
      fbDel(store, key) // IndexedDB 有值即以其为准，清理兜底副本
      return v
    }
  } catch {
    // IndexedDB 不可用：降级读兜底
  }
  return fbGet<T>(store, key)
}

/**
 * 将值转为「可被结构化克隆」的纯对象。
 * IndexedDB 的 put 使用结构化克隆算法，无法克隆 Vue reactive/ref 的 Proxy、函数、DOM 节点等，
 * 否则抛 DOMException(DataError: could not be cloned)。本项目数据均可 JSON 序列化，
 * 故用 JSON 往返剥离 Proxy，保证传入 ref/reactive 数据也能安全落库。
 */
function toPlain(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return value
  }
}

/** 写一条（存在则覆盖）；写入前剥离 Proxy；IndexedDB 失败时自动降级 localStorage 兜底 */
export async function set(store: string, key: string, value: unknown): Promise<void> {
  const plain = toPlain(value) // 关键：剥离 Vue reactive Proxy，避免结构化克隆 DataError
  try {
    await withRequest<unknown>(store, 'readwrite', (s) => s.put(plain, key))
    fbDel(store, key) // 写入成功，兜底副本作废（以 IndexedDB 为准）
  } catch (e) {
    if (!fbSet(store, key, plain)) throw e // 兜底也失败才抛错给调用方
    console.warn('[db] IndexedDB 写入失败，已降级 localStorage 兜底（数据仍可保存/读取）', e)
  }
}

/** 读 store 全部（IndexedDB 不可用时返回 []） */
export async function getAll<T = unknown>(store: string): Promise<T[]> {
  try {
    return await withRequest<T[]>(store, 'readonly', (s) => s.getAll())
  } catch (e) {
    console.warn('[db] getAll 失败', e)
    return []
  }
}

/** 删一条（`delete` 是保留字不能做函数名，导出为 del） */
export async function del(store: string, key: string): Promise<void> {
  try {
    await withRequest<undefined>(store, 'readwrite', (s) => s.delete(key))
  } finally {
    fbDel(store, key)
  }
}

/** 清空整个 store（同时清理兜底副本） */
export async function clear(store: string): Promise<void> {
  try {
    await withRequest<undefined>(store, 'readwrite', (s) => s.clear())
  } catch (e) {
    console.warn('[db] clear 失败', e)
  }
  fbClearStore(store)
}

/**
 * 存储配额检测：navigator.storage.estimate()。
 * 用量占配额 ≥90% 时 console.warn（写入失败由调用方 catch）。
 * 不支持 estimate 的环境（老 WebView / SSR）静默跳过。
 */
export async function checkQuota(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.estimate !== 'function') return
    const est = await navigator.storage.estimate()
    const usage = est.usage || 0
    const quota = est.quota || 0
    if (quota > 0 && usage / quota >= 0.9) {
      console.warn(
        `[db] 本地存储即将用尽：${(usage / 1048576).toFixed(1)}MB / ${(quota / 1048576).toFixed(1)}MB，新保存可能失败`
      )
    }
  } catch (e) {
    console.warn('[db] checkQuota 失败', e)
  }
}

/**
 * 启动时把旧 localStorage 数据搬进 IndexedDB。
 * - 幂等：已迁移（lp-schema-version === 当前版本）直接返回
 * - 迁移源：lp-data-*（开奖缓存）与 lottery-picker-mypicks-*（自选号），key/value 原样拷贝
 * - 设置项（主题 / AI 设置 / 兑奖弹窗标记等）不在迁移范围
 * - 拷贝成功后删除旧 localStorage key，并写入版本号
 */
export async function migrateFromLocal(): Promise<void> {
  if (typeof localStorage === 'undefined') return
  if (localStorage.getItem(SCHEMA_KEY) === SCHEMA_VERSION) return
  try {
    await openDB()
    const ls = window.localStorage
    const keys: string[] = []
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i)
      if (k) keys.push(k)
    }
    // 1) 拷贝
    for (const key of keys) {
      if (!key.startsWith(DRAW_PREFIX) && !key.startsWith(PICKS_PREFIX)) continue
      const raw = ls.getItem(key)
      if (raw == null) continue
      try {
        const store = key.startsWith(DRAW_PREFIX) ? STORE_DRAWS : STORE_PICKS
        await set(store, key, JSON.parse(raw))
      } catch (e) {
        // 单条脏数据不阻断整体迁移
        console.warn(`[db] 迁移 ${key} 失败，跳过`, e)
      }
    }
    // 2) 清理已迁移的旧 key
    for (const key of keys) {
      if (key.startsWith(DRAW_PREFIX) || key.startsWith(PICKS_PREFIX)) ls.removeItem(key)
    }
    // 3) 标记版本（此后不再迁移）
    ls.setItem(SCHEMA_KEY, SCHEMA_VERSION)
    console.info('[db] localStorage → IndexedDB 迁移完成')
  } catch (e) {
    console.warn('[db] 迁移未完成，下次启动重试', e)
  }
}
