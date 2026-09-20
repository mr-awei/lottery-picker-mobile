// 启动期错误捕获：把 JS 错误直接显示在加载动画上，避免白屏无法定位
(function () {
  function showError(text) {
    var el = document.getElementById('lp-boot-err')
    if (!el) {
      el = document.createElement('pre')
      el.id = 'lp-boot-err'
      el.style.cssText = 'margin:16px;padding:10px;max-width:92%;font-size:10px;color:#f56c6c;background:#fef0f0;border:1px solid #fbc4c4;border-radius:6px;white-space:pre-wrap;word-break:break-all;max-height:45%;overflow:auto;text-align:left;'
      var boot = document.getElementById('lp-boot')
      if (boot) { boot.appendChild(el); boot.style.justifyContent = 'flex-start'; boot.style.paddingTop = '40px'; }
      else document.body.appendChild(el)
    }
    el.textContent += text + '\n\n'
  }
  window.addEventListener('error', function (e) {
    var msg = e.message || (e.error && e.error.message) || 'Unknown error'
    var src = e.filename ? ('\n' + e.filename.split('/').slice(-1)[0] + ':' + e.lineno + ':' + e.colno) : ''
    showError('JS Error: ' + msg + src)
  }, true)
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason
    var msg = r ? (r.message || r.toString() || JSON.stringify(r)) : 'Unknown'
    var stack = r && r.stack ? '\n' + String(r.stack).split('\n').slice(0, 3).join('\n') : ''
    showError('Promise: ' + msg + stack)
  })
  document.addEventListener('securitypolicyviolation', function (e) {
    showError('CSP: ' + e.violatedDirective + ' blocked ' + e.blockedURI + ' (' + e.effectiveDirective + ')')
  })
  // 兜底：若 8s 后启动屏仍在，强制隐藏，避免 JS 崩溃导致永久卡在加载动画
  // （正常挂载时 Vue 早已加 .hide，此处再加一次为 no-op，无副作用）
  setTimeout(function () {
    var b = document.getElementById('lp-boot')
    if (b && !b.classList.contains('hide')) b.classList.add('hide')
  }, 8000)
})()
