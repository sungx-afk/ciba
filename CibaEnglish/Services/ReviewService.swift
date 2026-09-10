import UIKit
import StoreKit

/// 评价一下 row: asks for a rating in-session, with an App Store fallback link.
enum ReviewService {

    static func requestRating(in viewController: UIViewController) {
        if #available(iOS 14.0, *) {
            if let scene = viewController.view.window?.windowScene {
                SKStoreReviewController.requestReview(in: scene)
                return
            }
        }
        // Fallback: open the store page (only when the real App Store id is set).
        guard AppConfig.appStoreAppID != "1234567890",
              let url = AppConfig.appStoreReviewURL else {
            let alert = UIAlertController.simple(title: "喜欢糍粑英语吗？",
                                                 message: "感谢你的支持！正式上架后即可在 App Store 评分。")
            viewController.present(alert, animated: true)
            return
        }
        UIApplication.shared.open(url)
    }
}
