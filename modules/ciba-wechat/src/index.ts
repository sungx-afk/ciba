import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

/**
 * 微信登录（iOS 原生）JS 桥接层。
 *
 * 原生侧由 modules/ciba-wechat/ios 下的 Expo 模块提供，
 * 非 iOS 平台（web / android）不存在该模块，这里统一降级为空实现，避免打包或运行报错。
 */

interface NativeWechatModule {
  registerApp(appId: string, universalLink: string): Promise<boolean>;
  sendAuthRequest(scope: string, state: string): Promise<{ code: string; state: string }>;
  cancelAuthRequest(): Promise<boolean>;
}

function loadNativeModule(): NativeWechatModule | null {
  if (Platform.OS !== 'ios') return null;
  try {
    return requireNativeModule('CibaWechat') as NativeWechatModule;
  } catch {
    return null;
  }
}

const NativeWechat = loadNativeModule();

/** 当前运行环境是否支持微信原生登录 */
export const isWechatNativeAvailable = !!NativeWechat;

/** 向微信注册 App，必须在发起授权前调用 */
export async function registerWechatApp(
  appId: string,
  universalLink: string
): Promise<boolean> {
  if (!NativeWechat) return false;
  return NativeWechat.registerApp(appId, universalLink);
}

/** 发起微信授权，返回授权 code（失败时 reject） */
export async function sendWechatAuthRequest(
  scope: string,
  state: string
): Promise<{ code: string; state: string }> {
  if (!NativeWechat) {
    throw new Error('当前平台不支持微信登录');
  }
  return NativeWechat.sendAuthRequest(scope, state);
}

/** 放弃本次授权（例如界面卸载时），避免 Promise 悬挂 */
export async function cancelWechatAuthRequest(): Promise<void> {
  if (!NativeWechat) return;
  await NativeWechat.cancelAuthRequest();
}
