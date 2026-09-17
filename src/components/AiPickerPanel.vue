<template>
  <!-- 定位选号（直位玩法）/ 自定义锁定号码（组合玩法） -->
  <div v-if="cfg.playMode === 'direct'" class="ctrl-row lock-row">
    <span class="ctrl-label">定位选号（每位可多选 = 定位复式，不选由 AI 随机）</span>
    <div class="lock-pools">
      <div v-for="(p, pi) in cfg.digits" :key="'dp' + pi" class="lock-pool">
        <span class="lock-pool-label">{{ p.label }}</span>
        <span
          v-for="n in 10"
          :key="'dpv' + n"
          class="pick-ball pick-ball-red"
          :class="{ locked: posSel[pi] && posSel[pi].includes(n - 1) }"
          @click="togglePos(pi, n - 1)"
        >{{ n - 1 }}</span>
      </div>
      <div v-if="cfg.tail" class="lock-pool">
        <span class="lock-pool-label">尾位</span>
        <span
          v-for="n in 10"
          :key="'dtv' + n"
          class="pick-ball pick-ball-blue"
          :class="{ locked: tailSel.includes(n - 1) }"
          @click="toggleTail(n - 1)"
        >{{ n - 1 }}</span>
      </div>
    </div>
    <el-button v-if="hasPosSel" size="small" text @click="clearPos">清空</el-button>
  </div>
  <div v-else class="ctrl-row">
    <span class="ctrl-label">自定义号码</span>
    <div class="lock-pools">
      <div class="lock-pool">
        <span class="lock-pool-label">{{ cfg.redLabel }}（{{ lockLimit.red - lockedRed.length }} 个由 AI 补）</span>
        <span
          v-for="n in cfg.redMax"
          :key="'lr' + n"
          class="pick-ball pick-ball-red"
          :class="{ locked: lockedRed.includes(n) }"
          @click="toggleLockRed(n)"
        >{{ pad2(n) }}</span>
      </div>
      <div class="lock-pool">
        <span class="lock-pool-label">{{ cfg.blueLabel }}（{{ lockLimit.blue - lockedBlue.length }} 个由 AI 补）</span>
        <span
          v-for="n in cfg.blueMax"
          :key="'lb' + n"
          class="pick-ball pick-ball-blue"
          :class="{ locked: lockedBlue.includes(n) }"
          @click="toggleLockBlue(n)"
        >{{ pad2(n) }}</span>
      </div>
    </div>
    <el-button v-if="lockedRed.length || lockedBlue.length" size="small" text @click="clearLocked">清空</el-button>
  </div>
  <div v-if="lockedRed.length || lockedBlue.length" class="ctrl-row">
    <span class="dim" style="font-size: 12px">{{ lockHint }}。结果中带金色描边的号码即您自定义的必选号。</span>
  </div>
</template>

<script setup>
import { pad2 } from '../utils/game-config'

const props = defineProps({
  picker: { type: Object, required: true },
  cfg: { type: Object, required: true }
})
const {
  posSel, togglePos, tailSel, toggleTail, hasPosSel, clearPos,
  lockedRed, lockedBlue, toggleLockRed, toggleLockBlue, clearLocked,
  lockLimit, lockHint
} = props.picker
</script>

<style scoped>
/* 自定义号码选择区 */
.lock-row {
  align-items: flex-start;
  border-top: 1px dashed var(--border);
  padding-top: 10px;
}
.lock-pools {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  align-items: flex-start;
}
.lock-pool {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.lock-pool-label {
  font-size: 12px;
  color: var(--text-muted);
  margin-right: 2px;
  white-space: nowrap;
}
.pick-ball {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
  line-height: 1;
}
.pick-ball-red {
  background: rgba(255, 77, 79, 0.08);
  color: #c0392b;
  border: 1px solid rgba(255, 77, 79, 0.35);
}
.pick-ball-blue {
  background: rgba(64, 158, 255, 0.08);
  color: #2b6cb0;
  border: 1px solid rgba(64, 158, 255, 0.35);
}
.pick-ball:hover {
  transform: scale(1.12);
  border-color: var(--accent);
}
.pick-ball.locked {
  background: linear-gradient(135deg, #f6c453, #e8a838);
  color: #fff;
  border-color: #d4912a;
  box-shadow: 0 0 8px rgba(246, 196, 83, 0.6);
}
html.dark .pick-ball-red {
  color: #ff8a80;
  border-color: rgba(255, 138, 128, 0.4);
}
html.dark .pick-ball-blue {
  color: #82b1ff;
  border-color: rgba(130, 177, 255, 0.4);
}

.ctrl-label {
  font-size: 13px;
  color: var(--text-muted);
  white-space: nowrap;
  min-width: 48px;
  flex-shrink: 0;
}
.ctrl-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
@media (max-width: 768px) {
  .ctrl-row { flex-wrap: wrap; gap: 8px; row-gap: 10px; margin-bottom: 12px; align-items: flex-start; }
  .pick-ball { width: 30px; height: 30px; font-size: 13px; }
}
</style>
