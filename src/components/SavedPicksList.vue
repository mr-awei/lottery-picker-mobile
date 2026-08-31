<template>
  <div class="spl">
    <div class="spl-head">
      <div class="spl-title">
        <span class="spl-title-text">我的自选票</span>
        <span class="spl-count">{{ picks.length }} 张<span v-if="picks.length" class="spl-hits"> · 历史 {{ totalHits }} 期中奖</span></span>
      </div>
      <div v-if="picks.length" class="spl-tools">
        <el-button size="small" text @click="recheckAll">重新核对</el-button>
        <el-button size="small" text type="danger" @click="clearAll">清空全部</el-button>
      </div>
    </div>

    <div v-if="!picks.length" class="spl-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="spl-empty-icon">
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="M8 9h8M8 13h5" />
      </svg>
      <div class="spl-empty-title">还没有保存的自选号码</div>
      <div class="spl-empty-body">去「选号」保存一注就会自动出现在这里。系统会自动追溯最近开奖核对中奖情况，中了大奖会主动弹窗提示。</div>
    </div>

    <div v-else class="spl-list">
      <div v-for="p in picks" :key="p.id" class="spl-row" :class="{ won: p.prize && p.prize.level > 0, pending: p.status === 'pending' }">
        <div class="spl-main">
          <div class="spl-balls" v-if="p.ticket.type === 'single'">
            <template v-if="p.ticket.digits">
              <el-tag v-if="p.ticket.zx && p.ticket.zx !== 'direct'" size="small" type="warning" effect="plain" style="margin-right: 6px">{{ zxLabel(p.ticket.zx) }}</el-tag>
              <span v-for="(dv, di) in p.ticket.digits" :key="'d' + di" class="ball ball-red">{{ dv }}</span>
              <span v-if="p.ticket.tail != null" class="ball ball-blue">{{ p.ticket.tail }}</span>
            </template>
            <template v-else>
              <span v-for="n in p.ticket.red" :key="'r' + n" class="ball ball-red">{{ pad2(n) }}</span>
              <span v-for="(b, i) in p.ticket.blue" :key="'b' + i" class="ball ball-blue">{{ pad2(b) }}</span>
            </template>
          </div>
          <div v-else-if="p.ticket.type === 'multi'" class="spl-multi">
            <el-tag size="small" type="warning" effect="plain" style="margin-right: 6px">多注 ×{{ p.ticket.tickets.length }}</el-tag>
            <div class="spl-multi-balls" :class="{ 'grid-mode': p.ticket.tickets.length > 4 }">
              <!-- 修复（1.8.6）：>4 注自动 2 列网格布局（更紧凑不占页面），
              ≤4 注单列。折叠仍按 ≤8 全显示 / >8 折叠。 -->
              <div v-for="(t, i) in (p.ticket.tickets.length <= 8 || p._multiExpanded ? p.ticket.tickets : p.ticket.tickets.slice(0, 8))" :key="i" class="spl-mini-line">
                <span class="spl-mini-num">{{ i + 1 }}</span>
                <template v-if="t.digits">
                  <span v-for="(dv, di) in t.digits" :key="'d' + di" class="ball ball-red spl-mini-ball">{{ dv }}</span>
                  <span v-if="t.tail != null" class="ball ball-blue spl-mini-ball">{{ t.tail }}</span>
                </template>
                <template v-else>
                  <span v-for="n in t.red" :key="'r' + n" class="ball ball-red spl-mini-ball">{{ pad2(n) }}</span>
                  <span v-for="(b, bi) in t.blue" :key="'b' + bi" class="ball ball-blue spl-mini-ball">{{ pad2(b) }}</span>
                </template>
              </div>
              <div v-if="p.ticket.tickets.length > 8" class="spl-more" @click="toggleMulti(p)">
                <span v-if="!p._multiExpanded">展开剩余 {{ p.ticket.tickets.length - 8 }} 注 ▼</span>
                <span v-else>收起 ▲</span>
              </div>
            </div>
          </div>
          <div v-else-if="p.ticket.type === 'duplex' && p.ticket.digits" class="spl-balls">
            <el-tag size="small" type="success" effect="plain" style="margin-right: 6px">定位复式</el-tag>
            <span v-for="(ds, di) in p.ticket.digits" :key="'ds' + di" class="spl-pos-group">
              <span class="spl-mini-num">{{ di + 1 }}</span>
              <span v-for="dv in ds" :key="'v' + dv" class="ball ball-red spl-mini-ball">{{ dv }}</span>
            </span>
          </div>
          <div v-else class="spl-balls">
            <el-tag size="small" :type="p.ticket.type === 'duplex' ? 'success' : 'primary'" effect="plain" style="margin-right: 6px">
              {{ p.ticket.type === 'duplex' ? '复式' : '胆拖' }}
            </el-tag>
            <template v-if="p.ticket.type === 'duplex'">
              <span v-for="n in p.ticket.red" :key="'r' + n" class="ball ball-red">{{ pad2(n) }}</span>
              <span v-for="(b, i) in p.ticket.blue" :key="'b' + i" class="ball ball-blue">{{ pad2(b) }}</span>
            </template>
            <template v-else>
              <span v-for="n in p.ticket.danRed" :key="'d' + n" class="ball ball-amber" :title="'胆码 ' + pad2(n)">{{ pad2(n) }}</span>
              <span v-for="n in p.ticket.tuoRed" :key="'t' + n" class="ball ball-red-soft" :title="'拖码 ' + pad2(n)">{{ pad2(n) }}</span>
              <span v-for="(b, i) in p.ticket.blue" :key="'b' + i" class="ball ball-blue">{{ pad2(b) }}</span>
            </template>
          </div>
        </div>

        <div class="spl-meta">
          <div class="spl-meta-line">
            <span class="spl-score">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="spl-ic-sm"><path d="M12 2l2.6 5.6 6.1.8-4.5 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.3 8.4l6.1-.8z" /></svg>
              评分 {{ p.score ? p.score.total : '—' }}
            </span>
            <span class="spl-amount" v-if="p.combos">{{ p.combos }} 注 · ¥{{ p.amount }}<span v-if="p.ticket && p.ticket.append">（追加）</span></span>
          </div>
          <div class="spl-result">
            <template v-if="p.status === 'pending'">
              <span class="status-pill pending">未开奖</span>
              <span class="spl-sub">等第 {{ p.checkedIssue }} 期</span>
            </template>
            <template v-else-if="p.prize">
              <span v-if="p.prize.level > 0" class="prize-badge" :class="'lv' + p.prize.level">
                {{ p.prize.name }} · ¥{{ fmtBonus(p.prize.bonus) }}
              </span>
              <span v-else class="spl-sub">未中奖</span>
              <span v-if="p.prize.draw" class="spl-sub">第 {{ p.prize.draw.issue }} 期</span>
              <el-button v-if="p.prize.level > 0" size="small" text type="primary" @click="showFlow(p)">兑奖流程</el-button>
              <el-button v-if="p.hitCount > 0" size="small" text type="primary" @click="toggleHits(p)">{{ p._hitsExpanded ? '收起' : '明细' }}</el-button>
            </template>
            <span v-else class="spl-sub">等待核对…</span>
          </div>
          <div v-if="p._hitsExpanded && p.hits && p.hits.length" class="spl-hits-list">
            <div v-for="(h, hi) in p.hits" :key="hi" class="spl-hit-chip" :class="'lv' + h.level">
              <span class="spl-hit-issue">{{ h.issue }}期</span>
              <span class="spl-hit-name">{{ h.name }}</span>
              <span class="spl-hit-bonus">¥{{ fmtBonus(h.bonus) }}</span>
            </div>
          </div>
        </div>

        <el-button size="small" text type="danger" class="spl-del" @click="removePick(p.id)">删除</el-button>
      </div>
    </div>

    <el-dialog v-model="flowVisible" width="600px" align-center class="prize-flow-dialog" :show-close="true" append-to-body>
      <div v-if="flowData" class="prize-flow">
        <div class="pf-hero" :class="flowData.isBig ? 'pf-hero-big' : 'pf-hero-small'">
          <div class="pf-level">{{ flowData.name }}</div>
          <div class="pf-title">恭喜中奖！</div>
          <div class="pf-bonus"><span class="pf-bonus-sym">¥</span>{{ flowData.bonusText }}<span v-if="flowData.winCount > 1" class="pf-win-count">{{ flowData.winCount }} 注中奖</span></div>
          <div v-if="flowData.draw" class="pf-draw">第 {{ flowData.draw.issue }} 期 · {{ fmtDate(flowData.draw.date) }}</div>
          <div v-if="flowData.draw && flowData.draw.red" class="pf-balls">
            <span v-for="n in flowData.draw.red" :key="'r' + n" class="ball ball-red">{{ pad2(n) }}</span>
            <span v-for="b in [flowData.draw.blue, flowData.draw.blue2].filter(v => v != null)" :key="'b' + b" class="ball ball-blue">{{ pad2(b) }}</span>
          </div>
          <div v-else-if="flowData.draw && flowData.draw.digits" class="pf-balls">
            <span v-for="(d, di) in flowData.draw.digits" :key="'d' + di" class="ball ball-red">{{ d }}</span>
            <span v-if="flowData.draw.tail != null" class="ball ball-blue">{{ flowData.draw.tail }}</span>
          </div>
        </div>
        <div class="pf-section-title">兑奖流程</div>
        <div class="pf-steps">
          <div v-for="s in flowData.steps" :key="s.no" class="pf-step">
            <span class="pf-step-no">{{ s.no }}</span>
            <div class="pf-step-body">
              <div class="pf-step-title">{{ s.title }}</div>
              <div class="pf-step-desc">{{ s.desc }}</div>
            </div>
          </div>
        </div>
        <div v-if="flowData.note" class="pf-warn">
          <span class="pf-warn-icon">!</span>
          <span>{{ flowData.note }}</span>
        </div>
        <div class="pf-footer">
          <el-button class="pf-btn" type="danger" round @click="flowVisible = false">我知道了</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, onActivated } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { pad2, fmtDate } from '../utils/game-config'
import { checkTicketHistory, checkTicketHistoryMulti, isBigWin, bigWinFlow, smallWinNote, fmtBonus } from '../utils/prize-check'

const props = defineProps({
  cfg: { type: Object, required: true },
  draws: { type: Array, required: true }
})

const STORE_KEY = () => 'lottery-picker-mypicks-' + props.cfg.key
const FLOW_SHOWN_KEY = () => 'lottery-picker-flow-shown-' + props.cfg.key

const picks = ref([])
const flowVisible = ref(false)
const flowData = ref(null)
const shownFlowIds = ref(new Set())

const latest = computed(() => (props.draws && props.draws.length ? props.draws[0] : null))
const totalHits = computed(() => picks.value.reduce((a, p) => a + (p.hitCount || 0), 0))

function zxLabel(zx) {
  if (zx === 'zuxuan3') return '组选3'
  if (zx === 'zuxuan6') return '组选6'
  return '直选'
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY())
    const arr = raw ? JSON.parse(raw) : []
    picks.value = arr.map((p) => {
      if (!p.ticket) {
        return {
          ...p,
          ticket: { type: 'single', red: p.red || [], blue: p.blue || [] },
          combos: 1,
          amount: 2
        }
      }
      // 修复（1.8.5）：旧版本 multi 票存了错误的 combos/amount（calcPlay bug 导致 5 注存为 1/¥2），
      // 加载时按 ticket.tickets.length 重算（默认 ¥2/注，不含追加/倍数——用户已加的不动）
      if (p.ticket.type === 'multi' && Array.isArray(p.ticket.tickets)) {
        const realCombos = p.ticket.tickets.length
        if (p.combos !== realCombos) {
          // 用真实注数 + 重新按基础价（¥2/注）算金额（追加/倍数场景用户应手动重选）
          return { ...p, combos: realCombos, amount: realCombos * 2 }
        }
      }
      return p
    })
  } catch (e) {
    picks.value = []
  }
}

function persist() {
  try {
    localStorage.setItem(STORE_KEY(), JSON.stringify(picks.value))
  } catch (e) {
    console.error('保存自选号失败', e)
  }
}

function loadShown() {
  try {
    const raw = localStorage.getItem(FLOW_SHOWN_KEY())
    shownFlowIds.value = new Set(raw ? JSON.parse(raw) : [])
  } catch (e) {
    shownFlowIds.value = new Set()
  }
}

function persistShown() {
  try {
    localStorage.setItem(FLOW_SHOWN_KEY(), JSON.stringify([...shownFlowIds.value]))
  } catch (e) {
    console.error(e)
  }
}

function flowKey(p) {
  const pr = p.prize && p.prize.best ? p.prize.best : p.prize
  const issue = pr && pr.draw ? pr.draw.issue : p.checkedIssue || ''
  return `${p.id}-${issue}-${pr ? pr.level : 0}`
}

function markShown(p) {
  shownFlowIds.value.add(flowKey(p))
  persistShown()
}

function buildFlowData(prize, text) {
  const isBig = isBigWin(prize)
  const lines = (text || '').split('\n').map((s) => s.trim()).filter(Boolean)
  const steps = []
  let note = ''
  lines.forEach((line) => {
    const m = line.match(/^(\d+)\.\s*([^：:]+)[：:]\s*(.*)$/)
    if (m) {
      steps.push({ no: Number(m[1]), title: m[2], desc: m[3] || '' })
    } else if (line.indexOf('温馨提示') === 0) {
      note = line
    }
  })
  return {
    isBig,
    name: prize ? prize.name : '',
    bonusText: prize ? fmtBonus(prize.bonus) : '',
    winCount: prize ? prize.winCount || 1 : 1,
    draw: prize && prize.draw ? prize.draw : null,
    steps,
    note
  }
}

function showFlow(p) {
  const pr = p.prize && p.prize.best ? p.prize.best : p.prize
  flowData.value = buildFlowData(pr, isBigWin(pr) ? bigWinFlow(props.cfg, pr) : smallWinNote(props.cfg, pr))
  flowVisible.value = true
}

function toggleHits(p) {
  p._hitsExpanded = !p._hitsExpanded
}

function toggleMulti(p) {
  p._multiExpanded = !p._multiExpanded
}

function recheckAll() {
  if (!latest.value || !props.draws.length) return
  // 修复（1.8.3）：原来 markShown/shownFlowIds 是死代码——"中大奖自动弹窗"功能缺失。
  // 现在 recheckAll 后若发现首次中大奖（未弹过）自动弹兑奖流程，并记录已弹避免重复打扰
  let newlyWon = null
  picks.value = picks.value.map((p) => {
    const checked = checkTicketHistory(props.cfg, p.ticket, props.draws)
    const multi = checkTicketHistoryMulti(props.cfg, p.ticket, props.draws)
    const np = { ...p, checkedIssue: checked && checked.draw ? checked.draw.issue : null, status: 'checked', prize: checked, hits: multi.hits, hitCount: multi.hitCount, totalBonus: multi.totalBonus }
    const pr = checked && checked.best ? checked.best : checked
    if (pr && isBigWin(pr) && !shownFlowIds.value.has(flowKey(np)) && !newlyWon) {
      newlyWon = np
    }
    return np
  })
  persist()
  if (newlyWon) {
    showFlow(newlyWon)
    markShown(newlyWon)
  }
}

function removePick(id) {
  const p = picks.value.find((x) => x.id === id)
  if (!p) return
  ElMessageBox.confirm('确定删除这张自选号码吗？删除后不可恢复。', '删除确认', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(() => {
      picks.value = picks.value.filter((x) => x.id !== id)
      persist()
      ElMessage.success('已删除')
    })
    .catch(() => {})
}

function clearAll() {
  if (!picks.value.length) return
  ElMessageBox.confirm(`确定清空全部 ${picks.value.length} 张自选号码吗？删除后不可恢复。`, '清空确认', {
    confirmButtonText: '全部删除',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(() => {
      picks.value = []
      persist()
      ElMessage.success('已清空')
    })
    .catch(() => {})
}

function onPicksUpdated(e) {
  if (e && e.detail && e.detail.key === props.cfg.key) {
    load()
    // 修复（1.9.1）：之前只 load 不 recheck → 新保存的票没有 prize 状态显示"等待核对…"，
    // 用户看不到中奖核对反馈，误以为"保存失败 → 要清后台重启"才看到。
    if (props.draws && props.draws.length) recheckAll()
  }
}

onMounted(() => {
  load()
  loadShown()
  if (props.draws && props.draws.length) recheckAll()
  window.addEventListener('lp-picks-updated', onPicksUpdated)
})

// 修复（1.9.1）：SavedPicksList 被 keep-alive 包在 FileCheck 内（LotteryBoard `:key="active+'-'+game"`），
// 切 tab / 切彩种都不重 mount；如果用户的「保存事件」在 SavedPicksList 首次 mount 之前派发（例如
// App 启动过程中或 FileCheck 首次渲染尚未触发 onMounted），window 上的 listener 还没注册 → 事件丢失。
// 兜底：每次激活（onActivated）都强制重 load + recheck，覆盖「事件丢失」和「跨组件后续刷新」两种场景。
onActivated(() => {
  load()
  loadShown()
  if (props.draws && props.draws.length) recheckAll()
})

onBeforeUnmount(() => {
  window.removeEventListener('lp-picks-updated', onPicksUpdated)
})

watch(() => props.draws, () => {
  if (props.draws && props.draws.length) recheckAll()
})
</script>

<style scoped>
/* ============================================
   SavedPicksList - 弱化为紧凑列表卡（不与 FileCheck hero 抢戏）
   设计原则：
   - 不再做强玻璃（去 backdrop-filter），仅 hairline 边框 + 内 padding
   - 标题用 3px 竖线 + 小标，与 FileCheck section title 节奏统一
   - 空态去掉虚线方框，改为居中文案 + 单色 icon
   ============================================ */
.spl {
  position: relative;
  border-radius: 16px;
  padding: 14px 14px 12px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.10));
  background: rgba(255, 255, 255, 0.02);
  box-shadow: none;
  overflow: hidden;
}
.spl::before {
  display: none;
}

.spl-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.spl-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  /* 修复（1.8.6）：flex:1 + min-width:0 在窄屏把"我的自选票"压成 0 宽 → 4 字竖排。
  改 flex:0 1 auto + min-width:fit-content 保证 4 字自然横排。 */
  flex: 0 1 auto;
  min-width: fit-content;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--text-primary);
}
.spl-title::before {
  content: '';
  display: inline-block;
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--accent, #f6c453), rgba(246, 196, 83, 0.4));
  margin-right: 6px;
  transform: translateY(2px);
}
.spl-title-text {
  line-height: 1;
}
.spl-count {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}
.spl-hits {
  color: var(--accent, #f6c453);
  font-weight: 700;
}

.spl-tools {
  display: flex;
  gap: 8px;
}

/* ---------- 空状态（精简：无虚线方框，纯文字+icon） ---------- */
.spl-empty {
  padding: 40px 8px 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--text-muted);
  text-align: center;
}
.spl-empty-icon {
  width: 36px;
  height: 36px;
  opacity: 0.6;
  color: var(--accent, #f6c453);
  margin-bottom: 4px;
}
.spl-empty-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
}
.spl-empty-body {
  font-size: 12px;
  line-height: 1.7;
  max-width: 320px;
  opacity: 0.85;
}

.spl-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.spl-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  flex-wrap: wrap;
  transition: transform 0.14s var(--ease-out), border-color 0.2s;
}
.spl-row:hover { transform: translateY(-1px); }
.spl-row.won {
  border-color: rgba(246, 196, 83, 0.55);
  background: linear-gradient(90deg, rgba(246, 196, 83, 0.10), rgba(255, 255, 255, 0.03) 60%);
}
.spl-row.pending {
  border-color: rgba(100, 181, 246, 0.4);
}

.spl-main {
  flex: 1 1 220px;
  min-width: 0;
}

.spl-balls {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.spl-multi {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}
.spl-multi-balls {
  display: flex;
  flex-direction: column;
  gap: 3px;
  /* 修复（1.8.6）：删除 max-height: 96px + overflow: hidden——
     之前的 max-height 是 1.8.2 时期"折叠 3 行"的硬编码 CSS 物理限制，
     导致 5+ 注永远只显示 3-4 行（被 CSS 截断而非 v-for slice），所有模板逻辑修复都失效。
     现在折叠完全由 v-for 的 tickets.length <= 8 || _multiExpanded 控制。 */
}
.spl-multi-balls.grid-mode {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 8px;
}
.spl-multi-balls.grid-mode .spl-mini-line {
  margin: 0;
}
.spl-mini-line {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
}
.spl-mini-ball {
  width: 20px;
  height: 20px;
  font-size: 10px;
}
/* 修复（1.8.8）：grid-mode 2 列下每列只有 ~152px，6 红 + 1 蓝 = 7 球 + 序号标
   原始 20px 球 + 2px gap 总宽 ~170px > 152px → flex-wrap 把蓝球挤到下一行。
   现在 grid-mode 强制 nowrap + 缩球到 17px + 减小 gap，让单行装下。
   非 grid-mode（≤4 注）行宽 = 313px 容纳 7×22+14+2=170 没问题，保持 20px。 */
.spl-multi-balls.grid-mode .spl-mini-line {
  flex-wrap: nowrap;
}
.spl-multi-balls.grid-mode .spl-mini-ball {
  width: 17px;
  height: 17px;
  font-size: 9px;
  flex-shrink: 0;
}
.spl-multi-balls.grid-mode .spl-mini-num {
  width: 12px;
  font-size: 9px;
  flex-shrink: 0;
}
.spl-mini-num {
  font-size: 10px;
  color: var(--text-muted);
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}
.spl-pos-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-right: 6px;
}
.spl-more {
  font-size: 11px;
  color: var(--accent, #f6c453);
  margin-top: 4px;
  cursor: pointer;
  font-weight: 600;
  user-select: none;
}
.spl-more:hover { text-decoration: underline; }

.spl-meta {
  flex: 1 1 200px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.spl-meta-line {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  flex-wrap: wrap;
}
.spl-score {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 700;
  color: var(--accent, #f6c453);
}
.spl-ic-sm {
  width: 12px;
  height: 12px;
}
.spl-amount {
  color: var(--text-muted);
  font-size: 12px;
}

.spl-result {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.spl-sub {
  font-size: 11px;
  color: var(--text-muted);
}

.status-pill {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}
.status-pill.pending {
  background: rgba(100, 181, 246, 0.18);
  color: #64b5f6;
}

.prize-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}
.lv1 { background: linear-gradient(90deg, #ffd54f, #ffb300); color: #3e2723; }
.lv2 { background: linear-gradient(90deg, #b0bec5, #90a4ae); color: #1c2833; }
.lv3, .lv4 { background: rgba(255, 152, 0, 0.22); color: #ffb74d; }
.lv5, .lv6 { background: rgba(76, 175, 80, 0.20); color: #81c784; }
.lv7, .lv8, .lv9 { background: rgba(33, 150, 242, 0.20); color: #64b5f6; }

.spl-hits-list {
  flex-basis: 100%;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 6px;
  border-top: 1px dashed var(--border, rgba(255, 255, 255, 0.15));
}
.spl-hit-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
}
.spl-hit-chip.lv1, .spl-hit-chip.lv2 { border-left: 3px solid #f6c453; }
.spl-hit-chip.lv3, .spl-hit-chip.lv4 { border-left: 3px solid #64b5f6; }
.spl-hit-chip.lv5, .spl-hit-chip.lv6, .spl-hit-chip.lv7 { border-left: 3px solid #a5d6a7; }
.spl-hit-issue { font-weight: 700; color: var(--accent, #f6c453); }
.spl-hit-name { color: var(--text-primary); }
.spl-hit-bonus { font-weight: 700; color: #f6c453; margin-left: auto; }

.spl-del {
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .spl { padding: 12px; }
  .spl-row { padding: 10px 12px; gap: 8px; }
  .spl-main, .spl-meta { flex: 1 1 100%; }
  .spl-hits-list { padding-top: 6px; }
}
</style>

<style>
/* 弹窗全局样式（与原 MyPicks/FileCheck 共享） */
.prize-flow-dialog.el-dialog {
  border-radius: var(--r-lg);
  overflow: visible !important;
  border: 1px solid var(--border);
  background: var(--surface-1);
  box-shadow: var(--shadow-3);
  padding: 0;
  max-width: calc(100vw - 48px);
}
.prize-flow-dialog .el-dialog__header { display: none; }
.prize-flow-dialog .el-dialog__body { padding: 0; }
.prize-flow {
  background: linear-gradient(180deg, var(--surface-2) 0%, var(--surface-1) 100%);
  animation: pf-pop 0.32s var(--ease-out);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 48px);
  overscroll-behavior: contain;
}
@keyframes pf-pop {
  from { opacity: 0; transform: scale(0.94) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.pf-hero {
  position: relative;
  text-align: center;
  padding: 22px 22px 14px;
  overflow: visible;
  flex: none;
}
.pf-hero-big {
  background:
    radial-gradient(ellipse at 50% -20%, rgba(246, 196, 83, 0.28), transparent 62%),
    linear-gradient(180deg, #1d2745 0%, var(--surface-2) 100%);
}
.pf-hero-small {
  background:
    radial-gradient(ellipse at 50% -20%, rgba(61, 123, 255, 0.22), transparent 62%),
    linear-gradient(180deg, #16203a 0%, var(--surface-2) 100%);
}
.pf-level {
  display: inline-block;
  padding: 4px 14px;
  border-radius: var(--r-full);
  font-size: var(--fs-13);
  font-weight: 700;
  letter-spacing: 2px;
  margin-bottom: 6px;
}
.pf-hero-big .pf-level {
  background: linear-gradient(90deg, #ffd54f, #ffb300);
  color: #3e2723;
  box-shadow: 0 2px 10px rgba(255, 179, 0, 0.4);
}
.pf-hero-small .pf-level {
  background: rgba(61, 123, 255, 0.18);
  color: #7fa8ff;
  border: 1px solid rgba(61, 123, 255, 0.35);
}
.pf-title { font-size: var(--fs-24); font-weight: 800; color: var(--text-primary); letter-spacing: 1px; }
.pf-bonus { margin-top: 6px; font-size: var(--fs-32); font-weight: 800; line-height: 1.15; }
.pf-hero-big .pf-bonus { color: var(--accent-strong); text-shadow: 0 0 22px rgba(246, 196, 83, 0.35); }
.pf-hero-small .pf-bonus { color: #7fa8ff; }
.pf-bonus-sym { font-size: var(--fs-20); margin-right: 2px; }
.pf-win-count { display: inline-block; margin-left: 8px; font-size: var(--fs-12); font-weight: 600; color: var(--text-secondary); vertical-align: middle; }
.pf-draw { margin-top: 4px; font-size: var(--fs-12); color: var(--text-muted); }
.pf-balls { margin-top: 6px; display: flex; justify-content: center; gap: 4px; }
.pf-section-title { padding: 0 22px 6px; font-size: var(--fs-13); font-weight: 700; color: var(--text-muted); letter-spacing: 2px; flex: none; }
.pf-steps { padding: 0 22px; display: flex; flex-direction: column; gap: 6px; flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.pf-step { display: flex; gap: 12px; padding: 6px 14px; border: 1px solid var(--border-subtle); border-radius: var(--r-md); background: var(--surface-2); }
.pf-step-no { flex: 0 0 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: var(--fs-13); font-weight: 800; color: #3e2723; background: linear-gradient(90deg, #ffd54f, #ffb300); }
.pf-step-body { flex: 1; min-width: 0; }
.pf-step-title { font-size: var(--fs-14); font-weight: 700; color: var(--text-primary); }
.pf-step-desc { font-size: var(--fs-12); line-height: 1.5; color: var(--text-secondary); }
.pf-note { margin: 4px 22px 0; padding: 12px 14px; border-radius: var(--r-md); border: 1px dashed var(--border-strong); background: var(--surface-2); font-size: var(--fs-12); line-height: 1.6; color: var(--text-secondary); flex: none; }
.pf-warn { display: flex; align-items: flex-start; gap: 8px; margin: 8px 22px 0; padding: 8px 14px; border-radius: var(--r-md); background: rgba(255, 77, 94, 0.10); border: 1px solid rgba(255, 77, 94, 0.25); font-size: var(--fs-12); line-height: 1.7; color: var(--text-secondary); flex: none; }
.pf-warn-icon { flex: 0 0 18px; height: 18px; border-radius: 50%; background: var(--danger); color: #fff; font-size: var(--fs-12); font-weight: 800; text-align: center; line-height: 18px; }
.pf-footer { padding: 12px 22px 16px; text-align: center; flex: none; }
.pf-btn { min-width: 160px; font-weight: 700; }
html.light .pf-hero-big { background: radial-gradient(ellipse at 50% -20%, rgba(246, 196, 83, 0.35), transparent 62%), linear-gradient(180deg, #fff6e0 0%, #fdfaf3 100%); }
html.light .pf-hero-small { background: radial-gradient(ellipse at 50% -20%, rgba(61, 123, 255, 0.20), transparent 62%), linear-gradient(180deg, #eaf1ff 0%, #fbfdff 100%); }
html.light .pf-hero-big .pf-level { color: #5d4000; }
html.light .pf-step { background: #fff; border-color: #e5e8f0; }
html.light .pf-note { background: #f7f9fc; border-color: #d8dee8; }
html.light .pf-warn { background: rgba(255, 77, 94, 0.08); }
html.light .prize-flow { background: linear-gradient(180deg, #ffffff 0%, #f5f7fb 100%); }
</style>
