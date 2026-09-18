<template>
  <div>
    <div class="card-title">复式拆票 · 智能缩水</div>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="输入一张复式/定位复式票，系统自动展开为全部单注；可启用智能缩水，按统计引擎评分保留 Top N 注，降低投注金额。"
      style="margin-bottom: 14px"
    />

    <!-- 模式切换（仅乐透型） -->
    <el-radio-group v-if="!isDirect" v-model="mode" size="small" style="margin-bottom: 14px">
      <el-radio-button value="score">评分缩水</el-radio-button>
      <el-radio-button value="filter">条件过滤</el-radio-button>
      <el-radio-button value="wheel">旋转矩阵</el-radio-button>
    </el-radio-group>

    <!-- 直位型提示 -->
    <el-alert
      v-if="isDirect"
      type="warning"
      :closable="false"
      show-icon
      title="直位型彩种暂不支持条件过滤和旋转矩阵，仅提供评分缩水"
      style="margin-bottom: 14px"
    />

    <!-- 旋转矩阵不支持的彩种提示 -->
    <el-alert
      v-if="!isDirect && mode === 'wheel' && !wheelSupported"
      type="warning"
      :closable="false"
      show-icon
      title="暂不支持该彩种的旋转矩阵（仅双色球/大乐透有公式表）"
      style="margin-bottom: 14px"
    />

    <div class="pick-panel">
      <template v-if="isDirect">
        <div v-for="(d, di) in cfg.digits" :key="'pos' + di" class="pos-zone">
          <div class="zone-label red-label">{{ d.label }}（可多选，多选即定位复式）</div>
          <div class="ball-pool">
            <button
              v-for="v in (d.max + 1)"
              :key="'p' + di + '_' + v"
              class="pool-btn"
              :class="{ picked: posSel[di] && posSel[di].includes(v - 1), 'btn-red': true }"
              @click="togglePos(di, v - 1)"
            >{{ v - 1 }}</button>
          </div>
        </div>
        <template v-if="cfg.tail != null">
          <div class="zone-label blue-label">尾位（0~{{ cfg.tailMax }}）</div>
          <div class="ball-pool">
            <button
              v-for="v in (cfg.tailMax + 1)"
              :key="'tail' + v"
              class="pool-btn"
              :class="{ picked: tailSel.includes(v - 1), 'btn-blue': true }"
              @click="toggleTail(v - 1)"
            >{{ v - 1 }}</button>
          </div>
        </template>
      </template>
      <template v-else>
        <div class="zone-label red-label">
          {{ mode === 'wheel' ? `红球号码池（选 7~12 个，当前 ${redSel.length}）` : `红球区（复式选 ≥${cfg.redCount} 个）` }}
        </div>
        <div class="ball-pool">
          <button
            v-for="n in cfg.redMax"
            :key="'r' + n"
            class="pool-btn"
            :class="{ picked: redSel.includes(n), 'btn-red': true }"
            @click="toggleIn('red', n)"
          >{{ pad2(n) }}</button>
        </div>
        <div class="zone-label blue-label">
          {{ mode === 'wheel' ? `蓝球区（选 1~3 个，当前 ${blueSel.length}）` : `蓝球区（选 ≥${cfg.blueCount} 个）` }}
        </div>
        <div class="ball-pool">
          <button
            v-for="n in cfg.blueMax"
            :key="'b' + n"
            class="pool-btn"
            :class="{ picked: blueSel.includes(n), 'btn-blue': true }"
            @click="toggleIn('blue', n)"
          >{{ pad2(n) }}</button>
        </div>
      </template>

      <!-- 旋转矩阵：公式选择 -->
      <div v-if="!isDirect && mode === 'wheel' && wheelSupported" class="wheel-picker">
        <div class="zone-label red-label">选择矩阵公式</div>
        <el-select v-model="wheelFormulaIdx" size="small" style="width: 100%" :disabled="!availableFormulas.length">
          <el-option
            v-for="(f, i) in availableFormulas"
            :key="i"
            :label="`${f.name} · ${f.count} 注（中${f.pickSize}保${f.guarantee}）`"
            :value="i"
          />
        </el-select>
        <div v-if="!availableFormulas.length" class="dim" style="font-size: 12px; margin-top: 6px">
          当前号码池 {{ redSel.length }} 个，无匹配公式。请选择 7~12 个红球。
        </div>
      </div>

      <div class="pick-actions">
        <el-button size="small" @click="randomFill">随机补选</el-button>
        <el-button size="small" type="danger" plain @click="clearSel">清空</el-button>
        <el-button
          v-if="!isDirect && mode === 'wheel'"
          size="small"
          type="primary"
          :disabled="!wheelValid"
          @click="doWheel"
        >生成矩阵</el-button>
        <el-button
          v-else
          size="small"
          type="primary"
          :disabled="!selectionValid"
          @click="doExpand"
        >展开拆票</el-button>
      </div>
    </div>

    <!-- ========== 评分缩水模式（原有逻辑） ========== -->
    <template v-if="!isDirect && mode === 'score' && expanded.length">
      <div class="summary-row">
        <div class="sum-card">
          <div class="sum-label">展开单注</div>
          <div class="sum-value">{{ expanded.length }}</div>
        </div>
        <div class="sum-card">
          <div class="sum-label">全额投注金额</div>
          <div class="sum-value">¥{{ fullAmount }}</div>
        </div>
        <div v-if="shrinkEnabled && shrunk.length" class="sum-card">
          <div class="sum-label">缩水后注数</div>
          <div class="sum-value sum-accent">{{ shrunk.length }}</div>
        </div>
        <div v-if="shrinkEnabled && shrunk.length" class="sum-card">
          <div class="sum-label">缩水后金额</div>
          <div class="sum-value sum-accent">¥{{ shrunkAmount }}</div>
        </div>
        <div v-if="shrinkEnabled && shrunk.length" class="sum-card">
          <div class="sum-label">节省</div>
          <div class="sum-value sum-save">¥{{ fullAmount - shrunkAmount }}（{{ savePct }}%）</div>
        </div>
      </div>

      <div class="shrink-bar">
        <el-checkbox v-model="shrinkEnabled" size="small">启用智能缩水（按统计引擎评分保留高分单注）</el-checkbox>
        <template v-if="shrinkEnabled">
          <el-select v-model="shrinkMode" size="small" style="width: 150px; margin-left: 10px">
            <el-option label="保留 Top N 注" value="topN" />
            <el-option label="按预算金额" value="budget" />
          </el-select>
          <el-input-number
            v-if="shrinkMode === 'topN'"
            v-model="topN"
            :min="1"
            :max="Math.max(1, expanded.length)"
            size="small"
            style="width: 120px; margin-left: 8px"
          />
          <el-input-number
            v-else
            v-model="budget"
            :min="2"
            :max="99999"
            :step="2"
            size="small"
            style="width: 130px; margin-left: 8px"
          />
          <el-button size="small" type="primary" plain style="margin-left: 8px" @click="doShrink">应用缩水</el-button>
        </template>
      </div>
    </template>

    <!-- ========== 条件过滤模式 ========== -->
    <template v-if="!isDirect && mode === 'filter' && expanded.length">
      <div class="summary-row">
        <div class="sum-card">
          <div class="sum-label">展开总数</div>
          <div class="sum-value">{{ expanded.length }}</div>
        </div>
        <div class="sum-card">
          <div class="sum-label">过滤后注数</div>
          <div class="sum-value sum-accent">{{ filteredLines.length }}</div>
        </div>
        <div class="sum-card">
          <div class="sum-label">过滤后金额</div>
          <div class="sum-value">¥{{ filteredLines.length * 2 }}</div>
        </div>
      </div>

      <div class="condition-panel">
        <div class="cond-title">条件过滤（勾选条件后实时过滤，未勾选不参与）</div>
        <div class="cond-grid">
          <!-- 和值范围 -->
          <div class="cond-row">
            <el-checkbox v-model="filterConds.sum.enabled" size="small">和值范围</el-checkbox>
            <template v-if="filterConds.sum.enabled">
              <el-input-number v-model="filterConds.sum.min" size="small" :min="0" :max="500" controls-position="right" style="width: 90px" />
              <span class="cond-sep">~</span>
              <el-input-number v-model="filterConds.sum.max" size="small" :min="0" :max="500" controls-position="right" style="width: 90px" />
            </template>
          </div>
          <!-- AC 值范围 -->
          <div class="cond-row">
            <el-checkbox v-model="filterConds.ac.enabled" size="small">AC 值范围</el-checkbox>
            <template v-if="filterConds.ac.enabled">
              <el-input-number v-model="filterConds.ac.min" size="small" :min="0" :max="20" controls-position="right" style="width: 80px" />
              <span class="cond-sep">~</span>
              <el-input-number v-model="filterConds.ac.max" size="small" :min="0" :max="20" controls-position="right" style="width: 80px" />
            </template>
          </div>
          <!-- 奇偶比 -->
          <div class="cond-row">
            <el-checkbox v-model="filterConds.oddEven.enabled" size="small">奇偶比</el-checkbox>
            <el-select v-if="filterConds.oddEven.enabled" v-model="filterConds.oddEven.ratio" size="small" style="width: 100px">
              <el-option v-for="o in oddEvenOpts" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>
          <!-- 大小比 -->
          <div class="cond-row">
            <el-checkbox v-model="filterConds.bigSmall.enabled" size="small">大小比</el-checkbox>
            <el-select v-if="filterConds.bigSmall.enabled" v-model="filterConds.bigSmall.ratio" size="small" style="width: 100px">
              <el-option v-for="o in bigSmallOpts" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>
          <!-- 跨度范围 -->
          <div class="cond-row">
            <el-checkbox v-model="filterConds.span.enabled" size="small">跨度范围</el-checkbox>
            <template v-if="filterConds.span.enabled">
              <el-input-number v-model="filterConds.span.min" size="small" :min="0" :max="80" controls-position="right" style="width: 80px" />
              <span class="cond-sep">~</span>
              <el-input-number v-model="filterConds.span.max" size="small" :min="0" :max="80" controls-position="right" style="width: 80px" />
            </template>
          </div>
          <!-- 连号个数 -->
          <div class="cond-row">
            <el-checkbox v-model="filterConds.consecutive.enabled" size="small">连号个数</el-checkbox>
            <el-select v-if="filterConds.consecutive.enabled" v-model="filterConds.consecutive.count" size="small" style="width: 90px">
              <el-option label="任意" value="any" />
              <el-option label="0" value="0" />
              <el-option label="1" value="1" />
              <el-option label="2" value="2" />
            </el-select>
          </div>
          <!-- 重号个数 -->
          <div class="cond-row">
            <el-checkbox v-model="filterConds.repeat.enabled" size="small">重号个数</el-checkbox>
            <el-select v-if="filterConds.repeat.enabled" v-model="filterConds.repeat.count" size="small" style="width: 90px">
              <el-option label="任意" value="any" />
              <el-option label="0" value="0" />
              <el-option label="1" value="1" />
              <el-option label="2" value="2" />
            </el-select>
          </div>
          <!-- 012 路比 -->
          <div class="cond-row">
            <el-checkbox v-model="filterConds.route012.enabled" size="small">012 路比</el-checkbox>
            <el-select v-if="filterConds.route012.enabled" v-model="filterConds.route012.type" size="small" style="width: 90px">
              <el-option label="任意" value="any" />
              <el-option label="均衡" value="balanced" />
            </el-select>
          </div>
          <!-- 尾数重复 -->
          <div class="cond-row">
            <el-checkbox v-model="filterConds.tailRepeat.enabled" size="small">尾数重复</el-checkbox>
            <el-select v-if="filterConds.tailRepeat.enabled" v-model="filterConds.tailRepeat.count" size="small" style="width: 90px">
              <el-option label="任意" value="any" />
              <el-option label="0" value="0" />
              <el-option label="1" value="1" />
            </el-select>
          </div>
          <!-- 质数个数 -->
          <div class="cond-row">
            <el-checkbox v-model="filterConds.prime.enabled" size="small">质数个数</el-checkbox>
            <el-select v-if="filterConds.prime.enabled" v-model="filterConds.prime.count" size="small" style="width: 90px">
              <el-option label="任意" value="any" />
              <el-option label="0" value="0" />
              <el-option label="1" value="1" />
              <el-option label="2" value="2" />
              <el-option label="3" value="3" />
            </el-select>
          </div>
        </div>
        <div class="cond-preview dim">
          实时预览：展开 {{ expanded.length }} 注 → 满足条件 {{ filteredLines.length }} 注（¥{{ filteredLines.length * 2 }}）
        </div>
      </div>
    </template>

    <!-- ========== 旋转矩阵模式 ========== -->
    <template v-if="!isDirect && mode === 'wheel' && wheelGenerated">
      <div class="summary-row">
        <div class="sum-card">
          <div class="sum-label">矩阵注数</div>
          <div class="sum-value">{{ wheelResult.length }}</div>
        </div>
        <div class="sum-card">
          <div class="sum-label">投注金额</div>
          <div class="sum-value">¥{{ wheelResult.length * 2 }}</div>
        </div>
      </div>
    </template>

    <!-- ========== 共享：操作栏 + 列表 ========== -->
    <template v-if="showResults">
      <div class="shrink-bar">
        <el-button size="small" style="margin-left: auto" @click="exportCsv">导出 CSV</el-button>
        <el-button size="small" type="success" plain :disabled="!saveList.length || saving" @click="saveToPicks">保存到自选号（{{ saveList.length }} 注）</el-button>
      </div>

      <div class="sub-title">
        {{ mode === 'wheel' ? '矩阵组合列表' : mode === 'filter' ? '过滤结果列表' : '单注列表' }}
        （展示前 {{ shownLines.length }} / {{ saveList.length }} 注<template v-if="mode === 'score'">，按评分降序</template>）
      </div>
      <div class="line-list">
        <div v-for="(line, i) in shownLines" :key="i" class="line-row">
          <span class="line-no dim">{{ saveIndex(line) }}</span>
          <template v-if="line.digits != null">
            <span v-for="(dv, di) in line.digits" :key="'d' + di" class="ball ball-red ball-sm">{{ dv }}</span>
            <span v-if="line.tail != null" class="ball ball-blue ball-sm">{{ line.tail }}</span>
          </template>
          <template v-else>
            <span v-for="n in line.red" :key="'r' + n" class="ball ball-red ball-sm">{{ pad2(n) }}</span>
            <span v-for="(b, i) in line.blue" :key="'b' + i" class="ball ball-blue ball-sm">{{ pad2(b) }}</span>
          </template>
          <span v-if="line.score != null" class="line-score">评分 {{ Math.round(line.score) }}</span>
        </div>
      </div>
      <div v-if="saveList.length > shownLines.length" class="dim" style="font-size: 12px; margin-top: 6px">
        共 {{ saveList.length }} 注，仅展示前 100 注预览；CSV 与保存为完整列表。
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { pad2 } from '../utils/game-config'
import { expandTicket, scoreTicketPlay, computeDirectStats, computeStats, scoreDigits } from '../utils/picker-engine'
import { filterByConditions, oddEvenOptions, bigSmallOptions } from '../utils/filter'
import { WHEELING_TABLE, getFormulasForPool, applyWheeling } from '../utils/wheeling'
import { checkTicketHistory, checkTicketHistoryMulti } from '../utils/prize-check'
import { isRecentDuplicate } from '../utils/picks-fingerprint'
import { get, set, STORE_PICKS } from '../utils/db'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const isDirect = computed(() => props.cfg.playMode === 'direct')

// 模式：score=评分缩水 / filter=条件过滤 / wheel=旋转矩阵
const mode = ref('score')

const redSel = ref([])
const blueSel = ref([])
const posSel = ref([])
const tailSel = ref([])

const expanded = ref([])
const scored = ref([])
const shrinkEnabled = ref(true)
const shrinkMode = ref('topN')
const topN = ref(50)
const budget = ref(50)

// 条件过滤状态
const filterStats = ref(null)
const filterConds = ref({
  sum: { enabled: false, min: props.cfg.sumMin, max: props.cfg.sumMax },
  ac: { enabled: false, min: 5, max: 10 },
  oddEven: { enabled: false, ratio: '3:3' },
  bigSmall: { enabled: false, ratio: '3:3' },
  span: { enabled: false, min: props.cfg.spanMin || 16, max: props.cfg.spanMax || 30 },
  consecutive: { enabled: false, count: 'any' },
  repeat: { enabled: false, count: 'any' },
  route012: { enabled: false, type: 'any' },
  tailRepeat: { enabled: false, count: 'any' },
  prime: { enabled: false, count: 'any' }
})

// 旋转矩阵状态
const wheelFormulaIdx = ref(0)
const wheelGenerated = ref(false)

const wheelSupported = computed(() => {
  return !!WHEELING_TABLE[props.cfg.key] && WHEELING_TABLE[props.cfg.key].length > 0
})

const availableFormulas = computed(() => {
  return getFormulasForPool(props.cfg.key, redSel.value.length)
})

const wheelValid = computed(() => {
  if (isDirect.value || !wheelSupported.value) return false
  if (redSel.value.length < 7 || redSel.value.length > 12) return false
  if (!availableFormulas.value.length) return false
  if (blueSel.value.length < (props.cfg.blueCount || 0)) return false
  return true
})

/** 蓝球组合枚举（旋转矩阵 × 蓝球笛卡尔积用） */
function combosOf(arr, k) {
  if (k <= 0) return [[]]
  if (k >= arr.length) return [[...arr]]
  const out = []
  function bt(start, chosen) {
    if (chosen.length === k) { out.push([...chosen]); return }
    for (let i = start; i < arr.length; i++) {
      chosen.push(arr[i])
      bt(i + 1, chosen)
      chosen.pop()
    }
  }
  bt(0, [])
  return out
}

/** 旋转矩阵结果：红球矩阵 × 蓝球组合 */
const wheelResult = computed(() => {
  if (mode.value !== 'wheel' || isDirect.value || !wheelGenerated.value) return []
  const formulas = availableFormulas.value
  if (!formulas.length || wheelFormulaIdx.value >= formulas.length) return []
  const formula = formulas[wheelFormulaIdx.value]
  const redCombos = applyWheeling(redSel.value, formula)
  if (!redCombos.length) return []
  const blueCombos = (props.cfg.blueCount || 0) > 0
    ? combosOf(blueSel.value, props.cfg.blueCount)
    : [[]]
  const result = []
  for (const red of redCombos) {
    for (const blue of blueCombos) {
      result.push({ red: [...red], blue: [...blue], score: null })
    }
  }
  return result
})

const selectionValid = computed(() => {
  if (isDirect.value) {
    const ok = posSel.value.some((p) => p && p.length > 0)
    return ok
  }
  return redSel.value.length >= props.cfg.redCount && blueSel.value.length >= props.cfg.blueCount
})

function toggleIn(zone, n) {
  if (zone === 'red') {
    redSel.value = redSel.value.includes(n) ? redSel.value.filter((x) => x !== n) : [...redSel.value, n].sort((a, b) => a - b)
  } else {
    blueSel.value = blueSel.value.includes(n) ? blueSel.value.filter((x) => x !== n) : [...blueSel.value, n].sort((a, b) => a - b)
  }
}

function togglePos(di, v) {
  const cur = posSel.value[di] || []
  posSel.value[di] = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v].sort((a, b) => a - b)
  posSel.value = [...posSel.value]
}

function toggleTail(v) {
  tailSel.value = tailSel.value.includes(v) ? tailSel.value.filter((x) => x !== v) : [...tailSel.value, v].sort((a, b) => a - b)
}

function clearSel() {
  redSel.value = []
  blueSel.value = []
  posSel.value = []
  tailSel.value = []
  wheelGenerated.value = false
}

function randomFill() {
  // Fisher-Yates 无偏洗牌
  const shuffle = (arr) => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  if (isDirect.value) {
    props.cfg.digits.forEach((d, di) => {
      if (!posSel.value[di] || !posSel.value[di].length) posSel.value[di] = [randInt(0, d.max)]
    })
    if (props.cfg.tail != null && !tailSel.value.length) tailSel.value = [randInt(0, props.cfg.tailMax)]
    posSel.value = [...posSel.value]
    return
  }
  const pool = Array.from({ length: props.cfg.redMax }, (_, i) => i + 1)
  const bpool = Array.from({ length: props.cfg.blueMax }, (_, i) => i + 1)
  if (mode.value === 'wheel') {
    // 旋转矩阵：补选 7~12 个红球 + 1~3 个蓝球
    const rCount = randInt(7, Math.min(12, props.cfg.redMax))
    const bCount = randInt(1, Math.min(3, props.cfg.blueMax))
    redSel.value = [...new Set([...redSel.value, ...shuffle(pool).slice(0, rCount)])].sort((a, b) => a - b)
    blueSel.value = [...new Set([...blueSel.value, ...shuffle(bpool).slice(0, bCount)])].sort((a, b) => a - b)
    return
  }
  const r = Math.min(props.cfg.redMax, props.cfg.redCount + randInt(1, Math.min(3, props.cfg.redMax - props.cfg.redCount)))
  const b = Math.min(props.cfg.blueMax, props.cfg.blueCount + randInt(0, 1))
  redSel.value = [...new Set([...redSel.value, ...shuffle(pool).slice(0, r)])].sort((a, b) => a - b)
  blueSel.value = [...new Set([...blueSel.value, ...shuffle(bpool).slice(0, Math.max(props.cfg.blueCount, b))])].sort((a, b) => a - b)
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function currentTicket() {
  if (isDirect.value) {
    return { type: 'duplex', digits: posSel.value.map((p) => [...(p || [])]), tail: props.cfg.tail != null ? [...tailSel.value] : undefined }
  }
  return { type: 'duplex', red: [...redSel.value], blue: [...blueSel.value] }
}

// st 为 doExpand 里预先算好的一次性统计，避免逐注重复全量统计（性能关键）
function scoreLine(line, st) {
  if (isDirect.value) {
    return st ? scoreDigits(props.cfg, line.digits, line.tail, st).total : 0
  }
  const r = scoreTicketPlay(props.cfg, props.draws, { type: 'single', red: line.red, blue: line.blue }, st)
  return r.total != null ? r.total : 0
}

function doExpand() {
  if (!selectionValid.value) return
  const ticket = currentTicket()
  let lines = expandTicket(props.cfg, ticket)
  if (!lines.length) {
    ElMessage.warning('无法展开：请检查复式选择是否合法')
    return
  }
  if (lines.length > 50000) {
    ElMessage.warning(`展开注数 ${lines.length} 超出安全上限（5 万注），请减少所选号码`)
    return
  }
  expanded.value = lines
  const st = isDirect.value
    ? computeDirectStats(props.cfg, props.draws || [])
    : computeStats(props.cfg, props.draws || [])
  filterStats.value = st // 条件过滤模式用 st.lastRed
  const t0 = performance.now()
  scored.value = lines.map((l) => {
    const sc = scoreLine(l, st)
    return { ...l, score: sc }
  })
  scored.value.sort((a, b) => b.score - a.score)
  ElMessage.success(`展开 ${lines.length} 注，评分耗时 ${Math.round(performance.now() - t0)}ms`)
}

function doWheel() {
  if (!wheelValid.value) return
  wheelGenerated.value = true
  ElMessage.success(`矩阵生成：${wheelResult.value.length} 注`)
}

const fullAmount = computed(() => expanded.value.length * 2)

/** 保存按钮冷却标记 */
const saving = ref(false)

// ========== 条件过滤：实时计算过滤结果 ==========
const oddEvenOpts = computed(() => oddEvenOptions(props.cfg.redCount || 6))
const bigSmallOpts = computed(() => bigSmallOptions(props.cfg.redCount || 6))

const filteredLines = computed(() => {
  if (mode.value !== 'filter' || !expanded.value.length) return []
  return filterByConditions(expanded.value, filterConds.value, props.cfg, filterStats.value || undefined)
})

// ========== saveList：根据模式返回不同结果 ==========
const saveList = computed(() => {
  if (mode.value === 'filter') return filteredLines.value
  if (mode.value === 'wheel') return wheelResult.value
  // score 模式（原有逻辑）
  if (!shrinkEnabled.value) return scored.value
  if (shrinkMode.value === 'topN') {
    return scored.value.slice(0, Math.min(topN.value, scored.value.length))
  }
  const maxN = Math.floor(budget.value / 2)
  return scored.value.slice(0, Math.min(maxN, scored.value.length))
})

/** 是否展示结果区域 */
const showResults = computed(() => {
  if (isDirect.value) return expanded.value.length > 0
  if (mode.value === 'wheel') return wheelGenerated.value && wheelResult.value.length > 0
  return expanded.value.length > 0
})

const shrunk = computed(() => (shrinkEnabled.value ? saveList.value : []))
const shrunkAmount = computed(() => shrunk.value.length * 2)
const savePct = computed(() => {
  if (!fullAmount.value) return 0
  return Math.round(((fullAmount.value - shrunkAmount.value) / fullAmount.value) * 100)
})

const shownLines = computed(() => saveList.value.slice(0, 100))

function saveIndex(line) {
  return saveList.value.indexOf(line) + 1
}

function doShrink() {
  ElMessage.success(`缩水完成：${expanded.value.length} → ${saveList.value.length} 注`)
}

function exportCsv() {
  if (!saveList.value.length) return
  const rows = [['序号', '红球/号码', '蓝球/尾位', '评分']]
  saveList.value.forEach((l, i) => {
    const main = l.digits != null ? l.digits.join(',') : l.red.map(pad2).join(',')
    const sub = l.tail != null ? String(l.tail) : l.blue ? l.blue.map(pad2).join(',') : ''
    rows.push([i + 1, main, sub, l.score != null ? Math.round(l.score * 100) / 100 : ''])
  })
  const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.cfg.key}-拆票缩水-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('CSV 已导出')
}

async function saveToPicks() {
  if (saving.value) return
  if (!saveList.value.length) return
  saving.value = true
  const latest = props.draws && props.draws.length ? props.draws[0] : null
  const STORE_KEY = 'lottery-picker-mypicks-' + props.cfg.key
  let picks = []
  try {
    const raw = await get(STORE_PICKS, STORE_KEY)
    picks = Array.isArray(raw) ? raw : []
  } catch (e) {
    picks = []
  }
  const pick = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    createStamp: Date.now(),
    ticket: { type: 'multi', tickets: saveList.value.map((l) => (l.digits != null ? { digits: l.digits, tail: l.tail != null ? l.tail : undefined } : { red: l.red, blue: l.blue })) },
    savedAt: Date.now(),
    combos: saveList.value.length,
    amount: saveList.value.length * 2,
    score: { total: Math.round(saveList.value.reduce((s, l) => s + (l.score || 0), 0) / saveList.value.length * 100) / 100, count: saveList.value.length },
    checkedIssue: latest ? latest.issue : null,
    status: latest ? 'checked' : 'pending',
    prize: latest ? checkTicketHistory(props.cfg, { type: 'multi', tickets: saveList.value.map((l) => (l.digits != null ? { digits: l.digits, tail: l.tail != null ? l.tail : undefined } : { red: l.red, blue: l.blue })) }, props.draws) : null,
    hits: latest ? checkTicketHistoryMulti(props.cfg, { type: 'multi', tickets: saveList.value.map((l) => (l.digits != null ? { digits: l.digits, tail: l.tail != null ? l.tail : undefined } : { red: l.red, blue: l.blue })) }, props.draws) : { hits: [], hitCount: 0, totalBonus: 0 },
    hitCount: 0,
    totalBonus: 0,
    _hitsExpanded: false
  }
  try {
    const multi = pick.hits
    pick.hitCount = multi ? multi.hitCount : 0
    pick.totalBonus = multi ? multi.totalBonus : 0
  } catch (e) { /* 历史核对失败不阻断拆分保存 */ }
  if (isRecentDuplicate(picks, pick.ticket)) {
    ElMessage.info('已保存过相同的拆票结果，跳过重复保存')
    saving.value = false
    return
  }
  picks.unshift(pick)
  try {
    await set(STORE_PICKS, STORE_KEY, picks)
  } catch (e) {
    console.error('拆票保存失败', e)
    ElMessage.error('保存失败：本地存储不可用')
    saving.value = false
    return
  }
  window.dispatchEvent(new CustomEvent('lp-picks-updated', { detail: { key: props.cfg.key } }))
  ElMessage.success(`已保存 ${saveList.value.length} 注到自选号（可在「自选号」页面查看与核对）`)
  setTimeout(() => { saving.value = false }, 600)
}
</script>

<style scoped>
.pick-panel {
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

.ball-pool {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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

.pick-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  flex-wrap: wrap;
}

.wheel-picker {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--card-bg);
  border: 1px solid var(--border-light);
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

.sum-accent {
  color: var(--accent);
}

.sum-save {
  color: #67c23a;
}

.shrink-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.condition-panel {
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--card-bg);
  padding: 12px 14px;
  margin-bottom: 12px;
}

.cond-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 10px;
  color: var(--text-main);
}

.cond-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 8px 16px;
}

.cond-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.cond-sep {
  font-size: 12px;
  color: var(--text-dim);
}

.cond-preview {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-light);
  font-size: 12px;
}

.sub-title {
  font-size: 13px;
  font-weight: 700;
  margin: 14px 0 8px;
  color: var(--text-main);
}

.line-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 460px;
  overflow-y: auto;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 8px;
  background: var(--card-bg);
}

.line-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border-radius: 6px;
}

.line-row:nth-child(odd) {
  background: var(--card-inset);
}

.line-no {
  width: 36px;
  font-size: 11px;
  flex: none;
}

.line-score {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-dim);
  flex: none;
}

.dim {
  color: var(--text-dim);
}

@media (max-width: 768px) {
  .pick-panel { padding: 10px; }
  .pool-btn { width: 30px; height: 30px; font-size: 11px; }
  .ball-pool { gap: 4px; }
  .summary-row { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .sum-card { padding: 10px 12px; }
  .pick-actions { flex-wrap: wrap; }
  .line-list { max-height: 380px; }
  .cond-grid { grid-template-columns: 1fr; }
}
</style>
