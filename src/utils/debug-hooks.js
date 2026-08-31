// debug-hooks.js —— 开发/调试/验收用全局钩子
// 把核心引擎与配置挂到 window.__lp，方便 CDP 注入验证与排障（生产环境保留，无副作用）
export * from './picker-engine'
export * from './game-config'
export * from './prize-check'
export * from './picks-fingerprint'
export * from './ocr-meta'
export * from './mobile-api'
