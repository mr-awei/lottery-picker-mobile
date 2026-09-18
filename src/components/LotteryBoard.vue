<template>
  <div class="board">
    <!-- 错误态 -->
    <div v-if="error && !isLocalView" class="board-error">
      <el-empty :description="`数据加载失败：${error}`">
        <div class="net-tip">若一直失败，请检查：① 手机已连接网络（Wi-Fi/流量）；② 系统设置 → 应用 → 彩票选号器 → 权限 → 允许「完全的网络访问权限」（部分系统默认需手动开启）</div>
        <el-button type="primary" @click="$emit('retry')">重试</el-button>
      </el-empty>
    </div>

    <!-- 二级标签 (segmented-control 风格) —— 子 tab ≤ 1 个时直接隐藏，避免孤零零一个胶囊 -->
    <nav v-if="!boardError && currentGroup.children.length > 1" class="seg-tabs" role="tablist">
      <button
        v-for="item in currentGroup.children"
        :key="item.key"
        type="button"
        role="tab"
        :aria-selected="active === item.key"
        class="seg-tab"
        :class="{ active: active === item.key }"
        @click="active = item.key"
      >
        <svg class="seg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path :d="item.icon" />
        </svg>
        <span class="seg-label">{{ item.label }}</span>
      </button>
    </nav>

    <!-- 主内容卡片 -->
    <div class="board-main">
      <template v-if="!isLocalView && loading && !draws">
        <div class="empty-tip">数据加载中…（首次抓取约需 10~30 秒）</div>
      </template>
      <template v-else-if="!isLocalView && (!draws || !draws.draws || !draws.draws.length)">
        <div class="empty-tip">暂无数据，请点击右上角「刷新」</div>
      </template>
      <!-- keep-alive 保活本地视图（尤其 AI 选号）：切 tab（game 不变）时组件不卸载，长任务继续跑、进度不丢。
           切彩种时 active+game 组合 key 变化 → 命中不到缓存 → 重建并重置状态。 -->
      <keep-alive v-else>
        <component :is="currentView" :key="active + '-' + props.game" v-bind="compProps" />
      </keep-alive>
    </div>

    <!-- 底部 TabBar (4 个一组) -->
    <nav class="bottom-tabs">
      <button
        v-for="group in navGroups"
        :key="group.key"
        type="button"
        class="bottom-tab"
        :class="{ active: currentGroup.key === group.key }"
        @click="switchGroup(group)"
      >
        <svg class="bottom-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path :d="group.icon" />
        </svg>
        <span class="bottom-tab-label">{{ group.label }}</span>
      </button>
    </nav>
  </div>
</template>

<script setup>
import { ref, computed, defineAsyncComponent } from 'vue'
import { GAME_CONFIG } from '../utils/game-config'
import { uiState } from '../utils/ui-state'

// 向父组件（App.vue）声明 retry 事件，避免隐式 $emit
defineEmits(['retry'])

/* 首屏优化（1.9.11）：20 个子视图改为异步组件，按需加载。
   原静态 import 会把全部视图（含 9 个引入 echarts 的图表视图）打进主 chunk，
   使 WebView 首屏必须同步解析约 2.6MB JS，表现为白屏/黑屏数秒。
   改为懒加载后：首屏只加载当前 tab 的视图，echarts（~700KB）延迟到
   首次进入图表 tab 时才加载。keep-alive 保活行为不变。 */
const HistoryTable = defineAsyncComponent(() => import('./HistoryTable.vue'))
const DistributionChart = defineAsyncComponent(() => import('./DistributionChart.vue'))
const TrendChart = defineAsyncComponent(() => import('./TrendChart.vue'))
const MaxPrizeCard = defineAsyncComponent(() => import('./MaxPrizeCard.vue'))
const PrizeMap = defineAsyncComponent(() => import('./PrizeMap.vue'))
const PoolView = defineAsyncComponent(() => import('./PoolView.vue'))
const HotColdBoard = defineAsyncComponent(() => import('./HotColdBoard.vue'))
const MatrixView = defineAsyncComponent(() => import('./MatrixView.vue'))
const AiPicker = defineAsyncComponent(() => import('./AiPicker.vue'))
const MyPicks = defineAsyncComponent(() => import('./MyPicks.vue'))
const FileCheck = defineAsyncComponent(() => import('./FileCheck.vue'))
const SplitTool = defineAsyncComponent(() => import('./SplitTool.vue'))
const ChasePlan = defineAsyncComponent(() => import('./ChasePlan.vue'))
const KnowledgeView = defineAsyncComponent(() => import('./KnowledgeView.vue'))
const SettingsView = defineAsyncComponent(() => import('./SettingsView.vue'))
const BacktestView = defineAsyncComponent(() => import('./BacktestView.vue'))
const OmitAnalysis = defineAsyncComponent(() => import('./OmitAnalysis.vue'))
const BlueAnalysis = defineAsyncComponent(() => import('./BlueAnalysis.vue'))
const HistorySameView = defineAsyncComponent(() => import('./HistorySameView.vue'))
const NumberRelationView = defineAsyncComponent(() => import('./NumberRelationView.vue'))

const props = defineProps({
  game: { type: String, required: true },
  draws: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' }
})

const cfg = computed(() => GAME_CONFIG[props.game])

const VIEW_KEYS = {
  history: true, distribution: true, trend: true, maxprize: true,
  map: true, pool: true, hotcold: true, matrix: true,
  ai: true, mypicks: true, filecheck: true, split: true, chase: true,
  knowledge: true, settings: true,
  backtest: true, omit: true, blue: true, historysame: true, relation: true
}

const active = ref(uiState.tab in VIEW_KEYS ? uiState.tab : 'history')

import { watch } from 'vue'
watch(active, (v) => { uiState.tab = v })

const VIEWS = {
  history: HistoryTable,
  distribution: DistributionChart,
  trend: TrendChart,
  maxprize: MaxPrizeCard,
  map: PrizeMap,
  pool: PoolView,
  hotcold: HotColdBoard,
  matrix: MatrixView,
  ai: AiPicker,
  mypicks: MyPicks,
  filecheck: FileCheck,
  split: SplitTool,
  chase: ChasePlan,
  knowledge: KnowledgeView,
  settings: SettingsView,
  backtest: BacktestView,
  omit: OmitAnalysis,
  blue: BlueAnalysis,
  historysame: HistorySameView,
  relation: NumberRelationView
}

/* 4 个一级 tab（合并原 know+settings 为「我的」）
   - 数据 (13) | 选号 (4) | 查奖 (1) | 我的 (2) */
const navGroups = [
  {
    key: 'data',
    label: '数据',
    icon: 'M3 3h18v4H3zM3 10h18v4H3zM3 17h12v4H3z',
    children: [
      { key: 'history',    label: '往期号码', icon: 'M4 6h16M4 12h16M4 18h10' },
      { key: 'distribution', label: '分布图',  icon: 'M4 20V10M10 20V4M16 20v-8M22 20H2' },
      { key: 'trend',      label: '走势图',   icon: 'M3 17l5-5 4 3 6-7 3 3' },
      { key: 'maxprize',   label: '最大奖',   icon: 'M12 2l2.6 5.6 6.1.8-4.5 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.3 8.4l6.1-.8z' },
      { key: 'map',        label: '中奖地图', icon: 'M9 20l-6 2V6l6-2 6 2 6-2v16l-6 2-6-2zM9 4v16M15 6v16' },
      { key: 'pool',       label: '奖池销量', icon: 'M4 19V9m6 10V5m6 14v-7m4 7H2' },
      { key: 'hotcold',    label: '冷热号',   icon: 'M12 3a5 5 0 00-5 5v1a5 5 0 0010 0V8a5 5 0 00-5-5zM8 15v1a4 4 0 008 0v-1M12 20v2' },
      { key: 'matrix',     label: '号码矩阵', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
      { key: 'backtest',   label: '策略回测', icon: 'M3 3v18h18M7 15l4-4 3 3 5-6' },
      { key: 'omit',       label: '遗漏分析', icon: 'M6 4v16M12 4v10M18 4v16M3 20h18' },
      { key: 'blue',       label: '蓝球分析', icon: 'M12 12m-9 0a9 9 0 1018 0 9 9 0 10-18 0zM12 8v4l3 2' },
      { key: 'historysame', label: '历史同期', icon: 'M8 2v4M16 2v4M3 8h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z' },
      { key: 'relation',   label: '号码关系', icon: 'M5 5h4v4H5zM15 15h4v4h-4zM9 7h6M7 9v6' }
    ]
  },
  {
    key: 'pick',
    label: '选号',
    icon: 'M12 4l1.6 3.4 3.8.5-2.8 2.6.7 3.7-3.3-1.8-3.3 1.8.7-3.7L6.6 7.9l3.8-.5zM5 20h14',
    children: [
      { key: 'ai',      label: 'AI 选号',   icon: 'M12 3a5 5 0 00-5 5v1a5 5 0 0010 0V8a5 5 0 00-5-5zM8 15v1a4 4 0 008 0v-1M12 20v2' },
      { key: 'mypicks', label: '自选号',    icon: 'M7 3h7l5 5v13H7zM14 3v5h5M9 13h6M9 17h6' },
      { key: 'split',   label: '复式拆票',  icon: 'M8 3h8v4H8zM4 7h16v4H4zM6 11h12v10H6zM10 15h4' },
      { key: 'chase',   label: '追号计划',  icon: 'M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z' }
    ]
  },
  {
    key: 'check',
    label: '查奖',
    icon: 'M7 3h7l5 5v13H7zM14 3v5h5M9 13h6M9 17h6',
    children: [
      { key: 'filecheck', label: '查中奖', icon: 'M7 3h7l5 5v13H7zM14 3v5h5M9 13h6M9 17h6' }
    ]
  },
  {
    key: 'me',
    label: '我的',
    icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1',
    children: [
      { key: 'knowledge', label: '选号知识', icon: 'M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2zM9 3v18M12 8l2 2 2-2' },
      { key: 'settings',  label: '设置',    icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z' }
    ]
  }
]

const currentGroup = computed(() => {
  return navGroups.find((g) => g.children.some((c) => c.key === active.value)) || navGroups[0]
})

const currentView = computed(() => VIEWS[active.value] || HistoryTable)

const boardError = computed(() => !!(props.error && !isLocalView.value))

const LOCAL_VIEWS = {
  ai: true, mypicks: true, filecheck: true, split: true, chase: true,
  knowledge: true, settings: true
}
const isLocalView = computed(() => !!LOCAL_VIEWS[active.value])

const compProps = computed(() => {
  if (active.value === 'settings') return { game: props.game }
  if (active.value === 'knowledge') return {}
  return { draws: (props.draws && props.draws.draws) || [], cfg: cfg.value }
})

function switchGroup(group) {
  const first = group.children[0]
  if (first) active.value = first.key
}

/** 精确跳到某个一级分组下的指定子 tab（供 MyPicks「去查中奖核对」等跨组件跳转） */
function switchToGroupTab(groupKey, tabKey) {
  const g = navGroups.find((x) => x.key === groupKey)
  if (!g) return
  const c = g.children.find((x) => x.key === tabKey)
  if (c) active.value = c.key
}

function onSwitchTab(e) {
  if (e && e.detail && e.detail.group && e.detail.tab) {
    switchToGroupTab(e.detail.group, e.detail.tab)
  }
}

/** App Shortcuts（长按图标）host → {group, tab} 映射 */
const SHORTCUT_TAB_MAP = {
  ai: { group: 'pick', tab: 'ai' },
  check: { group: 'check', tab: 'filecheck' },
  mypicks: { group: 'pick', tab: 'mypicks' }
}

/** 读取 Android 原生写入的 shortcut tab（冷启动），并清除标记 */
function applyShortcutTab() {
  let host = ''
  try {
    host = localStorage.getItem('lp-shortcut-tab') || ''
    if (host) localStorage.removeItem('lp-shortcut-tab')
  } catch (e) {
    /* localStorage 不可用 */
  }
  const target = SHORTCUT_TAB_MAP[host]
  if (target) switchToGroupTab(target.group, target.tab)
}

/** App 已在前台时通过 CustomEvent 即时切换 */
function onShortcutEvent(e) {
  const host = e && e.detail && e.detail.tab
  const target = SHORTCUT_TAB_MAP[host]
  if (target) switchToGroupTab(target.group, target.tab)
}

import { onMounted, onBeforeUnmount } from 'vue'
onMounted(() => {
  window.addEventListener('lp-switch-tab', onSwitchTab)
  window.addEventListener('lp-shortcut', onShortcutEvent)
  applyShortcutTab()
})
onBeforeUnmount(() => {
  window.removeEventListener('lp-switch-tab', onSwitchTab)
  window.removeEventListener('lp-shortcut', onShortcutEvent)
})
</script>

<style scoped>
/* ============================================================
   .board - 内容区容器（透明，不再是大卡片包裹）
   - 内部各 view 自行用白卡；seg / 底部 tab 用轻边界白卡
   ============================================================ */
.board {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--section-gap, 14px);
  background: transparent;
  overflow: hidden;
}

/* ============================================================
   seg-tabs - 清爽胶囊分段控件
   ============================================================ */
.seg-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-pill, 12px);
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  flex-shrink: 0;
  min-height: 46px;
  box-shadow: var(--shadow-card);
}
.seg-tabs::-webkit-scrollbar { display: none; }

.seg-tab {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--r-pill, 12px);
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  transition: color var(--dur-fast, 0.14s) var(--ease-out), background var(--dur-fast, 0.14s) var(--ease-out), border-color var(--dur-fast, 0.14s) var(--ease-out);
  min-height: 36px;
}
.seg-tab:hover { color: var(--text-primary); background: var(--surface-hover); }
.seg-tab.active {
  color: var(--brand-strong);
  background: var(--brand-soft);
  border-color: var(--border-accent);
}

.seg-icon { width: 16px; height: 16px; flex-shrink: 0; }
.seg-label { line-height: 1; }

/* ============================================================
   board-main - 内容区（可滚动）
   ============================================================ */
.board-main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 2px 2px 8px;
}

.board-error {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  min-height: 220px;
}

.net-tip {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.7;
  text-align: left;
  max-width: 320px;
  margin: 0 auto 14px;
  padding: 0 8px;
}

/* ============================================================
   bottom-tabs - 4 个主类目底部 tabbar（白卡轻边界）
   ============================================================ */
.bottom-tabs {
  display: flex;
  flex-shrink: 0;
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg, 16px);
  padding: 6px;
  gap: 4px;
  box-shadow: var(--shadow-2);
}

.bottom-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 7px 4px;
  border-radius: var(--r-md, 12px);
  font-family: inherit;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
  border: none;
  background: transparent;
  transition: color var(--dur-fast, 0.14s) var(--ease-out), background var(--dur-fast, 0.14s) var(--ease-out);
  min-height: 46px;
  justify-content: center;
}

.bottom-tab-icon { width: 20px; height: 20px; }
.bottom-tab-label { line-height: 1; letter-spacing: 0.5px; }

.bottom-tab:hover { color: var(--text-secondary); }
.bottom-tab.active {
  color: var(--brand-strong);
  background: var(--brand-soft);
}

/* ============================================================
   移动端适配
   ============================================================ */
@media (max-width: 768px) {
  .board { gap: 12px; }

  .seg-tabs { padding: 4px; gap: 4px; min-height: 44px; }
  .seg-tab { padding: 6px 11px; font-size: 12px; min-height: 32px; gap: 4px; }
  .seg-icon { width: 14px; height: 14px; }

  .board-main { padding: 1px 0 6px; }
  .board-error { padding: 16px 12px; }

  .bottom-tabs { padding: 5px; }
  .bottom-tab { min-height: 48px; gap: 3px; font-size: 10px; padding: 6px 2px; }
  .bottom-tab-icon { width: 18px; height: 18px; }
}
</style>
