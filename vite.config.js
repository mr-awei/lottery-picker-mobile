/// <reference types="vitest" />
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
// unplugin-element-plus：兜底用——若仍有 `import { X } from 'element-plus'` 的
// 显式导入，自动补上对应样式。
import ElementPlus from 'unplugin-element-plus/vite'

/* ============================================================
   首屏优化（1.9.11）：ElementPlus 精确按需引入
   ------------------------------------------------------------
   原先 main.js 全量 `import ElementPlus from 'element-plus'` + `.use()`，
   实测产物里含 date-picker / upload / calendar / cascader 等完全没用到的组件
   （~1MB JS + 364KB CSS），低端 WebView 首屏解析要数秒。
   改用官方 ElementPlusResolver 后仍是全量：它从 `element-plus/es` 主入口导入，
   而主入口的 installer 引用了所有组件，tree-shaking 无法生效。
   故自定义 resolver 直接指向 `element-plus/es/components/<组件>/index.mjs`，
   只打包模板中真正用到的 23 个组件，并按组件引入各自 style。
   ============================================================ */
const EP_COMPONENTS_DIR = path.resolve(process.cwd(), 'node_modules/element-plus/es/components')

/** 驼峰转短横线：CheckboxButton → checkbox-button */
function kebabCase(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/** 部分子组件无独立入口，实现挂在父组件目录下（其 style 目录仍是独立的） */
const EP_PARENT_DIR = {
  'checkbox-button': 'checkbox',
  'checkbox-group': 'checkbox',
  'radio-button': 'radio',
  'radio-group': 'radio',
  'option': 'select',
  'option-group': 'select',
  'table-column': 'table',
  'tab-pane': 'tabs'
}

const ElementPlusExactResolver = {
  type: 'component',
  resolve(name) {
    if (!name.startsWith('El')) return
    const kebab = kebabCase(name.slice(2))
    const dir = EP_PARENT_DIR[kebab] || kebab
    // 目录不存在则不接管，交回运行时解析，避免构建直接失败
    if (!fs.existsSync(path.join(EP_COMPONENTS_DIR, dir, 'index.mjs'))) return
    return {
      name,
      from: `element-plus/es/components/${dir}/index.mjs`,
      sideEffects: `element-plus/es/components/${kebab}/style/css`
    }
  }
}

export default defineConfig({
  plugins: [
    vue(),
    ElementPlus(),
    Components({ resolvers: [ElementPlusExactResolver] })
  ],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // 修复（1.8.6）：改回 true——每次 build 清空 dist，避免 emptyOutDir:false 残留旧 css/js 尸体
    // （之前 bIIpjJ9U.css 旧版含 max-height:96px 一直留在 dist，被 sync 进 APK 的 public_old）
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // 代码分割：echarts（含 zrender）、element-plus、tesseract.js 各自独立 chunk，
        // 不进主 index chunk；tesseract.js 仅在线 OCR 失败时动态 import 才加载
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('echarts') || id.includes('zrender')) return 'echarts'
            if (id.includes('element-plus') || id.includes('@element-plus')) return 'element-plus'
            if (id.includes('tesseract.js') || id.includes('tesseract')) return 'tesseract'
          }
        }
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/utils/picker-engine.ts', 'src/utils/prize-check.ts']
    }
  }
})
