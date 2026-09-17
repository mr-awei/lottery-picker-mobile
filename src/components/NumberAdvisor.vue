<template>
  <!-- 智能推荐：杀号 / 定胆（仅乐透型彩种；直位型隐藏） -->
  <div v-if="cfg.playMode !== 'direct'" class="advisor">
    <div class="advisor-head" @click="open = !open">
      <span class="advisor-title">智能推荐 · 杀号 / 定胆</span>
      <span class="advisor-toggle">{{ open ? '收起 ▲' : '展开 ▼' }}</span>
    </div>

    <div v-if="open" class="advisor-body">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="理性购彩提示：彩票为独立随机事件，本工具仅供参考，不构成投注建议。"
        style="margin-bottom: 10px"
      />

      <template v-if="!hasDraws">
        <div class="advisor-empty">暂无历史开奖数据，无法给出统计推荐。请先在数据页刷新开奖记录。</div>
      </template>
      <template v-else>
        <div class="advisor-cols">
          <div class="advisor-col">
            <div class="advisor-col-title kill">
              杀号（从号码池排除）
              <el-button v-if="excludedRed.length || excludedBlue.length" size="small" text @click="clearExcluded">清除全部排除</el-button>
            </div>
            <div v-if="!result.redKills.length && !result.blueKills.length" class="advisor-empty">当前无高置信杀号。</div>
            <div
              v-for="k in result.redKills"
              :key="'rk' + k.num"
              class="advisor-item"
              :class="{ off: isExcludedRed(k.num) }"
              @click="toggleExcludeRed(k.num)"
            >
              <span class="ball ball-red">{{ pad2(k.num) }}</span>
              <span class="advisor-reason">{{ k.reason }}</span>
              <span class="advisor-act">{{ isExcludedRed(k.num) ? '已排除 ✓' : '排除' }}</span>
            </div>
            <div
              v-for="k in result.blueKills"
              :key="'bk' + k.num"
              class="advisor-item"
              :class="{ off: isExcludedBlue(k.num) }"
              @click="toggleExcludeBlue(k.num)"
            >
              <span class="ball ball-blue">{{ pad2(k.num) }}</span>
              <span class="advisor-reason">蓝球 · {{ k.reason }}</span>
              <span class="advisor-act">{{ isExcludedBlue(k.num) ? '已排除 ✓' : '排除' }}</span>
            </div>
          </div>

          <div class="advisor-col">
            <div class="advisor-col-title dan">定胆（锁定为必选号）</div>
            <div v-if="!result.redDans.length" class="advisor-empty">当前无高置信胆码。</div>
            <div
              v-for="d in result.redDans"
              :key="'dn' + d.num"
              class="advisor-item"
              :class="{ on: isLockedRed(d.num) }"
              @click="applyDanRed(d.num)"
            >
              <span class="ball ball-red">{{ pad2(d.num) }}</span>
              <span class="advisor-reason">{{ d.reason }}</span>
              <span class="advisor-act">{{ isLockedRed(d.num) ? '已锁定 ✓' : '定胆' }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { pad2 } from '../utils/game-config'
import { recommendKillAndDan } from '../utils/advisor'

const props = defineProps({
  picker: { type: Object, required: true },
  cfg: { type: Object, required: true },
  draws: { type: Array, required: true }
})

const open = ref(false)
const hasDraws = computed(() => !!(props.draws && props.draws.length))
const result = computed(() => recommendKillAndDan(props.cfg, props.draws || []))

const {
  isExcludedRed, isExcludedBlue, toggleExcludeRed, toggleExcludeBlue, clearExcluded,
  isLockedRed, applyDanRed, excludedRed, excludedBlue
} = props.picker
</script>

<style scoped>
.advisor {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--card-inset);
  margin-bottom: 14px;
  overflow: hidden;
}
.advisor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
}
.advisor-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}
.advisor-toggle {
  font-size: 12px;
  color: var(--accent, #f6c453);
}
.advisor-body {
  padding: 0 14px 12px;
}
.advisor-cols {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.advisor-col {
  flex: 1 1 260px;
  min-width: 0;
}
.advisor-col-title {
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.advisor-col-title.kill { color: var(--text-dim); }
.advisor-col-title.dan { color: var(--accent, #f6c453); }
.advisor-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-light);
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.15s;
}
.advisor-item:hover { border-color: var(--accent); }
.advisor-item.off { opacity: 0.5; }
.advisor-item.on {
  border-color: var(--accent);
  background: rgba(246, 196, 83, 0.1);
}
.advisor-reason {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}
.advisor-act {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent, #f6c453);
}
.advisor-empty {
  font-size: 12px;
  color: var(--text-muted);
  padding: 8px 0;
}
.ball {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.ball-red {
  background: radial-gradient(circle at 32% 28%, #ff9a8a, #d92b3f 100%);
}
.ball-blue {
  background: radial-gradient(circle at 32% 28%, #8fc0ff, #1d5ad4 100%);
}
@media (max-width: 768px) {
  .advisor-cols { gap: 10px; }
}
</style>
