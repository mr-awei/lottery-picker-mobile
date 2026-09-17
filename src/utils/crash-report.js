// 前端本地崩溃捕获：window.onerror + unhandledrejection，最多保留 50 条到 localStorage
// 不引入任何第三方崩溃 SDK，纯本地记录，供设置页查看/导出
const STORAGE_KEY = 'lp-crash-logs'
const MAX_ENTRIES = 50

function readLogs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch (e) {
    return []
  }
}

function writeLogs(arr) {
  try {
    const trimmed = arr.slice(0, MAX_ENTRIES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch (e) {
    /* 存储已满或不可用时静默丢弃 */
  }
}

function pushLog(entry) {
  const logs = readLogs()
  logs.unshift(entry)
  writeLogs(logs)
}

function normalizeError(e) {
  if (!e) return ''
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.stack ? String(e.stack) : String(e.message || e)
  try {
    return JSON.stringify(e)
  } catch (_) {
    return String(e)
  }
}

export function getCrashLogs() {
  return readLogs()
}

export function clearCrashLogs() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (e) {
    /* ignore */
  }
}

export function exportCrashLogs() {
  const logs = readLogs()
  const lines = [
    '# 彩票选号器 崩溃日志导出',
    '# 导出时间：' + new Date().toISOString(),
    '# 共 ' + logs.length + ' 条',
    ''
  ]
  logs.forEach((log, i) => {
    lines.push('--- [' + (i + 1) + '] ' + (log.timestamp || '') + ' ---')
    lines.push('类型：' + (log.type || 'unknown'))
    if (log.message) lines.push('信息：' + log.message)
    if (log.source) lines.push('来源：' + log.source)
    if (log.lineno != null) lines.push('行列：' + log.lineno + ':' + (log.colno != null ? log.colno : ''))
    if (log.reason) lines.push('未处理拒绝：' + log.reason)
    if (log.stack) lines.push('堆栈：\n' + log.stack)
    lines.push('')
  })
  const text = lines.join('\n')
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'lp-crash-logs-' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return logs.length
}

let installed = false

export function installCrashReporter() {
  if (installed) return
  installed = true

  window.onerror = function (message, source, lineno, colno, error) {
    pushLog({
      type: 'onerror',
      message: String(message || ''),
      source: String(source || ''),
      lineno: lineno != null ? lineno : null,
      colno: colno != null ? colno : null,
      stack: normalizeError(error),
      timestamp: new Date().toISOString()
    })
    return false
  }

  window.onunhandledrejection = function (event) {
    pushLog({
      type: 'unhandledrejection',
      message: '未处理的 Promise 拒绝',
      reason: normalizeError(event && event.reason),
      timestamp: new Date().toISOString()
    })
  }
}
