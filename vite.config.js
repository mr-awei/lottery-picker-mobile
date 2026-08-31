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
    chunkSizeWarningLimit: 2000
  },
  server: {
    port: 5173,
    strictPort: true
  }
})
