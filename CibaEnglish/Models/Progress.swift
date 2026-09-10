import Foundation

/// Per-word learning state, persisted by ProgressStore.
struct WordProgress: Codable, Equatable {
    var remembered = false      // 已记住: answered with ≥1 day interval at least once
    var reps = 0                // successful repetitions so far
    var intervalDays = 0        // current spacing in days
    var dueAt: Date?            // next review date (start of day). nil == never scheduled
    var lastReviewedAt: Date?
    var bookmarked = false      // in 生词本

    func isDue(now: Date) -> Bool {
        guard let dueAt else { return false }
        return dueAt <= now
    }
}

/// The four answer buttons on a study card, mirroring the mockup:
/// 稍后重来(灰) · 1 天·困难(橙) · 3 天·一般(金) · 7 天·容易(绿)
enum IntervalChoice: Int, CaseIterable {
    case again = 0
    case day1 = 1
    case day3 = 3
    case day7 = 7

    var intervalDays: Int { rawValue }

    var title: String {
        switch self {
        case .again: return "稍后"
        case .day1: return "1 天"
        case .day3: return "3 天"
        case .day7: return "7 天"
        }
    }

    var subtitle: String {
        switch self {
        case .again: return "重来"
        case .day1: return "困难"
        case .day3: return "一般"
        case .day7: return "容易"
        }
    }

    var isSuccess: Bool { self != .again }
}

/// Pure spacing logic — no UI, fully unit-testable.
enum Scheduler {

    static let dayKeyFormat = "yyyyMMdd"

    /// Applies an answer to the previous progress state.
    static func apply(_ choice: IntervalChoice,
                      to progress: WordProgress,
                      now: Date,
                      calendar: Calendar = .current) -> WordProgress {
        var next = progress
        let today = calendar.startOfDay(for: now)

        switch choice {
        case .again:
            // Failed → drop back to unremembered; try again tomorrow.
            next.remembered = false
            next.reps = 0
            next.intervalDays = 0
            next.dueAt = calendar.date(byAdding: .day, value: 1, to: today)
        case .day1, .day3, .day7:
            next.remembered = true
            next.reps = progress.remembered ? progress.reps + 1 : 1
            next.intervalDays = choice.intervalDays
            next.dueAt = calendar.date(byAdding: .day, value: choice.intervalDays, to: today)
        }
        next.lastReviewedAt = now
        return next
    }

    /// Direct "mark as remembered" used by list checkmarks → behaves like a normal 3 天 answer.
    static func markRemembered(_ progress: WordProgress,
                               now: Date,
                               calendar: Calendar = .current) -> WordProgress {
        apply(.day3, to: progress, now: now, calendar: calendar)
    }

    /// Direct "mark as not remembered" from a list checkmark.
    static func markUnremembered(_ progress: WordProgress,
                                 now: Date,
                                 calendar: Calendar = .current) -> WordProgress {
        apply(.again, to: progress, now: now, calendar: calendar)
    }

    /// Consecutive-day streak. Counts back from `today`; a streak that last ended
    /// yesterday is still alive until today ends.
    static func computeStreak(studyDays: Set<String>,
                              asOf date: Date,
                              calendar: Calendar = .current) -> Int {
        var day = calendar.startOfDay(for: date)
        guard let formatter = dayKeyFormatter(calendar: calendar) else { return 0 }
        var streak = 0
        var cursor = day
        // Walk backwards through consecutive studied days.
        while true {
            let key = formatter.string(from: cursor)
            if studyDays.contains(key) {
                streak += 1
                guard let prev = calendar.date(byAdding: .day, value: -1, to: cursor) else { break }
                cursor = prev
            } else {
                break
            }
        }
        // Allow "alive" streak when today not yet studied but yesterday was.
        let todayKey = formatter.string(from: day)
        if !studyDays.contains(todayKey) && streak == 0 {
            guard let yesterday = calendar.date(byAdding: .day, value: -1, to: day) else { return 0 }
            let yKey = formatter.string(from: yesterday)
            if studyDays.contains(yKey) {
                var cursor2 = yesterday
                while true {
                    let key = formatter.string(from: cursor2)
                    if studyDays.contains(key) {
                        streak += 1
                        guard let prev = calendar.date(byAdding: .day, value: -1, to: cursor2) else { break }
                        cursor2 = prev
                    } else { break }
                }
            }
        }
        return streak
    }

    private static func dayKeyFormatter(calendar: Calendar) -> DateFormatter? {
        let f = DateFormatter()
        f.calendar = calendar
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = dayKeyFormat
        return f
    }

    static func dayKey(for date: Date, calendar: Calendar = .current) -> String {
        let f = DateFormatter()
        f.calendar = calendar
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = dayKeyFormat
        return f.string(from: date)
    }
}
