<template>
  <div class="omit-analysis">
    <el-alert type="info" :closable="false" show-icon class="tip-alert">
      遗漏分析：统计每个号码当前遗漏、历史平均与最大遗漏。遗漏值超过历史均值 1.5 倍的号码已标红提醒。仅供走势观察，不构成投注建议。
    </el-alert>

    <div v-if="!draws.length" class="card empty-card">
      <el-empty description="暂无开奖数据" />
    </div>

    <template v-else>
      <!-- 红球遗漏柱状图 -->
      <div class="card">
        <div class="card-title">红球当前遗漏分布（期）</div>
        <div ref="redBarEl" class="chart-box"></div>
      </div>

      <!-- 单号码遗漏走势 -->
      <div class="card">
        <div class="card-title">
          单号遗漏走势
          <span class="dim sub">（点击下表号码切换 · 近50期）</span>
        </div>
        <div class="picker-row">
          <button
            v-for="n in cfg.redMax"
            :key="'p' + n"
            type="button"
            class="pick-ball ball ball-sm"
            :class="{ active: selRed === n }"
            @click="selRed = n"
          >{{ pad2(n) }}</button>
        </div>
        <div ref="lineEl" class="chart-box"></div>
      </div>

      <!-- 红球明细表 -->
      <div class="card">
        <div class="card-title">红球遗漏明细</div>
        <div class="table-scroll">
          <table class="omit-table">
            <thead>
              <tr><th>号码</th><th>当前遗漏</th><th>平均遗漏</th><th>最大遗漏</th><th>状态</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in redRows" :key="'t' + row.n" :class="{ active: selRed === row.n }" @click="selRed = row.n">
                <td><span class="ball ball-xs ball-red">{{ pad2(row.n) }}</span></td>
                <td :class="{ hot: row.omit > row.avg * 1.5 && row.avg > 0 }">{{ row.omit }}</td>
                <td>{{ row.avg || '—' }}</td>
                <td>{{ row.max || '—' }}</td>
                <td>
                  <el-tag v-if="row.omit > row.avg * 1.5 && row.avg > 0" type="danger" size="small">回补预警</el-tag>
                  <el-tag v-else-if="row.omit === 0" type="success" size="small">刚开出</el-tag>
                  <el-tag v-else type="info" size="small">正常</el-tag>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 蓝球遗漏 -->
      <div v-if="hasBlue" class="card">
        <div class="card-title">{{ cfg.blueLabel || '蓝球' }}遗漏分布</div>
        <div ref="blueBarEl" class="chart-box-sm"></div>
        <div class="table-scroll">
          <table class="omit-table">
            <thead>
              <tr><th>号码</th><th>当前遗漏</th><th>平均遗漏</th><th>最大遗漏</th><th>状态</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in blueRows" :key="'b' + row.n">
                <td><span class="ball ball-xs ball-blue">{{ pad2(row.n) }}</span></td>
                <td :class="{ hot: row.omit > row.avg * 1.5 && row.avg > 0 }">{{ row.omit }}</td>
                <td>{{ row.avg || '—' }}</td>
                <td>{{ row.max || '—' }}</td>
                <td>
                  <el-tag v-if="row.omit > row.avg * 1.5 && row.avg > 0" type="danger" size="small">回补预警</el-tag>
                  <el-tag v-else-if="row.omit === 0" type="success" size="small">刚开出</el-tag>
                  <el-tag v-else type="info" size="small">正常</el-tag>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { computeStats } from '../utils/picker-engine'
import { computeOmitStats, omitSeriesFor } from '../utils/analysis'
import { pad2 } from '../utils/game-config'
import { echarts, chartTheme, tipStyle, onThemeChange } from '../utils/echarts-setup'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const selRed = ref(1)

const stats = computed(() => (props.draws.length ? computeStats(props.cfg, props.draws) : null))
const omitStats = computed(() => (props.draws.length ? computeOmitStats(props.cfg, props.draws) : null))
const hasBlue = computed(() => (props.cfg.blueMax || 0) > 0)

const redRows = computed(() => {
  if (!stats.value || !omitStats.value) return []
  const s = stats.value
  const o = omitStats.value
  const rows = []
  for (let n = 1; n <= props.cfg.redMax; n++) {
    rows.push({
      n,
      omit: s.omitVal[n] != null ? s.omitVal[n] : props.draws.length,
      avg: o.redAvg[n] || 0,
      max: o.redMax[n] || 0
    })
  }
  return rows
})

const blueRows = computed(() => {
  if (!hasBlue.value || !stats.value || !omitStats.value) return []
  const s = stats.value
  const o = omitStats.value
  const rows = []
  for (let b = 1; b <= props.cfg.blueMax; b++) {
    rows.push({
      n: b,
      omit: s.blueOmit[b] != null ? s.blueOmit[b] : props.draws.length,
      avg: o.blueAvg[b] || 0,
      max: o.blueMax[b] || 0
    })
  }
  return rows
})

const redBarEl = ref(null)
const lineEl = ref(null)
const blueBarEl = ref(null)
let redBarChart = null
let lineChart = null
let blueBarChart = null
let offTheme = null

function renderRedBar() {
  if (!redBarEl.value || !redRows.value.length) return
  if (!redBarChart) redBarChart = echarts.init(redBarEl.value)
  const t = chartTheme()
  const rows = redRows.value
  redBarChart.setOption({
    grid: { left: 40, right: 16, top: 20, bottom: 40 },
    tooltip: { trigger: 'axis', ...tipStyle(t) },
    xAxis: {
      type: 'category',
      data: rows.map((r) => pad2(r.n)),
      axisLabel: { color: t.text, fontSize: 9, interval: 1 },
      axisLine: { lineStyle: { color: t.axisLine } }
    },
    yAxis: { type: 'value', axisLabel: { color: t.text, fontSize: 10 }, splitLine: { lineStyle: { color: t.split } } },
    series: [{
      type: 'bar',
      barMaxWidth: 14,
      data: rows.map((r) => ({
        value: r.omit,
        itemStyle: { color: r.avg > 0 && r.omit > r.avg * 1.5 ? t.gold : t.red, borderRadius: [3, 3, 0, 0] }
      }))
    }]
  }, true)
}

function renderLine() {
  if (!lineEl.value || !redRows.value.length) return
  if (!lineChart) lineChart = echarts.init(lineEl.value)
  const t = chartTheme()
  const n = selRed.value
  const series = omitSeriesFor(props.cfg, props.draws, n, false, 50)
  // series 新→旧；图表按 旧→新 展示
  const issues = props.draws.slice(0, 50).map((d) => d.issue).reverse()
  lineChart.setOption({
    grid: { left: 40, right: 16, top: 24, bottom: 40 },
    tooltip: { trigger: 'axis', ...tipStyle(t) },
    title: { text: `红球 ${pad2(n)} 号遗漏走势`, left: 8, top: 4, textStyle: { color: t.textStrong, fontSize: 12 } },
    xAxis: {
      type: 'category',
      data: issues,
      axisLabel: { color: t.text, fontSize: 9, rotate: 45 },
      axisLine: { lineStyle: { color: t.axisLine } }
    },
    yAxis: { type: 'value', axisLabel: { color: t.text, fontSize: 10 }, splitLine: { lineStyle: { color: t.split } } },
    series: [{
      type: 'line',
      data: [...series].reverse(),
      smooth: false,
      symbol: 'circle',
      symbolSize: 4,
      lineStyle: { color: t.purple, width: 2 },
      itemStyle: { color: t.purple }
    }]
  }, true)
}

function renderBlueBar() {
  if (!hasBlue.value || !blueBarEl.value || !blueRows.value.length) return
  if (!blueBarChart) blueBarChart = echarts.init(blueBarEl.value)
  const t = chartTheme()
  const rows = blueRows.value
  blueBarChart.setOption({
    grid: { left: 40, right: 16, top: 20, bottom: 30 },
    tooltip: { trigger: 'axis', ...tipStyle(t) },
    xAxis: {
      type: 'category',
      data: rows.map((r) => pad2(r.n)),
      axisLabel: { color: t.text, fontSize: 10 },
      axisLine: { lineStyle: { color: t.axisLine } }
    },
    yAxis: { type: 'value', axisLabel: { color: t.text, fontSize: 10 }, splitLine: { lineStyle: { color: t.split } } },
    series: [{
      type: 'bar',
      barMaxWidth: 18,
      data: rows.map((r) => ({
        value: r.omit,
        itemStyle: { color: r.avg > 0 && r.omit > r.avg * 1.5 ? t.gold : t.blue, borderRadius: [3, 3, 0, 0] }
      }))
    }]
  }, true)
}

function renderAll() {
  renderRedBar()
  renderLine()
  renderBlueBar()
}

function onResize() {
  redBarChart && redBarChart.resize()
  lineChart && lineChart.resize()
  blueBarChart && blueBarChart.resize()
}

watch([selRed, () => props.draws], async () => {
  await nextTick()
  renderAll()
})

onMounted(async () => {
  window.addEventListener('resize', onResize)
  offTheme = onThemeChange(renderAll)
  await nextTick()
  renderAll()
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  if (offTheme) offTheme()
  ;[redBarChart, lineChart, blueBarChart].forEach((c) => { if (c) c.dispose() })
  redBarChart = lineChart = blueBarChart = null
})
</script>

<style scoped>
.omit-analysis { display: flex; flex-direction: column; gap: 12px; }
.tip-alert { margin-bottom: 4px; }
.card {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg, 16px);
  padding: 12px 14px;
  box-shadow: var(--shadow-card);
}
.empty-card { padding: 24px 12px; }
.card-title { font-size: 14px; font-weight: 700; margin-bottom: 10px; }
.card-title .sub { font-size: 11px; font-weight: 400; margin-left: 6px; }
.chart-box { width: 100%; height: 240px; }
.chart-box-sm { width: 100%; height: 180px; margin-bottom: 8px; }

.picker-row { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.pick-ball { cursor: pointer; border: none; color: #fff; font-weight: 700; }
.pick-ball.active { outline: 2px solid var(--brand-strong); outline-offset: 1px; }

.table-scroll { max-height: 300px; overflow-y: auto; }
.omit-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.omit-table th, .omit-table td {
  padding: 6px 6px;
  border-bottom: 1px solid var(--border-subtle);
  text-align: left;
}
.omit-table th { color: var(--text-muted); font-weight: 600; }
.omit-table tbody tr { cursor: pointer; }
.omit-table tbody tr.active { background: var(--brand-soft); }
td.hot { color: #d92b3f; font-weight: 700; }

@media (max-width: 768px) {
  .chart-box { height: 200px; }
}
</style>
