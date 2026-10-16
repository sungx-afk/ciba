import { Platform } from 'react-native';
import {
  registerWechatApp,
  sendWechatAuthRequest,
  cancelWechatAuthRequest,
  isWechatNativeAvailable,
} from '../../modules/ciba-wechat/src';
import { WECHAT_APP_ID, WECHAT_UNIVERSAL_LINK, WECHAT_AUTH_SCOPE } from '../config/wechat';
import { AuthApi, ApiResponse } from './api';

/**
 * 微信登录服务：封装「拉起微信授权 → 取回 code → 后端换 token」整条链路。
 */

/** 是否支持微信原生登录（仅 iOS 且原生模块可用） */
export const isWechatLoginSupported = Platform.OS === 'ios' && isWechatNativeAvailable;

/** 生成一次性 state，用于防 CSRF 与重放（原生侧会比对回调带回的 state） */
function createState(): string {
  return `ciba_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 执行微信授权登录。
 *
 * 用户主动取消时抛出的错误 code 为 `ERR_WECHAT_CANCEL`，
 * 由界面层决定是否静默；其余失败 code 为 `ERR_WECHAT_AUTH` / `ERR_WECHAT_STATE` / `ERR_WECHAT_SEND`。
 */
export async function loginWithWechat(): Promise<ApiResponse> {
  if (!isWechatLoginSupported) {
    return { result: -1, msg: '当前平台暂不支持微信登录' };
  }

  // registerApp 幂等，可重复调用；失败通常是 AppID 或 Universal Link 与开放平台后台不一致
  const registered = await registerWechatApp(WECHAT_APP_ID, WECHAT_UNIVERSAL_LINK);
  if (!registered) {
    return { result: -1, msg: '微信服务初始化失败，请稍后重试' };
  }

  const state = createState();
  try {
    const auth = await sendWechatAuthRequest(WECHAT_AUTH_SCOPE, state);
    if (!auth?.code) {
      return { result: -1, msg: '微信未返回授权凭证' };
    }
    return await AuthApi.wechatAppLogin({ code: auth.code, appid: WECHAT_APP_ID });
  } finally {
    // 兜底清理，避免异常路径下原生 Promise 悬挂（已完成时无副作用）
    await cancelWechatAuthRequest().catch(() => {});
  }
}
