import { createApp } from 'vue'
import App from './App.vue'
import './assets/global.css'
import { initTheme } from './utils/ui-state'
import { migrateFromLocal, checkQuota } from './utils/db'
import { installCrashReporter } from './utils/crash-report'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

// 按需导入 element-plus 组件（子路径，确保 tree-shaking）
import ElButton from 'element-plus/es/components/button/index.mjs'
import ElDialog from 'element-plus/es/components/dialog/index.mjs'
import ElAlert from 'element-plus/es/components/alert/index.mjs'
import { ElSelect, ElOption } from 'element-plus/es/components/select/index.mjs'
import ElInputNumber from 'element-plus/es/components/input-number/index.mjs'
import ElSwitch from 'element-plus/es/components/switch/index.mjs'
import { ElRadio, ElRadioGroup, ElRadioButton } from 'element-plus/es/components/radio/index.mjs'
import { ElCheckbox, ElCheckboxGroup, ElCheckboxButton } from 'element-plus/es/components/checkbox/index.mjs'
import ElEmpty from 'element-plus/es/components/empty/index.mjs'
import ElProgress from 'element-plus/es/components/progress/index.mjs'
import ElTag from 'element-plus/es/components/tag/index.mjs'
import ElInput from 'element-plus/es/components/input/index.mjs'
import ElPopover from 'element-plus/es/components/popover/index.mjs'
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs'
import { ElTabs, ElTabPane } from 'element-plus/es/components/tabs/index.mjs'
import ElDivider from 'element-plus/es/components/divider/index.mjs'
import ElConfigProvider from 'element-plus/es/components/config-provider/index.mjs'
import ElMessage from 'element-plus/es/components/message/index.mjs'

// 组件 CSS
import 'element-plus/es/components/button/style/css.mjs'
import 'element-plus/es/components/dialog/style/css.mjs'
import 'element-plus/es/components/alert/style/css.mjs'
import 'element-plus/es/components/select/style/css.mjs'
import 'element-plus/es/components/input-number/style/css.mjs'
import 'element-plus/es/components/switch/style/css.mjs'
import 'element-plus/es/components/radio/style/css.mjs'
import 'element-plus/es/components/checkbox/style/css.mjs'
import 'element-plus/es/components/empty/style/css.mjs'
import 'element-plus/es/components/progress/style/css.mjs'
import 'element-plus/es/components/tag/style/css.mjs'
import 'element-plus/es/components/input/style/css.mjs'
import 'element-plus/es/components/popover/style/css.mjs'
import 'element-plus/es/components/table/style/css.mjs'
import 'element-plus/es/components/tabs/style/css.mjs'
import 'element-plus/es/components/divider/style/css.mjs'
import 'element-plus/es/components/config-provider/style/css.mjs'
import 'element-plus/es/components/message/style/css.mjs'
import 'element-plus/theme-chalk/dark/css-vars.css'

installCrashReporter()
initTheme()

const app = createApp(App)
const comps = [ElButton, ElDialog, ElAlert, ElSelect, ElOption, ElInputNumber,
  ElSwitch, ElRadio, ElRadioGroup, ElRadioButton, ElCheckbox,
  ElCheckboxGroup, ElCheckboxButton, ElEmpty, ElProgress, ElTag,
  ElInput, ElPopover, ElTable, ElTableColumn, ElTabs, ElTabPane,
  ElDivider, ElConfigProvider]
comps.forEach((c) => app.component(c.name, c))
app.config.globalProperties.$message = ElMessage
app.mount('#app')

;(async () => {
  try {
    await migrateFromLocal()
    await checkQuota()
    window.dispatchEvent(new CustomEvent('lp-db-ready'))
  } catch (e) {
    console.warn('[db] 启动迁移/配额检测失败', e)
  }
})()

import('./utils/debug-hooks').then((m) => { window.__lp = m }).catch((e) => console.warn('[debug-hooks] load failed', e))
