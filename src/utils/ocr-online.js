/**
 * ocr-online.js
 * ------------------------------------------------------------
 * 在线 OCR 客户端（OCR.Space 免费 API）
 * - apikey=helloworld（公开免费、无需注册）
 * - language=chs（简体中文）+ OCREngine=2（更准）
 * - 文件大小限制 1MB，前端 canvas 压缩到 <1MB 再上传
 * - 通过 CapacitorHttp 走原生网络栈（WebView 83 CORS-safe），
 *   浏览器 dev 模式回退 fetch
 *
 * 与离线 ocr-engine.js 接口对齐：recognizeTicket(dataUrl, onProgress)
 * 返回 { text, raw }，text 是提取的纯文本（每行一注），给 FileCheck.parseAndCheck 解析
 * ------------------------------------------------------------
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { extractTicketMeta, countOcrLines } from './ocr-meta'

const ENDPOINT = 'https://api.ocr.space/parse/image'
const APIKEY = 'helloworld' // 公开免费 key
const MAX_BYTES = 900 * 1024 // <1MB 上限，留 ~100KB 余量
const MIN_QUALITY = 0.45
const MIN_WIDTH = 1100 // 太小识别率骤降

/**
 * dataUrl → Image
 */
function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = dataUrl
  })
}

/**
 * 把 Image 画到 canvas，导出 JPEG dataUrl
 */
function imageToJpegDataUrl(img, maxWidth, quality) {
  const ratio = Math.min(1, maxWidth / img.naturalWidth)
  const w = Math.max(1, Math.round(img.naturalWidth * ratio))
  const h = Math.max(1, Math.round(img.naturalHeight * ratio))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  // 白底铺底（票面多为白底，避免 PNG 透明区被识别成噪点）
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * 循环压缩：先降到 MIN_WIDTH 宽，再按 0.9 比例降质，
 * 直到 < MAX_BYTES 或质/宽已到下限。
 * 返回 [dataUrl, blobBytes]
 */
async function compressToBudget(dataUrl) {
  const img = await dataUrlToImage(dataUrl)
  let width = Math.max(MIN_WIDTH, img.naturalWidth)
  let quality = 0.85
  let out = ''
  for (let i = 0; i < 8; i++) {
    out = imageToJpegDataUrl(img, width, quality)
    // dataUrl base64 长度反推字节数：约 3/4 倍
    const bytes = Math.floor((out.length - out.indexOf(',') - 1) * 3 / 4)
    if (bytes <= MAX_BYTES) return { dataUrl: out, bytes }
    if (quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - 0.12)
    } else {
      width = Math.round(width * 0.88)
    }
  }
  return { dataUrl: out, bytes: Math.floor((out.length - out.indexOf(',') - 1) * 3 / 4) }
}

/**
 * dataUrl → Blob（用于 FormData）
 */
function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',')
  const mime = /data:([^;]+);base64/.exec(meta)[1]
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

/**
 * 调 OCR.Space。Capacitor 原生走 CapacitorHttp，浏览器回退 fetch + FormData。
 */
async function callOcrSpace(fileBlob, fileName) {
  let res
  if (Capacitor.isNativePlatform()) {
    // CapacitorHttp 不直接支持 multipart/file，把 Blob 转 base64 用 base64Image 字段
    // OCR.Space 支持 base64Image: data:image/jpeg;base64,xxxx
    const reader = new FileReader()
    const dataUrl = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(fileBlob)
    })
    res = await CapacitorHttp.post({
      url: ENDPOINT,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: {
        apikey: APIKEY,
        language: 'chs',
        OCREngine: '2',
        isOverlayRequired: 'false',
        scale: 'true',
        base64Image: dataUrl
      },
      connectTimeout: 30000,
      readTimeout: 30000
    })
  } else {
    const fd = new FormData()
    fd.append('apikey', APIKEY)
    fd.append('language', 'chs')
    fd.append('OCREngine', '2')
    fd.append('isOverlayRequired', 'false')
    fd.append('scale', 'true')
    fd.append('file', fileBlob, fileName || 'ticket.jpg')
    res = await fetch(ENDPOINT, { method: 'POST', body: fd })
  }

  if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
  // CapacitorHttp 返回结构 { status, data, headers }，data 可能是对象或字符串
  const j = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
  if (!j || j.IsErroredOnProcessing) {
    const msg = (j && (j.ErrorMessage || j.ErrorDetails)) || '在线 OCR 接口返回错误'
    throw new Error(Array.isArray(msg) ? msg.join('; ') : String(msg))
  }
  if (j.OCRExitCode !== 1 && j.OCRExitCode !== '1') {
    throw new Error(`OCRExitCode=${j.OCRExitCode}（${j.ErrorMessage || ''}）`)
  }
  const first = Array.isArray(j.ParsedResults) && j.ParsedResults[0]
  if (!first) throw new Error('在线 OCR 未返回识别结果')
  if (first.FileParseExitCode !== 1 && first.FileParseExitCode !== '1') {
    throw new Error(`文件解析失败: ${first.ErrorMessage || ''}`)
  }
  return String(first.ParsedText || '').trim()
}

/**
 * 主入口：识别 dataUrl 图像，返回 { text, raw, meta, stats }
 * - text: 提取的纯文本（按行整理，剔除空行/装饰字符），给 parseAndCheck 解析
 * - raw: OCR 原始返回（调试/手动校对用）
 * - meta (v1.9.6): { gameKey, gameName, issue, drawDate, playHint, foundAny }
 *   由 ocr-meta.js 二次解析票面头部"双色球 销售期 2023013 开奖日期 2023-02-07"等字段
 * - stats (v1.9.6): { totalLines, candidateLines } 检测出的票面注数（粗）
 *   用来对账"上传了 X 注但只解析出 Y 注"—— 漏识别警告
 */
export async function recognizeTicketOnline(dataUrl, onProgress) {
  if (!dataUrl) throw new Error('未提供图片')

  if (onProgress) onProgress('压缩图片…')
  const { dataUrl: compressed, bytes } = await compressToBudget(dataUrl)

  if (onProgress) onProgress(`在线识别中…（${(bytes / 1024).toFixed(0)}KB）`)
  const blob = dataUrlToBlob(compressed)
  const raw = await callOcrSpace(blob, 'ticket.jpg')

  if (onProgress) onProgress('整理号码…')
  // OCR 原始文本按行整理，剔除纯装饰行
  const text = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')

  // v1.9.6：提取票面元数据 + 行数估算（用于 FileCheck 漏注警告/精准当期核对）
  const meta = extractTicketMeta(text)
  const totalLines = String(text).split(/\r?\n/).filter(Boolean).length
  const candidateLines = countOcrLines(text)

  return { text, raw, meta, stats: { totalLines, candidateLines } }
}

// debug hook：把 online OCR 入口挂到 window，方便 CDP 注入测试
// 生产环境无副作用（仅多一个 window 属性，可后续移除）
if (typeof window !== 'undefined') {
  window.__ocrOnline = recognizeTicketOnline
}
