<template>
  <div>
    <div class="card-title">设置</div>

    <div class="set-card">
      <div class="set-group-title">基本设置</div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">外观主题</div>
          <div class="set-desc">浅色 / 深色界面切换，选择后即时生效并自动记忆</div>
        </div>
        <el-switch
          :model-value="theme === 'dark'"
          active-text="深色"
          inactive-text="浅色"
          @change="onThemeChange"
        />
      </div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">自动刷新数据</div>
          <div class="set-desc">临近开奖时间（前 30 分钟）每分钟刷新，其余时间每 30 分钟刷新一次</div>
        </div>
        <el-switch
          :model-value="autoRefresh"
          @change="onAutoRefreshChange"
        />
      </div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">当前彩种</div>
          <div class="set-desc">顶栏切换双色球 / 大乐透，各自数据独立缓存</div>
        </div>
        <div class="dim">{{ cfg.name }} · 开奖 {{ drawDaysText }}</div>
      </div>
    </div>

    <div class="set-card">
      <div class="set-group-title">AI 选号</div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">AI 一直选上限次数</div>
          <div class="set-desc">AI 一直选最大尝试次数（1000 ~ 100 万）。达到该次数仍未达预期分时，取最高分组合</div>
        </div>
        <el-input-number v-model="maxAttempts" :min="1000" :max="1000000" :step="1000" size="small" style="width: 160px" @change="onMaxAttemptsChange" />
      </div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">暴力模式</div>
          <div class="set-desc">开启后 AI 一直选即使达到预期分也不停止，一直跑到设定次数，并统计多次出现的号码</div>
        </div>
        <el-switch v-model="violentMode" @change="onViolentModeChange" />
      </div>
      <div class="set-row" v-if="violentMode">
        <div class="set-info">
          <div class="set-label">暴力模式次数</div>
          <div class="set-desc">建议 10 万 / 100 万，次数越多耗时越长，期间可随时切走或关闭</div>
        </div>
        <el-input-number v-model="violentAttempts" :min="10000" :max="1000000" :step="10000" size="small" style="width: 160px" @change="onViolentAttemptsChange" />
      </div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">多线程加速</div>
          <div class="set-desc">将 AI 一直选 / 暴力模式的大量小运算拆分到后台多线程（Web Worker）并行计算，主线程（界面、动画）完全不阻塞，按设备核数自适应 2–4 核并行。默认关闭，AI 一直选 / 暴力模式推荐开启。</div>
        </div>
        <el-switch v-model="gpuAccel" @change="onGpuAccelChange" />
      </div>
      <div class="set-row" v-if="gpuAccel">
        <div class="set-info">
          <div class="set-label">当前加速后端</div>
          <div class="set-desc">{{ accelBackendNote }}</div>
        </div>
        <span class="accel-badge" :class="accelBadgeClass">{{ accelBackendLabel }}</span>
      </div>
    </div>

    <div class="set-card">
      <div class="set-group-title">更新公告</div>
      <div class="changelog-list">
        <div v-for="ver in CHANGELOG" :key="ver.version" class="changelog-item">
          <div class="changelog-head">
            <span class="changelog-version">v{{ ver.version }}</span>
            <span class="changelog-date dim">{{ ver.date }} · {{ ver.title }}</span>
          </div>
          <ul class="changelog-items">
            <li v-for="(item, i) in ver.items" :key="i">{{ item }}</li>
          </ul>
        </div>
      </div>
    </div>

    <div class="set-card">
      <div class="set-group-title">关于软件</div>
      <div class="about-box">
        <div class="about-name">彩票选号器</div>
        <div class="about-sub">LOTTERY PICKER v{{ APP_VERSION }}</div>
        <el-divider style="margin: 14px 0" />
        <div class="about-line">本软件完全<b style="color: var(--success)">免费</b>，仅供个人娱乐与学习参考使用。</div>
        <div class="about-line">严禁任何个人或组织对本软件进行<b>倒卖、转售、收费代安装</b>等盈利行为；严禁将软件内置的选号引擎、统计方法用于商业用途。</div>
        <div class="about-line">软件不含任何内购、广告与付费功能，若您通过付费渠道获得本软件，请立即联系平台举报。</div>
        <el-divider style="margin: 14px 0" />
        <div class="about-line dim">理性购彩提示：彩票开奖为独立随机事件，本软件提供的所有统计、评分、推荐均不提高中奖概率，仅供组合参考。未成年人不得购彩，请量力而行。</div>
        <div class="about-line dim">数据来源：中国福利彩票发行管理中心（双色球）与中国体育彩票官方公开接口。数据可能存在延迟或异常，请以官方公告为准。</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { GAME_CONFIG } from '../utils/game-config'
import { theme, applyTheme } from '../utils/ui-state'
import { APP_VERSION, CHANGELOG } from '../utils/version'
import { isAccelEnabled, setAccelEnabled, getBackendLabel, detectBackend } from '../utils/gpu-accel'

const props = defineProps({
  game: { type: String, required: true }
})

const AUTO_REFRESH_KEY = 'lp-auto-refresh'
const autoRefresh = ref(localStorage.getItem(AUTO_REFRESH_KEY) !== 'off')

// AI 选号设置：上限次数 / 暴力模式开关与次数（AiPicker 读取同一 localStorage key）
const MAX_ATTEMPTS_KEY = 'lp-ai-max-attempts'
const VIOLENT_KEY = 'lp-ai-violent'
const VIOLENT_ATTEMPTS_KEY = 'lp-ai-violent-attempts'
const maxAttempts = ref(Number(localStorage.getItem(MAX_ATTEMPTS_KEY)) || 20000)
const violentMode = ref(localStorage.getItem(VIOLENT_KEY) === 'on')
const violentAttempts = ref(Number(localStorage.getItem(VIOLENT_ATTEMPTS_KEY)) || 100000)

// 多线程加速开关（持久化在 gpu-accel.js 内部，含旧 key 兼容）
const gpuAccel = ref(isAccelEnabled())
const accelBackendLabel = ref('—')
const accelBadgeClass = ref('badge-off')
const accelBackendNote = ref('')

async function refreshAccelBackend() {
  if (!gpuAccel.value) {
    accelBackendLabel.value = '已关闭'
    accelBadgeClass.value = 'badge-off'
    accelBackendNote.value = '开启后，AI 选号与暴力模式的大量小运算将拆分到后台多线程并行计算，界面不再卡顿'
    return
  }
  const label = await getBackendLabel()
  accelBackendLabel.value = label
  const isGpu = label.indexOf('GPU 计算') === 0
  const isMt = label.indexOf('多线程加速') === 0
  accelBadgeClass.value = isGpu ? 'badge-gpu' : (isMt ? 'badge-worker' : 'badge-off')
  accelBackendNote.value = isGpu
    ? '当前设备支持 WebGPU：选号生成与评分在 GPU 上并行执行'
    : (isMt
      ? '当前设备通过后台多线程并行计算（Capacitor 以本地文件加载时 WebGPU 不可用，多线程是真加速主路径）'
      : '本设备暂不支持硬件/多线程加速，开启亦无效')
}

onMounted(refreshAccelBackend)

function onGpuAccelChange(val) {
  setAccelEnabled(val)
  window.dispatchEvent(new CustomEvent('lp-accel-change', { detail: { on: val } }))
  refreshAccelBackend()
}

const cfg = computed(() => GAME_CONFIG[props.game])
const drawDaysText = computed(() => cfg.value.drawDaysText || (props.game === 'ssq' ? '每周二、四、日 21:15' : '每周一、三、六 21:25'))

function onThemeChange(val) {
  applyTheme(val ? 'dark' : 'light')
}

function onAutoRefreshChange(val) {
  autoRefresh.value = val
  localStorage.setItem(AUTO_REFRESH_KEY, val ? 'on' : 'off')
  window.dispatchEvent(new CustomEvent('lp-auto-refresh-change', { detail: { on: val } }))
}

function onMaxAttemptsChange(val) {
  localStorage.setItem(MAX_ATTEMPTS_KEY, String(val || 20000))
  window.dispatchEvent(new CustomEvent('lp-ai-settings-change'))
}

function onViolentModeChange(val) {
  localStorage.setItem(VIOLENT_KEY, val ? 'on' : 'off')
  window.dispatchEvent(new CustomEvent('lp-ai-settings-change'))
}

function onViolentAttemptsChange(val) {
  localStorage.setItem(VIOLENT_ATTEMPTS_KEY, String(val || 100000))
  window.dispatchEvent(new CustomEvent('lp-ai-settings-change'))
}
</script>

<style scoped>
.set-card {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--card-bg);
  padding: 16px 18px;
  margin-bottom: 16px;
}

.set-group-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 10px;
}

.set-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-top: 1px solid var(--border-light);
}

.set-row:first-of-type {
  border-top: none;
}

.set-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.set-desc {
  font-size: 12px;
  color: var(--text-dim);
  margin-top: 3px;
  max-width: 520px;
}

/* 加速后端徽标（与 AiPicker 一致） */
.accel-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.6;
  white-space: nowrap;
}
.accel-badge::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 6px currentColor;
}
.badge-gpu { color: #7b3ff2; background: rgba(123, 63, 242, 0.12); }
.badge-worker { color: #0a8f6b; background: rgba(10, 143, 107, 0.12); }
.badge-off { color: var(--text-muted); background: rgba(120, 130, 150, 0.12); }

.about-box {
  font-size: 13px;
  line-height: 2;
  color: var(--text-main);
}

.about-name {
  font-size: 20px;
  font-weight: 800;
}

.about-sub {
  font-size: 12px;
  color: var(--text-dim);
  letter-spacing: 1px;
}

.changelog-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.changelog-item {
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--card-inset);
  padding: 12px 14px;
}

.changelog-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.changelog-version {
  font-size: 14px;
  font-weight: 800;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid rgba(246, 196, 83, 0.35);
  border-radius: 999px;
  padding: 2px 12px;
}

.changelog-date {
  font-size: 12px;
}

.changelog-items {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.9;
  color: var(--text-main);
}
@media (max-width: 768px) {
  .set-card { padding: 12px 14px; }
  .set-row { gap: 10px; }
}
</style>
