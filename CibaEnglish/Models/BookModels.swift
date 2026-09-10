import Foundation

/// Word-status filter used by the 未记住 / 已记住 / 全部 segmented control.
/// Raw values line up with the segmented control order used across screens.
enum StatusFilter: Int, CaseIterable {
    case unremembered = 0
    case remembered = 1
    case all = 2

    var title: String {
        switch self {
        case .unremembered: return "未记住"
        case .remembered: return "已记住"
        case .all: return "全部"
        }
    }
}

/// Progress numbers for one word: used by cells and empty-state logic.
struct WordStatusSummary {
    let remembered: Int
    let unremembered: Int
    var total: Int { remembered + unremembered }
    var ratio: Float { total == 0 ? 0 : Float(remembered) / Float(total) }
}

/// One 二级分类 (意群) row of a category screen.
struct SubGroupStat {
    let name: String       // display name; "其他" for directly-attached words
    let total: Int
    let remembered: Int
    var unremembered: Int { total - remembered }
    var ratio: Float { total == 0 ? 0 : Float(remembered) / Float(total) }
}

/// One 大类 row of the category home screen.
struct CategoryStat {
    let name: String
    let total: Int
    let remembered: Int
    let subGroups: [SubGroupStat]   // empty == flat category (words sit directly under it)
    var unremembered: Int { total - remembered }
    var ratio: Float { total == 0 ? 0 : Float(remembered) / Float(total) }
}

/// Where a learning session draws its queue from.
enum SessionScope: Equatable {
    case category(name: String)                    // all words of one 大类
    case group(category: String, sub: String)      // one 意群 (二级分类)
    case wordbook                                 // words the user bookmarked
    case allDue                                   // every due word (今日复习)

    var title: String {
        switch self {
        case .category(let name): return name
        case .group(_, let sub): return sub
        case .wordbook: return "生词本"
        case .allDue: return "今日复习"
        }
    }
}

/// What kind of round a study session runs.
enum SessionMode: Equatable {
    case learnNew      // picking up words not yet remembered
    case reviewDue     // refreshing remembered words that became due

    var resultTitle: String {
        switch self {
        case .learnNew: return "本轮学习完成"
        case .reviewDue: return "今日复习完成"
        }
    }

    var badge: String {
        switch self {
        case .learnNew: return "学习"
        case .reviewDue: return "复习"
        }
    }
}

/// Numbers summarized after a finished round (shown on the result screen).
struct StudyRoundStats: Equatable {
    let scope: SessionScope
    let mode: SessionMode
    let total: Int
    let success: Int        // answered with 1/3/7 天
    let again: Int          // answered 稍后重来

    var isClean: Bool { again == 0 }
}
