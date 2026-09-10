import UIKit

/// App-wide configuration and content constants.
/// NOTE: replace the placeholders below with your own values before App Store release.
///liushuang test
enum AppConfig {

    static let appName = "糍粑英语"
    static let appNameEN = "CibaEnglish"
    static let tagline = "按意群分类背单词"
    static let version = "1.0.0"
    static let supportEmail = "support@cibaenglish.example"   // TODO: replace with real support mailbox
    static let appStoreAppID = "1234567890"                  // TODO: replace after App Store Connect creation
    static let privacyURL = "https://cibaenglish.example/privacy"  // TODO: host a real page (in-app HTML is bundled too)

    /// StoreKit product identifiers for membership, cheapest first.
    /// Until these exist in App Store Connect the membership screen falls back to
    /// `plannedPlans` so the offer is still legible.
    static let membershipProductIDs: [String] = [
        "com.cibaenglish.app.monthly",
        "com.cibaenglish.app.quarterly",
        "com.cibaenglish.app.yearly"
    ]

    // MARK: - Membership offer

    /// What a member gets. Written as outcomes rather than features — this is
    /// the only copy on the screen that has to do any persuading.
    static let membershipBenefits: [String] = [
        "四本词库全解锁：高中 / 四级 / 考研 / 托福",
        "离线发音，地铁里也能背",
        "错词自动重排，按记忆曲线复习",
        "后续新增词库免费用"
    ]

    /// Display-only plan ladder, used when StoreKit has no products yet.
    /// `monthlyEquivalent` and `anchor` drive the per-month math and the
    /// struck-through price; keep them consistent with App Store Connect.
    struct PlannedPlan {
        let id: String
        let title: String
        let price: String
        let monthlyEquivalent: String
        let anchor: String?        // struck-through comparison price
        let badge: String?         // e.g. 省 35%
        let isBest: Bool
    }

    static let plannedPlans: [PlannedPlan] = [
        PlannedPlan(id: "com.cibaenglish.app.yearly", title: "12 个月", price: "¥78",
                    monthlyEquivalent: "¥6.5 / 月", anchor: "¥120", badge: "省 35%", isBest: true),
        PlannedPlan(id: "com.cibaenglish.app.quarterly", title: "3 个月", price: "¥25",
                    monthlyEquivalent: "¥8.3 / 月", anchor: "¥30", badge: nil, isBest: false),
        PlannedPlan(id: "com.cibaenglish.app.monthly", title: "1 个月", price: "¥10",
                    monthlyEquivalent: "¥10 / 月", anchor: nil, badge: nil, isBest: false)
    ]

    static var appStoreReviewURL: URL? {
        URL(string: "https://apps.apple.com/app/id\(appStoreAppID)?action=write-review")
    }

    /// Word books. Only the TOEFL book ships real data in v1.0; other entries are
    /// displayed as "coming soon" so the UI never promises content we don't have.
    struct BookMeta {
        let id: String
        let title: String
        let tagline: String
        let wordCount: Int
        let available: Bool
        let isCurrent: Bool
    }

    static let books: [BookMeta] = [
        BookMeta(id: "highschool", title: "高中词汇", tagline: "高考必备", wordCount: 3680, available: false, isCurrent: false),
        BookMeta(id: "cet4", title: "大学四级", tagline: "四级通关", wordCount: 5000, available: false, isCurrent: false),
        BookMeta(id: "kaoyan", title: "考研词汇", tagline: "考研进阶", wordCount: 5500, available: false, isCurrent: false),
        BookMeta(id: "toefl", title: "托福 TOEFL", tagline: "出国留学", wordCount: 4123, available: true, isCurrent: true)
    ]

    static var currentBook: BookMeta { books.first(where: \.isCurrent) ?? books[3] }
}
