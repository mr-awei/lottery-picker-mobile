// ESLint 配置（legacy .eslintrc 格式，配套 eslint@8）
// 项目为纯 JS + Vue 3 Composition API + Vite 5
module.exports = {
  env: {
    browser: true,
    node: true,
    es2022: true
  },
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-recommended',
    'prettier' // eslint-config-prettier：关闭与 Prettier 冲突的格式化规则（必须放最后）
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  globals: {
    // WebGPU 实验 API（gpu-accel.js 探测失败时回退主线程计算，运行时安全）
    GPUBufferUsage: 'readonly',
    GPUMapMode: 'readonly'
  },
  overrides: [
    {
      // TypeScript 文件（渐进式迁移：核心 4 模块）
      files: ['*.ts'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      rules: {
        // 用 @typescript-eslint 版替换核心 no-unused-vars，兼容 type-only import / 接口等 TS 语法
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
      }
    }
  ],
  rules: {
    // 项目组件均为单个单词（AiPicker / MyPicks / PrizeMap 等），不强制多词组件名
    'vue/multi-word-component-names': 'off',
    // 项目模板不使用 v-html，关闭该规则避免误报
    'vue/no-v-html': 'off',
    // 约定：_ 前缀的形参/变量视为有意保留，不参与 no-unused-vars 检查
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
  }
}
