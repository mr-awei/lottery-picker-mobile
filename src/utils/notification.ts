// 开奖提醒 / 系统通知（功能 13）。
// 仅 Android App（@capacitor/local-notifications）真正生效；浏览器 / dev 环境下
// schedule 会 reject，所有调用均 try/catch 包裹，不影响其他功能。
//
// 设置存储 key：'lp-notification-settings'
// 结构：{ enabled: boolean, perGame: {ssq: true, ...}, remindBefore: boolean, remindAfter: boolean }
//   - remindBefore: 开奖前 15 分钟提醒
//   - remindAfter:  开奖后 5 分钟提醒

import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { GAME_CONFIG, GAME_KEYS } from './game-config'

export const NOTIFICATION_SETTINGS_KEY = 'lp-notification-settings'

// 中文星期 → Date.getDay() 数值（周日=0）
const WEEKDAY_MAP = { 日: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }

export const DEFAULT_NOTIFICATION_SETTINGS = {
  enabled: false,
  perGame: Object.fromEntries(GAME_KEYS.map((k) => [k, true])),
  remindBefore: true,
  remindAfter: false
}

/** 读取本地提醒设置（带默认值兜底） */
export function loadNotificationSettings() {
  try {
    const raw = localStorage.getItem(NOTIFICATION_SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_NOTIFICATION_SETTINGS }
    const parsed = JSON.parse(raw)
    return {
      enabled: !!parsed.enabled,
      perGame: { ...DEFAULT_NOTIFICATION_SETTINGS.perGame, ...(parsed.perGame || {}) },
      remindBefore: parsed.remindBefore !== false,
      remindAfter: !!parsed.remindAfter
    }
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS }
  }
}

/** 持久化提醒设置 */
export function saveNotificationSettings(settings) {
  try {
    localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* 存储不可用时忽略 */
  }
}

/** 是否原生 Android 环境（浏览器 / dev 不支持本地通知） */
export function isNotificationSupported() {
  return Capacitor.getPlatform() === 'android'
}

/**
 * 解析 drawDaysText（如 "每周二、四、日 21:15" / "每日 21:30"），
 * 返回 { days: number[], hour, minute }，解析失败返回 null。
 */
function parseDrawSchedule(drawDaysText) {
  if (!drawDaysText) return null
  const m = String(drawDaysText).match(/(\d{1,2}):(\d{2})\s*$/)
  if (!m) return null
  const hour = Number(m[1])
  const minute = Number(m[2])
  if (/每日|每天|天天/.test(drawDaysText)) {
    return { days: [0, 1, 2, 3, 4, 5, 6], hour, minute }
  }
  const weekM = drawDaysText.match(/每周(.+?)\s+\d{1,2}:\d{2}/)
  if (!weekM) return null
  const days = []
  for (const ch of weekM[1]) {
    if (WEEKDAY_MAP[ch] != null) days.push(WEEKDAY_MAP[ch])
  }
  return days.length ? { days: [...new Set(days)], hour, minute } : null
}

/** 计算某彩种下一次开奖时间（未来时间），无可用时间返回 null */
function nextDrawDate(schedule) {
  if (!schedule) return null
  const now = new Date()
  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date(now)
    d.setDate(now.getDate() + offset)
    d.setHours(schedule.hour, schedule.minute, 0, 0)
    if (schedule.days.includes(d.getDay()) && d.getTime() > now.getTime()) return d
  }
  return null
}

/** 生成该彩种的通知 id（gameIndex*10 + typeIndex），避免冲突 */
function notifyId(gameIndex, typeIndex) {
  return gameIndex * 10 + typeIndex
}

/** 取消全部开奖提醒通知（覆盖 8 彩种 × 2 类型的全部 id） */
export async function cancelAllNotifications() {
  if (!isNotificationSupported()) return
  try {
    const ids = []
    GAME_KEYS.forEach((_, gi) => {
      ids.push({ id: notifyId(gi, 0) })
      ids.push({ id: notifyId(gi, 1) })
    })
    await LocalNotifications.cancel({ notifications: ids })
  } catch {
    /* 浏览器环境 reject，忽略 */
  }
}

/**
 * 根据设置重新调度全部开奖提醒。
 * 每次调用先取消旧通知，再按设置调度。
 */
export async function scheduleDrawNotifications(settings) {
  if (!isNotificationSupported()) return
  const s = settings || loadNotificationSettings()
  await cancelAllNotifications()
  if (!s.enabled) return
  try {
    const pending = []
    GAME_KEYS.forEach((key, gi) => {
      if (!s.perGame[key]) return
      const cfg = GAME_CONFIG[key]
      const schedule = parseDrawSchedule(cfg && cfg.drawDaysText)
      const drawAt = nextDrawDate(schedule)
      if (!drawAt) return
      const timeText = `${pad2(schedule.hour)}:${pad2(schedule.minute)}`
      if (s.remindBefore) {
        const at = new Date(drawAt.getTime() - 15 * 60000)
        if (at.getTime() > Date.now()) {
          pending.push({
            id: notifyId(gi, 0),
            title: `${cfg.name}开奖提醒`,
            body: `${cfg.name}将于 ${timeText} 开奖，距开奖还有 15 分钟`,
            schedule: { at }
          })
        }
      }
      if (s.remindAfter) {
        const at = new Date(drawAt.getTime() + 5 * 60000)
        pending.push({
          id: notifyId(gi, 1),
          title: `${cfg.name}开奖结果`,
          body: '点击查看最新开奖号码',
          schedule: { at }
        })
      }
    })
    if (pending.length) await LocalNotifications.schedule({ notifications: pending })
  } catch (e) {
    console.warn('开奖提醒调度失败（非原生环境可忽略）', e)
  }
}

/** 首次开启全局开关时请求通知权限 */
export async function requestNotificationPermission() {
  if (!isNotificationSupported()) return { display: 'denied' }
  try {
    return await LocalNotifications.requestPermissions()
  } catch {
    return { display: 'denied' }
  }
}

function pad2(n) {
  return String(n).padStart(2, '0')
}
