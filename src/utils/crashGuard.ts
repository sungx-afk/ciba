/**
 * 全局防闪退守护与启动黑匣子日志系统 (CrashGuard & BootLogger)
 * 
 * 作用：
 * 1. 彻底阻止 React Native 在 Release 模式下因未捕获 JS 异常调用 RCTFatal / abort() 发生闪退。
 * 2. 拦截并收集启动阶段及运行时的关键日志与异常堆栈。
 * 3. 驱动屏幕上的实时诊断浮层，白屏或异常时立即直观展示错误信息。
 */

export interface LogEntry {
  time: string;
  level: 'info' | 'warn' | 'error';
  tag: string;
  message: string;
  stack?: string;
}

const MAX_LOGS = 50;
const logBuffer: LogEntry[] = [];
type LogListener = (entry: LogEntry) => void;
const listeners = new Set<LogListener>();

function nowStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

export function addBootLog(tag: string, message: string, level: 'info' | 'warn' | 'error' = 'info', stack?: string) {
  const entry: LogEntry = {
    time: nowStr(),
    level,
    tag,
    message,
    stack,
  };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOGS) {
    logBuffer.shift();
  }
  // 打印到控制台
  if (level === 'error') {
    console.error(`[${entry.time}][${tag}] ${message}`, stack || '');
  } else if (level === 'warn') {
    console.warn(`[${entry.time}][${tag}] ${message}`);
  } else {
    console.log(`[${entry.time}][${tag}] ${message}`);
  }

  listeners.forEach((fn) => {
    try {
      fn(entry);
    } catch (_) {}
  });
}

export function getBootLogs(): LogEntry[] {
  return [...logBuffer];
}

export function subscribeBootLog(listener: LogListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ─── 全局异常守护初始化 ──────────────────────────────────────────────────────────
(function setupCrashGuard() {
  addBootLog('CrashGuard', '启动全局异常防闪退守护系统');

  // 1. 拦截 React Native 全局 JS 异常
  const g = typeof global !== 'undefined' ? (global as any) : (typeof window !== 'undefined' ? (window as any) : {});
  if (g && g.ErrorUtils) {
    const errorUtils = g.ErrorUtils;
    const originalHandler = typeof errorUtils.getGlobalHandler === 'function' ? errorUtils.getGlobalHandler() : null;

    errorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
      const msg = error?.message || String(error);
      const stack = error?.stack ? String(error.stack).split('\n').slice(0, 6).join('\n') : undefined;

      addBootLog('FatalError', `捕获到全局未捕获异常: ${msg}`, 'error', stack);

      // 关键防闪退：将 isFatal 强制降级为 false，阻止 Native 侧调用 RCTFatal / abort()
      if (typeof originalHandler === 'function') {
        try {
          originalHandler(error, false);
        } catch (_) {}
      }
    });
    addBootLog('CrashGuard', 'ErrorUtils.setGlobalHandler 注册成功');
  }

  // 2. 拦截全局未处理的 Promise Rejection
  if (g && typeof g.addEventListener === 'function') {
    g.addEventListener('unhandledrejection', (event: any) => {
      const reason = event?.reason;
      const msg = reason?.message || String(reason);
      const stack = reason?.stack ? String(reason.stack).split('\n').slice(0, 6).join('\n') : undefined;
      addBootLog('UnhandledPromise', `未处理的 Promise 拒绝: ${msg}`, 'error', stack);
    });
  }
})();
