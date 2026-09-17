<template>
  <div class="number-relation">
    <el-alert type="info" :closable="false" show-icon class="tip-alert">
      号码关系：振幅 / 重号 / 邻号 / 斜连号四大形态统计。基于已加载历史数据，仅供形态观察，不构成投注建议。
    </el-alert>

    <div v-if="isDirect" class="card empty-card">
      <el-empty description="直位型彩种暂不支持号码关系分析" />
    </div>

    <template v-else>
      <el-tabs v-model="tab" class="rel-tabs">
        <!-- 振幅 -->
        <el-tab-pane label="振幅分析" name="amp">
          <div class="stat-row">
            <span class="dim">平均振幅：<b class="ok">{{ ampStats.avg }}</b></span>
            <span class="dim">最大振幅：<b>{{ ampStats.max }}</b></span>
            <span class="dim">最小振幅：<b>{{ ampStats.min }}</b></span>
          </div>
          <div class="card">
            <div class="card-title">振幅分布（相邻两期同位置号码差绝对值）</div>
            <div ref="ampDistEl" class="chart-box"></div>
          </div>
          <div class="card">
            <div class="card-title">第 {{ ampPos + 1 }} 位振幅走势（近50期）</div>
            <div class="picker-row">
              <button
                v-for="p in cfg.redCount"
                :key="'ap' + p"
                type="button"
                class="pos-btn"
                :class="{ active: ampPos === p - 1 }"
                @click="ampPos = p - 1"
              >第{{ p }}位</button>
            </div>
            <div ref="ampLineEl" class="chart-box-sm"></div>
          </div>
        </el-tab-pane>

        <!-- 重号 -->
        <el-tab-pane label="重号分析" name="repeat">
          <div class="card">
            <div class="card-title">重号个数分布（本期与上期重复）</div>
            <div ref="repeatPieEl" class="chart-box-sm"></div>
          </div>
          <div class="card">
            <div class="card-title">最常作为重号出现的号码 TOP10</div>
            <div class="rank-list">
              <div v-for="(item, i) in repeatTop" :key="'rp' + item.n" class="rank-row">
                <span class="rank">{{ i + 1 }}</span>
                <span class="ball ball-xs ball-red">{{ pad2(item.n) }}</span>
                <span class="rank-bar"><span class="rank-fill" :style="{ width: pct(item.c, repeatTop[0].c) }"></span></span>
                <span class="rank-num">{{ item.c }} 次</span>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- 邻号 -->
        <el-tab-pane label="邻号分析" name="neighbor">
          <div class="card">
            <div class="card-title">邻号个数分布（本期与上期 ±1 的号码）</div>
            <div ref="neighborPieEl" class="chart-box-sm"></div>
          </div>
          <div class="card">
            <div class="card-title">最常作为邻号出现的号码 TOP10</div>
            <div class="rank-list">
              <div v-for="(item, i) in neighborTop" :key="'nb' + item.n" class="rank-row">
                <span class="rank">{{ i + 1 }}</span>
                <span class="ball ball-xs ball-red">{{ pad2(item.n) }}</span>
                <span class="rank-bar"><span class="rank-fill" :style="{ width: pct(item.c, neighborTop[0].c) }"></span></span>
                <span class="rank-num">{{ item.c }} 次</span>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- 斜连号 -->
        <el-tab-pane label="斜连号" name="diag">
          <div class="card">
            <div class="card-title">三期斜连模式（如 05→06→07，连续三期 +1 或 -1）</div>
            <div v-if="diagList.length" class="diag-list">
              <div v-for="(d, i) in diagList" :key="i" class="diag-row">
                <span class="dim">{{ d.issue }}</span>
                <span class="diag-nums">
                  <span v-for="(n, k) in d.seq" :key="k" class="ball ball-xs" :class="k === 1 ? 'ball-purple' : 'ball-red'">{{ pad2(n) }}</span>
                </span>
                <span class="dim">{{ d.dir === 1 ? '递增斜连' : '递减斜连' }}</span>
              </div>
            </div>
            <div v-else class="dim empty-line">已加载区间内未发现完整三期斜连模式</div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { pad2 } from '../utils/game-config'
import { echarts, chartTheme, tipStyle, onThemeChange } from '../utils/echarts-setup'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const isDirect = computed(() => props.cfg.playMode === 'direct')
const tab = ref('amp')
const ampPos = ref(0)

// 按位置排序的红球（draws 新→旧）
const sortedRed = computed(() => props.draws.map((d) => (d.red || []).slice().sort((a, b) => a - b)))

// ===== 振幅 =====
const ampDist = computed(() => {
  const arr = new Array((props.cfg.redMax || 0) + 1).fill(0)
  const sr = sortedRed.value
  for (let i = 0; i < sr.length - 1; i++) {
    const a = sr[i], b = sr[i + 1]
    const len = Math.min(a.length, b.length)
    for (let k = 0; k < len; k++) {
      const v = Math.abs(a[k] - b[k])
      if (v <= props.cfg.redMax) arr[v]++
    }
  }
  return arr
})

const ampStats = computed(() => {
  const vals = []
  const arr = ampDist.value
  for (let v = 0; v < arr.length; v++) for (let k = 0; k < arr[v]; k++) vals.push(v)
  if (!vals.length) return { avg: 0, max: 0, min: 0 }
  return {
    avg: (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1),
    max: Math.max(...vals),
    min: Math.min(...vals)
  }
})

/** 指定位点近50期振幅（新→旧） */
function ampSeries(pos) {
  const sr = sortedRed.value
  const out = []
  for (let i = 0; i < Math.min(50, sr.length - 1); i++) {
    const a = sr[i], b = sr[i + 1]
    out.push(pos < Math.min(a.length, b.length) ? Math.abs(a[pos] - b[pos]) : 0)
  }
  return out
}

// ===== 重号 / 邻号 =====
const repeatDist = computed(() => {
  const dist = { 0: 0, 1: 0, 2: 0, 3: 0 }
  const freq = new Array((props.cfg.redMax || 0) + 1).fill(0)
  const sr = sortedRed.value
  for (let i = 0; i < sr.length - 1; i++) {
    const cur = new Set(sr[i])
    const prev = sr[i + 1]
    let c = 0
    for (const n of prev) {
      if (cur.has(n)) { c++; freq[n]++ }
    }
    const key = c >= 3 ? 3 : c
    dist[key]++
  }
  return { dist, freq }
})

const repeatTop = computed(() =>
  repeatDist.value.freq.map((c, n) => ({ n, c })).filter((r) => r.n >= 1 && r.c > 0).sort((a, b) => b.c - a.c).slice(0, 10)
)

const neighborDist = computed(() => {
  const dist = { 0: 0, 1: 0, 2: 0, 3: 0 }
  const freq = new Array((props.cfg.redMax || 0) + 1).fill(0)
  const sr = sortedRed.value
  for (let i = 0; i < sr.length - 1; i++) {
    const cur = sr[i]
    const prevSet = new Set(sr[i + 1])
    let c = 0
    for (const n of cur) {
      if (prevSet.has(n - 1) || prevSet.has(n + 1)) { c++; freq[n]++ }
    }
    const key = c >= 3 ? 3 : c
    dist[key]++
  }
  return { dist, freq }
})

const neighborTop = computed(() =>
  neighborDist.value.freq.map((c, n) => ({ n, c })).filter((r) => r.n >= 1 && r.c > 0).sort((a, b) => b.c - a.c).slice(0, 10)
)

// ===== 斜连号 =====
const diagList = computed(() => {
  const out = []
  const sr = sortedRed.value
  for (let i = 0; i < sr.length - 2; i++) {
    const cur = new Set(sr[i])      // 最新
    const mid = new Set(sr[i + 1])
    const old = new Set(sr[i + 2])
    for (const n of old) {
      // 递增：old=n, mid=n+1, cur=n+2
      if (mid.has(n + 1) && cur.has(n + 2)) {
        out.push({ issue: props.draws[i].issue, seq: [n, n + 1, n + 2], dir: 1 })
      }
      // 递减：old=n, mid=n-1, cur=n-2
      if (mid.has(n - 1) && cur.has(n - 2)) {
        out.push({ issue: props.draws[i].issue, seq: [n, n - 1, n - 2], dir: -1 })
      }
    }
  }
  return out.slice(0, 20)
})

// ===== 图表 =====
const ampDistEl = ref(null)
const ampLineEl = ref(null)
const repeatPieEl = ref(null)
const neighborPieEl = ref(null)
let ampDistChart = null
let ampLineChart = null
let repeatPieChart = null
let neighborPieChart = null
let offTheme = null

function pct(v, max) {
  if (!max) return '0%'
  return Math.max(4, Math.round((v / max) * 100)) + '%'
}

function renderAmpDist() {
  if (!ampDistEl.value) return
  if (!ampDistChart) ampDistChart = echarts.init(ampDistEl.value)
  const t = chartTheme()
  const arr = ampDist.value
  ampDistChart.setOption({
    grid: { left: 36, right: 16, top: 20, bottom: 30 },
    tooltip: { trigger: 'axis', ...tipStyle(t) },
    xAxis: { type: 'category', data: arr.map((_, i) => String(i)), axisLabel: { color: t.text, fontSize: 9 }, axisLine: { lineStyle: { color: t.axisLine } } },
    yAxis: { type: 'value', axisLabel: { color: t.text, fontSize: 10 }, splitLine: { lineStyle: { color: t.split } } },
    series: [{ type: 'bar', barMaxWidth: 14, data: arr.map((v) => ({ value: v, itemStyle: { color: t.red, borderRadius: [3, 3, 0, 0] } })) }]
  }, true)
}

function renderAmpLine() {
  if (!ampLineEl.value) return
  if (!ampLineChart) ampLineChart = echarts.init(ampLineEl.value)
  const t = chartTheme()
  const series = ampSeries(ampPos.value).reverse()
  const issues = props.draws.slice(0, 50).map((d) => d.issue).reverse()
  ampLineChart.setOption({
    grid: { left: 30, right: 16, top: 20, bottom: 40 },
    tooltip: { trigger: 'axis', ...tipStyle(t) },
    xAxis: { type: 'category', data: issues, axisLabel: { color: t.text, fontSize: 9, rotate: 45 }, axisLine: { lineStyle: { color: t.axisLine } } },
    yAxis: { type: 'value', axisLabel: { color: t.text, fontSize: 10 }, splitLine: { lineStyle: { color: t.split } } },
    series: [{ type: 'line', data: series, symbol: 'circle', symbolSize: 3, lineStyle: { color: t.orange, width: 2 }, itemStyle: { color: t.orange } }]
  }, true)
}

function renderRepeatPie() {
  if (!repeatPieEl.value) return
  if (!repeatPieChart) repeatPieChart = echarts.init(repeatPieEl.value)
  const t = chartTheme()
  const d = repeatDist.value.dist
  repeatPieChart.setOption({
    tooltip: { trigger: 'item', ...tipStyle(t) },
    legend: { bottom: 0, textStyle: { color: t.text, fontSize: 10 } },
    series: [{
      type: 'pie', radius: ['35%', '58%'], center: ['50%', '45%'],
      data: [
        { name: '0 个', value: d[0], itemStyle: { color: t.gray } },
        { name: '1 个', value: d[1], itemStyle: { color: t.teal } },
        { name: '2 个', value: d[2], itemStyle: { color: t.gold } },
        { name: '3+ 个', value: d[3], itemStyle: { color: t.red } }
      ],
      label: { fontSize: 10, color: t.text, formatter: '{b} {d}%' }
    }]
  }, true)
}

function renderNeighborPie() {
  if (!neighborPieEl.value) return
  if (!neighborPieChart) neighborPieChart = echarts.init(neighborPieEl.value)
  const t = chartTheme()
  const d = neighborDist.value.dist
  neighborPieChart.setOption({
    tooltip: { trigger: 'item', ...tipStyle(t) },
    legend: { bottom: 0, textStyle: { color: t.text, fontSize: 10 } },
    series: [{
      type: 'pie', radius: ['35%', '58%'], center: ['50%', '45%'],
      data: [
        { name: '0 个', value: d[0], itemStyle: { color: t.gray } },
        { name: '1 个', value: d[1], itemStyle: { color: t.teal } },
        { name: '2 个', value: d[2], itemStyle: { color: t.gold } },
        { name: '3+ 个', value: d[3], itemStyle: { color: t.blue } }
      ],
      label: { fontSize: 10, color: t.text, formatter: '{b} {d}%' }
    }]
  }, true)
}

function renderAll() {
  if (isDirect.value) return
  renderAmpDist()
  renderAmpLine()
  renderRepeatPie()
  renderNeighborPie()
}

function onResize() {
  ;[ampDistChart, ampLineChart, repeatPieChart, neighborPieChart].forEach((c) => c && c.resize())
}

watch([tab, ampPos, () => props.draws], async () => {
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
  ;[ampDistChart, ampLineChart, repeatPieChart, neighborPieChart].forEach((c) => { if (c) c.dispose() })
  ampDistChart = ampLineChart = repeatPieChart = neighborPieChart = null
})
</script>

<style scoped>
.number-relation { display: flex; flex-direction: column; gap: 12px; }
.tip-alert { margin-bottom: 4px; }
.card {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg, 16px);
  padding: 12px 14px;
  box-shadow: var(--shadow-card);
  margin-bottom: 12px;
}
.empty-card { padding: 24px 12px; }
.card-title { font-size: 14px; font-weight: 700; margin-bottom: 10px; }
.stat-row { display: flex; gap: 18px; margin-bottom: 10px; font-size: 13px; }
.ok { color: #2e7d32; }
.chart-box { width: 100%; height: 220px; }
.chart-box-sm { width: 100%; height: 200px; }

.picker-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.pos-btn {
  padding: 5px 12px; border-radius: 999px; border: 1px solid var(--border-subtle);
  background: var(--surface-card); color: var(--text-secondary); font-size: 12px; cursor: pointer;
}
.pos-btn.active { background: var(--brand-soft); color: var(--brand-strong); border-color: var(--border-accent, var(--brand-strong)); font-weight: 700; }

.rank-list { display: flex; flex-direction: column; gap: 4px; }
.rank-row { display: flex; align-items: center; gap: 8px; }
.rank { width: 16px; text-align: center; font-size: 11px; color: var(--text-muted); }
.rank-bar { flex: 1; height: 7px; border-radius: 4px; background: var(--border-subtle); overflow: hidden; }
.rank-fill { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, #ff9a8a, #d92b3f); }
.rank-num { width: 44px; text-align: right; font-size: 11px; }

.diag-list { display: flex; flex-direction: column; gap: 8px; }
.diag-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px dashed var(--border-subtle); }
.diag-nums { display: flex; gap: 3px; }
.empty-line { padding: 14px 0; }

@media (max-width: 768px) {
  .chart-box, .chart-box-sm { height: 180px; }
}
</style>
