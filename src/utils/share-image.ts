// 选号结果分享图：用 Canvas 2D API 绘制（不引入 html2canvas 等第三方库）。
// 两个调用点：MyPicks.vue（保存成功后）与 AiPicker.vue（生成结果后）。
//
// 画布固定 750×1000：
//   顶部  彩种名称 + 日期
//   中部  号码球（红色渐变圆 + 白色数字；蓝色渐变圆）
//   底部  免责声明
// 绘制完成后调用方用 canvas.toDataURL('image/png') 生成图片预览/保存。

const W = 750
const H = 1000

/** 把形态各异的 ticket 归一化为展示行：每行 { red: number[], blue: number[] } */
function normalizeLines(cfg: any, ticket: any) {
  if (!ticket) return []
  const lines: Array<{ red: number[]; blue: number[] }> = []
  const isDirect = cfg.playMode === 'direct'

  const pushDirect = (digits: any, tail: any) => {
    lines.push({
      red: Array.isArray(digits) ? digits.map(Number) : [],
      blue: tail != null ? [Number(tail)] : []
    })
  }
  const pushLotto = (red: any, blue: any) => {
    lines.push({
      red: Array.isArray(red) ? red.map(Number) : [],
      blue: Array.isArray(blue) ? blue.map(Number) : []
    })
  }

  if (isDirect) {
    if (ticket.type === 'multi' && Array.isArray(ticket.tickets)) {
      ticket.tickets.forEach((t: any) => pushDirect(t.digits, t.tail))
    } else if (ticket.type === 'duplex' && Array.isArray(ticket.digits)) {
      // 定位复式：取每位第一个可选数字作为代表展示行
      pushDirect(ticket.digits.map((arr: any) => (Array.isArray(arr) && arr.length ? arr[0] : 0)), ticket.tail)
    } else if (Array.isArray(ticket.digits)) {
      pushDirect(ticket.digits, ticket.tail)
    }
    return lines
  }

  if (ticket.type === 'multi' && Array.isArray(ticket.tickets)) {
    ticket.tickets.forEach((t: any) => pushLotto(t.red, t.blue))
  } else if (ticket.type === 'danTuo') {
    pushLotto([...(ticket.danRed || []), ...(ticket.tuoRed || [])], ticket.blue || [])
  } else if (Array.isArray(ticket.red)) {
    pushLotto(ticket.red, ticket.blue || [])
  }
  return lines
}

function drawBall(ctx: any, cx: number, cy: number, r: number, text: string, color: string) {
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.15, cx, cy, r)
  if (color === 'red') {
    g.addColorStop(0, '#ff9a8a')
    g.addColorStop(1, '#d92b3f')
  } else if (color === 'amber') {
    g.addColorStop(0, '#ffd54f')
    g.addColorStop(1, '#f57c00')
  } else {
    g.addColorStop(0, '#8fc0ff')
    g.addColorStop(1, '#1d5ad4')
  }
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${Math.round(r * 0.95)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, cx, cy + r * 0.05)
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

/**
 * 绘制分享图到指定 canvas。
 * @param {HTMLCanvasElement} canvas 目标画布（函数内会设置其宽高为 750×1000）
 * @param {object} cfg 彩种配置（GAME_CONFIG 项）
 * @param {object} ticket 选号票（single/multi/duplex/danTuo）
 * @param {string} date 顶部展示日期文本
 */
export function drawShareImage(canvas: any, cfg: any, ticket: any, date: string) {
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 背景渐变
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#1d2745')
  bg.addColorStop(1, '#101731')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // 顶部光晕
  const glow = ctx.createRadialGradient(W / 2, -80, 40, W / 2, -80, 420)
  glow.addColorStop(0, 'rgba(246,196,83,0.35)')
  glow.addColorStop(1, 'rgba(246,196,83,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, 360)

  // 顶部：彩种名称
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 56px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(cfg.name || '彩票选号', W / 2, 120)

  // 顶部：日期
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.font = '26px system-ui, sans-serif'
  ctx.fillText(date, W / 2, 178)

  // 中间：号码球
  const lines = normalizeLines(cfg, ticket).slice(0, 6)
  if (lines.length) {
    const top = 260
    const rowGap = 110
    lines.forEach((line, li) => {
      const balls = [
        ...line.red.map((n) => ({ n, c: 'red' })),
        ...line.blue.map((n) => ({ n, c: 'blue' }))
      ]
      if (!balls.length) return
      // 根据球数自适应直径与间距，保证一行不超宽
      const maxBalls = 10
      const r = balls.length > maxBalls ? 26 : balls.length > 7 ? 30 : 34
      const gap = r * 0.45
      const totalW = balls.length * r * 2 + (balls.length - 1) * gap
      let startX = (W - totalW) / 2 + r
      const y = top + li * rowGap + r
      balls.forEach((b) => {
        const text = cfg.playMode === 'direct' ? String(b.n) : pad2(b.n)
        drawBall(ctx, startX, y, r, text, b.c)
        startX += r * 2 + gap
      })
    })
  }

  // 底部免责声明
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(60, H - 150)
  ctx.lineTo(W - 60, H - 150)
  ctx.stroke()

  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '24px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('彩票为独立随机事件，仅供参考', W / 2, H - 100)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = '20px system-ui, sans-serif'
  ctx.fillText('理性购彩 · 量力而行', W / 2, H - 64)

  // 底部品牌小字
  ctx.fillStyle = 'rgba(246,196,83,0.8)'
  ctx.font = 'bold 22px system-ui, sans-serif'
  ctx.fillText('彩票选号器', W / 2, H - 30)
}

/** 把已绘制好的 canvas 导出为 PNG 并触发下载（移动端 WebView 下 a.download 同样可用） */
export function downloadShareImage(canvas: any, filename?: string) {
  const url = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `选号分享-${new Date().toISOString().slice(0, 10)}.png`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/** 当前日期字符串（顶部展示用） */
export function todayText() {
  const d = new Date()
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
