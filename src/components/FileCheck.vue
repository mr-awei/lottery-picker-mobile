<template>
  <div class="fc">
    <!-- 上传区：hero / 拍照选图 / 预览 / 手动输入 / OCR 元数据 -->
    <FileCheckUpload :ocr="ocr" :cfg="cfg" />

    <!-- 我的自选票 -->
    <SavedPicksList :cfg="cfg" :draws="draws" />

    <!-- 核对结果：解析错误 / 结果列表 / 兑奖流程弹窗 -->
    <FileCheckResults :ocr="ocr" :cfg="cfg" :draws="draws" />
  </div>
</template>

<script setup>
import { useOcrCheck } from '../composables/useOcrCheck'
import SavedPicksList from './SavedPicksList.vue'
import FileCheckUpload from './FileCheckUpload.vue'
import FileCheckResults from './FileCheckResults.vue'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

// OCR / 兑奖核心逻辑全部收敛到 useOcrCheck；子组件通过同一 ocr 上下文 + cfg/draws 渲染。
const ocr = useOcrCheck(props)
</script>

<style scoped>
/* ============================================
   FileCheck - 节奏化间距（hero→section 36px，section→section 28px）
   ============================================ */
.fc {
  display: flex;
  flex-direction: column;
  /* 节奏：hero→section 36px，section→section 28px */
  gap: 28px;
}

/* ---------- 移动端 ---------- */
@media (max-width: 768px) {
  .fc { gap: 18px; }
}
</style>

<!-- .fc-section 基础样式为 Upload / Results 两个子组件共用，放这里非 scoped 一次定义 -->
<style>
.fc-section {
  position: relative;
  border-radius: 16px;
  padding: 14px 14px 12px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.02) 100%);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.10));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
  overflow: hidden;
}
.fc-section-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.fc-section-title {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.fc-section-title::before {
  content: '';
  display: inline-block;
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--accent, #f6c453), rgba(246, 196, 83, 0.4));
}
.fc-section-meta {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: auto;
  white-space: nowrap;
}
</style>
