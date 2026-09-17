import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
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
  }
})
