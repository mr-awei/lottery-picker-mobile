<template>
  <div class="history-same">
    <el-alert type="info" :closable="false" show-icon class="tip-alert">
      历史同期号与周维度统计：基于已加载的 {{ draws.length }} 期开奖数据。统计仅供观察，开奖独立随机，不构成投注建议。
    </el-alert>

    <div v-if="!draws.length" class="card empty-card">
      <el-empty description="暂无开奖数据" />
    </div>

    <template v-else>
      <!-- 历史同期号 -->
      <div class="card">
        <div class="card-title">历史同期号</div>
        <div class="same-input-row">
          <span class="dim">期号后三位</span>
          <el-input v-model="suffix" size="small" maxlength="3" class="suffix-input" placeholder="如 013" />
          <span class="dim">命中 {{ sameRows.length }} 期</span>
        </div>

        <div v-if="sameRows.length">
          <div class="table-scroll">
            <table class="same-table">
              <thead>
                <tr><th>年份</th><th>期号</th><th>开奖日期</th><th>红球</th><th>蓝球</th><th>和值</th><th>跨度</th></tr>
              </thead>
              <tbody>
                <tr v-for="row in sameRows" :key="row.issue">
                  <td>{{ row.year }}</td>
                  <td>{{ row.issue }}</td>
                  <td>{{ row.date }}</td>
                  <td>
                    <span v-for="n in row.red" :key="'sr' + row.issue + n" class="ball ball-xs ball-red">{{ pad2(n) }}</span>
                  </td>
                  <td>
                    <span v-if="row.blue == null" class="dim">—</span>
                    <span v-for="(b, bi) in row.blueList" :key="'sb' + row.issue + bi" class="ball ball-xs ball-blue">{{ pad2(b) }}</span>
                  </td>
                  <td>{{ row.sum }}</td>
                  <td>{{ row.span }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="sub-title">同期号红球出现频率 TOP10</div>
          <div ref="sameFreqEl" class="chart-box"></div>
        </div>
        <div v-else class="dim empty-line">未找到期号以「{{ suffix }}」结尾的历史记录</div>
      </div>

      <!-- 周维度分析 -->
      <div class="card">
        <div class="card-title">按开奖星期统计</div>
        <div ref="weekEl" class="chart-box"></div>
        <div class="table-scroll">
          <table class="week-table">
            <thead>
              <tr><th>星期</th><th>期数</th><th>和值均值</th><th>奇偶比均值(奇:偶)</th><th>热号 TOP3</th></tr>
            </thead>
            <tbody>
              <tr v-for="w in weekRows" :key="w.day">
                <td>{{ w.name }}</td>
                <td>{{ w.count }}</td>
                <td>{{ w.avgSum }}</td>
                <td>{{ w.oddAvg }} : {{ w.evenAvg }}</td>
                <td>
                  <span v-for="n in w.top3" :key="w.day + n" class="ball ball-xs ball-red">{{ pad2(n) }}</span>
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
import { pad2, fmtDate } from '../utils/game-config'
import { sumOf, spanOf } from '../utils/analysis'
import { echarts, chartTheme, tipStyle, onThemeChange } from '../utils/echarts-setup'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const suffix = ref('013')

const WEEK_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const sameRows = computed(() => {
  const s = String(suffix.value).trim()
  if (!s) return []
  const out = []
  for (const d of props.draws) {
    if (!String(d.issue).endsWith(s)) continue
    const red = (d.red || []).slice().sort((a, b) => a - b)
    out.push({
      issue: d.issue,
      date: fmtDate(d.date),
      year: String(d.issue).slice(0, 4),
      red,
      blue: d.blue,
      blueList: [d.blue, d.blue2].filter((b) => b != null),
      sum: sumOf(red),
      span: spanOf(red)
    })
  }
  // draws 新→旧；同期号按年升序更直观
  return out.sort((a, b) => a.issue.localeCompare(b.issue))
})

const sameFreqTop = computed(() => {
  const freq = new Array((props.cfg.redMax || 0) + 1).fill(0)
  for (const row of sameRows.value) for (const n of row.red) if (n >= 1 && n <= (props.cfg.redMax || 0)) freq[n]++
  return freq.map((f, n) => ({ n, f })).filter((r) => r.n >= 1).sort((a, b) => b.f - a.f).slice(0, 10)
})

const weekRows = computed(() => {
  const buckets = Array.from({ length: 7 }, () => ({ sum: 0, odd: 0, count: 0, freq: new Array((props.cfg.redMax || 0) + 1).fill(0) }))
  for (const d of props.draws) {
    const dt = new Date(d.date)
    if (isNaN(dt.getTime())) continue
    const day = dt.getDay()
    const b = buckets[day]
    const red = d.red || []
    b.sum += sumOf(red)
    b.odd += red.filter((n) => n % 2 === 1).length
    b.count++
    for (const n of red) if (n >= 1 && n <= (props.cfg.redMax || 0)) b.freq[n]++
  }
  // 周一~周日 顺序
  const order = [1, 2, 3, 4, 5, 6, 0]
  return order
    .filter((day) => buckets[day].count > 0)
    .map((day) => {
      const b = buckets[day]
      const redCount = props.cfg.redCount || 6
      const oddAvg = Math.round((b.odd / b.count / redCount) * 10) / 10
      const evenAvg = Math.round((1 - oddAvg) * 10) / 10
      const top3 = b.freq.map((f, n) => ({ n, f })).filter((r) => r.n >= 1 && r.f > 0).sort((a, b2) => b2.f - a.f).slice(0, 3).map((r) => r.n)
      return { day, name: WEEK_NAMES[day], count: b.count, avgSum: Math.round(b.sum / b.count), oddAvg, evenAvg, top3 }
    })
})

const sameFreqEl = ref(null)
const weekEl = ref(null)
let sameFreqChart = null
let weekChart = null
let offTheme = null

function renderSameFreq() {
  if (!sameFreqEl.value || !sameFreqTop.value.length) return
  if (!sameFreqChart) sameFreqChart = echarts.init(sameFreqEl.value)
  const t = chartTheme()
  sameFreqChart.setOption({
    grid: { left: 40, right: 30, top: 16, bottom: 30 },
    tooltip: { trigger: 'axis', ...tipStyle(t) },
    xAxis: {
      type: 'value', axisLabel: { color: t.text, fontSize: 10 }, splitLine: { lineStyle: { color: t.split } }
    },
    yAxis: {
      type: 'category',
      data: sameFreqTop.value.map((r) => pad2(r.n)).reverse(),
      axisLabel: { color: t.text, fontSize: 10 }, axisLine: { lineStyle: { color: t.axisLine } }
    },
    series: [{
      type: 'bar', barMaxWidth: 12,
      data: sameFreqTop.value.map((r) => r.f).reverse(),
      itemStyle: { color: t.red, borderRadius: [0, 3, 3, 0] }
    }]
  }, true)
}

function renderWeek() {
  if (!weekEl.value || !weekRows.value.length) return
  if (!weekChart) weekChart = echarts.init(weekEl.value)
  const t = chartTheme()
  weekChart.setOption({
    grid: { left: 40, right: 16, top: 30, bottom: 30 },
    tooltip: { trigger: 'axis', ...tipStyle(t) },
    legend: { textStyle: { color: t.text, fontSize: 10 }, top: 0 },
    xAxis: {
      type: 'category', data: weekRows.value.map((w) => w.name),
      axisLabel: { color: t.text, fontSize: 10 }, axisLine: { lineStyle: { color: t.axisLine } }
    },
    yAxis: [
      { type: 'value', name: '和值均值', axisLabel: { color: t.text, fontSize: 10 }, splitLine: { lineStyle: { color: t.split } } }
    ],
    series: [{
      name: '和值均值', type: 'bar', barMaxWidth: 26,
      data: weekRows.value.map((w) => w.avgSum),
      itemStyle: { color: t.teal, borderRadius: [3, 3, 0, 0] }
    }]
  }, true)
}

function renderAll() {
  renderSameFreq()
  renderWeek()
}

function onResize() {
  sameFreqChart && sameFreqChart.resize()
  weekChart && weekChart.resize()
}

watch([suffix, () => props.draws], async () => {
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
  if (sameFreqChart) { sameFreqChart.dispose(); sameFreqChart = null }
  if (weekChart) { weekChart.dispose(); weekChart = null }
})
</script>

<style scoped>
.history-same { display: flex; flex-direction: column; gap: 12px; }
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
.same-input-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.suffix-input { width: 110px; }
.empty-line { padding: 16px 0; }
.sub-title { font-size: 13px; font-weight: 700; margin: 12px 0 6px; }
.chart-box { width: 100%; height: 220px; }

.table-scroll { max-height: 300px; overflow-y: auto; }
.same-table, .week-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.same-table th, .same-table td, .week-table th, .week-table td {
  padding: 6px 6px;
  border-bottom: 1px solid var(--border-subtle);
  text-align: left;
  vertical-align: middle;
}
.same-table th, .week-table th { color: var(--text-muted); font-weight: 600; }

@media (max-width: 768px) {
  .chart-box { height: 190px; }
}
</style>
