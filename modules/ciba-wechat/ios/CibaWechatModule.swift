import ExpoModulesCore
import WechatOpenSDK

public final class CibaWechatModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CibaWechat")

    AsyncFunction("registerApp") { (appId: String, universalLink: String) -> Bool in
      return WXApi.registerApp(appId, universalLink: universalLink)
    }

    AsyncFunction("sendAuthRequest") { (scope: String, state: String, promise: Promise) in
      let req = SendAuthReq()
      req.scope = scope
      req.state = state

      WechatRespHandler.shared.beginAuth(state: state, promise: promise)

      WXApi.send(req) { success in
        if !success {
          WechatRespHandler.shared.cancelAuth()
          promise.reject("ERR_WECHAT_SEND", "调起微信失败")
        }
      }
    }

    AsyncFunction("cancelAuthRequest") { () -> Bool in
      WechatRespHandler.shared.cancelAuth()
      return true
    }
  }
}
