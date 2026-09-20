<template>
  <div>
    <div class="card-title">追号计划模拟</div>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="基于已加载的官方开奖历史数据，模拟固定号码追号 N 期的投入与回报。仅作历史回测观察，开奖随机独立，不构成投注建议。"
      style="margin-bottom: 14px"
    />

    <div class="panel">
      <div class="import-row">
        <el-button size="small" type="warning" plain @click="openImport">从自选号导入</el-button>
        <el-button v-if="importedTicket" size="small" text @click="clearImport">取消导入</el-button>
        <span v-if="importedTicket" class="import-meta">
          已导入 {{ importedTypeLabel }} · {{ importedTotal }} 注<span v-if="importedSavedAt">（保存于 {{ importedSavedAt }}）</span>
        </span>
      </div>

      <div v-if="importedTicket" class="import-banner">
        <div class="import-lines">
          <div v-for="(l, i) in importedPreview" :key="i" class="import-line">
            <span class="import-line-no">{{ i + 1 }}</span>
            <template v-if="l.digits">
              <span v-for="(dv, di) in l.digits" :key="'d' + di" class="ball ball-red ball-xs">{{ dv }}</span>
              <span v-if="l.tail != null" class="ball ball-blue ball-xs">{{ l.tail }}</span>
            </template>
            <template v-else>
              <span v-for="n in l.red" :key="'r' + n" class="ball ball-red ball-xs">{{ pad2(n) }}</span>
              <span v-for="(b, bi) in l.blue" :key="'b' + bi" class="ball ball-blue ball-xs">{{ pad2(b) }}</span>
            </template>
          </div>
          <div v-if="importedTotal > importedPreview.length" class="dim" style="font-size: 12px">… 共 {{ importedTotal }} 注</div>
        </div>
      </div>

      <template v-else-if="isDirect">
        <div v-for="(d, di) in cfg.digits" :key="'pos' + di" class="zone-label" :class="{ 'red-label': true }">
          {{ d.label }}
          <el-select v-model="chaseDigits[di]" size="small" style="width: 90px; margin-left: 6px">
            <el-option v-for="v in (d.max + 1)" :key="'p' + di + '_' + (v - 1)" :label="String(v - 1)" :value="v - 1" />
          </el-select>
        </div>
        <template v-if="cfg.tail != null">
          <div class="zone-label blue-label">
            尾位
            <el-select v-model="chaseTail" size="small" style="width: 90px; margin-left: 6px">
              <el-option v-for="v in (cfg.tailMax + 1)" :key="'t' + (v - 1)" :label="String(v - 1)" :value="v - 1" />
            </el-select>
          </div>
        </template>
      </template>
      <template v-else>
        <div class="zone-label red-label">红球（选 {{ cfg.redCount }}~{{ cfg.redMax }} 个，当前 {{ chaseRed.length }}）</div>
        <div class="ball-pool">
          <button
            v-for="n in cfg.redMax"
            :key="'r' + n"
            class="pool-btn btn-red"
            :class="{ picked: chaseRed.includes(n) }"
            @click="toggleRed(n)"
          >{{ pad2(n) }}</button>
        </div>
        <div class="zone-label blue-label">蓝球（选 {{ cfg.blueCount }}~{{ cfg.blueMax }} 个，当前 {{ chaseBlue.length }}）</div>
        <div class="ball-pool">
          <button
            v-for="n in cfg.blueMax"
            :key="'b' + n"
            class="pool-btn btn-blue"
            :class="{ picked: chaseBlue.includes(n) }"
            @click="toggleBlue(n)"
          >{{ pad2(n) }}</button>
        </div>
        <div v-if="poolInfo" class="duplex-info">{{ poolInfo }}</div>
      </template>

      <div class="params-row">
        <div class="param-item">
          <span class="param-label">计划期数</span>
          <el-input-number v-model="periods" :min="1" :max="100" size="small" />
          <span class="param-hint">本地 {{ availableDraws }} 期</span>
        </div>
        <div class="param-item">
          <span class="param-label">起始倍数</span>
          <el-input-number v-model="startMulti" :min="1" :max="99" size="small" />
        </div>
        <div class="param-item">
          <span class="param-label">倍投策略</span>
          <el-select v-model="strategy" size="small" style="width: 140px">
            <el-option label="固定倍数" value="fixed" />
            <el-option label="线性加码(+1)" value="linear" />
            <el-option label="翻倍追号" value="double" />
            <el-option label="阶梯(1-2-4-8)" value="ladder" />
          </el-select>
        </div>
        <div class="param-item">
          <span class="param-label">中奖止盈</span>
          <el-switch v-model="stopOnWin" size="small" />
        </div>
        <el-button type="primary" size="small" :disabled="!validSel" @click="runSim">开始回测</el-button>
        <el-button size="small" @click="randomPick">随机号码</el-button>
      </div>
    </div>

    <template v-if="result.length">
      <div class="summary-row">
        <div class="sum-card">
          <div class="sum-label">回测期数</div>
          <div class="sum-value">{{ result.length }}</div>
        </div>
        <div class="sum-card">
          <div class="sum-label">总投入</div>
          <div class="sum-value">¥{{ totalCost }}</div>
        </div>
        <div class="sum-card">
          <div class="sum-label">总奖金</div>
          <div class="sum-value" :class="{ 'sum-win': totalBonus > totalCost, 'sum-lose': totalBonus < totalCost }">¥{{ totalBonus }}</div>
        </div>
        <div class="sum-card">
          <div class="sum-label">净收益</div>
          <div class="sum-value" :class="{ 'sum-win': totalBonus - totalCost >= 0, 'sum-lose': totalBonus - totalCost < 0 }">
            {{ totalBonus - totalCost >= 0 ? '+' : '' }}¥{{ totalBonus - totalCost }}
          </div>
        </div>
        <div class="sum-card">
          <div class="sum-label">收益率</div>
          <div class="sum-value" :class="{ 'sum-win': roi >= 0, 'sum-lose': roi < 0 }">
            {{ roi >= 0 ? '+' : '' }}{{ roi.toFixed(1) }}%
          </div>
        </div>
        <div class="sum-card">
          <div class="sum-label">中奖期数 / 命中</div>
          <div class="sum-value">{{ winCount }} / {{ hitCount }}</div>
        </div>
      </div>

      <div class="sub-title">逐期回测明细</div>
      <div class="table-wrap">
        <table class="mini-table">
          <thead>
            <tr>
              <th>期号</th>
              <th>开奖号码</th>
              <th>倍投</th>
              <th>投入</th>
              <th>中奖等级</th>
              <th>奖金</th>
              <th>累计盈亏</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in result" :key="i" :class="{ 'row-win': r.bonus > 0 }">
              <td class="dim">{{ r.issue }}</td>
              <td>
                <template v-if="r.drawDigits != null">
                  <span v-for="(dv, di) in r.drawDigits" :key="'d' + di" class="ball ball-red ball-xs">{{ dv }}</span>
                  <span v-if="r.drawTail != null" class="ball ball-blue ball-xs">{{ r.drawTail }}</span>
                </template>
                <template v-else>
                  <span v-for="n in r.drawRed" :key="'r' + n" class="ball ball-red ball-xs">{{ pad2(n) }}</span>
                  <span v-for="(b, bi) in r.drawBlue" :key="'b' + bi" class="ball ball-blue ball-xs">{{ pad2(b) }}</span>
                </template>
              </td>
              <td>{{ r.multiple }}x</td>
              <td>¥{{ r.cost }}</td>
              <td>
                <span v-if="r.bonus > 0" class="prize-tag">{{ r.levelName }}</span>
                <span v-else class="dim">未中奖</span>
              </td>
              <td :class="{ 'cell-win': r.bonus > 0 }">¥{{ r.bonus }}</td>
              <td :class="{ 'cell-win': r.cum >= 0, 'cell-lose': r.cum < 0 }">{{ r.cum >= 0 ? '+' : '' }}¥{{ r.cum }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="dim" style="font-size: 12px; margin-top: 8px; line-height: 1.8">
        回测口径：按官方历史开奖逐期核对（最新一期起向前回溯）；奖金按固定奖级规则计算，浮动奖（一等奖/二等奖等按奖池浮动）以单注基础奖金估算。理性购彩，量力而行。
      </div>
    </template>

    <el-dialog v-model="importVisible" title="从自选号导入" width="92%">
      <div v-if="!savedPicksView.length" class="dim" style="font-size: 13px; line-height: 1.8">
        当前彩种还没有保存的自选号。请先在「选号 → 自选号」页保存号码，再回来导入追号。
      </div>
      <div v-else class="import-list">
        <div v-for="row in savedPicksView" :key="row.pick.id" class="import-item">
          <div class="import-item-info">
            <div class="import-item-date">{{ fmtSavedTime(row.pick.savedAt) }}<span v-if="row.total > 1" class="dim"> · 共 {{ row.total }} 注</span></div>
            <div class="import-line">
              <template v-if="row.first && row.first.digits">
                <span v-for="(dv, di) in row.first.digits" :key="'d' + di" class="ball ball-red ball-xs">{{ dv }}</span>
                <span v-if="row.first.tail != null" class="ball ball-blue ball-xs">{{ row.first.tail }}</span>
              </template>
              <template v-else-if="row.first">
                <span v-for="n in row.first.red" :key="'r' + n" class="ball ball-red ball-xs">{{ pad2(n) }}</span>
                <span v-for="(b, bi) in row.first.blue" :key="'b' + bi" class="ball ball-blue ball-xs">{{ pad2(b) }}</span>
              </template>
              <span v-else class="dim">号码数据异常</span>
            </div>
          </div>
          <el-button size="small" type="primary" :disabled="!row.first" @click="importPick(row.pick)">追号</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { pad2 } from '../utils/game-config'
import { checkTicket } from '../utils/prize-check'
import { expandTicket, calcPlay } from '../utils/picker-engine'
import { get, STORE_PICKS } from '../utils/db'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const isDirect = computed(() => props.cfg.playMode === 'direct')

const chaseRed = ref([])
const chaseBlue = ref([])
const chaseDigits = ref([])
const chaseTail = ref(null)

const periods = ref(10)
const startMulti = ref(1)
const strategy = ref('fixed')
const stopOnWin = ref(true)

/** 本地已加载的开奖期数（回测实际期数 = min(计划期数, 该值)） */
const availableDraws = computed(() => (Array.isArray(props.draws) ? props.draws.length : 0))

const result = ref([])

// ===== 从已保存的自选号导入追号 =====
const importVisible = ref(false)
const savedPicks = ref([])
const importedTicket = ref(null)
const importedSavedAt = ref('')

/** 自选号保存时间格式化 */
function fmtSavedTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 导入票展开后的逐注（用于展示与注数） */
const importedLines = computed(() => (importedTicket.value ? expandTicket(props.cfg, importedTicket.value) : []))
const importedTotal = computed(() => importedLines.value.length)
const importedPreview = computed(() => importedLines.value.slice(0, 8))
const importedTypeLabel = computed(() => {
  const t = importedTicket.value
  if (!t) return ''
  return { single: '单式', duplex: '复式', multi: '多注', danTuo: '胆拖' }[t.type] || '单式'
})

/** 自选号列表预览（每个取首注） */
const savedPicksView = computed(() =>
  savedPicks.value.map((p) => {
    const lines = p && p.ticket ? expandTicket(props.cfg, p.ticket) : []
    return { pick: p, first: lines[0] || null, total: lines.length }
  })
)

/** 打开导入弹窗并读取当前彩种的自选号 */
async function openImport() {
  try {
    const raw = await get(STORE_PICKS, 'lottery-picker-mypicks-' + props.cfg.key)
    savedPicks.value = Array.isArray(raw) ? raw : []
  } catch (e) {
    savedPicks.value = []
  }
  importVisible.value = true
}

/** 导入一注自选号并立即回测 */
function importPick(p) {
  if (!p || !p.ticket) {
    ElMessage.warning('该自选号数据异常，无法导入')
    return
  }
  // 深拷贝为纯对象（同时规避 reactive Proxy）
  importedTicket.value = JSON.parse(JSON.stringify(p.ticket))
  importedSavedAt.value = fmtSavedTime(p.savedAt)
  importVisible.value = false
  runSim()
  ElMessage.success('已导入自选号，开始追号回测')
}

/** 取消导入，回到手动选号 */
function clearImport() {
  importedTicket.value = null
  importedSavedAt.value = ''
  result.value = []
}

const validSel = computed(() => {
  if (importedTicket.value) return true
  if (isDirect.value) {
    return props.cfg.digits.every((d, di) => chaseDigits.value[di] != null)
  }
  return chaseRed.value.length >= props.cfg.redCount && chaseBlue.value.length >= props.cfg.blueCount
})

const isDuplex = computed(() => !isDirect.value && (chaseRed.value.length > props.cfg.redCount || chaseBlue.value.length > props.cfg.blueCount))

function combosCount(n, k) {
  if (k < 0 || k > n) return 0
  if (k === 0 || k === n) return 1
  k = Math.min(k, n - k)
  let result = 1
  for (let i = 0; i < k; i++) {
    result = result * (n - i) / (i + 1)
  }
  return Math.round(result)
}

const duplexCombos = computed(() => {
  if (isDirect.value) return 1
  return combosCount(chaseRed.value.length, props.cfg.redCount) * combosCount(chaseBlue.value.length, props.cfg.blueCount)
})

/** 选区信息提示：注数 / 每期金额，且反映「起始倍数」（旧文案写死"未加倍"、只显示单倍价，误导） */
const poolInfo = computed(() => {
  if (isDirect.value) return ''
  const r = chaseRed.value.length
  const b = chaseBlue.value.length
  if (r < props.cfg.redCount || b < props.cfg.blueCount) return ''
  const combos = duplexCombos.value
  const base = combos * 2
  const kind = isDuplex.value ? '复式' : '单式'
  if (startMulti.value > 1) {
    return `${kind} ${r}+${b} → ${combos} 注 · 起始 ${startMulti.value} 倍（首期 ¥${base * startMulti.value}/期）`
  }
  return `${kind} ${r}+${b} → ${combos} 注 · ¥${base}/期（未加倍）`
})

function toggleRed(n) {
  chaseRed.value = chaseRed.value.includes(n) ? chaseRed.value.filter((x) => x !== n) : [...chaseRed.value, n].sort((a, b) => a - b)
}
function toggleBlue(n) {
  chaseBlue.value = chaseBlue.value.includes(n) ? chaseBlue.value.filter((x) => x !== n) : [...chaseBlue.value, n].sort((a, b) => a - b)
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomPick() {
  if (importedTicket.value) clearImport() // 手动随机时退出导入状态
  if (isDirect.value) {
    props.cfg.digits.forEach((d, di) => {
      chaseDigits.value[di] = randInt(0, d.max)
    })
    chaseDigits.value = [...chaseDigits.value]
    if (props.cfg.tail != null) chaseTail.value = randInt(0, props.cfg.tailMax)
    return
  }
  const pool = Array.from({ length: props.cfg.redMax }, (_, i) => i + 1)
  const bpool = Array.from({ length: props.cfg.blueMax }, (_, i) => i + 1)
  // Fisher-Yates 无偏洗牌（1.8.3：替代 sort(() => Math.random()-0.5)）
  const shuffle = (arr) => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  chaseRed.value = shuffle(pool).slice(0, Math.min(props.cfg.redCount + 2, props.cfg.redMax)).sort((a, b) => a - b)
  chaseBlue.value = shuffle(bpool).slice(0, Math.min(props.cfg.blueCount + 1, props.cfg.blueMax)).sort((a, b) => a - b)
}

function multipleAt(idx) {
  switch (strategy.value) {
    case 'fixed':
      return startMulti.value
    case 'linear':
      return startMulti.value + idx
    case 'double':
      return startMulti.value * Math.pow(2, idx)
    case 'ladder':
      return startMulti.value * [1, 2, 4, 8][idx % 4]
    default:
      return startMulti.value
  }
}

/** 当前参与回测的票：优先用导入的自选号，否则按选区构造 */
function activeTicket() {
  if (importedTicket.value) return importedTicket.value
  if (isDirect.value) {
    return { type: 'single', digits: chaseDigits.value.map((v) => (v == null ? 0 : v)), tail: chaseTail.value != null ? chaseTail.value : undefined }
  }
  return isDuplex.value
    ? { type: 'duplex', red: [...chaseRed.value], blue: [...chaseBlue.value] }
    : { type: 'single', red: [...chaseRed.value], blue: [...chaseBlue.value] }
}

function runSim() {
  if (!validSel.value) {
    ElMessage.warning('请先选择完整的追号号码')
    return
  }
  const ticket = activeTicket()
  const total = props.draws.length
  if (!total) {
    ElMessage.warning('暂无开奖数据，请先刷新数据')
    return
  }
  const n = Math.min(periods.value, total)
  if (n < periods.value) ElMessage.info(`本地仅有 ${total} 期开奖数据，本次按 ${n} 期回测`)
  const rows = []
  let cum = 0
  for (let i = 0; i < n; i++) {
    const draw = props.draws[i]
    const multiple = multipleAt(i)
    const t = { ...ticket, multiple }
    // 每期投入：任意玩法（单式/多注/复式/胆拖/直选）统一按 calcPlay 计金额（已含倍数）
    const cost = calcPlay(props.cfg, t).amount
    // 每期奖金：checkTicket 按玩法展开逐注核对，并对单注奖金乘倍数
    const res = checkTicket(props.cfg, t, draw)
    const bonus = res.bonus || 0
    cum += bonus - cost
    rows.push({
      issue: draw.issue,
      drawRed: draw.red || [],
      drawBlue: [draw.blue, draw.blue2].filter((b) => b != null),
      drawDigits: draw.digits || [],
      drawTail: draw.tail != null ? draw.tail : null,
      multiple,
      cost,
      bonus,
      level: res.level || 0,
      levelName: res.name || '',
      cum: Math.round(cum * 100) / 100
    })
    // 中奖止盈：命中后停止后续期
    if (stopOnWin.value && bonus > 0) break
  }
  result.value = rows
}

const totalCost = computed(() => result.value.reduce((s, r) => s + r.cost, 0))
const totalBonus = computed(() => result.value.reduce((s, r) => s + r.bonus, 0))
/** 收益率（ROI）= 净收益 ÷ 总投入 × 100% */
const roi = computed(() => {
  const cost = totalCost.value
  if (!cost) return 0
  return ((totalBonus.value - cost) / cost) * 100
})
const winCount = computed(() => result.value.filter((r) => r.bonus > 0).length)
const hitCount = computed(() => result.value.filter((r) => r.level > 0).length)
</script>

<style scoped>
.panel {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--card-inset);
  padding: 16px;
  margin-bottom: 14px;
}

.zone-label {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
}

.red-label {
  color: var(--red);
}

.blue-label {
  color: var(--blue);
  margin-top: 14px;
}

.duplex-info {
  margin-top: 10px;
  padding: 8px 12px;
  background: rgba(217, 43, 63, 0.08);
  border-radius: 8px;
  font-size: 12px;
  color: var(--red);
  font-weight: 600;
}

.ball-pool {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}

.pool-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text-dim);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
  font-weight: 600;
}

.btn-red.picked {
  background: radial-gradient(circle at 32% 28%, #ff9a8a, #d92b3f 100%);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 2px 6px rgba(217, 43, 63, 0.5);
}

.btn-blue.picked {
  background: radial-gradient(circle at 32% 28%, #8fc0ff, #1d5ad4 100%);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 2px 6px rgba(29, 90, 212, 0.5);
}

.params-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 14px;
  flex-wrap: wrap;
}

.param-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.param-label {
  font-size: 12px;
  color: var(--text-dim);
}

.param-hint {
  font-size: 11px;
  color: var(--text-dim);
  opacity: 0.85;
}

.summary-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.sum-card {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--card-bg);
  padding: 12px 14px;
}

.sum-label {
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 4px;
}

.sum-value {
  font-size: 20px;
  font-weight: 800;
}

.sum-win {
  color: #67c23a;
}

.sum-lose {
  color: #f56c6c;
}

.sub-title {
  font-size: 13px;
  font-weight: 700;
  margin: 14px 0 8px;
  color: var(--text-main);
}

.table-wrap {
  border: 1px solid var(--border-light);
  border-radius: 10px;
  overflow: auto;
  max-height: 480px;
  background: var(--card-bg);
}

.mini-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.mini-table th,
.mini-table td {
  padding: 7px 10px;
  border-bottom: 1px solid var(--border-light);
  text-align: left;
  white-space: nowrap;
}

.mini-table th {
  position: sticky;
  top: 0;
  background: var(--card-bg);
  color: var(--text-dim);
  font-weight: 600;
  z-index: 1;
}

.row-win {
  background: rgba(103, 194, 58, 0.06);
}

.cell-win {
  color: #67c23a;
  font-weight: 700;
}

.cell-lose {
  color: #f56c6c;
  font-weight: 700;
}

.prize-tag {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 8px;
  background: rgba(214, 48, 49, 0.12);
  color: var(--red);
  font-size: 11px;
}
@media (max-width: 768px) {
  .panel { padding: 10px; }
  .pool-btn { width: 30px; height: 30px; font-size: 11px; }
  .ball-pool { gap: 4px; }
  .params-row { flex-wrap: wrap; }
  .summary-row { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .sum-card { padding: 10px 12px; }
  .table-wrap { max-height: 360px; }
}

/* ===== 从自选号导入 ===== */
.import-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.import-meta {
  font-size: 12px;
  color: var(--text-dim);
}
.import-banner {
  border: 1px dashed var(--border-strong);
  border-radius: 10px;
  padding: 10px 12px;
  background: rgba(246, 196, 83, 0.06);
  margin-bottom: 12px;
}
.import-lines {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.import-line {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.import-line-no {
  width: 18px;
  font-size: 11px;
  color: var(--text-dim);
}
.import-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 60vh;
  overflow: auto;
}
.import-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
}
.import-item-info {
  flex: 1;
  min-width: 0;
}
.import-item-date {
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 4px;
}
</style>
