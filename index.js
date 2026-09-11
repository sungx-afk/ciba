/**
 * index.js — 应用入口（纯 CommonJS 格式）
 *
 * 重要说明：
 *   ES6 `import` 语句会被 Metro 提升（hoist）到文件顶部，在任何内联代码之前执行。
 *   因此，必须使用 `require()` 来确保全局守护代码是第一行被执行的代码。
 */

// ─── 第一步：最先安装全局 JS 异常守护 ───────────────────────────────────────────
// 阻止未捕获的 JS 异常通过 RCTExceptionsManager 调用 RCTFatal → abort() 导致闪退
(function installGlobalGuard() {
  try {
    var g = typeof global !== 'undefined' ? global : this;
    if (g && g.ErrorUtils) {
      var errorUtils = g.ErrorUtils;
      var originalHandler =
        typeof errorUtils.getGlobalHandler === 'function'
          ? errorUtils.getGlobalHandler()
          : null;

      errorUtils.setGlobalHandler(function safeGlobalHandler(error, isFatal) {
        try {
          var msg = error && error.message ? error.message : String(error);
          var stack =
            error && error.stack
              ? String(error.stack).split('\n').slice(0, 5).join('\n')
              : '';
          // eslint-disable-next-line no-console
          console.error(
            '[SafeGuard] 全局异常已拦截（防止闪退）\n' + msg + '\n' + stack
          );
        } catch (_) {
          // 日志本身不能崩溃
        }

        // 关键：将 isFatal 强制降级为 false
        // 这样 Native 侧的 RCTExceptionsManager 只会调用 reportSoftException，
        // 而不是 reportFatalException → RCTFatal → abort()
        if (typeof originalHandler === 'function') {
          try {
            originalHandler(error, false);
          } catch (_) {
            // ignore
          }
        }
      });
    }
  } catch (_) {
    // 守护本身绝不能崩溃
  }
})();

// ─── 第二步：加载应用 ──────────────────────────────────────────────────────────
var Expo = require('expo');
var App = require('./App').default;

Expo.registerRootComponent(App);
