import UserNotifications

/// Schedules the daily study reminder (default 20:00), matching the "学习提醒" row.
final class ReminderService {

    static let shared = ReminderService()
    private static let identifier = "dailyStudyReminder"

    private init() {}

    func requestAuthorizationIfNeeded(completion: ((Bool) -> Void)? = nil) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            DispatchQueue.main.async { completion?(granted) }
        }
    }

    func authorizationStatus(completion: @escaping (UNAuthorizationStatus) -> Void) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async { completion(settings.authorizationStatus) }
        }
    }

    func scheduleDaily(hour: Int, minute: Int, dueCount: Int) {
        let content = UNMutableNotificationContent()
        content.title = "今日复习提醒"
        content.body = dueCount > 0
            ? "今天有 \(dueCount) 个单词等待复习，花 3 分钟巩固一下吧"
            : "该学习新单词啦，每天进步一点点"
        content.sound = .default

        var components = DateComponents()
        components.hour = hour
        components.minute = minute
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
        let request = UNNotificationRequest(identifier: Self.identifier, content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request)
    }

    func cancel() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [Self.identifier])
    }

    func isScheduled(completion: @escaping (Bool) -> Void) {
        UNUserNotificationCenter.current().getPendingNotificationRequests { requests in
            DispatchQueue.main.async {
                completion(requests.contains { $0.identifier == Self.identifier })
            }
        }
    }

    /// Called after each study session so the reminder body stays truthful.
    func refreshScheduledNotification() {
        guard SettingsStore.shared.isReminderEnabled else { return }
        scheduleDaily(hour: SettingsStore.shared.reminderHour,
                      minute: SettingsStore.shared.reminderMinute,
                      dueCount: StudyEngine().totalDueToday)
    }
}
