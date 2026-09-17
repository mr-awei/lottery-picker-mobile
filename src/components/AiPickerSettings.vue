<template>
  <div class="ai-controls">
    <div class="ctrl-row">
      <span class="ctrl-label">玩法</span>
      <el-radio-group v-model="playType" size="small">
        <el-radio-button value="single">单注</el-radio-button>
        <el-radio-button value="multi">多注</el-radio-button>
        <el-radio-button v-if="cfg.playMode !== 'direct'" value="duplex">复式</el-radio-button>
        <el-radio-button v-if="cfg.playMode !== 'direct'" value="danTuo">胆拖</el-radio-button>
      </el-radio-group>
      <template v-if="cfg.playMode === 'direct' && Array.isArray(cfg.directTypes) && cfg.directTypes.includes('zuxuan3')">
        <span class="ctrl-label" style="margin-left: 14px">投注方式</span>
        <el-radio-group v-model="zxType" size="small">
          <el-radio-button value="direct">直选</el-radio-button>
          <el-radio-button value="zuxuan3">组选3</el-radio-button>
          <el-radio-button value="zuxuan6">组选6</el-radio-button>
        </el-radio-group>
      </template>
    </div>

    <div class="ctrl-row">
      <template v-if="playType === 'multi'">
        <span class="ctrl-label">注数</span>
        <el-input-number v-model="multiN" :min="1" :max="20" size="small" style="width: 110px" />
      </template>
      <template v-else-if="cfg.playMode !== 'direct' && playType === 'duplex'">
        <span class="ctrl-label">红球数</span>
        <el-input-number v-model="duplexRed" :min="cfg.redCount + 1" :max="cfg.redMax" size="small" style="width: 110px" />
        <span class="ctrl-label" style="margin-left: 14px">蓝球数</span>
        <el-input-number v-model="duplexBlue" :min="cfg.blueCount" :max="cfg.blueMax" size="small" style="width: 110px" />
      </template>
      <template v-else-if="cfg.playMode !== 'direct' && playType === 'danTuo'">
        <span class="ctrl-label">胆码数</span>
        <el-input-number v-model="danN" :min="1" :max="cfg.redCount - 1" size="small" style="width: 110px" />
        <span class="ctrl-label" style="margin-left: 14px">拖码数</span>
        <el-input-number v-model="tuoN" :min="cfg.redCount - danN + 1" :max="cfg.redMax - danN" size="small" style="width: 110px" />
        <template v-if="cfg.blueCount === 1">
          <span class="ctrl-label" style="margin-left: 14px">蓝球个数</span>
          <el-input-number v-model="blueN" :min="cfg.blueCount" :max="cfg.blueMax" size="small" style="width: 110px" />
        </template>
      </template>
      <span v-if="liveAmount > 0" class="amount-pill">共 {{ liveCombos }} 注 · ¥{{ liveAmount }}</span>
    </div>

    <div class="ctrl-row">
      <span class="ctrl-label">生成策略</span>
      <!-- 修复（1.8.5）：策略区分"推荐"和"高级"——推荐组（cfg.recommendMethods 6 种）始终可见，
      剩余 15 种"高级策略"折叠在"更多策略"按钮里。 -->
      <el-button size="small" text class="methods-toggle-btn" @click="toggleMethodsCollapse">
        <span v-if="methodsCollapsed">更多策略（{{ advancedMethodList.length }}） ▼</span>
        <span v-else>收起高级 ▲</span>
      </el-button>
      <el-button size="small" text @click="methods = methodList.map((x) => x.key)">全选</el-button>
      <el-button size="small" text @click="methods = []">不用策略</el-button>
      <el-button size="small" text @click="methods = [...recommendedMethods()]">恢复默认</el-button>
    </div>
    <div class="ctrl-row methods-grid">
      <el-checkbox-group v-model="methods" size="small">
        <el-checkbox-button v-for="m in recommendedMethodList" :key="m.key" :value="m.key">{{ m.label }}</el-checkbox-button>
      </el-checkbox-group>
      <span v-if="!methods.length" class="dim" style="font-size: 12px">当前为纯随机选号，不套用任何统计规则</span>
      <span v-else-if="methods.length < methodList.length" class="dim" style="font-size: 12px">已选 {{ methods.length }}/{{ methodList.length }} 种策略，按权重综合择优</span>
    </div>
    <div v-if="!methodsCollapsed" class="ctrl-row methods-grid">
      <div class="dim" style="font-size: 11px; margin-bottom: 4px; opacity: 0.7">— 高级策略 —</div>
      <el-checkbox-group v-model="methods" size="small">
        <el-checkbox-button v-for="m in advancedMethodList" :key="m.key" :value="m.key">{{ m.label }}</el-checkbox-button>
      </el-checkbox-group>
    </div>

    <div class="ctrl-row">
      <span class="ctrl-label">预期得分（满分 100）</span>
      <el-input-number v-model="targetScore" :min="1" :max="100" size="small" style="width: 110px" />
      <span class="dim" style="font-size: 12px">AI 将一直选号，直到平均得分达到该分值</span>
    </div>

    <div class="ctrl-row">
      <span class="ctrl-label">暴力模式次数</span>
      <el-input-number v-model="violentAttempts" :min="1000" :max="1000000" :step="1000" size="small" style="width: 150px" />
      <span class="dim" style="font-size: 12px">暴力模式在 AI 选号界面直接设定，跑满该次数取最高分（与设置页同步）</span>
    </div>

    <div v-if="cfg.zhuijia" class="ctrl-row">
      <el-checkbox v-model="append">大乐透追加投注（每注 +1 元，一/二等奖奖金 ×1.8）</el-checkbox>
    </div>

    <div class="ctrl-row">
      <span class="ctrl-label">倍数投注（1~99 倍）</span>
      <el-input-number v-model="multiple" :min="1" :max="99" size="small" style="width: 110px" />
      <span class="dim" style="font-size: 12px">官方玩法：多倍投注，金额与中奖奖金同倍</span>
    </div>

    <div v-if="cfg.blueCount > 1 && playType === 'danTuo'" class="ctrl-row">
      <span class="ctrl-label">后区胆拖</span>
      <span class="dim" style="font-size: 12px; margin-right: 6px">后区胆码</span>
      <el-input-number v-model="blueDanN" :min="0" :max="cfg.blueCount - 1" size="small" style="width: 90px" />
      <span class="dim" style="font-size: 12px; margin: 0 6px 0 10px">后区拖码</span>
      <el-input-number v-model="blueTuoN" :min="cfg.blueCount - blueDanN" :max="cfg.blueMax - blueDanN" size="small" style="width: 90px" />
      <span class="dim" style="font-size: 12px">大乐透官方玩法：后区胆拖（0 胆 = 普通选号）</span>
    </div>

    <div class="ctrl-row accel-row">
      <span class="ctrl-label">加速引擎</span>
      <span class="accel-badge" :class="accelClass">{{ accelBackend }}</span>
      <span class="dim" style="font-size: 12px">{{ accelHint }}</span>
    </div>

    <div class="ctrl-row actions">
      <el-button type="danger" @click="generate">生成推荐</el-button>
      <el-button type="primary" :disabled="searching && !isViolent && stopping" @click="searching && !isViolent ? stopSearching() : pickUntilTarget(false)">
        {{ searching && !isViolent ? (stopping ? '正在终止…' : `AI 一直选… 已尝试 ${searchingCount} 次 · 点击终止`) : 'AI 一直选 (达预期分)' }}
      </el-button>
      <el-button type="warning" :disabled="searching && isViolent && stopping" @click="searching && isViolent ? stopSearching() : pickUntilTarget(true)">
        {{ searching && isViolent ? (stopping ? '正在终止…' : `暴力模式… 已尝试 ${searchingCount} 次 · 点击终止`) : '暴力模式' }}
      </el-button>
      <el-button class="ghost-btn" @click="generate">换一组</el-button>
      <span v-if="generatedAt" class="dim">生成于 {{ generatedAt }}</span>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  picker: { type: Object, required: true },
  cfg: { type: Object, required: true }
})
const {
  playType, zxType, multiN, duplexRed, duplexBlue, danN, tuoN, blueN, blueDanN, blueTuoN,
  multiple, targetScore, violentAttempts, append, methods, methodsCollapsed,
  recommendedMethodList, advancedMethodList, methodList, recommendedMethods, toggleMethodsCollapse,
  liveAmount, liveCombos, accelBackend, accelClass, accelHint,
  generate, searching, isViolent, stopping, stopSearching, pickUntilTarget,
  searchingCount, generatedAt
} = props.picker
</script>

<style scoped>
/* 玩法 radio 按钮：浅色下未选中态清晰可点，避免像禁用 */
:deep(.el-radio-button__inner) {
  box-shadow: none;
}
:deep(.el-radio-button:not(.is-active) .el-radio-button__inner) {
  background: #ffffff;
  border-color: var(--accent);
  color: #2a3350;
}
:deep(.el-radio-button:not(.is-active):hover .el-radio-button__inner) {
  background: #fff7e0;
  border-color: var(--accent-strong);
  color: #a87b00;
}
html.dark :deep(.el-radio-button:not(.is-active) .el-radio-button__inner) {
  background: var(--surface-2);
  border-color: var(--border-strong);
  color: var(--text-primary);
}
html.dark :deep(.el-radio-button:not(.is-active):hover .el-radio-button__inner) {
  background: var(--surface-1);
  border-color: var(--accent);
  color: var(--accent);
}

/* 全选 / 不用策略 文字按钮：浅色下加深文字，避免像禁用 */
.ctrl-row :deep(.el-button.is-text) {
  color: #2a3350;
}
.ctrl-row :deep(.el-button.is-text:hover) {
  background: #fffdf4;
  color: var(--accent);
}
html.dark .ctrl-row :deep(.el-button.is-text) {
  color: var(--text-primary);
}
html.dark .ctrl-row :deep(.el-button.is-text:hover) {
  background: var(--surface-1);
  color: var(--accent);
}

/* 次要操作按钮：浅色下金色边框+深色文字，明确可点，避免像禁用 */
.ghost-btn {
  --el-button-bg-color: #ffffff;
  --el-button-border-color: var(--accent);
  --el-button-text-color: #2a3350;
  --el-button-hover-bg-color: #fff7e0;
  --el-button-hover-border-color: var(--accent-strong);
  --el-button-hover-text-color: #a87b00;
  --el-button-active-bg-color: #f7ecd0;
  --el-button-active-border-color: var(--accent-strong);
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(30, 40, 80, 0.08);
}
html.dark .ghost-btn {
  --el-button-bg-color: var(--surface-2);
  --el-button-border-color: var(--accent);
  --el-button-text-color: var(--text-primary);
  --el-button-hover-bg-color: var(--surface-1);
  --el-button-hover-border-color: var(--accent-strong);
  --el-button-hover-text-color: var(--accent-strong);
  box-shadow: none;
}

.ai-controls {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--card-inset);
  padding: 14px 16px;
  margin-bottom: 14px;
}

/* 加速引擎徽标：如实显示当前后端，不做虚假宣传 */
.accel-row {
  border-top: 1px dashed var(--border);
  padding-top: 10px;
  align-items: center;
}
.accel-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.6;
}
.accel-badge::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 6px currentColor;
}
.badge-gpu {
  color: #7b3ff2;
  background: rgba(123, 63, 242, 0.12);
}
.badge-worker {
  color: #0a8f6b;
  background: rgba(10, 143, 107, 0.12);
}
.badge-off {
  color: var(--text-muted);
  background: rgba(120, 130, 150, 0.12);
}

.ctrl-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.ctrl-row:last-child {
  margin-bottom: 0;
}

/* 修复（1.8.4）：策略区默认折叠——快速按钮（折叠时仍可见）+ 折叠态文字加粗配色便于发现 */
.methods-toggle-btn {
  font-weight: 700;
  color: var(--accent, #f6c453);
}
.methods-toggle-btn:hover { color: var(--accent-strong, #ffd97a); }
.methods-grid .el-checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 2px;
  width: 100%;
}
.methods-grid .el-checkbox-button {
  margin: 0 !important;
}
.methods-grid .el-checkbox-button__inner {
  padding: 6px 10px !important;
  font-size: 12px !important;
}

/* ctrl-row 内 el-radio-group / el-checkbox-group: chip 之间显式加间距,避免被 Element 默认 -1px 边距折叠让 chip 紧贴 */
.ctrl-row :deep(.el-radio-group),
.ctrl-row :deep(.el-checkbox-group) {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ctrl-row :deep(.el-radio-button),
.ctrl-row :deep(.el-checkbox-button) {
  margin: 0 !important;
}

/* 标签最小宽度,避免"玩法"/"红球"/"蓝球"/"生成策略"等中文短标签被挤压 */
.ctrl-label {
  font-size: 13px;
  color: var(--text-muted);
  white-space: nowrap;
  min-width: 48px;
  flex-shrink: 0;
}

.ctrl-row.actions {
  border-top: 1px dashed var(--border);
  padding-top: 12px;
  align-items: stretch;
}
.ctrl-row.actions :deep(.el-button) {
  min-width: 0;
  flex: 0 1 auto;
}

.amount-pill {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(103, 194, 58, 0.15);
  color: #67c23a;
  font-size: 12px;
  font-weight: 600;
}

@media (max-width: 768px) {
  .ai-controls { padding: 12px; }
  .ctrl-row { flex-wrap: wrap; gap: 8px; row-gap: 10px; margin-bottom: 12px; align-items: flex-start; }
  .ctrl-label { font-size: 12px; min-width: 42px; }
  .ctrl-row .dim { width: 100%; line-height: 1.6; }
  /* 操作按钮区: 加大按钮与说明文字间距, 保证触控尺寸, 并让换行后排布整齐 */
  .ctrl-row.actions {
    gap: 8px;
    row-gap: 10px;
    padding-top: 14px;
    margin-bottom: 0;
    align-items: stretch;
  }
  .ctrl-row.actions :deep(.el-button) {
    min-height: 38px;
    margin-left: 0;
    flex: 0 1 auto;
  }
  .ctrl-row.actions .dim {
    width: 100%;
    margin-top: 6px;
  }
}
</style>
