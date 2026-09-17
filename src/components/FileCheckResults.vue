<template>
  <!-- 解析错误 -->
  <div v-if="parseError" class="fc-parse-error">{{ parseError }}</div>

  <!-- ============================================================
       核对结果（条件，强玻璃卡 + 列表）
       ============================================================ -->
  <section v-if="rows.length" class="fc-section fc-result">
    <header class="fc-section-head">
      <span class="fc-section-title">核对结果</span>
      <span class="fc-section-meta">
        <template v-if="lookupState.hit">
          精确核对 · 第 <b>{{ lookupState.hit.issue }}</b> 期（开奖 {{ lookupState.hit.date && lookupState.hit.date.slice(0, 10) }}）<template v-if="lookupState.nonCurrent"> · <b class="noncur">非当期</b></template>
        </template>
        <template v-else-if="lookupState.miss">
          ⚠️ 非当期核对 · {{ lookupState.miss }}
        </template>
        <template v-else>
          共 {{ rows.length }} 注 · 追溯 {{ draws.length }} 期
        </template>
      </span>
    </header>
    <div v-if="lookupState.miss" class="fc-period-warn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.86l-8.5 14.8A2 2 0 003.5 21h17a2 2 0 001.7-2.34l-8.5-14.8a2 2 0 00-3.4 0z"/></svg>
      <div>
        <div class="fc-period-warn-title">非当期核对</div>
        <div class="fc-period-warn-sub">这张票的期号（<b>{{ ocrMeta.issue || '?' }}</b>）开奖数据无法从官方接口获取（官方仅保留近 100 期）。下面仅展示识别到的号码，<b>未对最近 100 期做反查</b>，不能作为开奖依据。如需精确核对近期票，请确认期号无误或手动输入号码。</div>
      </div>
    </div>
    <div v-else-if="lookupState.hit && lookupState.nonCurrent" class="fc-period-warn info">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.86l-8.5 14.8A2 2 0 003.5 21h17a2 2 0 001.7-2.34l-8.5-14.8a2 2 0 00-3.4 0z"/></svg>
      <div>
        <div class="fc-period-warn-title">非当期核对（历史开奖）</div>
        <div class="fc-period-warn-sub">已按第 <b>{{ lookupState.hit.issue }}</b> 期（开奖 {{ lookupState.hit.date && lookupState.hit.date.slice(0, 10) }}）<b>实际开奖数据</b>核对，以下为该期真实中奖结果。注意：这是历史某期（非当期），并非当前最新一期。</div>
      </div>
    </div>
    <div v-if="partialParseWarn" class="fc-period-warn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/></svg>
      <div>
        <div class="fc-period-warn-title">可能漏识别 {{ ocrStats.candidateLines - rows.length }} 注</div>
        <div class="fc-period-warn-sub">OCR 检测到票面有 <b>{{ ocrStats.candidateLines }}</b> 注号码候选，但只解析出 <b>{{ rows.length }}</b> 注。建议点击"查看原始文本"校对，或用"手动输入号码"补充。</div>
      </div>
    </div>
    <div v-if="winCount > 0" class="fc-win-pill">
      <span>中奖 <b>{{ winCount }}</b> 注 · 合计 <b>¥{{ fmtBonus(totalBonus) }}</b></span>
    </div>
    <div v-else class="fc-result-sub">暂未中奖</div>

    <div class="fc-list">
      <div v-for="(row, i) in rows" :key="i" class="fc-row" :class="{ won: row.prize && row.prize.level > 0 }">
        <div class="fc-row-idx">{{ i + 1 }}</div>
        <div class="fc-row-balls">
          <template v-if="cfg.playMode === 'direct'">
            <span v-for="(d, di) in row.digits" :key="'d' + di" class="ball ball-red">{{ d }}</span>
            <span v-if="row.tail != null" class="ball ball-blue">{{ row.tail }}</span>
          </template>
          <template v-else>
            <span v-for="n in row.red" :key="'r' + n" class="ball ball-red">{{ pad2(n) }}</span>
            <span v-for="(b, bi) in row.blue" :key="'b' + bi" class="ball ball-blue">{{ pad2(b) }}</span>
          </template>
        </div>
        <div class="fc-row-result">
          <template v-if="row.prize">
            <span v-if="row.prize.level > 0" class="prize-badge" :class="'lv' + row.prize.level">
              {{ row.prize.name }} · ¥{{ fmtBonus(row.prize.bonus) }}
            </span>
            <span v-else class="fc-row-sub">未中奖</span>
            <span v-if="row.prize.level > 0" class="fc-row-sub">
              <template v-if="cfg.playMode === 'direct'">
                命中 {{ row.prize.digitsMatch }} 位<template v-if="cfg.tail"> · 尾位{{ row.prize.tailMatch ? '中' : '未中' }}</template>
              </template>
              <template v-else>
                红 {{ row.prize.redMatch }} / 蓝 {{ row.prize.blueMatch }}
              </template>
              <template v-if="row.prize.draw"> · 第 {{ row.prize.draw.issue }} 期</template>
            </span>
            <el-button v-if="row.prize && row.prize.level > 0" size="small" text type="primary" @click="showFlow(row)">兑奖流程</el-button>
          </template>
          <span v-else class="fc-row-sub">无效行</span>
        </div>
      </div>
    </div>
  </section>

  <!-- 兑奖流程弹窗（沿用全局样式） -->
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
</template>

<script setup>
import { pad2, fmtDate } from '../utils/game-config'

const props = defineProps({
  ocr: { type: Object, required: true },
  cfg: { type: Object, required: true },
  draws: { type: Array, required: true }
})
const {
  parseError, rows, lookupState, partialParseWarn, ocrMeta, ocrStats,
  winCount, totalBonus, fmtBonus, showFlow, flowVisible, flowData
} = props.ocr
</script>

<style scoped>
/* ---------- 错误 + 结果（.fc-section 基础样式见主组件非 scoped 块） ---------- */
.fc-parse-error {
  color: #ff8a80;
  font-size: 13px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 138, 128, 0.10);
  border: 1px solid rgba(255, 138, 128, 0.30);
}

.fc-period-warn {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 152, 0, 0.10);
  border: 1px solid rgba(255, 152, 0, 0.36);
  margin-bottom: 10px;
}
.fc-period-warn svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: #ffb74d;
  margin-top: 1px;
}
.fc-period-warn-title {
  font-size: 13px;
  font-weight: 700;
  color: #ffb74d;
  margin-bottom: 3px;
}
.fc-period-warn-sub {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}
.fc-period-warn-sub b { color: #ffb74d; }
/* v1.9.7：非当期（历史开奖）信息框 —— 蓝色，区别于"找不到该期"的琥珀色警告 */
.fc-period-warn.info {
  background: rgba(61, 123, 255, 0.10);
  border-color: rgba(61, 123, 255, 0.42);
}
.fc-period-warn.info svg { color: #6aa0ff; }
.fc-period-warn.info .fc-period-warn-title { color: #6aa0ff; }
.fc-period-warn.info .fc-period-warn-sub b { color: #8fc0ff; }
.noncur {
  display: inline-block;
  margin-left: 4px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #ff8a5b, #e0533f);
  vertical-align: middle;
}

.fc-win-pill {
  display: inline-block;
  margin-bottom: 10px;
  padding: 5px 14px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(246, 196, 83, 0.20), rgba(246, 196, 83, 0.08));
  border: 1px solid rgba(246, 196, 83, 0.35);
  color: var(--accent, #f6c453);
  font-size: 13px;
  font-weight: 700;
}
.fc-result-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.fc-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.fc-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  flex-wrap: wrap;
}
.fc-row.won {
  border-color: rgba(246, 196, 83, 0.55);
  background: linear-gradient(90deg, rgba(246, 196, 83, 0.10), rgba(255, 255, 255, 0.04) 60%);
}
.fc-row-idx {
  width: 24px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.fc-row-balls {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
.fc-row-result {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}
.fc-row-sub {
  font-size: 11px;
  color: var(--text-muted);
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
.lv7, .lv8, .lv9 { background: rgba(33, 150, 243, 0.20); color: #64b5f6; }

/* ---------- 移动端 ---------- */
@media (max-width: 768px) {
  .fc-list { gap: 6px; }
  .fc-row { padding: 8px 10px; gap: 8px; }
  .fc-period-warn-sub { font-size: 11px; }
}
</style>
