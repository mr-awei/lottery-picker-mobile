<template>
  <div>
    <div class="card-title">往期号码（近 {{ draws.length }} 期）</div>
    <el-input
      v-model="keyword"
      placeholder="输入期号搜索，如 2026096"
      clearable
      class="history-search"
    />

    <!-- 移动端 Grid 表格：完全脱离 el-table，避免 cell 嵌套截切 -->
    <div class="history-grid">
      <div class="hrow hrow-head">
        <div class="hcell hcell-issue">期号</div>
        <div class="hcell hcell-balls">红球</div>
        <div class="hcell hcell-blue">蓝球</div>
      </div>
      <div v-for="row in filtered" :key="row.issue" class="hrow">
        <div class="hcell hcell-issue"><b>{{ row.issue }}</b></div>
        <div class="hcell hcell-balls">
          <span v-for="n in row.red" :key="'r' + n" class="ball ball-sm ball-red">{{ pad2(n) }}</span>
        </div>
        <div class="hcell hcell-blue">
          <span v-for="(b, i) in blueList(row)" :key="'b' + i" class="ball ball-sm ball-blue">{{ pad2(b) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { fmtDate, fmtMoney, pad2 } from '../utils/game-config'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const keyword = ref('')

const filtered = computed(() => {
  const kw = keyword.value.trim()
  if (!kw) return props.draws
  return props.draws.filter((d) => String(d.issue).includes(kw))
})

function blueList(row) {
  const list = [row.blue]
  if (row.blue2 != null) list.push(row.blue2)
  return list.filter((b) => b != null)
}
</script>

<style scoped>
.history-search {
  width: 100%;
  max-width: 100%;
  margin-bottom: 14px;
}

:deep(.ball) {
  transition: transform var(--dur-fast) var(--ease-out);
}

/* ============================================================
   移动端 Grid 表格
   - 完全脱离 el-table 体系，避坑所有 cell 嵌套截切
   - 列宽按"容得下 6 个 20px 红球 + 1 个 22px 蓝球"精算
   ============================================================ */
.history-grid {
  width: 100%;
  overflow-x: auto;
  border-radius: var(--r-md);
  border: 1px solid var(--border-subtle);
  background: transparent;
  scrollbar-width: thin;
}
.history-grid::-webkit-scrollbar { height: 6px; }
.history-grid::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.14); border-radius: 4px; }

.hrow {
  display: grid;
  grid-template-columns: 64px minmax(140px, auto) minmax(28px, auto);
  column-gap: 10px;
  align-items: center;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border-subtle);
  width: max-content;
  min-width: 100%;
}
.hrow:last-child { border-bottom: none; }
.hrow-head {
  font-size: var(--fs-12);
  font-weight: 700;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.04);
  position: sticky;
  top: 0;
  z-index: 3;
}

.hcell {
  display: flex;
  align-items: center;
  overflow: visible;
  white-space: nowrap;
}
.hcell-issue {
  justify-content: flex-start;
  font-size: var(--fs-13);
}
.hcell-balls,
.hcell-blue {
  display: flex !important;
  flex-wrap: nowrap !important;
  flex-direction: row !important;
  gap: 3px !important;
  justify-content: flex-start !important;
  align-items: center !important;
  position: relative;
  z-index: 2;
}

/* 强制球 20px（蓝球 22px） */
:deep(.hcell-balls .ball-sm),
:deep(.hcell-blue .ball-sm) {
  width: 20px !important;
  height: 20px !important;
  font-size: 10px !important;
  flex-shrink: 0 !important;
}
:deep(.hcell-blue .ball-sm) {
  width: 22px !important;
  height: 22px !important;
  font-size: 11px !important;
}
</style>
