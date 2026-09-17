<template>
  <div>
    <div class="card-title">AI 选号（本地统计规则引擎）</div>
    <el-alert
      v-if="!hasDraws"
      type="error"
      :closable="false"
      show-icon
      title="历史开奖数据未加载：评分将仅基于号码结构（区间/奇偶/和值/大小），冷热/重号等统计不可用。请先返回数据页刷新，或检查应用网络权限。"
      style="margin-bottom: 14px"
    />
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      title="理性购彩提示：彩票开奖为独立随机事件，历史统计不提高中奖概率。本工具仅用于参考组合生成，请量力而行。"
      style="margin-bottom: 14px"
    />

    <AiPickerSettings :picker="picker" :cfg="cfg" />
    <AiPickerPanel :picker="picker" :cfg="cfg" />
    <AiPickerResults :picker="picker" :cfg="cfg" :draws="draws" />
  </div>
</template>

<script setup>
import { usePicker } from '../composables/usePicker'
import AiPickerSettings from './AiPickerSettings.vue'
import AiPickerPanel from './AiPickerPanel.vue'
import AiPickerResults from './AiPickerResults.vue'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

// 选号核心逻辑全部收敛到 usePicker；子组件仅通过同一 picker 上下文 + cfg/draws 渲染。
const picker = usePicker(props)
const { hasDraws } = picker
</script>
