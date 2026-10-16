import Foundation
import ExpoModulesCore
import WechatOpenSDK

/**
 * 微信响应的统一接收器。
 *
 * WXApi 的回调协议要求一个长期存活的 delegate，而 Expo Module 实例由框架托管，
 * 因此这里用单例承接回调，再把结果交还给发起授权时挂起的 Promise。
 */
public final class WechatRespHandler: NSObject, WXApiDelegate {
  public static let shared = WechatRespHandler()

  private var authPromise: Promise?
  private var expectedState: String?

  private override init() {
    super.init()
  }

  func beginAuth(state: String, promise: Promise) {
    authPromise?.reject("ERR_WECHAT_CANCEL", "微信授权已取消")
    authPromise = promise
    expectedState = state
  }

  func cancelAuth() {
    authPromise = nil
    expectedState = nil
  }

  // MARK: - WXApiDelegate

  public func onReq(_ req: BaseReq) {
    // 登录场景无需响应微信主动发来的请求
  }

  public func onResp(_ resp: BaseResp) {
    guard let authResp = resp as? SendAuthResp else {
      return
    }
    finishAuth(
      errCode: authResp.errCode,
      errStr: authResp.errStr,
      code: authResp.code,
      state: authResp.state
    )
  }

  func finishAuth(errCode: Int32, errStr: String?, code: String?, state: String?) {
    let promise = authPromise
    let expected = expectedState
    authPromise = nil
    expectedState = nil

    guard let promise = promise else {
      return
    }

    if errCode != 0 {
      // -2 为 WXErrCodeUserCancel，单独编码，界面层据此静默处理
      if errCode == -2 {
        promise.reject("ERR_WECHAT_CANCEL", errStr ?? "已取消微信授权")
      } else {
        promise.reject("ERR_WECHAT_AUTH", errStr ?? "微信授权失败")
      }
      return
    }

    guard let authCode = code, !authCode.isEmpty else {
      promise.reject("ERR_WECHAT_AUTH", "微信未返回授权 code")
      return
    }

    // 防 CSRF：回调 state 必须与发起时下发的一致
    if let expected = expected, expected != (state ?? "") {
      promise.reject("ERR_WECHAT_STATE", "微信授权状态校验失败")
      return
    }

    promise.resolve(["code": authCode, "state": state ?? ""])
  }
}
