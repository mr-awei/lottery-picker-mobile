<template>
  <div class="app" :class="'theme-' + activeGame">
    <!-- 顶部栏：logo + 主题切换 + 刷新 -->
    <header class="app-header">
      <div class="brand">
        <div class="brand-logo">
          <span class="logo-ball b1"></span>
          <span class="logo-ball b2"></span>
          <span class="logo-ball b3"></span>
        </div>
        <div class="brand-text">
          <div class="brand-title">彩票选号器</div>
          <div class="brand-sub">DAILY LOTTERY PICKER</div>
        </div>
      </div>
      <div class="app-actions">
        <span class="status-pill" v-if="statusText" :title="statusText">
          <i class="dot" :class="{ warn: statusWarn }"></i>{{ statusText }}
        </span>
        <button class="theme-btn" :title="theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'" @click="toggleTheme">
          <svg v-if="theme === 'dark'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="theme-icon">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="theme-icon">
            <path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" />
          </svg>
        </button>
        <el-button class="refresh-btn" :loading="refreshing" @click="refreshAll">
          {{ refreshing ? '刷新中…' : '刷新' }}
        </el-button>
      </div>
    </header>

    <!-- 彩种切换 (横向滚动胶囊) -->
    <div class="game-switch-row">
      <div class="game-switch" ref="gameSwitchEl">
        <button
          v-for="g in GAME_LIST"
          :key="g.key"
          :class="{ active: activeGame === g.key }"
          @click="switchGame(g.key)"
        >{{ g.name }}</button>
      </div>
    </div>

    <!-- 倒计时 banner -->
    <div v-if="nextDrawText" class="next-draw-bar">{{ nextDrawText }}</div>

    <!-- 主区 -->
    <div class="app-body">
      <transition name="fade" mode="out-in">
        <LotteryBoard
          :key="activeGame"
          :game="activeGame"
          :draws="draws[activeGame]"
          :loading="loading[activeGame]"
          :error="error[activeGame]"
          @retry="loadGame(activeGame, true)"
        />
      </transition>
    </div>

    <!-- 每日理性购彩弹窗 -->
    <el-dialog
      v-model="tipVisible"
      :show-close="false"
      width="90%"
      class="daily-tip-dialog"
      align-center
    >
      <div class="tip-box">
        <div class="tip-orb">
          <span class="tip-ball tb1"></span>
          <span class="tip-ball tb2"></span>
          <span class="tip-ball tb3"></span>
        </div>
        <div class="tip-title">理性购彩提醒</div>
        <div class="tip-sub">RATIONAL LOTTERY NOTICE</div>
        <ul class="tip-list">
          <li v-for="(line, i) in tipLines" :key="i">{{ line }}</li>
        </ul>
        <el-button class="tip-btn" type="danger" round @click="tipVisible = false">我知道了</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import LotteryBoard from './components/LotteryBoard.vue'
import { theme, toggleTheme } from './utils/ui-state'
import { lotteryApi } from './utils/mobile-api'

const DAILY_TIP_KEY = 'lp-daily-tip'
const gameSwitchEl = ref(null)

function todayStr() {
  const d = new Date()
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const tipVisible = ref(false)
const tipLines = [
  '彩票开奖为独立随机事件，本软件所有选号、评分、统计与推荐均不提高中奖概率，仅供娱乐参考。',
  '本软件完全免费，不含任何内购、广告与付费功能。',
  '若您通过付费渠道（收费代购、倒卖、转售、付费安装等）获得本软件，请立即要求退款，并向所在平台举报。',
  '未成年人禁止购彩；请理性投注、量力而行，切勿沉迷。'
]

function showDailyTipIfNeeded() {
  try {
    if (localStorage.getItem(DAILY_TIP_KEY) === todayStr()) return
    localStorage.setItem(DAILY_TIP_KEY, todayStr())
    tipVisible.value = true
  } catch (e) {
    /* 存储不可用时忽略弹窗 */
  }
}

const activeGame = ref('ssq')

const GAME_LIST = [
  { key: 'ssq', name: '双色球' },
  { key: 'dlt', name: '大乐透' },
  { key: 'qlc', name: '七乐彩' },
  { key: 'kl8', name: '快乐8' },
  { key: 'fc3d', name: '福彩3D' },
  { key: 'pl3', name: '排列3' },
  { key: 'pl5', name: '排列5' },
  { key: 'qxc', name: '7星彩' }
]
const GAME_NAMES = Object.fromEntries(GAME_LIST.map((g) => [g.key, g.name]))
const GAME_KEYS = GAME_LIST.map((g) => g.key)

const draws = reactive(Object.fromEntries(GAME_KEYS.map((k) => [k, null])))
const loading = reactive(Object.fromEntries(GAME_KEYS.map((k) => [k, false])))
const error = reactive(Object.fromEntries(GAME_KEYS.map((k) => [k, ''])))
// 请求序号（1.8.3）：同一彩种并发/连续刷新时，后发请求的结果优先，
// 丢弃过期响应，避免慢的旧请求覆盖新数据（竞态修复）
const loadSeq = Object.fromEntries(GAME_KEYS.map((k) => [k, 0]))
const refreshing = ref(false)
const statusText = ref('')
const statusWarn = ref(false)
const nextDrawText = ref('')
const AUTO_REFRESH_KEY = 'lp-auto-refresh'

const DRAW_SCHEDULE = {
  ssq: { days: [0, 2, 4], hour: 21, minute: 15, name: '双色球' },
  dlt: { days: [1, 3, 6], hour: 21, minute: 25, name: '大乐透' },
  qlc: { days: [1, 3, 5], hour: 21, minute: 15, name: '七乐彩' },
  kl8: { days: [0, 1, 2, 3, 4, 5, 6], hour: 21, minute: 30, name: '快乐8' },
  fc3d: { days: [0, 1, 2, 3, 4, 5, 6], hour: 21, minute: 15, name: '福彩3D' },
  pl3: { days: [0, 1, 2, 3, 4, 5, 6], hour: 21, minute: 25, name: '排列3' },
  pl5: { days: [0, 1, 2, 3, 4, 5, 6], hour: 21, minute: 25, name: '排列5' },
  qxc: { days: [2, 5, 0], hour: 21, minute: 25, name: '7星彩' }
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function nextDraw(game) {
  const s = DRAW_SCHEDULE[game]
  if (!s) return null
  const now = new Date()
  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date(now)
    d.setDate(now.getDate() + offset)
    d.setHours(s.hour, s.minute, 0, 0)
    if (s.days.includes(d.getDay()) && d.getTime() > now.getTime()) {
      return { dayOffset: offset, time: d }
    }
  }
  return null
}

function updateNextDrawText() {
  const n = nextDraw(activeGame.value)
  if (!n) {
    nextDrawText.value = ''
    return
  }
  const s = DRAW_SCHEDULE[activeGame.value]
  const diff = n.time.getTime() - Date.now()
  const hours = Math.floor(diff / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const dayText = n.dayOffset === 0 ? '今天' : n.dayOffset === 1 ? '明天' : dayNames[n.time.getDay()]
  nextDrawText.value = `${s.name} ${dayText} ${pad2(s.hour)}:${pad2(s.minute)} 开奖${hours > 0 ? ` · 距开奖 ${hours} 小时 ${mins} 分` : ` · 距开奖 ${mins} 分钟`}`
}

function pad2(x) {
  return String(x).padStart(2, '0')
}

async function loadGame(game, force) {
  if (!lotteryApi) {
    error[game] = '运行环境异常：未检测到数据接口'
    return
  }
  const seq = ++loadSeq[game]
  loading[game] = true
  error[game] = ''
  const gname = GAME_NAMES[game] || game
  try {
    const r = force ? await lotteryApi.refresh(game) : await lotteryApi.get(game)
    // 过期响应丢弃（期间又有更新的请求）
    if (seq !== loadSeq[game]) return
    if (r && r.ok) {
      draws[game] = r
      const src = r.source === 'cache' ? '缓存' : r.source === 'cache-stale' ? '缓存(抓取失败)' : r.source === 'snapshot' ? '本地快照' : '官方接口'
      statusText.value = `${gname} ${r.draws.length} 期 · 更新于 ${fmtTime(r.updatedAt)} · ${src}`
      statusWarn.value = r.source === 'cache-stale'
    } else {
      error[game] = (r && r.error) || '加载失败'
      statusText.value = `${gname} 数据加载失败`
      statusWarn.value = true
    }
  } catch (e) {
    if (seq !== loadSeq[game]) return
    error[game] = e.message || String(e)
    statusText.value = `${gname} 数据加载失败`
    statusWarn.value = true
  }
  loading[game] = false
}

function switchGame(game) {
  if (activeGame.value === game) return
  activeGame.value = game
  updateNextDrawText()
  if (!draws[game]) loadGame(game, false)
  scrollActiveGameIntoView()
}

function scrollActiveGameIntoView() {
  const el = gameSwitchEl.value
  if (!el) return
  const active = el.querySelector('button.active')
  if (!active) return
  const elRect = el.getBoundingClientRect()
  const btnRect = active.getBoundingClientRect()
  if (btnRect.left < elRect.left || btnRect.right > elRect.right) {
    el.scrollTo({
      left: active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2,
      behavior: 'smooth'
    })
  }
}

function snapGameSwitch() {
  const el = gameSwitchEl.value
  if (!el) return
  const btns = el.querySelectorAll('button')
  if (!btns.length) return
  const center = el.scrollLeft + el.clientWidth / 2
  let best = btns[0]
  let bestDist = Infinity
  btns.forEach((b) => {
    const d = Math.abs(b.offsetLeft + b.offsetWidth / 2 - center)
    if (d < bestDist) {
      bestDist = d
      best = b
    }
  })
  el.scrollTo({
    left: best.offsetLeft - (el.clientWidth - best.offsetWidth) / 2,
    behavior: 'smooth'
  })
}

async function refreshAll() {
  refreshing.value = true
  // 修复（1.8.3）：8 彩种并发刷新易触发官方接口限流（Connection reset/429），改为串行
  for (const g of GAME_KEYS) {
    await loadGame(g, true)
  }
  refreshing.value = false
}

let timer = null
let lastAutoRefresh = Date.now()

function autoRefreshEnabled() {
  return localStorage.getItem(AUTO_REFRESH_KEY) !== 'off'
}

function autoTick() {
  updateNextDrawText()
  if (!autoRefreshEnabled()) return
  const n = nextDraw(activeGame.value)
  if (!n) return
  const minsToDraw = (n.time.getTime() - Date.now()) / 60000
  const intervalMs = minsToDraw <= 30 ? 60000 : 30 * 60000
  if (Date.now() - lastAutoRefresh >= intervalMs) {
    lastAutoRefresh = Date.now()
    loadGame(activeGame.value, true)
  }
}

function onAutoRefreshChange(e) {
  if (e && e.detail && e.detail.on) {
    lastAutoRefresh = Date.now()
  }
}

onMounted(() => {
  GAME_KEYS.forEach((g) => loadGame(g, false))
  updateNextDrawText()
  scrollActiveGameIntoView()
  gameSwitchEl.value?.addEventListener('scrollend', snapGameSwitch)
  gameSwitchEl.value?.addEventListener('touchend', snapGameSwitch)
  timer = setInterval(autoTick, 60000)
  window.addEventListener('lp-auto-refresh-change', onAutoRefreshChange)
  showDailyTipIfNeeded()
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  gameSwitchEl.value?.removeEventListener('scrollend', snapGameSwitch)
  gameSwitchEl.value?.removeEventListener('touchend', snapGameSwitch)
  window.removeEventListener('lp-auto-refresh-change', onAutoRefreshChange)
})
</script>

<style>
/* 每日理性购彩弹窗 */
.daily-tip-dialog {
  border-radius: var(--r-lg);
  overflow: hidden;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-3);
}
.daily-tip-dialog .el-dialog__header { display: none; }
.daily-tip-dialog .el-dialog__body { padding: 0; }

.tip-box {
  padding: 32px 36px 30px;
  text-align: center;
  background: linear-gradient(180deg, var(--surface-card) 0%, var(--surface-subtle) 100%);
  color: var(--text-primary);
  position: relative;
  overflow: hidden;
  animation: tip-pop 0.32s var(--ease-out);
}

@keyframes tip-pop {
  from { opacity: 0; transform: scale(0.92) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.tip-box::before {
  content: '';
  position: absolute;
  top: -70px;
  left: 50%;
  transform: translateX(-50%);
  width: 320px;
  height: 320px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--brand-soft) 0%, transparent 70%);
  pointer-events: none;
}

.tip-orb {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
}

.tip-ball {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: inline-block;
  box-shadow: 0 3px 10px rgba(22, 38, 74, 0.18);
  animation: tip-bounce 1.4s ease-in-out infinite;
}
.tip-ball.tb1 {
  background: radial-gradient(circle at 32% 28%, #ff8a8a, var(--red-deep) 100%);
}
.tip-ball.tb2 {
  background: radial-gradient(circle at 32% 28%, #ffd36b, #d99a1f 100%);
  animation-delay: 0.18s;
}
.tip-ball.tb3 {
  background: radial-gradient(circle at 32% 28%, #6aa0ff, var(--blue-deep) 100%);
  animation-delay: 0.36s;
}

@keyframes tip-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.tip-title {
  font-size: var(--fs-24);
  font-weight: 800;
  letter-spacing: 2px;
  color: var(--brand-strong);
  margin-bottom: 4px;
}
.tip-sub {
  font-size: var(--fs-11);
  letter-spacing: 3px;
  color: var(--text-muted);
  margin-bottom: 18px;
}
.tip-list {
  list-style: none;
  margin: 0 0 24px 0;
  padding: 0;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tip-list li {
  position: relative;
  padding-left: 18px;
  font-size: var(--fs-13);
  line-height: 1.6;
  color: var(--text-secondary);
}
.tip-list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 7px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: linear-gradient(90deg, var(--red), var(--brand));
}

.tip-btn {
  min-width: 150px;
  font-weight: 600;
  letter-spacing: 2px;
  transition: transform var(--dur-fast) var(--ease-out);
}
.tip-btn:active { transform: scale(0.96); }
</style>
