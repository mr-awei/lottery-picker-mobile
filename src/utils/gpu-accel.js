// gpu-accel.js —— 选号加速后端调度（多线程加速，不是噱头）
//
// 设计原则（1.8.1 重构）：
// 1. 改名"GPU 加速" → "多线程加速"。原 WebGPU 路径在 Capacitor Android 上因
//    navigator.gpu 不可用而走不到，因此主路径是 Web Worker 多线程——叫"GPU 加速"
//    会误导用户。WebGPU 内核作为可选增强保留，检测到 navigator.gpu + 安全上下文 +
//    adapter 可用时才启用，UI 如实标注。
// 2. 真并行：探测 navigator.hardwareConcurrency，按 [2, 4] clamp 后并行起 N 个
//    Worker，每个 Worker 跑自己区间 [from, to) = cap/N。暴力模式各 Worker 内部
//    各累计 freq，回主线程合并。这是真"放线"，不是单 Worker 假并行。
// 3. UI 后端标签：worker 后端显示"多线程加速"或"多线程加速（N 核并行）"；
//    WebGPU 后端显示"GPU 计算"；开关关闭显示"已关闭"。
//
// 开关：localStorage lp-accel-mt（兼容旧 lp-gpu-accel），默认关闭——用户主动开启。

const ACCEL_KEY = 'lp-accel-mt'
const ACCEL_KEY_LEGACY = 'lp-gpu-accel'

function readAccelOn() {
  try {
    if (localStorage.getItem(ACCEL_KEY) === 'on') return true
    if (localStorage.getItem(ACCEL_KEY) === 'off') return false
    // 兼容旧 key 一次性迁移
    const legacy = localStorage.getItem(ACCEL_KEY_LEGACY)
    if (legacy === 'on') { localStorage.setItem(ACCEL_KEY, 'on'); return true }
    if (legacy === 'off') { localStorage.setItem(ACCEL_KEY, 'off'); return false }
  } catch (e) {}
  return false
}

function writeAccelOn(on) {
  try { localStorage.setItem(ACCEL_KEY, on ? 'on' : 'off') } catch (e) {}
}

export function isAccelEnabled() { return readAccelOn() }
export function setAccelEnabled(on) {
  writeAccelOn(on)
  try { window.dispatchEvent(new CustomEvent('lp-accel-change', { detail: { enabled: on } })) } catch (e) {}
}

let _gpuProbed = null // 'webgpu' | 'none'

// 探测 WebGPU 是否真正可用
export async function probeWebGPU() {
  if (_gpuProbed) return _gpuProbed
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    _gpuProbed = 'none'
    return _gpuProbed
  }
  const isSecure = typeof window !== 'undefined' &&
    (window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost')
  if (!isSecure) {
    _gpuProbed = 'none'
    return _gpuProbed
  }
  try {
    const adapter = await navigator.gpu.requestAdapter()
    _gpuProbed = adapter ? 'webgpu' : 'none'
  } catch (e) {
    _gpuProbed = 'none'
  }
  return _gpuProbed
}

export function workerSupported() {
  return typeof Worker !== 'undefined'
}

// 探测可启动的并行 Worker 数（[2, 4] clamp）
export function probeParallelism() {
  let cores = 2
  if (typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number') {
    cores = Math.max(1, Math.floor(navigator.hardwareConcurrency))
  }
  return Math.max(2, Math.min(4, cores))
}

// 返回当前实际可启用的后端（不考虑用户开关）
export async function detectBackend() {
  const gpu = await probeWebGPU()
  if (gpu === 'webgpu') return 'webgpu'
  if (workerSupported()) return 'worker'
  return 'none'
}

// 给用户/UI 显示的后端标签
export async function getBackendLabel() {
  if (!isAccelEnabled()) return '已关闭'
  const b = await detectBackend()
  if (b === 'webgpu') return 'GPU 计算（需设备支持）'
  if (b === 'worker') {
    const n = probeParallelism()
    return '多线程加速（' + n + ' 核并行）'
  }
  return '已关闭（设备不支持）'
}

// ============================================================
// WebGPU compute 内核（保留为可选增强，仅在 webgpu 后端启用）
// 每个 invocation 独立生成+评分一注，主线程精细评分择优。
// ============================================================
const WGSL = `
struct Params {
  redMax: u32,
  redCount: u32,
  blueMax: u32,
  blueCount: u32,
  target: u32,
  total: u32,
  seed: u32,
  lockRedCount: u32,
  lockBlueCount: u32,
  zoneEdge0: u32,
  zoneEdge1: u32,
  sumMin: u32,
  sumMax: u32,
  sizeSplit: u32,
  primeMask: u32,
  outStride: u32,
  _pad0: u32,
  _pad1: u32,
};

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> lockRed: array<u32>;
@group(0) @binding(2) var<storage, read> lockBlue: array<u32>;
@group(0) @binding(3) var<storage, read_write> outScores: array<f32>;
@group(0) @binding(4) var<storage, read_write> outReds: array<u32>;
@group(0) @binding(5) var<storage, read_write> outBlues: array<u32>;

fn hash(state: u32) -> u32 {
  var x = state;
  x = x ^ (x >> 16u);
  x = x * 0x7feb352du;
  x = x ^ (x >> 15u);
  x = x * 0x846ca68bu;
  x = x ^ (x >> 16u);
  return x;
}

fn isPrime(n: u32) -> bool {
  let m = 1u << n;
  return (P.primeMask & m) != 0u;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = gid.x;
  var rng = hash(P.seed ^ (id * 2654435761u) ^ (id << 13u));

  var reds: array<u32, 80>;
  var picked: array<bool, 80>;
  for (var i = 0u; i < 80u; i = i + 1u) { picked[i] = false; }

  var need = P.redCount;
  var rc = 0u;
  for (var k = 0u; k < P.lockRedCount; k = k + 1u) {
    let v = lockRed[k];
    reds[rc] = v;
    picked[v] = true;
    rc = rc + 1u;
  }
  need = need - rc;

  var tries = 0u;
  loop {
    if (rc >= P.redCount) { break; }
    if (tries > 4096u) { break; }
    tries = tries + 1u;
    rng = hash(rng + id + 1u);
    let cand = (rng % P.redMax) + 1u;
    if (cand < 1u || cand > P.redMax) { continue; }
    if (picked[cand]) { continue; }
    reds[rc] = cand;
    picked[cand] = true;
    rc = rc + 1u;
  }
  for (var c = 1u; c <= P.redMax && rc < P.redCount; c = c + 1u) {
    if (!picked[c]) { reds[rc] = c; picked[c] = true; rc = rc + 1u; }
  }

  for (var a = 0u; a < P.redCount; a = a + 1u) {
    for (var b = a + 1u; b < P.redCount; b = b + 1u) {
      if (reds[a] > reds[b]) { let t = reds[a]; reds[a] = reds[b]; reds[b] = t; }
    }
  }

  var blues: array<u32, 20>;
  var bpicked: array<bool, 20>;
  for (var i = 0u; i < 20u; i = i + 1u) { bpicked[i] = false; }
  var bc = 0u;
  for (var k = 0u; k < P.lockBlueCount; k = k + 1u) {
    let v = lockBlue[k];
    blues[bc] = v; bpicked[v] = true; bc = bc + 1u;
  }
  var btries = 0u;
  loop {
    if (bc >= P.blueCount) { break; }
    if (btries > 1024u) { break; }
    btries = btries + 1u;
    rng = hash(rng + id + 7u);
    let cand = (rng % P.blueMax) + 1u;
    if (cand < 1u || cand > P.blueMax) { continue; }
    if (bpicked[cand]) { continue; }
    blues[bc] = cand; bpicked[cand] = true; bc = bc + 1u;
  }
  for (var c = 1u; c <= P.blueMax && bc < P.blueCount; c = c + 1u) {
    if (!bpicked[c]) { blues[bc] = c; bpicked[c] = true; bc = bc + 1u; }
  }

  var sum = 0u;
  var odds = 0u;
  var bigs = 0u;
  var primes = 0u;
  var zones = vec3<u32>(0u, 0u, 0u);
  var routes = vec3<u32>(0u, 0u, 0u);
  var spanMin = 99u; var spanMax = 0u;
  var tailCnt = array<u32, 10>(0u,0u,0u,0u,0u,0u,0u,0u,0u,0u);
  for (var i = 0u; i < P.redCount; i = i + 1u) {
    let n = reds[i];
    sum = sum + n;
    if (n % 2u == 1u) { odds = odds + 1u; }
    if (n > P.sizeSplit) { bigs = bigs + 1u; }
    if (isPrime(n)) { primes = primes + 1u; }
    if (n <= P.zoneEdge0) { zones.x = zones.x + 1u; }
    else if (n <= P.zoneEdge1) { zones.y = zones.y + 1u; }
    else { zones.z = zones.z + 1u; }
    routes[n % 3u] = routes[n % 3u] + 1u;
    if (n < spanMin) { spanMin = n; }
    if (n > spanMax) { spanMax = n; }
    tailCnt[n % 10u] = tailCnt[n % 10u] + 1u;
  }
  let fsum = f32(sum);
  let mid = f32((P.sumMin + P.sumMax) / 2u);
  let spanRange = max(1u, P.sumMax - P.sumMin);
  let sumScore = clamp(100.0 - (abs(fsum - mid) / f32(spanRange)) * 220.0, 0.0, 100.0);
  let targetOdd = f32(P.redCount) / 2.0;
  let oddScore = clamp(100.0 - abs(f32(odds) - targetOdd) * 25.0, 0.0, 100.0);
  let targetBig = f32(P.redCount) / 2.0;
  let sizeScore = clamp(100.0 - abs(f32(bigs) - targetBig) * 30.0, 0.0, 100.0);
  let primeScore = clamp(100.0 - abs(f32(primes) - 2.0) * 28.0, 0.0, 100.0);
  let span = select(0u, spanMax - spanMin, spanMax > spanMin);
  let spanScore = clamp(100.0 - abs(f32(span) - 23.0) * 6.0, 0.0, 100.0);
  var tailPairs = 0.0;
  for (var t = 0u; t < 10u; t = t + 1u) { tailPairs = tailPairs + f32(tailCnt[t] > 1u ? (tailCnt[t] - 1u) : 0u); }
  let tailScore = clamp(100.0 - tailPairs * 22.0, 0.0, 100.0);
  let zoneScore = clamp(100.0 - f32(abs(i32(zones.x) - i32(P.redCount)/3) + abs(i32(zones.y) - i32(P.redCount)/3) + abs(i32(zones.z) - i32(P.redCount)/3)) * 8.0, 0.0, 100.0);

  let total = sumScore * 0.30 + oddScore * 0.18 + sizeScore * 0.16 + primeScore * 0.10 + spanScore * 0.10 + tailScore * 0.08 + zoneScore * 0.08;

  outScores[id] = total;
  let base = id * P.outStride;
  for (var i = 0u; i < P.redCount; i = i + 1u) { outReds[base + i] = reds[i]; }
  for (var i = 0u; i < P.blueCount; i = i + 1u) { outBlues[base + i] = blues[i]; }
}
`

async function runWebGPU(cfg, draws, play, methods, target, cap, violent, onProgress) {
  const adapter = await navigator.gpu.requestAdapter()
  const device = await adapter.requestDevice()
  const module = device.createShaderModule({ code: WGSL })
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'main' }
  })

  const redMax = cfg.redMax
  const blueMax = cfg.blueMax
  const outStride = Math.max(cfg.redCount, cfg.blueCount) + 1
  let primeMask = 0
  ;[2,3,5,7,11,13,17,19,23,29,31].forEach((p) => { if (p <= redMax) primeMask |= (1 << p) })

  const lockedRed = (play && play.locked && play.locked.red) || []
  const lockedBlue = (play && play.locked && play.locked.blue) || []

  const paramsData = new Uint32Array([
    redMax, cfg.redCount, blueMax, cfg.blueCount, target, (draws && draws.length) || 0,
    (Math.random() * 0xffffffff) >>> 0,
    lockedRed.length, lockedBlue.length,
    cfg.zoneEdges ? cfg.zoneEdges[0] : Math.floor(redMax/3),
    cfg.zoneEdges ? cfg.zoneEdges[1] : Math.floor(redMax*2/3),
    cfg.sumMin || 0, cfg.sumMax || redMax*cfg.redCount,
    cfg.sizeSplit || Math.floor(redMax/2),
    primeMask, outStride, 0, 0
  ])
  const paramBuf = device.createBuffer({ size: paramsData.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  device.queue.writeBuffer(paramBuf, 0, paramsData)

  const lockRedBuf = device.createBuffer({ size: Math.max(4, lockedRed.length*4), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
  device.queue.writeBuffer(lockRedBuf, 0, new Uint32Array(lockedRed))
  const lockBlueBuf = device.createBuffer({ size: Math.max(4, lockedBlue.length*4), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
  device.queue.writeBuffer(lockBlueBuf, 0, new Uint32Array(lockedBlue))

  const workgroups = Math.ceil(cap / 64)
  const realCap = workgroups * 64
  const scoreBuf = device.createBuffer({ size: realCap*4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })
  const redBuf = device.createBuffer({ size: realCap*outStride*4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })
  const blueBuf = device.createBuffer({ size: realCap*outStride*4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })

  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: paramBuf } },
      { binding: 1, resource: { buffer: lockRedBuf } },
      { binding: 2, resource: { buffer: lockBlueBuf } },
      { binding: 3, resource: { buffer: scoreBuf } },
      { binding: 4, resource: { buffer: redBuf } },
      { binding: 5, resource: { buffer: blueBuf } }
    ]
  })

  const enc = device.createCommandEncoder()
  const pass = enc.beginComputePass()
  pass.setPipeline(pipeline)
  pass.setBindGroup(0, bind)
  pass.dispatchWorkgroups(workgroups)
  pass.end()
  device.queue.submit([enc.finish()])

  const scoreRead = new Float32Array(realCap)
  const redRead = new Uint32Array(realCap*outStride)
  const blueRead = new Uint32Array(realCap*outStride)
  await scoreBuf.mapAsync(GPUMapMode.READ)
  await redBuf.mapAsync(GPUMapMode.READ)
  await blueBuf.mapAsync(GPUMapMode.READ)
  scoreRead.set(new Float32Array(scoreBuf.getMappedRange()))
  redRead.set(new Uint32Array(redBuf.getMappedRange()))
  blueRead.set(new Uint32Array(blueBuf.getMappedRange()))
  scoreBuf.unmap(); redBuf.unmap(); blueBuf.unmap()

  const { scoreTicketPlay, computeStats } = await import('./picker-engine')
  const s = computeStats(cfg, draws || [])
  let best = null
  let hitOnce = false
  const step = Math.max(1, Math.floor(cap / 200))
  for (let i = 0; i < cap; i++) {
    const ticket = {
      type: play.type,
      red: Array.from({ length: cfg.redCount }, (_, k) => redRead[i * outStride + k]),
      blue: Array.from({ length: cfg.blueCount }, (_, k) => blueRead[i * outStride + k])
    }
    const scored = scoreTicketPlay(cfg, draws, ticket, s)
    const total = scored.total
    if (!best || total > best.total) best = { ...scored, ticket, attempts: i + 1 }
    if (total >= target) {
      best = { ...scored, ticket, attempts: i + 1, hitTarget: true }
      hitOnce = true
      if (!violent) { return { ...best, stopped: false } }
    }
    if (onProgress && i % step === 0) onProgress(i + 1, best)
  }
  if (best) { if (!hitOnce) best.hitTarget = false }
  return best
}

// ============================================================
// 多 Worker 并行加速：起 N 个 worker，各跑 [from, to) 区间
// 主线程汇总：max(total) 的 best；暴力模式合并 freq。
// ============================================================
function buildRangePlan(cap, n) {
  // cap / n 分配，余数放到最后一个 worker
  const base = Math.floor(cap / n)
  const ranges = []
  let cur = 0
  for (let k = 0; k < n; k++) {
    const len = (k === n - 1) ? (cap - cur) : base
    if (len <= 0) break
    ranges.push([cur, cur + len]) // [from, to)
    cur += len
  }
  return ranges
}

function runWorkerRange(cfg, draws, play, methods, target, from, to, violent, onProgress, workerRef) {
  return new Promise((resolve, reject) => {
    let worker
    try {
      worker = new Worker(new URL('./picker-worker.js', import.meta.url), { type: 'module' })
      if (workerRef) workerRef.worker = worker
    } catch (e) { reject(e); return }
    worker.onmessage = (e) => {
      const m = e.data
      if (m.type === 'progress') {
        if (onProgress) onProgress(from + m.count, m.count, m.total, from, to)
      } else if (m.type === 'done') {
        worker.terminate()
        resolve({ ...(m.result || {}), _from: m.from, _to: m.to })
      } else if (m.type === 'error') {
        worker.terminate()
        reject(new Error(m.message))
      }
    }
    worker.onerror = (err) => { worker.terminate(); reject(err) }
    worker.postMessage({
      type: 'start',
      cfg: JSON.parse(JSON.stringify(cfg)),
      draws: JSON.parse(JSON.stringify(draws || [])),
      play: JSON.parse(JSON.stringify(play)),
      methods,
      target,
      from,
      to,
      violent
    })
  })
}

// 汇总 N 个 worker 的 best
function pickBest(parts) {
  let best = null
  for (const p of parts) {
    if (!p) continue
    if (!best || (typeof p.total === 'number' && p.total > best.total)) {
      best = { ...p }
    }
  }
  return best
}

// 合并暴力频次
function mergeFreq(parts) {
  const out = {}
  for (const p of parts) {
    if (!p || !p.freq) continue
    for (const k in p.freq) {
      out[k] = (out[k] || 0) + p.freq[k]
    }
  }
  return Object.keys(out).length ? out : null
}

async function runWorkerParallel(cfg, draws, play, methods, target, cap, violent, onProgress, onTicket, stopCheck) {
  const n = probeParallelism()
  const effectiveN = Math.min(n, Math.max(1, Math.min(cap, 4))) // cap 太小时不开多 Worker
  const ranges = buildRangePlan(cap, effectiveN)
  const workerRefs = ranges.map(() => ({ worker: null }))

  const checkStop = setInterval(() => {
    if (stopCheck && stopCheck()) {
      workerRefs.forEach((r) => {
        if (r.worker) try { r.worker.postMessage({ type: 'cancel' }) } catch (e) {}
      })
    }
  }, 80)

  try {
    const tasks = ranges.map(([from, to], idx) => runWorkerRange(
      cfg, draws, play, methods, target, from, to, violent,
      (absCount, kCount, kTotal, kFrom, kTo) => {
        if (onProgress) onProgress(absCount, { totalRuns: cap })
      },
      workerRefs[idx]
    ))
    const parts = await Promise.all(tasks)
    const best = pickBest(parts)
    if (!best) return null
    // 合并暴力 freq
    const freq = violent ? mergeFreq(parts) : null
    if (freq) best.freq = freq
    return best
  } finally {
    clearInterval(checkStop)
    workerRefs.forEach((r) => {
      if (r.worker) try { r.worker.terminate() } catch (e) {}
    })
  }
}

// 统一入口：开启且后端可用时返回 Promise<best>，否则返回 null（调用方回退主线程 generateUntil）
export async function runAccelerated(cfg, draws, play, methods, target, cap, violent, onProgress, onTicket, stopCheck) {
  if (!isAccelEnabled()) return null
  const backend = await detectBackend()
  if (backend === 'webgpu') {
    try {
      return await runWebGPU(cfg, draws, play, methods, target, cap, violent, onProgress)
    } catch (e) {
      console.warn('[gpu-accel] WebGPU 失败，回退主线程', e)
      return null
    }
  }
  if (backend === 'worker') {
    try {
      return await runWorkerParallel(cfg, draws, play, methods, target, cap, violent, onProgress, onTicket, stopCheck)
    } catch (e) {
      console.warn('[gpu-accel] Worker 失败，回退主线程', e)
      return null
    }
  }
  return null
}
