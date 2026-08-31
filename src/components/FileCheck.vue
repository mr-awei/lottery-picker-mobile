<template>
  <div class="fc">
    <!-- ============================================================
         Hero 主区（弱玻璃，撑场） ——  拍 / 选 / 手动 三入口合一
         ============================================================ -->
    <section class="fc-hero">
      <div class="fc-hero-head">
        <span class="fc-hero-eyebrow">查中奖</span>
        <h2 class="fc-hero-title">拍照、选图 或 手动输入<br />核对最近开奖</h2>
        <p class="fc-hero-sub">在线 OCR 识别号码 · 公开免费 API · 中文准确率高</p>
      </div>

      <div class="fc-actions">
        <button class="fc-action fc-action-primary" @click="actionSheet = true" :disabled="cameraBusy">
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
         我的自选票 —— SavedPicksList 自己的弱化外观直接作 .fc 子元素
         （不再外套 .fc-section，避免卡片套卡片）
         ============================================================ -->
    <SavedPicksList :cfg="props.cfg" :draws="props.draws" />

    <!-- ============================================================
         图片预览 + OCR 状态（条件）
         ============================================================ -->
    <section v-if="imagePreview" class="fc-section fc-section-preview">
      <header class="fc-section-head">
        <span class="fc-section-title">识别预览</span>
        <div class="fc-section-tools">
          <el-button size="small" @click="clearImage">移除图片</el-button>
          <el-button size="small" type="primary" @click="retryOcr" :disabled="ocrRunning">重新识别</el-button>
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
         合并旧的"拍照查奖"和"从相册选图"两个入口
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
        <el-button @click="actionSheet = false" round>取消</el-button>
      </template>
    </el-dialog>

    <!-- ============================================================
         手动输入弹窗（取代旧的折叠面板）
         点击 fc-section 内的"手动输入号码"按钮时弹起。
         OCR 识别到号码后会自动 parseAndCheck，不走此弹窗。
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
         OCR 文本头部识别到"双色球 / 大乐透 / ..." + 期号 + 开奖日期时展示。
         用于：① 提示与当前 Tab 不一致时可一键切彩种；
                ② 用识别到的期号精确匹配开奖数据（非回溯 50 期）。
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
            共 {{ rows.length }} 注 · 追溯 {{ props.draws.length }} 期
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
            <template v-if="props.cfg.playMode === 'direct'">
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
                <template v-if="props.cfg.playMode === 'direct'">
                  命中 {{ row.prize.digitsMatch }} 位<template v-if="props.cfg.tail"> · 尾位{{ row.prize.tailMatch ? '中' : '未中' }}</template>
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
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { pad2, fmtDate } from '../utils/game-config'
import { checkTicketHistory, isBigWin, bigWinFlow, smallWinNote, fmtBonus } from '../utils/prize-check'
import { Camera } from '@capacitor/camera'
import SavedPicksList from './SavedPicksList.vue'
// 在线 OCR 为主路径；本地 tesseract 兜底改为 dynamic import（1.8.3）：
// 只在在线识别失败时才加载，主 bundle 不再包含 tesseract.js（瘦身几百 KB）
import { recognizeTicketOnline } from '../utils/ocr-online'
// 1.8.5：智能号码提取（OCR 远程返回文字，本地找号码）——支持大乐透 A-E 前缀 5+2、双色球 6+1、编号列表等
import { extractTickets } from '../utils/picker-engine'
// v1.9.6：OCR 元数据（彩种/期号/开奖日期）+ 历史期号查找工具
import { findDrawByIssue, findDrawByDate } from '../utils/ocr-meta'
// v1.9.6：精确当期数据查找（CapacitorHttp 走原生，浏览器走 fetch/snapshot 兜底）
import { lotteryApi } from '../utils/mobile-api'
import { GAME_CONFIG } from '../utils/game-config'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const pasteDialog = ref(false)
const pasteText = ref('')
const actionSheet = ref(false)
const parseError = ref('')
const rows = ref([])
const flowVisible = ref(false)
const flowData = ref(null)

function openPasteDialog() {
  pasteDialog.value = true
}

function confirmPaste() {
  const text = pasteText.value
  if (!text || !text.trim()) return
  parseAndCheck(text)
  pasteDialog.value = false
}

// 图片/OCR 状态
const imagePreview = ref('')
const imageBlob = ref(null)
const imageName = ref('')
const cameraBusy = ref(false)
const ocrRunning = ref(false)
const ocrError = ref('')
const ocrStatusText = ref('正在识别…')

// v1.9.6：OCR 票面识别元数据（彩种/期号/开奖日期/玩法）
const ocrMeta = ref({ gameKey: null, gameName: null, issue: null, drawDate: null, playHint: null, foundAny: false })
// v1.9.6：OCR 原始文本（折叠区展示，方便用户手校）
const ocrRawVisible = ref(false)
const ocrRawText = ref('')
// v1.9.6：OCR 行数统计（用于漏注警告：候选 > 实际解析）
const ocrStats = ref({ totalLines: 0, candidateLines: 0 })
// v1.9.6：精确当期核对结果
const lookupState = ref({ gameKey: null, issue: null, hit: null, miss: null, nonCurrent: false, loading: false, error: '' })
// v1.9.6：识别彩种与当前 Tab 不一致时的目标 cfg
const suggestedCfg = computed(() => ocrMeta.value && ocrMeta.value.gameKey ? GAME_CONFIG[ocrMeta.value.gameKey] : null)
const isWrongGame = computed(() => !!ocrMeta.value.gameKey && ocrMeta.value.gameKey !== props.cfg.key)
// v1.9.6：漏注警告（在 result 区上方显示）
const partialParseWarn = computed(() => {
  const c = ocrStats.value.candidateLines || 0
  const p = rows.value.length
  return c > p && p > 0
})

const latest = computed(() => (props.draws && props.draws.length ? props.draws[0] : null))
const winCount = computed(() => rows.value.filter((r) => r.prize && r.prize.level > 0).length)
const totalBonus = computed(() => rows.value.reduce((a, r) => a + (r.prize && r.prize.bonus || 0), 0))

/** 把 Capacitor Camera Photo 转成 dataURL（base64）用于 <img> 预览 */
async function photoToDataUrl(photo) {
  if (photo.dataUrl) return photo.dataUrl
  if (!photo.path && !photo.webPath) return ''
  const src = photo.webPath || photo.path
  try {
    const r = await fetch(src)
    const blob = await r.blob()
    return await new Promise((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result || ''))
      fr.onerror = () => reject(fr.error)
      fr.readAsDataURL(blob)
    })
  } catch (e) {
    console.error('photo → dataUrl 失败', e)
    return ''
  }
}

/** Web 回退：从 <input type="file"> 直接选图（兼容 dev/pc 浏览器/Capacitor 失败时）
 * 1.9.1：加 30s 超时兜底。Android WebView 上 input.oncancel 不触发，
 * 用户从系统文件选择器返回时不会回调 → promise 永久 pending → 配套 captureImage 的超时才能解锁。
 * 1.9.3：pickImageViaInput(input) 接受调用方在 user activation（点击 handler 同步部分）
 * 里**先**调用 input.click()，本函数只负责挂监听 + 等待 + 清理；调用方在调用本函数之前
 * 必须已同步触发 click，否则报 "未触发选图" 错误。模块级单例 input，跨多次调用复用。
 * 解决 Chromium "File chooser dialog can only be shown with a user activation"。 */

let _fileInput = null
let _pickSlot = null // { resolve, reject, settled, timer }

function _ensureInput() {
  if (_fileInput) return _fileInput
  _fileInput = document.createElement('input')
  _fileInput.type = 'file'
  _fileInput.accept = 'image/*'
  _fileInput.style.display = 'none'
  _fileInput.addEventListener('change', () => {
    const slot = _pickSlot
    if (!slot || slot.settled) return
    const f = _fileInput.files && _fileInput.files[0]
    if (!f) return _finish(slot.reject, new Error('未选图'))
    const fr = new FileReader()
    fr.onload = () =>
      _finish(slot.resolve, { dataUrl: String(fr.result || ''), name: f.name, blob: f })
    fr.onerror = () => _finish(slot.reject, fr.error)
    fr.readAsDataURL(f)
  })
  return _fileInput
}

function _finish(fn, arg) {
  const slot = _pickSlot
  if (!slot || slot.settled) return
  slot.settled = true
  clearTimeout(slot.timer)
  _pickSlot = null
  fn(arg)
}

/** 必须由调用方在 user activation 上下文（点击 handler 同步部分）内调用。
 * 触发隐藏 input 的文件选择器。返回 input 实例（备用，调用方一般不用）。 */
function triggerFileInput() {
  const input = _ensureInput()
  if (!document.body.contains(input)) document.body.appendChild(input)
  input.value = ''
  input.click()
  return input
}

/** 等待上一次 triggerFileInput 的结果。30s 兜底超时。 */
function waitPickedImage(timeoutMs = 30000) {
  const input = _ensureInput()
  return new Promise((resolve, reject) => {
    if (_pickSlot && !_pickSlot.settled) return reject(new Error('选图进行中'))
    _pickSlot = {
      resolve,
      reject,
      settled: false,
      timer: setTimeout(() => _finish(reject, new Error('已取消（超时）')), timeoutMs)
    }
  })
}

/** 一站式：拿到图像 dataURL + 文件信息。优先用 Capacitor Camera，失败 fallback 到 input
 * 1.9.1：加 12s Promise.race 超时兜底 —— 部分国产 ROM（华为/小米/OPPO）的相册应用在
 * 用户取消时不调用 Capacitor Camera 的 cancel 回调，导致 promise 永久 pending；
 * 这会卡住 cameraBusy=true → "处理中"按钮一直转。超时强制 reject 让 finally 解锁。
 * 1.9.3：浏览器/web 环境直接走 input fallback —— 但 input.click() 必须在 user
 * activation 上下文里。click() 由调用方（pickSource 在 button click 同步部分）同步触发，
 * captureImage 仅负责 await waitPickedImage()。避免 Chromium
 * "File chooser dialog can only be shown with a user activation"。 */
function isNativeCapacitor() {
  return typeof window !== 'undefined' && window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()
}
async function captureImage(source) {
  cameraBusy.value = true
  try {
    // 浏览器/dev/web 环境：input.click() 已由 pickSource 在 click handler 同步部分触发，
    // 这里只 await 结果。Capacitor 桥不可用，不绕。
    if (!isNativeCapacitor()) {
      return await waitPickedImage()
    }
    if (source === 'camera') {
      const work = (async () => {
        try {
          const photo = await Camera.takePhoto({
            quality: 92,
            resultType: 'dataUrl',
            allowEditing: false,
            saveToGallery: false,
            correctOrientation: true,
            source: 'CAMERA',
            presentationStyle: 'fullScreen'
          })
          const dataUrl = photo.dataUrl || await photoToDataUrl(photo)
          if (!dataUrl) throw new Error('相机返回为空')
          return { dataUrl, name: '拍照-' + Date.now() + '.jpg', blob: null }
        } catch (e) {
          console.warn('Camera.takePhoto 失败:', e)
          throw new Error('相机调用失败，请重试')
        }
      })()
      const timeout = new Promise((_, reject) => setTimeout(
        () => reject(new Error('拍照超时（12s 无回调），请重试')), 12000))
      return await Promise.race([work, timeout])
    }
    // 相册：优先用系统文件选择器(<input type=file>)。Capacitor 原生 WebView 的 WebChromeClient
    // 会把它路由到系统图片/文档选择器，在所有真机（含 Android 11/12、国产 ROM）都可靠；
    // 绕开 @capacitor/camera 的 Ion Photo Picker —— 它在部分真机启动失败，表现为「相册调用失败，请重试」。
    // 兜底：系统选择器失败再试一次原生 chooseFromGallery。
    try {
      const r = await waitPickedImage(30000)
      if (r && r.dataUrl) return r
    } catch (e1) {
      console.warn('系统选择器选图失败，回退原生相册:', e1)
    }
    const work = (async () => {
      try {
        const result = await Camera.chooseFromGallery({ quality: 92, presentationStyle: 'fullScreen' })
        const photo = Array.isArray(result.photos) ? result.photos[0] : result
        const dataUrl = (photo && photo.dataUrl) || await photoToDataUrl(photo)
        if (!dataUrl) throw new Error('相册返回为空')
        return { dataUrl, name: '相册-' + Date.now() + '.jpg', blob: null }
      } catch (e2) {
        console.warn('Camera.chooseFromGallery 失败:', e2)
        throw new Error('相册调用失败，请重试')
      }
    })()
    const timeout = new Promise((_, reject) => setTimeout(
      () => reject(new Error('选图超时（12s 无回调），请重试')), 12000))
    return await Promise.race([work, timeout])
  } finally {
    cameraBusy.value = false
  }
}

/** button click handler：必须**同步**触发 input.click()（浏览器路径下），
 * 否则 Chromium 会报 "File chooser dialog can only be shown with a user activation"。
 * 这是 async function —— 第一行执行时仍在用户点击的同步栈内，所以这里调 triggerFileInput()
 * 是合规的；后面所有的 await 操作栈都已脱离激活上下文也没关系。 */
async function pickSource(source) {
  // 同步首行：相册在所有平台都走 <input type=file>，必须在 user activation 栈里触发
  // （Capacitor 原生 WebView 会把该 input 路由到系统图片选择器，比 Ion Photo Picker 更稳）。
  // 拍照走原生相机，由 captureImage 内部处理，这里不触发 input。
  if (source === 'gallery') triggerFileInput()
  actionSheet.value = false
  try {
    const r = await captureImage(source)
    await applyImage(r)
  } catch (e) {
    ElMessage.warning(e.message || (source === 'camera' ? '拍照已取消' : '选图已取消'))
  }
}

async function applyImage({ dataUrl, name, blob }) {
  clearRows()
  imagePreview.value = dataUrl
  imageName.value = name || ''
  imageBlob.value = blob || null
  ocrError.value = ''
  await runOcr()
}

async function runOcr() {
  if (!imagePreview.value) return
  ocrRunning.value = true
  ocrError.value = ''
  ocrStatusText.value = '压缩图片…'
  let result = null
  let used = ''
  try {
    try {
      result = await recognizeTicketOnline(imagePreview.value, (s) => {
        ocrStatusText.value = s
      })
      used = 'online'
    } catch (e) {
      console.warn('在线 OCR 失败，回退本地：', e)
      ocrStatusText.value = '在线识别失败，尝试本地…'
      try {
        // 动态加载本地 OCR（懒加载，tesseract 不进主 bundle）
        const { recognizeTicket: recognizeTicketLocal } = await import('../utils/ocr-engine')
        result = await recognizeTicketLocal(imagePreview.value, (s) => {
          ocrStatusText.value = s
        })
        used = 'local'
      } catch (e2) {
        throw new Error(`在线 OCR 失败（${e.message || e}）；本地兜底也失败（${e2.message || e2}））
`)
      }
    }
  } catch (e) {
    console.error(e)
    ocrError.value = e.message || String(e)
    return
  } finally {
    ocrRunning.value = false
  }
  const text = (result && result.text) || ''
  pasteText.value = text
  // v1.9.6：保存元数据 + 原始文本 + 行统计
  ocrRawText.value = (result && result.raw) || text
  ocrMeta.value = (result && result.meta) || { gameKey: null, foundAny: false }
  ocrStats.value = (result && result.stats) || { totalLines: 0, candidateLines: 0 }
  // 重置精确当期 lookup 状态（重新识别后旧结果丢弃）
  lookupState.value = { gameKey: null, issue: null, hit: null, miss: null, loading: false, error: '' }
  if (!text) {
    ocrError.value = `未能识别到号码（${used === 'online' ? '在线' : '本地'} OCR）— 请改用「手动输入号码」，或调整拍照角度/光线后重试`
    return
  }
  ocrStatusText.value = `识别完成（${used === 'online' ? '在线' : '本地'}）`
  parseAndCheck(pasteText.value)
}

/**
 * v1.9.6：精确当期核对 —— OCR 识别到"销售期 2023013"且 lotteryApi.lookupByIssue 命中时，
 * 用对应当期开奖数据重算奖金。识别到非当前彩种的票也能跨彩种查找。
 * 调用后会覆盖 rows。
 */
async function lookupAndCheckExact() {
  const meta = ocrMeta.value
  if (!meta || !meta.issue || !meta.gameKey) {
    ElMessage.warning('未识别到"销售期"或彩种，无法精确匹配当期')
    return
  }
  lookupState.value = { gameKey: meta.gameKey, issue: meta.issue, hit: null, miss: null, loading: true, error: '' }
  try {
    const cfg = GAME_CONFIG[meta.gameKey]
    if (!cfg) throw new Error(`未知彩种 ${meta.gameKey}`)
    // 解析号码（按识别 cfg 解析）
    const tickets = extractTickets(pasteText.value || '', cfg)
    if (!tickets.length) {
      lookupState.value.loading = false
      lookupState.value.error = '未解析出号码，无法核对'
      return
    }
    const r = await lotteryApi.lookupByIssue(meta.gameKey, meta.issue)
    if (!r.ok) throw new Error(r.error || '查询失败')
    if (!r.draw) {
      // 联网也拉不到这一期（官方接口仅保留近 100 期）→ 明确告知非当期，绝不对最近 100 期反查
      const out = tickets.map((nums) => ({ ...nums, prize: null }))
      rows.value = out
      lookupState.value = { gameKey: meta.gameKey, issue: meta.issue, hit: null, miss: r.miss || `第 ${meta.issue} 期开奖数据无法获取（官方接口仅保留近 100 期）`, nonCurrent: false, loading: false, error: '' }
      return
    }
    // 用精确当期开奖数据逐票核对
    const out = []
    tickets.forEach((nums) => {
      const ticket = cfg.playMode === 'direct'
        ? { type: 'single', digits: nums.digits, tail: nums.tail }
        : { type: 'single', red: nums.red, blue: nums.blue }
      const checked = checkTicketHistory(cfg, ticket, [r.draw])
      out.push({ ...nums, prize: checked })
    })
    rows.value = out
    lookupState.value = { gameKey: meta.gameKey, issue: meta.issue, hit: r.draw, miss: null, nonCurrent: !isCurrentIssue(props.draws, r.draw.issue), loading: false, error: '' }
  } catch (e) {
    console.error(e)
    lookupState.value = { gameKey: meta.gameKey, issue: meta.issue, hit: null, miss: null, loading: false, error: e.message || String(e) }
    ElMessage.error('精确当期核对失败：' + (e.message || e))
  }
}

/**
 * v1.9.6：把文本回填进"手动输入号码"对话框 —— 用于 OCR 漏注时用户手校后再次解析。
 */
function refillPasteFromOcr() {
  pasteText.value = ocrRawText.value || pasteText.value
  pasteDialog.value = true
}

async function retryOcr() {
  // 防重入（1.8.3）：识别进行中忽略重复点击，避免并发 OCR 覆盖状态
  if (ocrRunning.value) return
  await runOcr()
}

function clearImage() {
  imagePreview.value = ''
  imageBlob.value = null
  imageName.value = ''
  ocrRunning.value = false
  ocrError.value = ''
  ocrStatusText.value = '正在识别…'
  pasteText.value = ''
  clearRows()
}

/** 解析一行号码（与原 FileCheck 保持一致）
 * 智能识别（1.8.4）：兼容两种格式
 *  - 票面格式："红区 06 11 03 17 21 32 - 蓝区 16"（OCR 真实票面常带"红区/蓝区"中文标识）
 *  - 纯号码格式："01 02 03 04 05 06 16"（用户手动粘贴/复制）
 */
function parseLine(line, cfg) {
  if (cfg.playMode === 'direct') {
    const nums = (line.match(/\d/g) || []).map(Number)
    const nPos = cfg.digits ? cfg.digits.length : 0
    const need = nPos + (cfg.tail ? 1 : 0)
    if (nums.length < need) return null
    const digits = nums.slice(0, nPos)
    const tail = cfg.tail ? nums[nPos] : null
    return { digits, tail }
  }
  // 段内数字抽取：过滤 >2 位长数字（身份证/订单号/期号）
  const extractNums = (s, max) => (s.match(/\d+/g) || [])
    .filter((x) => x.length <= 2)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= max)

  // 智能识别：含"红区/蓝区"中文标识时按段抽取
  if (/红区/.test(line) || /蓝区/.test(line)) {
    const redM = line.match(/红区\s*[:：\-]?\s*([^\n蓝]*?)(?=\s*蓝区|$|\s*$)/)
    const blueM = line.match(/蓝区\s*[:：\-]?\s*([^\n]*?)\s*$/)
    const redNums = redM ? extractNums(redM[1], cfg.redMax) : []
    const blueNums = blueM ? extractNums(blueM[1], cfg.blueMax) : []
    if (redNums.length >= cfg.redCount && (cfg.blueCount === 0 || blueNums.length >= cfg.blueCount)) {
      return {
        red: redNums.slice(0, cfg.redCount).sort((a, b) => a - b),
        blue: blueNums.slice(0, cfg.blueCount).sort((a, b) => a - b)
      }
    }
    // 段式识别失败 → 回退到全行抽取（兼容 OCR 漏标点）
  }

  const nums = extractNums(line, Math.max(cfg.redMax, cfg.blueMax))
  const need = cfg.redCount + cfg.blueCount
  if (nums.length < need) return null
  const red = nums.slice(0, cfg.redCount)
  const blue = nums.slice(cfg.redCount, cfg.redCount + cfg.blueCount)
  if (red.some((n) => n > cfg.redMax) || blue.some((n) => n > cfg.blueMax)) return null
  return { red: [...new Set(red)].sort((a, b) => a - b), blue: [...new Set(blue)].sort((a, b) => a - b) }
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

function showFlow(row) {
  const pr = row.prize && row.prize.best ? row.prize.best : row.prize
  flowData.value = buildFlowData(pr, isBigWin(pr) ? bigWinFlow(props.cfg, pr) : smallWinNote(props.cfg, pr))
  flowVisible.value = true
}

// v1.9.7：判断某期是否"当期"（最新一期）。用于明确告知用户这是历史某期（非当期）。
function latestIssueOf(draws) {
  if (!draws || !draws.length) return null
  let max = null
  for (const d of draws) {
    const n = Number(d.issue)
    if (!Number.isNaN(n) && (max == null || n > max)) max = n
  }
  return max
}
function isCurrentIssue(draws, issue) {
  const latest = latestIssueOf(draws)
  if (latest == null || issue == null) return false
  return Number(issue) === Number(latest)
}

/** v1.9.10 OCR 文本预处理：把"红区 X / 蓝区 Y"相邻两行 join 成一行的"红区 X 蓝区 Y"。
 *  原因：OCR 在票面分段较密 / 字号小时常把这两段切成两行，而 picker-engine.extractTickets
 *  的 per-line 兜底逻辑只能处理"单行含全部 + 前后区"或"单行 6+1 不分段"两种，拆成两行会双双 0 命中。
 *  合并后再给 extractTickets，红区蓝区两段就能一起解析。 */
function preprocessOcrText(text) {
  if (!text) return text
  const lines = String(text).split(/\r?\n/).map((l) => l)
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i].trim()
    const b = lines[i + 1].trim()
    if (!a || !b) continue
    // 形如 "红区 ..." 或 "红区: ..." 紧跟 "蓝区 ..." 或 "蓝区: ..."
    if (/^红区\b/.test(a) && /^蓝区\b/.test(b)) {
      lines[i] = a + ' ' + b
      lines[i + 1] = ''
      i++ // 跳过已合并的下一行
    }
  }
  return lines.filter((l) => l.trim().length > 0).join('\n')
}

async function parseAndCheck(text) {
  parseError.value = ''
  // v1.9.6：根据识别的 gameKey 决定用什么 cfg（识别到大乐透的票却用双色球 cfg 解析会丢行）
  const useCfg = (ocrMeta.value && ocrMeta.value.gameKey && GAME_CONFIG[ocrMeta.value.gameKey])
    ? GAME_CONFIG[ocrMeta.value.gameKey]
    : props.cfg
  // v1.9.10：合并"红区/蓝区"相邻行 + 启发式策略 4 才走 extractTickets
  const tickets = extractTickets(preprocessOcrText(text || ''), useCfg)
  if (!tickets.length) {
    const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const nPos = useCfg.digits ? useCfg.digits.length : 0
    const needDesc = useCfg.playMode === 'direct'
      ? `每行需 ${nPos} 个数字${useCfg.tail ? ' + 1 个尾位' : ''}`
      : `每行需 ${useCfg.redCount} 个红球 + ${useCfg.blueCount} 个蓝球（票面格式：可为 "A: 01 02...+13" 大乐透多注 / "1) 01 02..." 编号列表 / "红区 ... - 蓝区 ..." 分段 / 纯号码行）`
    parseError.value = `共 ${lines.length} 行，均无法解析（${needDesc}）`
    rows.value = []
    return
  }
  // v1.9.7 对期修正：图上有明确彩种+期号时，绝不回溯 100 期。
  // 本地缓存命中该期 → 直接精确核对；本地没有该期 → 自动联网精确拉取（lookupAndCheckExact），不回退 props.draws 反查。
  const meta = ocrMeta.value || {}
  const metaIssue = meta.issue
  const metaGame = meta.gameKey
  const exact = metaIssue ? findDrawByIssue(props.draws, metaIssue) : null
  const exactByDate = !exact && meta.drawDate ? findDrawByDate(props.draws, meta.drawDate) : null
  if (metaIssue && metaGame && !exact && !exactByDate) {
    // 本地缓存没有这一期 → 自动精确联网拉取该期开奖（不再对最近 100 期反查）
    await lookupAndCheckExact()
    return
  }
  const useDraws = exact ? [exact] : (exactByDate ? [exactByDate] : (props.draws || []))
  lookupState.value = {
    gameKey: useCfg.key,
    issue: metaIssue || (exact && exact.issue) || (exactByDate && exactByDate.issue) || null,
    hit: exact || exactByDate || null,
    miss: (!exact && !exactByDate && metaIssue) ? `第 ${metaIssue} 期不在最近 ${(props.draws || []).length} 期缓存内` : null,
    nonCurrent: !!(exact || exactByDate) && !isCurrentIssue(props.draws, (exact || exactByDate).issue),
    loading: false,
    error: ''
  }
  const out = []
  tickets.forEach((nums) => {
    const ticket = useCfg.playMode === 'direct'
      ? { type: 'single', digits: nums.digits, tail: nums.tail }
      : { type: 'single', red: nums.red, blue: nums.blue }
    const checked = useDraws && useDraws.length ? checkTicketHistory(useCfg, ticket, useDraws) : null
    out.push({ ...nums, prize: checked })
  })
  rows.value = out
  const valid = out.filter((r) => useCfg.playMode === 'direct' ? r.digits.length : r.red.length).length
  if (valid === 0) {
    parseError.value = `共 ${tickets.length} 注，但均未通过奖级核对`
  }
  const big = out.find((r) => r.prize && r.prize.best && isBigWin(r.prize.best))
  if (big) {
    flowData.value = buildFlowData(big.prize.best, bigWinFlow(useCfg, big.prize.best))
    flowVisible.value = true
  }
}

function loadSample() {
  const sample = props.cfg.playMode === 'direct'
    ? (() => {
        const nPos = props.cfg.digits ? props.cfg.digits.length : 0
        const rows = []
        for (let r = 0; r < 3; r++) {
          const line = []
          for (let i = 0; i < nPos; i++) line.push((r * 3 + i) % 10)
          if (props.cfg.tail) line.push((r * 7 + 3) % (props.cfg.tailMax + 1))
          rows.push(line.join(' '))
        }
        return rows.join('\n')
      })()
    : props.cfg.key === 'ssq'
      ? '01 02 03 04 05 06 07\n08 09 10 11 12 13 14\n15 16 17 18 19 20 21'
      : '01 02 03 04 05 06 07\n08 09 10 11 12 13 14\n15 16 17 18 19 20 21 22'
  pasteText.value = sample
  parseAndCheck(sample)
}

function clearRows() {
  rows.value = []
  parseError.value = ''
}

watch(() => props.draws, () => {
  if (!props.draws || !props.draws.length || !rows.value.length) return
  rows.value = rows.value.map((r) => {
    if (props.cfg.playMode === 'direct' ? !r.digits.length : !r.red.length) return r
    const ticket = props.cfg.playMode === 'direct'
      ? { type: 'single', digits: r.digits, tail: r.tail }
      : { type: 'single', red: r.red, blue: r.blue }
    const checked = checkTicketHistory(props.cfg, ticket, props.draws)
    return { ...r, prize: checked }
  })
}, { immediate: true })
</script>

<style scoped>
/* ============================================
   FileCheck - Hero + 操作条 + 列表节奏
   设计原则：
   - 单个一级 hero 撑场（拍照/选图/手动），弱玻璃、留白大
   - 其他 section 弱化退位，紧凑卡片
   - 节奏化间距（hero 间 32px、其他 20px，section 内 12px）
   - 去除万物皆卡片、卡片套卡片
   ============================================ */
.fc {
  display: flex;
  flex-direction: column;
  /* 节奏：hero→section 36px，section→section 28px */
  gap: 28px;
}

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
  inset: 0;
  background: radial-gradient(420px circle at 0% 0%, rgba(246, 196, 83, 0.18), transparent 55%);
  pointer-events: none;
  z-index: -1;
}

.fc-hero-head {
  margin-bottom: 12px;
}
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
.fc-hero-sub {
  font-size: 11px;
  color: var(--text-muted);
  margin: 0;
  letter-spacing: 0.2px;
}

/* ---------- 操作按钮组（hero 内） ---------- */
.fc-actions {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 8px;
}
.fc-actions > .fc-action-link {
  grid-column: 1 / -1;   /* 手动输入独占一行，作为次入口 */
}

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

.fc-action-inner {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.fc-action-ic { width: 18px; height: 18px; flex-shrink: 0; }
.fc-spin {
  width: 16px;
  height: 16px;
  animation: fc-spin 0.9s linear infinite;
}
@keyframes fc-spin { to { transform: rotate(360deg); } }

/* ---------- Section 通用（中等玻璃卡：预览 / 手动 / 结果） ---------- */
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
.fc-section-hint {
  font-size: 11px;
  color: var(--text-muted);
}
.fc-section-tools {
  display: flex;
  gap: 6px;
  margin-left: auto;
}
.fc-section-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}

/* ---------- 图片预览 ---------- */
.fc-preview-row {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.fc-preview-img {
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
}
.fc-preview-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.fc-preview-name {
  font-size: 11px;
  color: var(--text-muted);
  word-break: break-all;
}
.fc-preview-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--accent, #f6c453);
  font-weight: 600;
}
.fc-preview-status.err { color: #ff8a80; }

/* ---------- 错误 + 结果 ---------- */
.fc-parse-error {
  color: #ff8a80;
  font-size: 13px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 138, 128, 0.10);
  border: 1px solid rgba(255, 138, 128, 0.30);
}

/* ---------- v1.9.6 OCR 元数据 + 警告 ---------- */
.fc-meta {
  border-radius: 14px;
  padding: 12px 14px;
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.10), rgba(255, 255, 255, 0.02) 60%);
  border: 1px solid rgba(76, 175, 80, 0.32);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.fc-meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.fc-meta-row.tools {
  margin-top: 2px;
}
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
.fc-meta-btn.ghost {
  background: transparent;
  border-style: dashed;
  color: var(--text-secondary);
}

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

.fc-result {}
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

/* ---------- 手动输入弹窗 ---------- */
.fc-paste-tips {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0 0 8px;
}
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
.fc-paste-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

/* ---------- 拍照/选图 ActionSheet ---------- */
.fc-actionsheet-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0;
}
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
.fc-as-item:hover {
  background: rgba(255, 255, 255, 0.10);
  border-color: rgba(246, 196, 83, 0.35);
}
.fc-as-item:active { transform: scale(0.98); }
.fc-as-item:disabled { opacity: 0.55; cursor: not-allowed; }
.fc-as-ic {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  color: var(--accent, #f6c453);
}
.fc-as-text { flex: 1; min-width: 0; }
.fc-as-title { font-size: 15px; font-weight: 700; }
.fc-as-sub { font-size: 11px; color: var(--text-muted); margin-top: 3px; }

/* ---------- 移动端 ---------- */
@media (max-width: 768px) {
  .fc { gap: 18px; }
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
  .fc-list { gap: 6px; }
  .fc-row { padding: 8px 10px; gap: 8px; }
  .fc-meta { padding: 10px 12px; }
  .fc-meta-row { gap: 6px; }
  .fc-meta-tag { font-size: 11px; padding: 3px 8px; }
  .fc-meta-btn { font-size: 11px; padding: 5px 10px; min-height: 28px; }
  .fc-raw { max-height: 160px; font-size: 10.5px; }
  .fc-period-warn-sub { font-size: 11px; }
}
</style>
