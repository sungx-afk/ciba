import ExpoModulesCore
import WechatOpenSDK

/**
 * 接管微信回跳 App 的两条通路。
 *
 * 以 AppDelegate 订阅者方式接入，无需改动 Expo 自动生成的 AppDelegate。
 */
public final class CibaWechatAppDelegate: BaseExpoAppDelegateSubscriber {
  /// Universal Link 回跳（微信优先走这条路径，配置正确时不会弹二次确认窗）
  public func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    guard userActivity.activityType == NSUserActivityTypeBrowsingWeb else {
      return false
    }
    return WXApi.handleOpenUniversalLink(userActivity, delegate: WechatRespHandler.shared)
  }

  /// URL Scheme 回跳（Universal Link 不可用时的降级路径）
  public func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return WXApi.handleOpen(url, delegate: WechatRespHandler.shared)
  }
}
