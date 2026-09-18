<template>
  <!-- ============================================================
       Hero 主区（弱玻璃，撑场）——  拍 / 选 / 手动 三入口合一
       ============================================================ -->
  <section class="fc-hero">
    <div class="fc-hero-head">
      <span class="fc-hero-eyebrow">查中奖</span>
      <h2 class="fc-hero-title">拍照、选图 或 手动输入<br />核对最近开奖</h2>
      <p class="fc-hero-sub">在线 OCR 识别号码 · 公开免费 API · 中文准确率高</p>
    </div>

    <div class="fc-actions">
      <button class="fc-action fc-action-primary" :disabled="cameraBusy" @click="actionSheet = true">
        <span v-if="cameraBusy" class="fc-action-inner">
          <svg class="fc-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="32 12" stroke-linecap="round" /></svg>
          <span>处理中…</span>
        </span>
        <span v-else class="fc-action-inner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="fc-action-ic"><path d="M14.5 4l1.5 2h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l1.5-2z"/><circle cx="12" cy="13" r="4"/></svg>
          <span>拍照 / 选图</span>
        </span>
      </button>
      <button class="fc-action fc-action-link" @click="openPasteDialog">
        <span class="fc-action-inner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="fc-action-ic"><rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>
          <span>手动输入号码</span>
        </span>
      </button>
    </div>
  </section>

  <!-- ============================================================
       图片预览 + OCR 状态（条件）
       ============================================================ -->
  <section v-if="imagePreview" class="fc-section fc-section-preview">
    <header class="fc-section-head">
      <span class="fc-section-title">识别预览</span>
      <div class="fc-section-tools">
        <el-button size="small" @click="clearImage">移除图片</el-button>
        <el-button size="small" type="primary" :disabled="ocrRunning" @click="retryOcr">重新识别</el-button>
      </div>
    </header>
    <div class="fc-preview-row">
      <img :src="imagePreview" class="fc-preview-img" />
      <div class="fc-preview-meta">
        <div v-if="imageName" class="fc-preview-name">{{ imageName }}</div>
        <div v-if="ocrRunning" class="fc-preview-status">
          <svg class="fc-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="32 12" stroke-linecap="round" /></svg>
          <span>{{ ocrStatusText }}</span>
        </div>
        <div v-else-if="ocrError" class="fc-preview-status err">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
          <span>{{ ocrError }}</span>
        </div>
      </div>
    </div>
  </section>

  <!-- ============================================================
       拍照 / 选图 来源选择弹窗（ActionSheet）
       ============================================================ -->
  <el-dialog
    v-model="actionSheet"
    title="选择图片来源"
    width="92%"
    :show-close="true"
    append-to-body
    align-center
    class="fc-actionsheet-dialog"
    :style="{ maxWidth: '480px' }"
  >
    <div class="fc-actionsheet-list">
      <button class="fc-as-item" :disabled="cameraBusy" @click="pickSource('camera')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="fc-as-ic"><path d="M14.5 4l1.5 2h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l1.5-2z"/><circle cx="12" cy="13" r="4"/></svg>
        <div class="fc-as-text">
          <div class="fc-as-title">拍照</div>
          <div class="fc-as-sub">使用相机拍摄彩票票面</div>
        </div>
      </button>
      <button class="fc-as-item" :disabled="cameraBusy" @click="pickSource('gallery')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="fc-as-ic"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5L9 21"/></svg>
        <div class="fc-as-text">
          <div class="fc-as-title">从相册选图</div>
          <div class="fc-as-sub">从手机相册里选择已有照片</div>
        </div>
      </button>
    </div>
    <template #footer>
      <el-button round @click="actionSheet = false">取消</el-button>
    </template>
  </el-dialog>

  <!-- ============================================================
       手动输入号码弹窗
       ============================================================ -->
  <el-dialog
    v-model="pasteDialog"
    title="手动输入号码"
    width="92%"
    :close-on-click-modal="true"
    :show-close="true"
    append-to-body
    class="fc-paste-dialog"
    :style="{ maxWidth: '520px' }"
  >
    <div class="fc-paste-tips">每行一注，空格或逗号分隔。例如：</div>
    <pre class="fc-paste-sample">01 02 03 04 05 06 07
08 09 10 11 12 13 14
15 16 17 18 19 20 21</pre>
    <el-input
      v-model="pasteText"
      type="textarea"
      :rows="6"
      placeholder="在此粘贴或输入号码…"
      resize="none"
    />
    <template #footer>
      <div class="fc-paste-actions">
        <el-button @click="loadSample">载入示例</el-button>
        <el-button @click="pasteText = ''">清空</el-button>
        <el-button type="primary" :disabled="!pasteText.trim()" @click="confirmPaste">核对粘贴号码</el-button>
      </div>
    </template>
  </el-dialog>

  <!-- ============================================================
       票面识别元数据 (v1.9.6)
       ============================================================ -->
  <section v-if="ocrMeta.foundAny" class="fc-meta">
    <div class="fc-meta-row">
      <span class="fc-meta-tag" :class="{'warn': isWrongGame}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="fc-meta-ic"><path d="M9 11l3 3 8-8M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        识别到<span class="fc-meta-game">{{ ocrMeta.gameName || '未知彩种' }}</span>
        <template v-if="ocrMeta.playHint"><span class="fc-meta-playhint">· {{ ocrMeta.playHint }}</span></template>
      </span>
      <span v-if="ocrMeta.issue" class="fc-meta-tag issue">第 <b>{{ ocrMeta.issue }}</b> 期</span>
      <span v-if="ocrMeta.drawDate" class="fc-meta-tag date">开奖 {{ ocrMeta.drawDate }}</span>
    </div>
    <div class="fc-meta-row tools">
      <button v-if="ocrMeta.issue" class="fc-meta-btn" :disabled="lookupState.loading" @click="lookupAndCheckExact">
        <span v-if="lookupState.loading">查询中…</span>
        <span v-else>精确核对当期</span>
      </button>
      <button v-if="isWrongGame" class="fc-meta-btn primary" @click="refillPasteFromOcr">
        切到 {{ ocrMeta.gameName }} 重新核对
      </button>
      <button class="fc-meta-btn ghost" @click="ocrRawVisible = !ocrRawVisible">
        {{ ocrRawVisible ? '收起原始文本' : '查看原始文本' }}
      </button>
    </div>
    <div v-if="ocrRawVisible" class="fc-raw">
      <pre>{{ ocrRawText || '(无)' }}</pre>
    </div>
  </section>
</template>

<script setup>
const props = defineProps({
  ocr: { type: Object, required: true },
  cfg: { type: Object, required: true }
})
const {
  cameraBusy, actionSheet, pickSource, openPasteDialog, pasteDialog, pasteText,
  loadSample, confirmPaste, imagePreview, imageName, ocrRunning, ocrStatusText,
  ocrError, clearImage, retryOcr, ocrMeta, isWrongGame, ocrRawVisible, ocrRawText,
  lookupState, lookupAndCheckExact, refillPasteFromOcr
} = props.ocr
</script>

<style scoped>
/* ---------- Hero（强玻璃主区） ---------- */
.fc-hero {
  position: relative;
  border-radius: 18px;
  padding: 16px 18px 14px;
  background:
    linear-gradient(135deg, rgba(246, 196, 83, 0.18) 0%, rgba(124, 92, 255, 0.10) 60%, rgba(61, 123, 255, 0.08) 100%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%);
  border: 1px solid rgba(246, 196, 83, 0.22);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(12px) saturate(160%);
  -webkit-backdrop-filter: blur(12px) saturate(160%);
  overflow: hidden;
  isolation: isolate;
}
.fc-hero::before {
  content: '';
  position: absolute;
  /* inset 简写需 Chrome 87+，WebView 83 下失效，故显式写四边 */
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: radial-gradient(420px circle at 0% 0%, rgba(246, 196, 83, 0.18), transparent 55%);
  pointer-events: none;
  z-index: -1;
}
.fc-hero-head { margin-bottom: 12px; }
.fc-hero-eyebrow {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 3px;
  color: var(--accent, #f6c453);
  text-transform: uppercase;
  margin-bottom: 6px;
  padding: 2px 8px;
  border: 1px solid rgba(246, 196, 83, 0.32);
  border-radius: 999px;
  background: rgba(246, 196, 83, 0.08);
}
.fc-hero-title {
  font-size: 19px;
  font-weight: 800;
  line-height: 1.32;
  letter-spacing: 0.3px;
  margin: 0 0 6px;
  background: linear-gradient(135deg, #fff 0%, rgba(255, 255, 255, 0.85) 60%, rgba(246, 196, 83, 0.7) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
html.light .fc-hero-title {
  background: linear-gradient(135deg, #1c2540 0%, #3d4d80 60%, #b8820d 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.fc-hero-sub { font-size: 11px; color: var(--text-muted); margin: 0; letter-spacing: 0.2px; }

/* ---------- 操作按钮组（hero 内） ---------- */
.fc-actions { display: grid; grid-template-columns: 1.1fr 1fr; gap: 8px; }
.fc-actions > .fc-action-link { grid-column: 1 / -1; }
.fc-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 9px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  user-select: none;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.14));
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
  transition: transform 0.16s var(--ease-out), background 0.16s var(--ease-out), border-color 0.16s var(--ease-out);
}
.fc-action:hover { transform: translateY(-1px); background: rgba(255, 255, 255, 0.10); }
.fc-action:active { transform: scale(0.98); }
.fc-action:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
.fc-action-primary {
  background: linear-gradient(135deg, var(--accent, #f6c453), var(--accent-strong, #ffd97a));
  color: #1c2540;
  border: 1px solid rgba(246, 196, 83, 0.55);
  box-shadow: 0 4px 14px rgba(246, 196, 83, 0.35);
}
.fc-action-primary:hover { box-shadow: 0 6px 20px rgba(246, 196, 83, 0.5); }
.fc-action-link {
  min-height: 42px;
  font-size: 13px;
  font-weight: 600;
  background: transparent;
  border: 1px dashed var(--border, rgba(255, 255, 255, 0.20));
  color: var(--text-secondary);
}
.fc-action-link:hover { color: var(--text-primary); border-color: rgba(246, 196, 83, 0.45); }
.fc-action-inner { display: inline-flex; align-items: center; gap: 8px; }
.fc-action-ic { width: 18px; height: 18px; flex-shrink: 0; }
.fc-spin { width: 16px; height: 16px; animation: fc-spin 0.9s linear infinite; }
@keyframes fc-spin { to { transform: rotate(360deg); } }

/* ---------- 图片预览（.fc-section 基础样式见主组件非 scoped 块） ---------- */
.fc-section-tools { display: flex; gap: 6px; margin-left: auto; }
.fc-preview-row { display: flex; gap: 14px; align-items: flex-start; }
.fc-preview-img {
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
}
.fc-preview-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.fc-preview-name { font-size: 11px; color: var(--text-muted); word-break: break-all; }
.fc-preview-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--accent, #f6c453);
  font-weight: 600;
}
.fc-preview-status.err { color: #ff8a80; }

/* ---------- v1.9.6 OCR 元数据 ---------- */
.fc-meta {
  border-radius: 14px;
  padding: 12px 14px;
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.10), rgba(255, 255, 255, 0.02) 60%);
  border: 1px solid rgba(76, 175, 80, 0.32);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.fc-meta-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.fc-meta-row.tools { margin-top: 2px; }
.fc-meta-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.10));
}
.fc-meta-tag.warn {
  background: linear-gradient(90deg, rgba(246, 196, 83, 0.18), rgba(255, 255, 255, 0.04));
  border-color: rgba(246, 196, 83, 0.45);
  color: var(--accent, #f6c453);
}
.fc-meta-tag.issue { font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, monospace; }
.fc-meta-tag.issue b { color: var(--accent, #f6c453); }
.fc-meta-tag.date { color: var(--text-secondary); }
.fc-meta-game { color: var(--accent, #f6c453); margin: 0 4px; font-weight: 700; }
.fc-meta-playhint { color: var(--text-muted); font-weight: 400; }
.fc-meta-ic { width: 14px; height: 14px; flex-shrink: 0; }
.fc-meta-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.14));
  color: var(--text-primary);
  transition: background 0.14s var(--ease-out), border-color 0.14s var(--ease-out);
}
.fc-meta-btn:hover { background: rgba(255, 255, 255, 0.10); border-color: rgba(246, 196, 83, 0.35); }
.fc-meta-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.fc-meta-btn.primary {
  background: linear-gradient(135deg, var(--accent, #f6c453), var(--accent-strong, #ffd97a));
  color: #1c2540;
  border-color: rgba(246, 196, 83, 0.55);
}
.fc-meta-btn.ghost { background: transparent; border-style: dashed; color: var(--text-secondary); }
.fc-raw {
  margin-top: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.18);
  border: 1px dashed var(--border, rgba(255, 255, 255, 0.14));
  max-height: 220px;
  overflow: auto;
  font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, monospace;
  font-size: 11px;
  line-height: 1.55;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}
.fc-raw pre { margin: 0; }

/* ---------- 手动输入弹窗 ---------- */
.fc-paste-tips { font-size: 12px; color: var(--text-muted); margin: 0 0 8px; }
.fc-paste-sample {
  margin: 0 0 12px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.6;
  font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, monospace;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.04);
  border: 1px dashed var(--border, rgba(255, 255, 255, 0.16));
  border-radius: 10px;
  white-space: pre-wrap;
  word-break: break-all;
}
.fc-paste-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }

/* ---------- 拍照/选图 ActionSheet ---------- */
.fc-actionsheet-list { display: flex; flex-direction: column; gap: 10px; padding: 4px 0; }
.fc-as-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.14));
  cursor: pointer;
  font-family: inherit;
  color: var(--text-primary);
  text-align: left;
  transition: background 0.15s var(--ease-out), border-color 0.15s var(--ease-out), transform 0.12s var(--ease-out);
}
.fc-as-item:hover { background: rgba(255, 255, 255, 0.10); border-color: rgba(246, 196, 83, 0.35); }
.fc-as-item:active { transform: scale(0.98); }
.fc-as-item:disabled { opacity: 0.55; cursor: not-allowed; }
.fc-as-ic { width: 24px; height: 24px; flex-shrink: 0; color: var(--accent, #f6c453); }
.fc-as-text { flex: 1; min-width: 0; }
.fc-as-title { font-size: 15px; font-weight: 700; }
.fc-as-sub { font-size: 11px; color: var(--text-muted); margin-top: 3px; }

/* ---------- 移动端 ---------- */
@media (max-width: 768px) {
  .fc-hero { padding: 14px 14px 12px; border-radius: 16px; }
  .fc-hero-title { font-size: 17px; line-height: 1.28; }
  .fc-hero-eyebrow { font-size: 9px; letter-spacing: 2.5px; padding: 1px 7px; }
  .fc-hero-sub { font-size: 10.5px; }
  .fc-actions { grid-template-columns: 1.05fr 1fr; gap: 6px; }
  .fc-actions > .fc-action-link { grid-column: auto; }
  .fc-action { min-height: 40px; padding: 8px 10px; font-size: 12.5px; }
  .fc-action-link { min-height: 36px; font-size: 12px; }
  .fc-action-ic { width: 16px; height: 16px; }
  .fc-preview-row { flex-direction: column; }
  .fc-preview-img { width: 100%; height: 160px; }
  .fc-meta { padding: 10px 12px; }
  .fc-meta-row { gap: 6px; }
  .fc-meta-tag { font-size: 11px; padding: 3px 8px; }
  .fc-meta-btn { font-size: 11px; padding: 5px 10px; min-height: 28px; }
  .fc-raw { max-height: 160px; font-size: 10.5px; }
}
</style>
