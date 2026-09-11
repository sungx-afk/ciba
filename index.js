import { registerRootComponent } from 'expo';
import { Alert } from 'react-native';

// 全局防闪退守护：阻止未捕获的 JS 异常上报给 Native RCTFatal 导致 abort() 闪退
if (typeof global !== 'undefined' && global.ErrorUtils) {
  const errorUtils = global.ErrorUtils;
  const originalHandler = errorUtils.getGlobalHandler && errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    console.error('[SafeGuard] 捕获到全局未捕获异常 (已成功阻止闪退):', error);
    try {
      Alert.alert(
        '运行时诊断信息',
        `已阻止闪退，错误信息如下:\n\n${error?.message || String(error)}\n\n堆栈概要:\n${(error?.stack || '').split('\n').slice(0, 3).join('\n')}`,
        [{ text: '知道了' }]
      );
    } catch {
      // ignore
    }
    // 关键点：强制将 isFatal 设为 false，确保 Native 端的 RCTExceptionsManager 绝不调用 RCTFatal / abort()
    if (originalHandler) {
      try {
        originalHandler(error, false);
      } catch {
        // ignore
      }
    }
  });
}

import App from './App';

registerRootComponent(App);
