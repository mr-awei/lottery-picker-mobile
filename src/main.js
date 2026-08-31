import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import App from './App.vue'
import './assets/global.css'
import { initTheme } from './utils/ui-state'

initTheme()
createApp(App).use(ElementPlus, { locale: zhCn }).mount('#app')

// 调试钩子：暴露引擎模块到 window.__lp（CDP 验收/排障用，生产无副作用）
import('./utils/debug-hooks').then((m) => {
  window.__lp = m
}).catch((e) => console.warn('[debug-hooks] load failed', e))
