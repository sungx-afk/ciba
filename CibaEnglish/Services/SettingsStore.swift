import UIKit

/// Lightweight user preferences (nickname, reminder time, speech settings).
final class SettingsStore {

    static let shared = SettingsStore()

    private enum Key {
        static let nickname = "settings.nickname"
        static let avatarIndex = "settings.avatarIndex"
        static let remindEnabled = "settings.remindEnabled"
        static let remindHour = "settings.remindHour"
        static let remindMinute = "settings.remindMinute"
        static let speechRate = "settings.speechRate"
        static let autoSpeak = "settings.autoSpeak"
        static let showPhonetic = "settings.showPhonetic"
        static let dailyGoal = "settings.dailyGoal"
        static let isMember = "settings.isMember"
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    // MARK: Profile

    var nickname: String {
        get { (defaults.string(forKey: Key.nickname) ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }
        set { defaults.set(newValue, forKey: Key.nickname) }
    }

    var displayName: String {
        let name = nickname
        return name.isEmpty ? "词汇学习者" : name
    }

    var avatarIndex: Int {
        get { max(0, min(defaults.integer(forKey: Key.avatarIndex), AvatarPalette.count - 1)) }
        set { defaults.set(newValue, forKey: Key.avatarIndex) }
    }

    // MARK: Reminder

    var isReminderEnabled: Bool {
        get { defaults.object(forKey: Key.remindEnabled) == nil ? true : defaults.bool(forKey: Key.remindEnabled) }
        set { defaults.set(newValue, forKey: Key.remindEnabled) }
    }

    var reminderHour: Int {
        get { defaults.object(forKey: Key.remindHour) == nil ? 20 : defaults.integer(forKey: Key.remindHour) }
        set { defaults.set(newValue, forKey: Key.remindHour) }
    }

    var reminderMinute: Int {
        get { defaults.integer(forKey: Key.remindMinute) }
        set { defaults.set(newValue, forKey: Key.remindMinute) }
    }

    var reminderTimeText: String {
        String(format: "%02d:%02d", reminderHour, reminderMinute)
    }

    // MARK: Speech

    /// AVSpeechSynthesizer rate: 0.0 … 1.0. 0.5 = normal.
    var speechRate: Float {
        get { defaults.object(forKey: Key.speechRate) == nil ? 0.5 : defaults.float(forKey: Key.speechRate) }
        set { defaults.set(max(0.2, min(newValue, 0.9)), forKey: Key.speechRate) }
    }

    var autoSpeakWord: Bool {
        get { defaults.object(forKey: Key.autoSpeak) == nil ? true : defaults.bool(forKey: Key.autoSpeak) }
        set { defaults.set(newValue, forKey: Key.autoSpeak) }
    }

    var showPhonetic: Bool {
        get { defaults.object(forKey: Key.showPhonetic) == nil ? true : defaults.bool(forKey: Key.showPhonetic) }
        set { defaults.set(newValue, forKey: Key.showPhonetic) }
    }

    // MARK: Daily goal

    /// Words to study per day. Drives the ring on the 分类 home header.
    var dailyGoal: Int {
        get { defaults.object(forKey: Key.dailyGoal) == nil ? 20 : defaults.integer(forKey: Key.dailyGoal) }
        set { defaults.set(max(5, min(newValue, 200)), forKey: Key.dailyGoal) }
    }

    static let dailyGoalOptions = [10, 20, 30, 50, 80]

    // MARK: Membership flag (local mirror of a StoreKit entitlement)

    var isMember: Bool {
        get { defaults.bool(forKey: Key.isMember) }
        set { defaults.set(newValue, forKey: Key.isMember) }
    }
}

/// Avatar color/emoji palette (index → colors & glyph), used by AvatarView.
/// Built around the logo's four blades, each darkened enough to carry white text.
enum AvatarPalette {
    static let count = 8
    static let backgrounds: [UIColor] = [
        UIColor(hex: 0xE8890F), UIColor(hex: 0x7CAE1C), UIColor(hex: 0x4A78E0),
        UIColor(hex: 0xE0524F), UIColor(hex: 0xC8901A), UIColor(hex: 0x5A9E7A),
        UIColor(hex: 0xA6689B), UIColor(hex: 0x6E7C8C)
    ]
}
