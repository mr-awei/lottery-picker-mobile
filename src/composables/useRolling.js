import { ref } from 'vue'

// 摇奖动画（滚动号码球 → 1.5s 后定格最终结果）。
// 从 usePicker 拆出的独立展示关注点：不参与选号/评分/锁定逻辑，
// 只接收 result / generatedAt 两个 ref，动画结束时写入。
export function useRolling(props, result, generatedAt) {
  const rolling = ref(false)
  const rollBalls = ref({ red: [], blue: [] })
  let rollTimer = null

  function nowTime() {
    const now = new Date()
    const p = (x) => String(x).padStart(2, '0')
    return `${now.getHours()}:${p(now.getMinutes())}:${p(now.getSeconds())}`
  }

  function randomRollBalls() {
    // Fisher-Yates 无偏洗牌：替代 sort(() => Math.random()-0.5) 的有偏随机
    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr
    }
    if (props.cfg.playMode === 'direct') {
      const nPos = props.cfg.digits.length
      rollBalls.value = {
        digits: Array.from({ length: nPos }, () => Math.floor(Math.random() * 10)),
        tail: props.cfg.tail != null ? Math.floor(Math.random() * (props.cfg.tailMax + 1)) : null
      }
      return
    }
    const pool = Array.from({ length: props.cfg.redMax }, (_, i) => i + 1)
    const bpool = Array.from({ length: props.cfg.blueMax }, (_, i) => i + 1)
    rollBalls.value = {
      red: shuffle(pool).slice(0, props.cfg.redCount).sort((a, b) => a - b),
      blue: shuffle(bpool).slice(0, props.cfg.blueCount).sort((a, b) => a - b)
    }
  }

  function stopRoll() {
    if (rollTimer) {
      clearInterval(rollTimer)
      rollTimer = null
    }
    rolling.value = false
  }

  /** 播放摇奖动画，结束后定格展示最终结果 */
  function playRoll(final) {
    stopRoll()
    rolling.value = true
    result.value = null
    randomRollBalls()
    rollTimer = setInterval(randomRollBalls, 90)
    setTimeout(() => {
      stopRoll()
      result.value = final
      generatedAt.value = nowTime()
    }, 1500)
  }

  return { rolling, rollBalls, stopRoll, playRoll }
}
