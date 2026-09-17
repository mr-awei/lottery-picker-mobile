import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
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
createApp(App).use(ElementPlus, { locale: zhCn }).mount('#app')

;(async () => {
  try {
    await migrateFromLocal()
    await checkQuota()
    // 迁移完成后通知 App 刷新数据（首次安装时缓存可能刚从 localStorage 迁移过来）
    window.dispatchEvent(new CustomEvent('lp-db-ready'))
  } catch (e) {
    console.warn('[db] 启动迁移/配额检测失败', e)
  }
})()

// 调试钩子：暴露引擎模块到 window.__lp（CDP 验收/排障用，生产无副作用）
import('./utils/debug-hooks').then((m) => {
  window.__lp = m
}).catch((e) => console.warn('[debug-hooks] load failed', e))
