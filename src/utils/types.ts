// 核心领域类型定义（渐进式迁移：先覆盖 4 个核心模块共用的类型）
// 说明：直位数字型（fc3d/pl3/pl5/qxc）与乐透型（ssq/dlt/qlc/kl8）字段差异较大，
//       这里用单一宽松接口 + 可选字段描述全部彩种，调用方按 cfg.key / playMode 分支收窄。

/** 直位数字型每位配置（福彩3D/排列3/排列5/7星彩） */
export interface DigitPos {
  label: string
  max: number
}

/** 单个彩种的玩法配置（GAME_CONFIG[key]） */
export interface GameConfig {
  key: string
  name: string
  /** combo=乐透型（红/蓝双区）；direct=直位数字型；缺省视为 combo */
  playMode?: 'combo' | 'direct'
  redLabel?: string
  blueLabel?: string
  /** 乐透型：红球个数 / 号码上限 */
  redCount?: number
  redMax?: number
  /** 乐透型：蓝球个数 / 号码上限（七乐彩/快乐8/直位为 0） */
  blueCount?: number
  blueMax?: number
  sumMin: number
  sumMax: number
  /** 三区分界（红区） */
  zoneEdges?: number[]
  zoneTarget?: number[]
  zoneNames?: string[]
  /** 大小分界：>sizeSplit 为大 */
  sizeSplit?: number
  blueSizeSplit?: number
  spanMin?: number
  spanMax?: number
  drawDaysText: string
  recommendMethods: string[]
  /** 大乐透追加投注 */
  zhuijia?: boolean
  zhuijiaPrice?: number
  /** 七乐彩特别号 */
  special?: boolean
  /** 快乐8 */
  kl8?: boolean
  kl8Selects?: number[]
  /** 直位数字型 */
  direct?: boolean
  digits?: DigitPos[]
  directTypes?: string[]
  /** 7星彩尾位上限 0-14 */
  tailMax?: number
  tail?: boolean
}

/** 某一期开奖数据（mobile-api 解析后 / 兑奖用） */
export interface DrawWinner {
  province: string
  city: string | null
  siteNo: string
  amount: number | null
}

export interface Draw {
  issue: string
  date: string
  /** 乐透型红球（快乐8 为全部 20 个开奖号；直位型解析后清空为 []） */
  red: number[]
  /** 主蓝球 / 七乐彩特别号 / 大乐透前蓝 */
  blue: number | null
  /** 大乐透后区第二蓝 */
  blue2: number | null
  /** 单注一等奖奖金（浮动） */
  firstPrizePerBet: number | null
  firstPrizeCount: number | null
  sales: number | null
  pool: number | null
  winners: DrawWinner[] | Array<string | { province?: string }>
  maxPersonalWin: number | null
  maxPersonalWinNote: string
  /** 奖级名 → 单注奖金（快乐8 为 x1z1~x10z10；7星彩为"一等奖"等中文名） */
  prizeMap: Record<string, number>
  /** 直位型：百/十/个等位数字（解析后从 red 切片填入） */
  digits?: number[]
  /** 7星彩尾位 0-14 */
  tail?: number | null
}

/** 乐透型单注评分维度（scoreRed 返回） */
export interface ScoreDims {
  zones: number[]
  odds: number
  sum: number
  cons: number
  hotIn: number
  coldIn: number
  bigs: number
  primes: number
  routes: number[]
  span: number
  tailPairs: number
  reps: number
  omitOk: number
  ac: number
  neighborIn: number
  goldenIn: number
  mirrorPairs: number
  sumTail: number
  fiboHits: number
  headOk: boolean
  tailOk: boolean
  clampHits: number
}

/** 乐透型红球评分（含各子项分与总分） */
export interface RedScore extends ScoreDims {
  zoneScore: number
  oddScore: number
  sumScore: number
  consScore: number
  hotScore: number
  sizeScore: number
  primeScore: number
  routeScore: number
  spanScore: number
  tailScore: number
  repeatScore: number
  omitScore: number
  acScore: number
  neighborScore: number
  goldenScore: number
  mirrorScore: number
  sumTailScore: number
  meanScore: number
  fiboScore: number
  headTailScore: number
  clampScore: number
  total: number
}

/** 蓝球评分（scoreBlue 返回） */
export interface BlueScore {
  hotIn: number
  hotScore: number
  sizeScore: number
  routeScore: number
  omitScore: number
  total: number
}

/** computeStats 返回的冷热/遗漏统计（乐透型） */
export interface ScoreStats {
  redFreq: number[]
  redMiss: number[]
  blueFreq: number[]
  blueMiss: number[]
  hot: number[]
  cold: number[]
  hotBlue: Set<number>
  total: number
  lastRed: number[]
  lastBlue: number[]
  tailFreq: number[]
  omitVal: number[]
  blueOmit: number[]
  sumRecent: number
}

/** 直位数字型统计（computeDirectStats 返回） */
export interface DirectStats {
  freq: number[][]
  miss: number[][]
  tailFreq: number[] | null
  tailMiss: number[] | null
  sumTailFreq: number[]
  total: number
  hotPos: number[][]
  coldPos: number[][]
  lastDigits: number[]
  lastTail: number | null
}

/** 直位单注评分（scoreDigits 返回） */
export interface DigitScore {
  hotScore: number
  sumScore: number
  oddScore: number
  sizeScore: number
  formScore: number
  repeatScore: number
  spanScore: number
  tailScore: number
  routeScore: number
  primeScore: number
  mirrorScore: number
  headTailScore: number
  sumTailScore: number
  omitScore: number
  total: number
  sum: number
}

/** 单张彩票（任意玩法）：结构由 type 决定 */
export interface Ticket {
  type?: 'single' | 'multi' | 'duplex' | 'danTuo'
  /** 单注/复式/胆拖红球 */
  red?: number[]
  /** 单注/复式/胆拖蓝球 */
  blue?: number[]
  /** 多注：子注列表 */
  tickets?: Ticket[]
  /** 胆拖：胆码红/拖码红 */
  danRed?: number[]
  tuoRed?: number[]
  /** 后区胆拖（大乐透） */
  blueDan?: number[]
  blueTuo?: number[]
  /** 多注注数 */
  n?: number
  /** 定位复式红/蓝个数 */
  redCount?: number
  blueCount?: number
  /** 胆拖胆码/拖码个数 */
  danN?: number
  tuoN?: number
  blueDanN?: number
  blueTuoN?: number
  /** 直位型：各位数字 / 尾位 / 组选类型 */
  digits?: number[]
  tail?: number | null
  zx?: string
  /** 直位定位复式：每一位候选数组 */
  pos?: number[][]
  /** 大乐透追加 / 倍数 */
  append?: boolean
  multiple?: number
  /** 用户锁定号码 */
  locked?: { red?: number[]; blue?: number[] }
}

/** 中奖判定结果（checkPrize / checkPrizeDirect / kl8Prize 返回） */
export interface PrizeResult {
  level: number
  name: string
  /** 浮动奖金（null = 浮动待定）；0 = 未中奖 */
  bonus: number | null
  draw: Draw | null
  /** 快乐8：选中号码命中开奖号个数 */
  match?: number
  redMatch?: number
  blueMatch?: number
  digitsMatch?: number
  tailMatch?: boolean
  append?: boolean
  /** PRIZE_RULES 中该奖级的固定奖金（用于 smallWinNote 判定） */
  fixed?: number | null
}

/** PRIZE_RULES 单条规则 */
export interface PrizeLevel {
  red: number
  blue: number
  level: number
  name: string
  fixed: number | null
}

/** checkTicket / checkTicketDirect 汇总结果 */
export interface TicketCheckResult {
  level: number
  name: string
  bonus: number
  winCount: number
  totalCount: number
  lines: unknown[]
  draw: Draw | null
  best: PrizeResult | null
}

/** checkTicketHistoryMulti 单条命中 */
export interface HistoryHit {
  issue: string
  date: string
  level: number
  name: string
  bonus: number
  winCount: number
  provinceText: string
}

/** lotteryApi.get / refresh 返回 */
export interface ApiDataResult {
  ok: boolean
  error?: string
  game?: string
  updatedAt?: string | null
  source?: string
  draws?: Draw[]
  count?: number
  missingWinners?: number
}
