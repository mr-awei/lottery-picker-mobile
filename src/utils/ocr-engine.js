/**
 * ocr-engine.js
 * ------------------------------------------------------------
 * 本地离线 OCR 引擎（Tesseract.js@5.1.1，兼容 WebView 83）。
 * 完全离线：core wasm 与 eng 语言包都从 public/ 本地加载，不联网。
 *
 * 设计：
 *  1. 懒加载并复用单个 worker（首识较慢，后续复用快）
 *  2. 两张策略结合：
 *     a) 全局识别：整图直接 recognize，拿到整体文本（兜底）
 *     b) 逐球识别：HSV 阈值分割红/蓝球 → 轮廓裁剪单个球 →
 *        反色 + 放大 + 二值化 → 逐球识别数字（主力，准确率高）
 *  3. 返回文本（每行一注，空格/逗号分隔），交给 FileCheck 的 parseAndCheck 解析
 * ------------------------------------------------------------
 */

// tesseract.js 改为动态 import（1.8.3 瘦身）：ocr-engine 本身已是被 dynamic import 的兜底模块，
// createWorker 也动态加载，tesseract.js 主体才能被 Vite 拆出主 bundle，
// 在线 OCR 为主路径时主包不再携带 tesseract（瘦身数百 KB）

const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/'
const CORE_PATH = `${BASE}tesseract/tesseract-core-lstm.wasm.js`
const LANG_PATH = `${BASE}tessdata`
const WORKER_PATH = `${BASE}tesseract/worker.min.js`

let workerPromise = null
let worker = null

/**
 * 获取（懒加载）单例 worker。
 * - OEM=1：LSTM 模型，对应本地 tesseract-core-lstm.wasm.js（eng 4.0.0 数据是 LSTM 格式，
 *   用 legacy core 会 init failed，必须用 lstm core）。
 * - gzip:false：APK 内 AAPT 已把 .gz 解压为无后缀 eng.traineddata，
 *   故让 worker 直接拼 eng.traineddata（不带 .gz）去 fetch。
 * corePath / langPath 指向本地文件实现离线。
 */
function getWorker(onProgress) {
  if (worker) return Promise.resolve(worker)
  if (workerPromise) return workerPromise

  workerPromise = (async () => {
    try {
      const { createWorker } = await import('tesseract.js')
      const w = await createWorker('eng', 1, {
        workerPath: WORKER_PATH,
        corePath: CORE_PATH,
        langPath: LANG_PATH,
        gzip: false,
        logger: (m) => {
          if (onProgress && m && m.status) {
            const map = {
              loading: '加载 OCR 模型…',
              initializing: '初始化引擎…',
              'downloading lang': '加载语言包…',
              recognizing: '识别中…'
            }
            onProgress(map[m.status] || `OCR: ${m.status}`)
          }
        }
      })
      worker = w
      return w
    } catch (e) {
      workerPromise = null
      throw new Error('OCR worker 初始化失败: ' + (e && e.message ? e.message : e))
    }
  })()

  return workerPromise
}

/**
 * 把图片 dataUrl 画到 canvas，返回 { canvas, ctx, width, height }
 */
function loadToCanvas(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0)
      resolve({ canvas, ctx, width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = (e) => reject(new Error('图片加载失败'))
    img.src = dataUrl
  })
}

/**
 * HSV 阈值分割彩色球（彩票红/蓝球）。
 * 返回候选球区域数组 [{x,y,w,h}]（已按位置简单排序）。
 * 简化实现：直接对红/蓝两色分别阈值二值化，再做连通域/轮廓近似。
 */
function findBalls(ctx, width, height) {
  const imgData = ctx.getImageData(0, 0, width, height)
  const data = imgData.data

  // 阈值：红球（红高、绿蓝低），蓝球（蓝高、红绿低）
  const balls = []
  const visited = new Uint8Array(width * height)

  // 颜色判定函数：返回 0=非球 1=红球 2=蓝球
  function colorClass(r, g, b) {
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const sat = max === 0 ? 0 : (max - min) / max
    if (sat < 0.35) return 0 // 灰度/白底，不是彩色球
    if (r > 110 && r > g * 1.6 && r > b * 1.4) return 1 // 红
    if (b > 110 && b > r * 1.3 && b > g * 1.2) return 2 // 蓝
    return 0
  }

  // 修复（1.8.3）：isBall 存 colorClass 原值（1=红 2=蓝），原来 `? 1 : 0` 把蓝球也标成 1，
  // 导致蓝球识别结果混入红球组（cls 恒为 1）
  const isBall = new Uint8Array(width * height)
  for (let i = 0; i < data.length; i += 4) {
    const idx = i / 4
    isBall[idx] = colorClass(data[i], data[i + 1], data[i + 2])
  }

  // 连通域（4 邻域）提取候选球
  const stack = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (isBall[idx] && !visited[idx]) {
        // BFS
        let minX = x, minY = y, maxX = x, maxY = y, count = 0
        stack.length = 0
        stack.push(idx)
        visited[idx] = 1
        while (stack.length) {
          const cur = stack.pop()
          const cx = cur % width
          const cy = (cur / width) | 0
          count++
          if (cx < minX) minX = cx
          if (cx > maxX) maxX = cx
          if (cy < minY) minY = cy
          if (cy > maxY) maxY = cy
          // 4 邻域（修复：原来的左右邻居判定条件恒为 true 直接 continue，
          // 导致连通域只沿垂直扩展、横排红球分裂成多个区域）
          const neigh = [cur - 1, cur + 1, cur - width, cur + width]
          for (const n of neigh) {
            if (n < 0 || n >= width * height) continue
            const dc = Math.abs((n % width) - cx)
            const dv = Math.abs(n - cur)
            // 左右邻居必须同行（dc===1），上下邻居必须差 width；防行首/行尾回绕误连
            if (!((dc === 1 && dv === 1) || dv === width)) continue
            if (isBall[n] && !visited[n]) {
              visited[n] = 1
              stack.push(n)
            }
          }
        }
        const w = maxX - minX + 1
        const h = maxY - minY + 1
        // 过滤：太小（噪点）或太大（整片背景）的连通域
        const areaRatio = count / (w * h)
        if (count > 80 && w > 12 && h > 12 && w < width * 0.9 && h < height * 0.9 && areaRatio > 0.45) {
          balls.push({ x: minX, y: minY, w, h, cls: isBall[idx] })
        }
      }
    }
  }

  // 按从上到下、从左到右排序（票面通常红球一排、蓝球一排）
  balls.sort((a, b) => (a.y - b.y) || (a.x - b.x))
  return balls
}

/**
 * 裁剪单个球 → 反色（白数字变黑） + 放大 → 返回 dataUrl 供 Tesseract 识别
 */
function cropBallCanvas(ctx, ball, scale = 3) {
  const pad = Math.round(Math.min(ball.w, ball.h) * 0.15)
  const sx = Math.max(0, ball.x - pad)
  const sy = Math.max(0, ball.y - pad)
  const sw = ball.w + pad * 2
  const sh = ball.h + pad * 2
  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = sw
  srcCanvas.height = sh
  const sctx = srcCanvas.getContext('2d')
  sctx.drawImage(ctx.canvas, sx, sy, sw, sh, 0, 0, sw, sh)

  // 反色 + 灰度（白字黑底 → 黑字白底）
  const imgData = sctx.getImageData(0, 0, sw, sh)
  const d = imgData.data
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2]
    const gray = (r + g + b) / 3
    // 球内是彩色底 + 白数字，反色后白底黑字
    const inv = 255 - gray
    d[i] = d[i + 1] = d[i + 2] = inv
  }
  sctx.putImageData(imgData, 0, 0)

  // 放大
  const out = document.createElement('canvas')
  out.width = sw * scale
  out.height = sh * scale
  const octx = out.getContext('2d')
  octx.imageSmoothingEnabled = true
  octx.drawImage(srcCanvas, 0, 0, out.width, out.height)
  return out
}

/**
 * 识别单图（dataUrl）。返回 { text, balls: [{cls, text}] }
 */
export async function recognizeTicket(dataUrl, onProgress) {
  if (onProgress) onProgress('加载图片…')
  const { canvas, ctx, width, height } = await loadToCanvas(dataUrl)

  const w = await getWorker(onProgress)
  if (onProgress) onProgress('识别中…')

  // 1) 全局识别（兜底）
  const globalRes = await w.recognize(canvas)
  const globalText = globalRes.data.text || ''

  // 2) 逐球识别（主力）
  let balls = []
  try {
    balls = findBalls(ctx, width, height)
  } catch (e) {
    console.warn('findBalls failed, fallback to global only', e)
  }

  const ballResults = []
  for (const ball of balls) {
    try {
      const ballCanvas = cropBallCanvas(ctx, ball, 3)
      const res = await w.recognize(ballCanvas)
      const txt = (res.data.text || '').replace(/[^0-9]/g, '').slice(0, 2)
      if (txt) ballResults.push({ cls: ball.cls, text: txt })
    } catch (e) {
      // 单球失败忽略
    }
  }

  // 3) 合并：优先用逐球结果（红球组 + 蓝球组），否则用全局文本
  let text = ''
  if (ballResults.length >= 4) {
    // 假设前面是红球、后面是蓝球（按排序），简单按数量切分：前 N 红后 M 蓝
    const reds = ballResults.filter((b) => b.cls === 1).map((b) => b.text)
    const blues = ballResults.filter((b) => b.cls === 2).map((b) => b.text)
    const parts = []
    if (reds.length) parts.push(reds.join(' '))
    if (blues.length) parts.push(blues.join(' '))
    text = parts.join(' | ')
  } else {
    text = globalText.trim()
  }

  return { text, globalText, ballCount: balls.length, ballResults }
}

/** 释放 worker（页面卸载或重试时调用） */
export async function terminateOcr() {
  if (worker) {
    await worker.terminate()
    worker = null
    workerPromise = null
  }
}
