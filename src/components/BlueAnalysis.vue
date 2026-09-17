<template>
  <div class="blue-analysis">
    <el-alert type="info" :closable="false" show-icon class="tip-alert">
      {{ cfg.blueLabel || '蓝球' }}专项分析：频率、遗漏、奇偶/大小/质合与振幅分布。仅供走势观察，不构成投注建议。
    </el-alert>

    <div v-if="!hasBlue" class="card empty-card">
      <el-empty :description="`${cfg.name} 无${cfg.blueLabel || '蓝球'}，不支持本视图`" />
    </div>

    <template v-else>
      <div class="card">
        <div class="toolbar">
          <span class="card-title" style="margin:0">{{ cfg.blueLabel || '蓝球' }}出现频率</span>
          <el-radio-group v-model="win" size="small">
            <el-radio-button :value="50">近50期</el-radio-button>
            <el-radio-button :value="100">近100期</el-radio-button>
          </el-radio-group>
        </div>
        <div ref="freqEl" class="chart-box"></div>
      </div>

      <div class="card">
        <div class="card-title">单号遗漏走势（点击下方球号切换 · 近50期）</div>
        <div class="picker-row">
          <button
            v-for="b in cfg.blueMax"
            :key="'pb' + b"
            type="button"
            class="pick-ball ball ball-sm"
            :class="{ active: selBlue === b }"
            @click="selBlue = b"
          >{{ pad2(b) }}</button>
        </div>
        <div ref="omitEl" class="chart-box-sm"></div>
      </div>

      <div class="card">
        <div class="card-title">结构占比（近{{ win }}期）</div>
        <div class="pie-grid">
          <div ref="pieOddEl" class="pie-box"></div>
          <div ref="pieSizeEl" class="pie-box"></div>
          <div ref="piePrimeEl" class="pie-box"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">{{ cfg.blueLabel || '蓝球' }}振幅分布（上下期差值绝对值）</div>
        <div ref="ampEl" class="chart-box-sm"></div>
        <div class="dim amp-note">振幅 = 相邻两期同位置号码之差的绝对值，振幅大说明上下期跳变大。</div>
      </div>

      <div class="card">
        <div class="card-title">冷热号榜</div>
        <div class="hotcold-grid">
          <div>
            <div class="sub-title hot-title">热号 TOP5</div>
            <div v-for="(item, i) in hotTop" :key="'h' + item.n" class="hc-row">
              <span class="rank">{{ i + 1 }}</span>
              <span class="ball ball-xs ball-blue">{{ pad2(item.n) }}</span>
              <span class="hc-num">{{ item.freq }} 次</span>
            </div>
          </div>
          <div>
            <div class="sub-title cold-title">冷号 TOP5</div>
            <div v-for="(item, i) in coldTop" :key="'c' + item.n" class="hc-row">
              <span class="rank">{{ i + 1 }}</span>
              <span class="ball ball-xs ball-blue">{{ pad2(item.n) }}</span>
              <span class="hc-num">遗漏 {{ item.omit }} 期</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { computeStats } from '../utils/picker-engine'
import { omitSeriesFor, BLUE_PRIMES } from '../utils/analysis'
import { pad2 } from '../utils/game-config'
import { echarts, chartTheme, tipStyle, onThemeChange } from '../utils/echarts-setup'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const hasBlue = computed(() => (props.cfg.blueMax || 0) > 0 && props.cfg.playMode !== 'direct')
const win = ref(50)
const selBlue = ref(1)

const statDraws = computed(() => props.draws.slice(0, Math.min(win.value, props.draws.length)))
const stats = computed(() => (hasBlue.value && props.draws.length ? computeStats(props.cfg, statDraws.value) : null))

const blueSizeSplit = computed(() => props.cfg.blueSizeSplit || Math.floor((props.cfg.blueMax || 0) / 2))

const freqRows = computed(() => {
  if (!stats.value) return []
  const s = stats.value
  const rows = []
  for (let b = 1; b <= props.cfg.blueMax; b++) rows.push({ n: b, freq: s.blueFreq[b] || 0 })
  return rows
})

const hotTop = computed(() => [...freqRows.value].sort((a, b) => b.freq - a.freq).slice(0, 5))
const coldTop = computed(() => {
  if (!stats.value) return []
  const s = stats.value
  const rows = []
  for (let b = 1; b <= props.cfg.blueMax; b++) {
    rows.push({ n: b, freq: s.blueFreq[b] || 0, omit: s.blueOmit[b] != null ? s.blueOmit[b] : props.draws.length })
  }
  return rows.sort((a, b) => b.omit - a.omit).slice(0, 5)
})

// 奇偶 / 大小 / 质合 分布
const dist = computed(() => {
  let odd = 0, even = 0, big = 0, small = 0, prime = 0, comp = 0
  for (const d of statDraws.value) {
    const blues = [d.blue, d.blue2].filter((b) => b != null)
    for (const b of blues) {
      if (b % 2 === 1) odd++
      else even++
      if (b > blueSizeSplit.value) big++
      else small++
      if (BLUE_PRIMES.has(b)) prime++
      else comp++
    }
  }
  return { odd, even, big, small, prime, comp }
})

// 振幅分布
const ampDist = computed(() => {
  const arr = new Array((props.cfg.blueMax || 0) + 1).fill(0)
  const ds = props.draws
  for (let i = 0; i < ds.length - 1; i++) {
    const a = [ds[i].blue, ds[i].blue2].filter((b) => b != null).sort((x, y) => x - y)
    const b = [ds[i + 1].blue, ds[i + 1].blue2].filter((x) => x != null).sort((x, y) => x - y)
    const len = Math.min(a.length, b.length)
    for (let k = 0; k < len; k++) {
      const amp = Math.abs(a[k] - b[k])
      if (amp <= props.cfg.blueMax) arr[amp]++
    }
  }
  return arr
})

const freqEl = ref(null)
const omitEl = ref(null)
const pieOddEl = ref(null)
const pieSizeEl = ref(null)
const piePrimeEl = ref(null)
const ampEl = ref(null)
let freqChart = null
let omitChart = null
let pieOddChart = null
let pieSizeChart = null
let piePrimeChart = null
let ampChart = null
let offTheme = null

function baseTooltip(t) {
  return { trigger: 'item', ...tipStyle(t) }
}

function renderFreq() {
  if (!freqEl.value || !freqRows.value.length) return
  if (!freqChart) freqChart = echarts.init(freqEl.value)
  const t = chartTheme()
  freqChart.setOption({
    grid: { left: 36, right: 16, top: 20, bottom: 30 },
    tooltip: { trigger: 'axis', ...tipStyle(t) },
    xAxis: {
      type: 'category', data: freqRows.value.map((r) => pad2(r.n)),
      axisLabel: { color: t.text, fontSize: 10 }, axisLine: { lineStyle: { color: t.axisLine } }
    },
    yAxis: { type: 'value', axisLabel: { color: t.text, fontSize: 10 }, splitLine: { lineStyle: { color: t.split } } },
    series: [{
      type: 'bar', barMaxWidth: 20,
      data: freqRows.value.map((r) => ({ value: r.freq, itemStyle: { color: t.blue, borderRadius: [3, 3, 0, 0] } }))
    }]
  }, true)
}

function renderOmit() {
  if (!omitEl.value) return
  if (!omitChart) omitChart = echarts.init(omitEl.value)
  const t = chartTheme()
  const b = selBlue.value
  const series = omitSeriesFor(props.cfg, props.draws, b, true, 50)
  const issues = props.draws.slice(0, 50).map((d) => d.issue).reverse()
  omitChart.setOption({
    grid: { left: 36, right: 16, top: 30, bottom: 40 },
    tooltip: { trigger: 'axis', ...tipStyle(t) },
    title: { text: `${cfgBlueLabel()} ${pad2(b)} 号遗漏走势`, left: 8, top: 4, textStyle: { color: t.textStrong, fontSize: 12 } },
    xAxis: { type: 'category', data: issues, axisLabel: { color: t.text, fontSize: 9, rotate: 45 }, axisLine: { lineStyle: { color: t.axisLine } } },
    yAxis: { type: 'value', axisLabel: { color: t.text, fontSize: 10 }, splitLine: { lineStyle: { color: t.split } } },
    series: [{ type: 'line', data: [...series].reverse(), symbol: 'circle', symbolSize: 4, lineStyle: { color: t.blue, width: 2 }, itemStyle: { color: t.blue } }]
  }, true)
}

function cfgBlueLabel() {
  return props.cfg.blueLabel || '蓝球'
}

function renderPies() {
  const t = chartTheme()
  const d = dist.value
  const mk = (el, chart, name, items) => {
    if (!el) return chart
    if (!chart) chart = echarts.init(el)
    chart.setOption({
      tooltip: baseTooltip(t),
      title: { text: name, left: 'center', top: 0, textStyle: { color: t.textStrong, fontSize: 12 } },
      series: [{
        type: 'pie', radius: ['35%', '58%'], center: ['50%', '56%'],
        data: items.map((it, i) => ({ name: it.name, value: it.value, itemStyle: { color: [t.red, t.blue, t.gold, t.teal][i] } })),
        label: { fontSize: 10, color: t.text, formatter: '{b}\n{d}%' },
        labelLine: { lineStyle: { color: t.split } }
      }]
    }, true)
    return chart
  }
  pieOddChart = mk(pieOddEl.value, pieOddChart, '奇偶', [{ name: '奇数', value: d.odd }, { name: '偶数', value: d.even }])
  pieSizeChart = mk(pieSizeEl.value, pieSizeChart, `大小(>${blueSizeSplit.value})`, [{ name: '大号', value: d.big }, { name: '小号', value: d.small }])
  piePrimeChart = mk(piePrimeEl.value, piePrimeChart, '质合', [{ name: '质数', value: d.prime }, { name: '合数', value: d.comp }])
}

function renderAmp() {
  if (!ampEl.value) return
  if (!ampChart) ampChart = echarts.init(ampEl.value)
  const t = chartTheme()
  const arr = ampDist.value
  const cats = arr.map((_, i) => String(i))
  ampChart.setOption({
    grid: { left: 36, right: 16, top: 20, bottom: 30 },
    tooltip: { trigger: 'axis', ...tipStyle(t) },
    xAxis: { type: 'category', data: cats, axisLabel: { color: t.text, fontSize: 10 }, axisLine: { lineStyle: { color: t.axisLine } } },
    yAxis: { type: 'value', axisLabel: { color: t.text, fontSize: 10 }, splitLine: { lineStyle: { color: t.split } } },
    series: [{ type: 'bar', barMaxWidth: 16, data: arr.map((v) => ({ value: v, itemStyle: { color: t.purple, borderRadius: [3, 3, 0, 0] } })) }]
  }, true)
}

function renderAll() {
  if (!hasBlue.value) return
  renderFreq()
  renderOmit()
  renderPies()
  renderAmp()
}

function onResize() {
  ;[freqChart, omitChart, pieOddChart, pieSizeChart, piePrimeChart, ampChart].forEach((c) => c && c.resize())
}

watch([win, selBlue, () => props.draws], async () => {
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
  ;[freqChart, omitChart, pieOddChart, pieSizeChart, piePrimeChart, ampChart].forEach((c) => { if (c) c.dispose() })
  freqChart = omitChart = pieOddChart = pieSizeChart = piePrimeChart = ampChart = null
})
</script>

<style scoped>
.blue-analysis { display: flex; flex-direction: column; gap: 12px; }
.tip-alert { margin-bottom: 4px; }
.card {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg, 16px);
  padding: 12px 14px;
  box-shadow: var(--shadow-card);
}
.empty-card { padding: 24px 12px; }
.card-title { font-size: 14px; font-weight: 700; }
.toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; flex-wrap: wrap; gap: 8px; }
.chart-box { width: 100%; height: 220px; }
.chart-box-sm { width: 100%; height: 180px; }
.amp-note { font-size: 11px; margin-top: 6px; }

.picker-row { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.pick-ball { cursor: pointer; border: none; color: #fff; font-weight: 700; }
.pick-ball.active { outline: 2px solid var(--brand-strong); outline-offset: 1px; }

.pie-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.pie-box { width: 100%; height: 180px; }

.hotcold-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.sub-title { font-size: 13px; font-weight: 700; margin-bottom: 8px; }
.hot-title { color: var(--red); }
.cold-title { color: var(--amber); }
.hc-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
.rank { width: 16px; font-size: 11px; color: var(--text-muted); text-align: center; }
.hc-num { font-size: 12px; color: var(--text-secondary); }

@media (max-width: 768px) {
  .pie-grid { grid-template-columns: 1fr; }
  .pie-box { height: 160px; }
  .chart-box { height: 190px; }
}
</style>
