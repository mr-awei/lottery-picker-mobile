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

// v1.9.7：开奖缓存 / 自选号从 localStorage 迁移到 IndexedDB。
// mount 前 await 迁移完成，保证首屏渲染时 picks/draws 已在 IndexedDB 中、且不与首次取数竞争；
// 迁移失败内部吞掉不阻断启动。
;(async () => {
  try {
    await migrateFromLocal()
    await checkQuota()
  } catch (e) {
    console.warn('[db] 启动迁移/配额检测失败', e)
  }
  createApp(App).use(ElementPlus, { locale: zhCn }).mount('#app')
})()

// 调试钩子：暴露引擎模块到 window.__lp（CDP 验收/排障用，生产无副作用）
import('./utils/debug-hooks').then((m) => {
  window.__lp = m
}).catch((e) => console.warn('[debug-hooks] load failed', e))
