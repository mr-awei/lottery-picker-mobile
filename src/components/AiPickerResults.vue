<template>
  <div v-if="searching" class="searching-tip">
    <el-progress :percentage="searchProgress" :stroke-width="8" style="max-width: 420px" />
    <div class="dim" style="margin-top: 6px; font-size: 12px">{{ isViolent ? `暴力模式：达到预期分也不停止，一直跑到设定次数（${violentAttempts} 次），并统计多次出现的号码` : '正在按统计规则循环生成并评分，达到预期得分即停止…' }}</div>
  </div>

  <div v-else-if="rolling" class="ticket roll-ticket">
    <div class="ticket-head">
      <el-tag size="small" type="warning" style="margin-right: 12px">摇奖中…</el-tag>
      <span v-if="cfg.playMode !== 'direct'" class="ticket-balls">
        <span v-for="n in rollBalls.red" :key="'r' + n" class="ball ball-red rolling">{{ pad2(n) }}</span>
        <span v-for="(b, bi) in rollBalls.blue" :key="'b' + bi" class="ball ball-blue rolling">{{ pad2(b) }}</span>
      </span>
      <span v-else class="ticket-balls">
        <span v-for="(d, di) in rollBalls.digits" :key="'rd' + di" class="ball ball-red rolling">{{ d }}</span>
        <span v-if="rollBalls.tail != null" class="ball ball-blue rolling">{{ rollBalls.tail }}</span>
      </span>
      <span class="ticket-score">正在滚动选号…</span>
    </div>
  </div>

  <div v-else-if="!result" class="empty-tip">选择玩法与预期得分，点击「生成推荐」或「AI 一直选」开始</div>

  <template v-else>
    <div v-if="result.attempts" class="attempt-line">
      <el-tag :type="result.stopped ? 'info' : (result.hitTarget === false ? 'warning' : 'success')" size="small" style="margin-right: 8px">
        {{ result.stopped ? '已手动终止，输出当前最优解' : (result.hitTarget === false ? '未能在上限内达到预期分，取最高分组合' : '已达标') }}
      </el-tag>
      <span class="dim" style="font-size: 12px">共尝试 {{ result.attempts }} 次</span>
      <span v-if="result.violentMode" class="dim" style="font-size: 12px; margin-left: 8px">· 暴力模式：达到预期分后继续跑满设定次数</span>
    </div>

    <div class="ticket">
      <div class="ticket-head">
        <el-tag size="small" type="danger" style="margin-right: 12px">{{ playLabel }}</el-tag>
        <template v-if="cfg.playMode === 'direct'">
          <span v-if="result.ticket.type === 'single'" class="ticket-balls">
            <span v-for="(d, di) in result.ticket.digits" :key="'d' + di" class="ball ball-red">{{ d }}</span>
            <span v-if="result.ticket.tail != null" class="ball ball-blue">{{ result.ticket.tail }}</span>
          </span>
          <span v-else-if="result.ticket.type === 'duplex'" class="ticket-balls">
            <span v-for="(arr, pi) in result.ticket.pos" :key="'pos' + pi" class="multi-mini">
              <span v-for="v in arr" :key="'pv' + v" class="ball ball-red" :class="{ 'ball-locked': isPosSel(pi, v) }" style="width: 22px; height: 22px; font-size: 10px">{{ v }}</span>
            </span>
            <span v-if="result.ticket.tail && result.ticket.tail.length" class="multi-mini">
              <span v-for="v in result.ticket.tail" :key="'tv' + v" class="ball ball-blue" :class="{ 'ball-locked': tailSel.includes(v) }" style="width: 22px; height: 22px; font-size: 10px">{{ v }}</span>
            </span>
          </span>
          <span v-else class="ticket-balls">
            <span v-for="(t, i) in result.ticket.tickets" :key="i" class="multi-mini">
              <span v-for="(d, di) in t.digits" :key="'d' + di" class="ball ball-red" style="width: 22px; height: 22px; font-size: 10px">{{ d }}</span>
              <span v-if="t.tail != null" class="ball ball-blue" style="width: 22px; height: 22px; font-size: 10px">{{ t.tail }}</span>
            </span>
          </span>
        </template>
        <template v-else-if="result.ticket.type === 'single' || result.ticket.type === 'duplex'">
          <span class="ticket-balls">
            <span v-for="n in result.ticket.red" :key="'r' + n" class="ball ball-red" :class="{ 'ball-locked': isLockedRed(n) }">{{ pad2(n) }}</span>
            <span v-for="(b, bi) in result.ticket.blue" :key="'b' + bi" class="ball ball-blue" :class="{ 'ball-locked': isLockedBlue(b) }">{{ pad2(b) }}</span>
          </span>
        </template>
        <template v-else-if="result.ticket.type === 'danTuo'">
          <span class="ticket-balls">
            <span v-for="n in result.ticket.danRed" :key="'d' + n" class="ball ball-amber" :class="{ 'ball-locked': isLockedRed(n) }" :title="'胆码 ' + pad2(n)">{{ pad2(n) }}</span>
            <span v-for="n in result.ticket.tuoRed" :key="'t' + n" class="ball ball-red-soft" :title="'拖码 ' + pad2(n)">{{ pad2(n) }}</span>
            <template v-if="result.ticket.blueDan && result.ticket.blueDan.length">
              <span v-for="(b, bi) in result.ticket.blueDan" :key="'bd' + bi" class="ball ball-blue-soft" :title="'后区胆码 ' + pad2(b)">{{ pad2(b) }}</span>
              <span v-for="(b, bi) in result.ticket.blueTuo" :key="'bt' + bi" class="ball ball-blue" :class="{ 'ball-locked': isLockedBlue(b) }" :title="'后区拖码 ' + pad2(b)">{{ pad2(b) }}</span>
            </template>
            <template v-else>
              <span v-for="(b, bi) in result.ticket.blue" :key="'b' + bi" class="ball ball-blue" :class="{ 'ball-locked': isLockedBlue(b) }">{{ pad2(b) }}</span>
            </template>
          </span>
        </template>
        <template v-else>
          <span class="ticket-balls">
            <span v-for="(t, i) in result.ticket.tickets" :key="i" class="multi-mini">
              <span v-for="n in t.red" :key="'r' + n" class="ball ball-red" :class="{ 'ball-locked': isLockedRed(n) }" style="width: 22px; height: 22px; font-size: 10px">{{ pad2(n) }}</span>
              <span v-for="(b, bi) in t.blue" :key="'b' + bi" class="ball ball-blue" :class="{ 'ball-locked': isLockedBlue(b) }" style="width: 22px; height: 22px; font-size: 10px">{{ pad2(b) }}</span>
            </span>
          </span>
        </template>
        <span class="ticket-score">
          {{ result.count > 1 ? `平均分 ${result.total}（最高 ${result.max} · 最低 ${result.min} · 共 ${result.count} 注）` : `综合得分 ${result.total}` }}
        </span>
        <span v-if="resultCombos > 0" class="amount-pill">共 {{ resultCombos }} 注 · ¥{{ resultAmount }}</span>
      </div>

      <div v-if="result.count === 1 && firstLine" class="ticket-reason">
        <div class="reason-line">
          <template v-if="cfg.playMode !== 'direct'">
            <template v-if="hasMethod('zone')">区间 {{ firstLine.score.zones[0] }}:{{ firstLine.score.zones[1] }}:{{ firstLine.score.zones[2] }}（目标 {{ cfg.zoneTarget.join(':') }}）</template>
            <template v-if="hasMethod('odd')">&nbsp;|&nbsp; 奇偶 {{ firstLine.score.odds }}:{{ cfg.redCount - firstLine.score.odds }}</template>
            <template v-if="hasMethod('sum')">&nbsp;|&nbsp; 和值 {{ firstLine.score.sum }}（区间 {{ cfg.sumMin }}~{{ cfg.sumMax }}）</template>
            <template v-if="hasMethod('cons')">&nbsp;|&nbsp; 连号 {{ firstLine.score.cons }} 组</template>
            <template v-if="hasMethod('hot')">&nbsp;|&nbsp; 热号 {{ firstLine.score.hotIn }} 个 / 冷号 {{ firstLine.score.coldIn }} 个</template>
            <template v-if="hasMethod('size')">&nbsp;|&nbsp; 大小 {{ firstLine.score.bigs }}:{{ cfg.redCount - firstLine.score.bigs }}</template>
            <template v-if="hasMethod('span')">&nbsp;|&nbsp; 跨度 {{ firstLine.score.span }}</template>
            <template v-if="hasMethod('prime')">&nbsp;|&nbsp; 质合 {{ firstLine.score.primes }}:{{ cfg.redCount - firstLine.score.primes }}</template>
            <template v-if="hasMethod('tail')">&nbsp;|&nbsp; 尾组 {{ firstLine.score.tailPairs }} 对</template>
            <template v-if="hasMethod('repeat')">&nbsp;|&nbsp; 重号 {{ firstLine.score.reps }} 个</template>
          </template>
          <template v-else>
            <template v-if="hasMethod('sum')">和值 {{ firstLine.score.sum }}（区间 {{ cfg.sumMin }}~{{ cfg.sumMax }}）</template>
            <template v-if="hasMethod('odd')">&nbsp;|&nbsp; 奇偶 {{ directStats.odds }}:{{ directStats.digits - directStats.odds }}</template>
            <template v-if="hasMethod('size')">&nbsp;|&nbsp; 大小 {{ directStats.bigs }}:{{ directStats.digits - directStats.bigs }}</template>
            <template v-if="hasMethod('form') || hasMethod('route')">&nbsp;|&nbsp; 形态 {{ directStats.form }}</template>
            <template v-if="hasMethod('repeat')">&nbsp;|&nbsp; 重号偏好 {{ Math.round(firstLine.score.repeatScore) }} 分</template>
            <template v-if="hasMethod('span')">&nbsp;|&nbsp; 跨度 {{ directStats.span }}</template>
            <template v-if="hasMethod('route')">&nbsp;|&nbsp; 012路 {{ directStats.routeCounts.join(':') }}</template>
            <template v-if="hasMethod('prime')">&nbsp;|&nbsp; 质数 {{ directStats.primeCount }} 个</template>
            <template v-if="hasMethod('tail')">&nbsp;|&nbsp; 尾位 {{ firstLine.tail != null ? firstLine.tail : '—' }}</template>
            <template v-if="hasMethod('headTail')">&nbsp;|&nbsp; 龙头 {{ firstLine.digits[0] }} · 凤尾 {{ firstLine.digits[firstLine.digits.length - 1] }}</template>
            <template v-if="hasMethod('mirror')">&nbsp;|&nbsp; 镜像对称 {{ Math.round(firstLine.score.mirrorScore) }} 分</template>
            <template v-if="hasMethod('sumTail')">&nbsp;|&nbsp; 和值尾 {{ firstLine.score.sum % 10 }}</template>
          </template>
        </div>
        <div class="score-bars">
          <div v-for="item in scoreItems(firstLine.score)" :key="item.label" class="score-bar">
            <span class="score-label">{{ item.label }}</span>
            <span class="score-track">
              <span class="score-fill" :style="{ width: item.value + '%' }"></span>
            </span>
            <span class="score-num">{{ Math.round(item.value) }}</span>
          </div>
        </div>
      </div>
      <div v-else-if="result.count > 1" class="dim" style="margin-top: 8px; font-size: 12px">
        玩法说明：{{ playDesc }} 评分取全部展开单注的平均分，用于衡量整张票的结构质量。
      </div>
    </div>
    <div v-if="freqTop.length" class="freq-box">
      <div class="freq-title">暴力模式 · 多次出现号码统计（辅助参考，主结果为上方号码组合）</div>
      <div class="freq-chips">
        <span v-for="(f, fi) in freqTop" :key="fi" class="freq-chip">
          <template v-if="f.pos != null"><span class="fc-label">{{ cfg.digits[f.pos].label }}</span><b>{{ f.val }}</b></template>
          <template v-else-if="f.tail"><span class="fc-label">尾</span><b>{{ f.val }}</b></template>
          <template v-else-if="f.red"><b class="fc-red">{{ pad2(f.val) }}</b></template>
          <template v-else><b class="fc-blue">{{ pad2(f.val) }}</b></template>
          <span class="fc-cnt">{{ f.cnt }} 次</span>
        </span>
      </div>
    </div>
    <div class="ai-save-row" style="margin-top: 12px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
      <el-button type="primary" plain :disabled="!result || saving" @click="saveToPicks">保存到自选号</el-button>
      <span v-if="savedTip" class="dim" style="font-size: 12px; color: #67c23a">{{ savedTip }}</span>
    </div>
    <div class="dim" style="margin-top: 10px">
      统计口径：热号=近 10 期出现 ≥3 次；冷号=当前遗漏 ≥10 期；主推不含冷号。单注金额 2 元{{ cfg.zhuijia ? '，大乐透追加每注 +1 元' : '' }}。
    </div>
  </template>
</template>

<script setup>
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { pad2 } from '../utils/game-config'
import { calcPlay, calcDirectPlay, scoreTicketPlay, expandDirectTicket, scoreDigits, computeDirectStats, scoreItemsFor } from '../utils/picker-engine'
import { checkTicketHistory } from '../utils/prize-check'
import { isRecentDuplicate } from '../utils/picks-fingerprint'
import { get, set, STORE_PICKS } from '../utils/db'

const props = defineProps({
  picker: { type: Object, required: true },
  cfg: { type: Object, required: true },
  draws: { type: Array, required: true }
})
const {
  result, rolling, rollBalls, searching, searchProgress, isViolent, violentAttempts,
  playType, multiN, duplexRed, duplexBlue, danN, tuoN, blueN, blueDanN, blueTuoN,
  multiple, append, zxType, hasPosSel, liveCombos,
  isLockedRed, isLockedBlue, isPosSel, tailSel, freq, saving, savedTip
} = props.picker

const firstLine = computed(() => (result.value && result.value.lines && result.value.lines.length ? result.value.lines[0] : null))

/** 结果票的实际投注注数与金额（含追加/倍数），用于结果区金额展示 */
const resultCalc = computed(() => {
  if (!result.value) return { combos: 0, amount: 0 }
  const ticket = { ...result.value.ticket, multiple: multiple.value }
  if (props.cfg.playMode === 'direct') return calcDirectPlay(props.cfg, ticket)
  if (props.cfg.zhuijia) ticket.append = append.value
  return calcPlay(props.cfg, ticket)
})
const resultCombos = computed(() => resultCalc.value.combos)
const resultAmount = computed(() => resultCalc.value.amount)

const playLabel = computed(() => {
  if (props.cfg.playMode === 'direct') {
    let label = zxType.value === 'zuxuan3' ? '组选3' : zxType.value === 'zuxuan6' ? '组选6' : '直选'
    if (hasPosSel.value) label += ' 定位复式'
    else if (playType.value === 'multi') label += ` ×${multiN.value}注`
    if (multiple.value > 1) label += ` ×${multiple.value}倍`
    return label
  }
  const map = { single: '单注', multi: `多注 ×${multiN.value}`, duplex: `复式 ${duplexRed.value}+${duplexBlue.value}`, danTuo: `胆拖 ${danN.value}胆${tuoN.value}拖` }
  let label = map[playType.value] + (append.value && props.cfg.zhuijia ? '（追加）' : '')
  if (playType.value === 'danTuo' && props.cfg.blueCount > 1 && blueDanN.value > 0) label += `·后区${blueDanN.value}胆${blueTuoN.value}拖`
  if (multiple.value > 1) label += ` ×${multiple.value}倍`
  return label
})

const playDesc = computed(() => {
  if (props.cfg.playMode === 'direct') {
    const zxLabel = zxType.value === 'zuxuan3' ? '组选3' : zxType.value === 'zuxuan6' ? '组选6' : '直选'
    let desc = `${zxLabel}：每位从 0-9 中选 1 个数字，顺序一致即中奖`
    if (zxType.value === 'zuxuan3') desc = '组选3：3 位号码中有 2 位相同，不计顺序，含 3 种排列'
    if (zxType.value === 'zuxuan6') desc = '组选6：3 位号码各不相同，不计顺序，含 6 种排列'
    if (hasPosSel.value) desc += `；定位复式每位可多选，自动组合成 ${liveCombos.value} 注`
    else if (playType.value === 'multi') desc += `；共 ${multiN.value} 注，每注独立对奖`
    if (multiple.value > 1) desc += ` 已开启 ${multiple.value} 倍投注，金额与奖金同倍。`
    return desc
  }
  const map = {
    single: '单注',
    multi: `共 ${multiN.value} 注单式号码，每注独立对奖。`,
    duplex: `红球选 ${duplexRed.value} 个、蓝球选 ${duplexBlue.value} 个，自动组合成 ${liveCombos.value} 注。`,
    danTuo: `${danN.value} 个胆码 + ${tuoN.value} 个拖码，自动组合成 ${liveCombos.value} 注。`
  }
  let desc = map[playType.value]
  if (playType.value === 'danTuo' && props.cfg.blueCount === 1 && blueN.value > 1) {
    desc = `${danN.value} 个胆码 + ${tuoN.value} 个拖码 + 蓝球选 ${blueN.value} 个（复式胆拖），自动组合成 ${liveCombos.value} 注。`
  }
  if (playType.value === 'danTuo' && props.cfg.blueCount > 1 && blueDanN.value > 0) {
    desc = `${danN.value} 个前区胆码 + ${tuoN.value} 个前区拖码 + 后区 ${blueDanN.value} 胆 ${blueTuoN.value} 拖，自动组合成 ${liveCombos.value} 注。`
  }
  if (multiple.value > 1) desc += ` 已开启 ${multiple.value} 倍投注，金额与奖金同倍。`
  desc += append.value && props.cfg.zhuijia ? ' 已开启追加投注，一/二等奖奖金 ×1.8。' : ''
  return desc
})

/** 当前彩种推荐策略是否包含某策略（reason-line 按推荐策略动态展示统计） */
function hasMethod(m) {
  const rec = props.cfg.recommendMethods
  return !!(rec && rec.includes(m))
}

function scoreItems(score) {
  return scoreItemsFor(props.cfg, score)
}

/** 直位单注的可读统计（reason-line 展示用） */
const directStats = computed(() => {
  const line = firstLine.value
  if (!line || !line.digits) return { digits: 0, odds: 0, bigs: 0, span: 0, form: '—', routeCounts: [0, 0, 0], primeCount: 0 }
  const d = line.digits
  const odds = d.filter((n) => n % 2 === 1).length
  const bigs = d.filter((n) => n >= 5).length
  const sorted = [...d].sort((a, b) => a - b)
  const uniq = new Set(d).size
  const routeCounts = [0, 0, 0]
  d.forEach((n) => routeCounts[n % 3]++)
  return {
    digits: d.length,
    odds,
    bigs,
    span: sorted.length ? sorted[sorted.length - 1] - sorted[0] : 0,
    form: uniq === 1 ? '豹子' : uniq === 2 ? '组三' : '组六',
    routeCounts,
    primeCount: d.filter((n) => [2, 3, 5, 7].includes(n)).length
  }
})

// 暴力模式高频号码：按出现次数降序取前 12
const freqTop = computed(() => {
  const arr = Object.keys(freq).map((k) => {
    const parts = k.split('_')
    const cnt = freq[k]
    if (parts[0] === 'p') return { pos: Number(parts[1]), val: Number(parts[2]), cnt }
    if (parts[0] === 'tail') return { tail: true, val: Number(parts[1]), cnt }
    if (parts[0] === 'red') return { red: true, val: Number(parts[1]), cnt }
    return { blue: true, val: Number(parts[1]), cnt }
  })
  return arr.sort((a, b) => b.cnt - a.cnt).slice(0, 12)
})

/** 将当前 AI 选号结果保存到自选号（与 MyPicks 共用 IndexedDB picks 数据，含评分与自动对奖） */
async function saveToPicks() {
  if (saving.value) return // 冷却挡双击
  if (!result.value) {
    ElMessage.warning('暂未生成号码，请等待 AI 一直选 / 暴力模式结束')
    return
  }
  saving.value = true
  const ticket = { ...result.value.ticket, multiple: multiple.value }
  if (props.cfg.zhuijia) ticket.append = append.value
  let calc, score, checked
  if (props.cfg.playMode === 'direct') {
    calc = calcDirectPlay(props.cfg, ticket)
    const st = computeDirectStats(props.cfg, props.draws)
    const lines = expandDirectTicket(props.cfg, ticket)
    const scored = lines.map((l) => ({ ...l, score: st ? scoreDigits(props.cfg, l.digits, l.tail, st) : { total: 0 } }))
    const totals = scored.map((x) => x.score.total || 0)
    score = {
      total: scored.length ? Math.round(totals.reduce((a, b) => a + b, 0) / scored.length) : 0,
      max: scored.length ? Math.round(Math.max(...totals)) : 0,
      min: scored.length ? Math.round(Math.min(...totals)) : 0,
      count: scored.length,
      lines: scored
    }
  } else {
    calc = calcPlay(props.cfg, ticket)
    score = scoreTicketPlay(props.cfg, props.draws, ticket)
  }
  checked = props.draws && props.draws.length ? checkTicketHistory(props.cfg, ticket, props.draws) : null
  const latest = props.draws && props.draws.length ? props.draws[0] : null
  const hitIssue = checked && checked.draw ? checked.draw.issue : null
  const pick = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ticket,
    savedAt: Date.now(),
    createStamp: Date.now(),
    combos: calc.combos,
    amount: calc.amount,
    score: { total: score.total, max: score.max, min: score.min, count: score.count, lines: score.lines || [] },
    checkedIssue: hitIssue || (latest ? latest.issue : null),
    status: latest ? 'checked' : 'pending',
    prize: checked
  }
  try {
    const key = 'lottery-picker-mypicks-' + props.cfg.key
    const raw = await get(STORE_PICKS, key)
    const arr = Array.isArray(raw) ? raw : []
    if (isRecentDuplicate(arr, ticket)) {
      ElMessage.info('已保存过相同号码，跳过重复保存')
      return
    }
    arr.unshift(pick)
    await set(STORE_PICKS, key, arr)
    savedTip.value = `已保存 ${calc.combos} 注 · ¥${calc.amount}，可在「自选号」页查看`
    ElMessage.success('已保存到自选号')
    window.dispatchEvent(new CustomEvent('lp-picks-updated', { detail: { key: props.cfg.key }}))
  } catch (e) {
    console.error('保存 AI 选号失败', e)
    ElMessage.error('保存失败，请重试')
  } finally {
    setTimeout(() => { saving.value = false }, 600)
  }
}
</script>

<style scoped>
.searching-tip { margin: 12px 0; }
.attempt-line { margin-bottom: 10px; display: flex; align-items: center; }
.freq-box {
  margin-bottom: 12px;
  border: 1px dashed var(--orange, #f09b2e);
  border-radius: 10px;
  padding: 10px 12px;
  background: rgba(240, 155, 46, 0.06);
}
.freq-title { font-size: 12px; font-weight: 700; color: var(--text-main); margin-bottom: 8px; }
.freq-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.freq-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border-light);
  border-radius: 999px;
  background: var(--card-bg);
  padding: 3px 10px;
  font-size: 13px;
  color: var(--text-main);
}
.freq-chip b { font-weight: 800; }
.freq-chip .fc-red { color: var(--danger, #e64545); }
.freq-chip .fc-blue { color: var(--primary, #3b7cff); }
.freq-chip .fc-label { font-size: 11px; color: var(--text-dim); }
.freq-chip .fc-cnt {
  font-size: 11px;
  color: var(--text-dim);
  background: var(--accent-soft);
  border-radius: 999px;
  padding: 1px 6px;
}
.ticket {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--card-bg);
  padding: 14px 16px;
  margin-bottom: 10px;
}
.ticket-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ticket-balls { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 2px; }
.multi-mini { display: inline-flex; align-items: center; gap: 1px; margin-right: 4px; }
.ticket-score { font-size: 13px; font-weight: 600; color: var(--accent); margin-left: 8px; }
.ticket-reason { margin-top: 10px; border-top: 1px dashed var(--border); padding-top: 10px; }
.reason-line { font-size: 12px; color: var(--text-dim); line-height: 1.8; }
.score-bars { margin-top: 8px; }
.score-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 12px; }
.score-label { width: 40px; color: var(--text-dim); }
.score-track { flex: 1; height: 6px; border-radius: 3px; background: var(--border-light); overflow: hidden; }
.score-fill { display: block; height: 100%; border-radius: 3px; background: linear-gradient(90deg, #ff6f5e, #f6c453); }
.score-num { width: 32px; text-align: right; color: var(--text-dim); }
.amount-pill {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(103, 194, 58, 0.15);
  color: #67c23a;
  font-size: 12px;
  font-weight: 600;
}
/* 结果票中用户自定义必选号高亮（金色描边） */
.ball-locked { outline: 2px solid var(--accent); outline-offset: 1px; box-shadow: 0 0 8px rgba(246, 196, 83, 0.75); }
/* 摇奖动画 */
.roll-ticket { box-shadow: var(--shadow-glow); }
.ball.rolling { animation: ball-shake 0.09s linear infinite, ball-glow 0.45s ease-in-out infinite alternate; }
@keyframes ball-shake {
  0% { transform: translate(0, 0); }
  25% { transform: translate(-1px, 1px); }
  50% { transform: translate(1px, -1px); }
  75% { transform: translate(-1px, -1px); }
  100% { transform: translate(1px, 1px); }
}
@keyframes ball-glow {
  from { box-shadow: 0 0 4px rgba(246, 196, 83, 0.4); }
  to { box-shadow: 0 0 14px rgba(246, 196, 83, 0.95); }
}
@media (max-width: 768px) {
  .freq-chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .freq-box { padding: 8px 10px; }
  .ticket { padding: 12px; }
  .ticket-head { flex-wrap: wrap; gap: 6px; }
  .ticket-balls { flex-wrap: wrap; }
  .score-bar { flex-wrap: wrap; }
}
</style>
