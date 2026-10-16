/**
 * 微信开放平台配置
 *
 * ⚠️ WECHAT_UNIVERSAL_LINK 必须与微信开放平台后台「移动应用」里填写的 Universal Link
 * 完全一致（含结尾斜杠），且代码里 registerApp 传入的值也要一致。
 * 微信 SDK 首次调用会校验，三者任一不一致都会导致授权失败。
 *
 * 服务端要求：https://cibaen.com/.well-known/apple-app-site-association
 * 需在 applinks.details 中声明 paths 包含 "/wx/*"，且必须返回 200、无重定向。
 */

/** 微信开放平台移动应用 AppID */
export const WECHAT_APP_ID = 'wxb71c639d4f3530dd';

/** Universal Link（与开放平台后台保持一致） */
export const WECHAT_UNIVERSAL_LINK = 'https://cibaen.com/wx/';

/** 授权作用域：获取用户昵称、头像等公开信息 */
export const WECHAT_AUTH_SCOPE = 'snsapi_userinfo';
