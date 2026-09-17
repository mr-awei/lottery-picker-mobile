/**
 * 轻量 IndexedDB 封装（无第三方库）
 *
 * - 数据库：lottery-picker，version 1
 * - stores：
 *   - draws  开奖缓存（key = 原 localStorage key `lp-data-{game}`，value = 缓存对象）
 *   - picks  自选号（key = 原 localStorage key `lottery-picker-mypicks-{game}`，value = 票数组）
 * - API：openDB / get / set / getAll / del / clear（全部 Promise 化）
 * - 迁移：migrateFromLocal() 启动时把旧 localStorage 数据搬进 IndexedDB，幂等
 * - 配额：checkQuota() 用 navigator.storage.estimate() 检测剩余空间，不足时 console.warn
 *
 * 注意：设置项（主题 / AI 设置 / 加速开关 / 兑奖弹窗已标记）仍留在 localStorage，不在此处迁移。
 */

const DB_NAME = 'lottery-picker'
const DB_VERSION = 1

export const STORE_DRAWS = 'draws'
export const STORE_PICKS = 'picks'

/** localStorage 迁移版本号：未设置 = v0（纯 localStorage）；当前版本 = '1'（已迁 IndexedDB） */
const SCHEMA_KEY = 'lp-schema-version'
const SCHEMA_VERSION = '1'

/** 旧 localStorage key 前缀（迁移来源） */
const DRAW_PREFIX = 'lp-data-'
const PICKS_PREFIX = 'lottery-picker-mypicks-'

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
        if (!db.objectStoreNames.contains(STORE_DRAWS)) db.createObjectStore(STORE_DRAWS)
        if (!db.objectStoreNames.contains(STORE_PICKS)) db.createObjectStore(STORE_PICKS)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'))
    })
  }
  // 失败后允许下次重试：清掉缓存的 reject，避免永久 stuck
  dbPromise.catch(() => {
    dbPromise = null
  })
  return dbPromise
}

/** 通用单请求事务封装 */
type TxMode = 'readonly' | 'readwrite' | 'versionchange'
function withRequest<T>(store: string, mode: TxMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = run(tx.objectStore(store))
        req.onsuccess = () => resolve(req.result as T)
        req.onerror = () => reject(req.error || new Error('IndexedDB 请求失败'))
      })
  )
}

/** 读一条；不存在返回 undefined */
export function get<T = unknown>(store: string, key: string): Promise<T | undefined> {
  return withRequest<T | undefined>(store, 'readonly', (s) => s.get(key))
}

/** 写一条（存在则覆盖） */
export function set(store: string, key: string, value: unknown): Promise<void> {
  return withRequest<unknown>(store, 'readwrite', (s) => s.put(value, key)).then(() => undefined)
}

/** 读 store 全部 */
export function getAll<T = unknown>(store: string): Promise<T[]> {
  return withRequest<T[]>(store, 'readonly', (s) => s.getAll())
}

/** 删一条（任务称 delete API；`delete` 是保留字不能做函数名，导出为 del） */
export function del(store: string, key: string): Promise<void> {
  return withRequest<undefined>(store, 'readwrite', (s) => s.delete(key)).then(() => undefined)
}

/** 清空整个 store */
export function clear(store: string): Promise<void> {
  return withRequest<undefined>(store, 'readwrite', (s) => s.clear()).then(() => undefined)
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
