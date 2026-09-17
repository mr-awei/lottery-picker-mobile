/// <reference types="vitest" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('echarts') || id.includes('zrender')) return 'echarts'
            if (id.includes('tesseract.js') || id.includes('tesseract')) return 'tesseract'
          }
        }
      }
    }
  },
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: { provider: 'v8', reporter: ['text', 'html'], include: ['src/utils/picker-engine.ts', 'src/utils/prize-check.ts'] }
  }
})
