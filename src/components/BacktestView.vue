<template>
  <div class="backtest">
    <el-alert type="info" :closable="false" show-icon class="tip-alert">
      策略回测：用历史开奖数据模拟"按策略选号"的命中表现。仅供策略研究，开奖随机独立，不构成投注建议。
    </el-alert>

    <div v-if="isDirect" class="card empty-card">
      <el-empty description="直位型彩种回测暂不支持，回测仅覆盖乐透型（双色球 / 大乐透等）" />
    </div>

    <template v-else>
      <div class="card ctrl-card">
        <div class="ctrl-row">
          <span class="ctrl-label">选择策略</span>
          <el-checkbox-group v-model="selectedMethods" class="method-group">
            <el-checkbox-button v-for="m in allMethods" :key="m" :value="m">
              {{ methodLabels[m] }}
            </el-checkbox-button>
          </el-checkbox-group>
        </div>
        <div class="ctrl-row">
          <span class="ctrl-label">回测范围</span>
          <el-radio-group v-model="periods" size="small">
            <el-radio-button :value="10">近10期</el-radio-button>
            <el-radio-button :value="30">近30期</el-radio-button>
            <el-radio-button :value="50">近50期</el-radio-button>
            <el-radio-button :value="100">近100期</el-radio-button>
          </el-radio-group>
        </div>
        <div class="ctrl-row">
          <span class="ctrl-label">每期注数</span>
          <el-radio-group v-model="perTicket" size="small">
            <el-radio-button :value="1">1 注</el-radio-button>
            <el-radio-button :value="3">3 注</el-radio-button>
            <el-radio-button :value="5">5 注</el-radio-button>
          </el-radio-group>
          <span class="dim hint">每注 2 元，不追加</span>
        </div>
        <div class="ctrl-row">
          <el-button type="primary" :loading="running" @click="run">
            {{ running ? '回测中…' : '开始回测' }}
          </el-button>
          <el-button v-if="running" @click="stop">停止</el-button>
          <span v-if="running" class="dim">{{ progress }}%</span>
        </div>
        <el-progress v-if="running" :percentage="progress" :stroke-width="6" :show-text="false" />
      </div>

      <template v-if="result">
        <!-- 汇总指标 -->
        <div class="stat-grid">
          <div class="stat-item">
            <div class="stat-label">总投入</div>
            <div class="stat-value">¥{{ result.totalCost }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">总中奖</div>
            <div class="stat-value win">¥{{ fmt(result.totalBonus) }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">净盈亏</div>
            <div class="stat-value" :class="result.net >= 0 ? 'win' : 'lose'">
              {{ result.net >= 0 ? '+' : '' }}{{ fmt(result.net) }}
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-label">ROI</div>
            <div class="stat-value" :class="result.net >= 0 ? 'win' : 'lose'">{{ result.roi }}%</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">中奖率</div>
            <div class="stat-value">{{ result.winRate }}%</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">中奖期数</div>
            <div class="stat-value">{{ result.winPeriods }}/{{ result.totalPeriods }}</div>
          </div>
        </div>

        <!-- 各奖级命中 -->
        <div class="card">
          <div class="card-title">各奖级命中</div>
          <div class="level-chips">
            <template v-for="(count, lv) in result.levelCounts" :key="lv">
              <span v-if="count > 0" class="level-chip" :class="'lv-' + lv">
                {{ levelName(Number(lv)) }} × {{ count }}
              </span>
            </template>
            <span v-if="!hasAnyLevel" class="dim">本期范围内无任何奖级命中</span>
          </div>
        </div>

        <!-- 盈亏走势 -->
        <div class="card">
          <div class="card-title">累计净盈亏走势</div>
          <div ref="chartEl" class="chart-box"></div>
        </div>

        <!-- 逐期明细 -->
        <div class="card">
          <div class="card-title">逐期明细</div>
          <div class="detail-scroll">
            <table class="detail-table">
              <thead>
                <tr>
                  <th>期号</th>
                  <th>生成号码</th>
                  <th>开奖号码</th>
                  <th>中奖等级</th>
                  <th>奖金</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in result.rows" :key="row.issue">
                  <td class="issue-cell">{{ row.issue }}</td>
                  <td>
                    <div v-for="(t, ti) in row.tickets" :key="ti" class="ticket-line">
                      <span v-for="n in t.red" :key="'r' + ti + n" class="ball ball-xs ball-red">{{ pad2(n) }}</span>
                      <span class="plus">+</span>
                      <span v-for="b in t.blue" :key="'b' + ti + b" class="ball ball-xs ball-blue">{{ pad2(b) }}</span>
                    </div>
                  </td>
                  <td>
                    <span v-for="n in row.drawRed" :key="'dr' + n" class="ball ball-xs ball-red-soft">{{ pad2(n) }}</span>
                    <span v-for="(b, bi) in row.drawBlue" :key="'db' + bi" class="ball ball-xs ball-blue">{{ pad2(b) }}</span>
                  </td>
                  <td>
                    <span v-if="row.level > 0" class="level-chip" :class="'lv-' + row.level">{{ row.prizeName }}</span>
                    <span v-else class="dim">—</span>
                  </td>
                  <td :class="row.bonus > 0 ? 'win' : 'dim'">{{ row.bonus > 0 ? '¥' + fmt(row.bonus) : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <el-alert type="warning" :closable="false" class="tip-alert">
        回测结果基于历史统计，不代表未来表现。彩票为独立随机事件，请理性购彩、量力而行。
      </el-alert>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ALL_METHODS, METHOD_LABELS } from '../utils/picker-engine'
import { runBacktest } from '../utils/analysis'
import { pad2 } from '../utils/game-config'
import { echarts, chartTheme, tipStyle, onThemeChange } from '../utils/echarts-setup'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const isDirect = computed(() => props.cfg.playMode === 'direct')
const allMethods = ALL_METHODS
const methodLabels = METHOD_LABELS

const selectedMethods = ref(['zone', 'odd', 'sum', 'hot', 'size'])
const periods = ref(50)
const perTicket = ref(3)
const running = ref(false)
const progress = ref(0)
const result = ref(null)
let stopFlag = false

const chartEl = ref(null)
let chart = null
let offTheme = null

const hasAnyLevel = computed(() => {
  if (!result.value) return false
  return Object.values(result.value.levelCounts).some((c) => c > 0)
})

function fmt(n) {
  return Number(n || 0).toFixed(0)
}

function levelName(lv) {
  const map = { 1: '一等奖', 2: '二等奖', 3: '三等奖', 4: '四等奖', 5: '五等奖', 6: '六等奖', 7: '七等奖', 8: '八等奖', 9: '九等奖' }
  return map[lv] || (lv + '等奖')
}

async function run() {
  if (!props.draws || !props.draws.length) return
  running.value = true
  progress.value = 0
  result.value = null
  stopFlag = false
  try {
    const r = await runBacktest(props.cfg, props.draws, {
      methods: selectedMethods.value,
      periods: periods.value,
      perTicket: perTicket.value,
      onProgress: (done, total) => {
        progress.value = Math.round((done / total) * 100)
      },
      shouldStop: () => stopFlag
    })
    result.value = r
    await nextTick()
    renderChart()
  } finally {
    running.value = false
  }
}

function stop() {
  stopFlag = true
}

function renderChart() {
  if (!chartEl.value || !result.value) return
  if (!chart) chart = echarts.init(chartEl.value)
  const t = chartTheme()
  const cum = result.value.cumulative
  chart.setOption({
    grid: { left: 50, right: 20, top: 30, bottom: 40 },
    tooltip: {
      trigger: 'axis',
      ...tipStyle(t),
      formatter: (ps) => {
        const p = ps[0]
        return `${p.axisValue}<br/>累计净盈亏：${p.value >= 0 ? '+' : ''}${p.value} 元`
      }
    },
    xAxis: {
      type: 'category',
      data: cum.map((c) => c.issue),
      axisLabel: { color: t.text, fontSize: 10, rotate: 45 },
      axisLine: { lineStyle: { color: t.axisLine } }
    },
    yAxis: {
      type: 'value',
      name: '元',
      axisLabel: { color: t.text, fontSize: 10 },
      splitLine: { lineStyle: { color: t.split } }
    },
    series: [
      {
        type: 'line',
        data: cum.map((c) => c.net),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: t.red, width: 2 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: t.redSoft },
              { offset: 1, color: 'rgba(255,77,94,0)' }
            ]
          }
        },
        markLine: { silent: true, symbol: 'none', data: [{ yAxis: 0 }], lineStyle: { color: t.gray, type: 'dashed' } }
      }
    ]
  }, true)
}

function onResize() {
  if (chart) chart.resize()
}

onMounted(() => {
  window.addEventListener('resize', onResize)
  offTheme = onThemeChange(renderChart)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  if (offTheme) offTheme()
  if (chart) { chart.dispose(); chart = null }
})
</script>

<style scoped>
.backtest { display: flex; flex-direction: column; gap: 12px; }
.tip-alert { margin-bottom: 4px; }
.card {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg, 16px);
  padding: 12px 14px;
  box-shadow: var(--shadow-card);
}
.empty-card { padding: 24px 12px; }
.card-title { font-size: 14px; font-weight: 700; margin-bottom: 10px; color: var(--text-primary, var(--text-secondary)); }
.ctrl-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.ctrl-label { font-size: 13px; font-weight: 600; color: var(--text-secondary); flex: none; }
.method-group { display: flex; flex-wrap: wrap; gap: 4px; }
.hint { font-size: 12px; }

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.stat-item {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 10px 8px;
  text-align: center;
}
.stat-label { font-size: 11px; color: var(--text-muted); }
.stat-value { font-size: 17px; font-weight: 800; margin-top: 4px; }
.stat-value.win { color: #2e7d32; }
.stat-value.lose { color: #d92b3f; }

.level-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.level-chip {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: var(--brand-soft);
  color: var(--brand-strong);
}
.chart-box { width: 100%; height: 260px; }

.detail-scroll { max-height: 360px; overflow-y: auto; }
.detail-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.detail-table th, .detail-table td {
  padding: 6px 4px;
  border-bottom: 1px solid var(--border-subtle);
  text-align: left;
  vertical-align: middle;
}
.detail-table th { color: var(--text-muted); font-weight: 600; white-space: nowrap; }
.issue-cell { white-space: nowrap; color: var(--text-secondary); }
.ticket-line { display: flex; align-items: center; gap: 2px; margin-bottom: 3px; flex-wrap: wrap; }
.plus { margin: 0 3px; color: var(--text-muted); }
.win { color: #2e7d32; font-weight: 600; }

@media (max-width: 768px) {
  .stat-grid { grid-template-columns: repeat(2, 1fr); }
  .chart-box { height: 220px; }
}
</style>
