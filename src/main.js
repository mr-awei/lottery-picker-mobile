import { createApp, h } from 'vue'
// 首屏优化（1.9.11）：不再全量 `import ElementPlus` + `.use(ElementPlus)`，
// 模板 el-xxx 由 vite.config.js 的自定义 resolver 精确按需引入（走具体组件路径）。
// 函数式组件（ElMessage / ElMessageBox）同样走具体组件路径，样式在此统一引入
// （组件样式是全局的，与导入位置无关）。
import 'element-plus/theme-chalk/dark/css-vars.css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import { ElConfigProvider } from 'element-plus/es/components/config-provider/index.mjs'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import App from './App.vue'
import './assets/global.css'
import { initTheme } from './utils/ui-state'
import { migrateFromLocal, checkQuota } from './utils/db'
import { installCrashReporter } from './utils/crash-report'

// 崩溃捕获必须在 createApp 之前注册，确保能捕获启动期错误
installCrashReporter()

initTheme()

// 立即挂载 Vue，不阻塞首屏渲染。
// IndexedDB 迁移/配额检测在后台异步执行，完成后通过 window 事件通知 App 重新加载数据。
// 用 ElConfigProvider 提供中文语言包（替代原先全量 use(ElementPlus, { locale })）。
createApp({
  render: () => h(ElConfigProvider, { locale: zhCn }, { default: () => h(App) })
}).mount('#app')

;(async () => {
  try {
    await migrateFromLocal()
    await checkQuota()
    // 迁移完成后通知 App 刷新数据
    window.dispatchEvent(new CustomEvent('lp-db-ready'))
  } catch (e) {
    console.warn('[db] 启动迁移/配额检测失败', e)
  }
})()

// 调试钩子：仅开发环境暴露引擎到 window.__lp（CDP 验收/排障用），生产构建不引入
if (import.meta.env.DEV) {
  import('./utils/debug-hooks').then((m) => {
    window.__lp = m
  }).catch((e) => console.warn('[debug-hooks] load failed', e))
}
