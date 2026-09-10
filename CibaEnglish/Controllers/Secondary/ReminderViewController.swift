import UIKit
import UserNotifications

/// 每日学习提醒：开关 + 提醒时间选择 + 通知权限状态提示。
final class ReminderViewController: UIViewController {

    private let settings = SettingsStore.shared

    private let scrollView = UIScrollView()
    private let contentStack = UIStackView()

    private let reminderSwitch = UISwitch()
    private let datePicker = UIDatePicker()
    private let previewLabel = Theme.makeLabel("", font: Theme.mono(13), color: Theme.palette.secondaryText, alignment: .center)
    private let warnRow = UIStackView()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Theme.palette.background
        title = "学习提醒"

        setupScroll()
        buildContent()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        refreshPermissionStatus()
    }

    // MARK: - Layout

    private func setupScroll() {
        scrollView.backgroundColor = .clear
        scrollView.alwaysBounceVertical = true
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scrollView)
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])

        contentStack.axis = .vertical
        contentStack.spacing = 12
        contentStack.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(contentStack)
        NSLayoutConstraint.activate([
            contentStack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 16),
            contentStack.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor, constant: Theme.Metrics.hMargin),
            contentStack.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor, constant: -Theme.Metrics.hMargin),
            contentStack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -24),
            contentStack.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor, constant: -Theme.Metrics.hMargin * 2)
        ])
    }

    private func buildContent() {
        contentStack.addArrangedSubview(makeEnableCard())
        contentStack.addArrangedSubview(makeTimeCard())

        updatePreview()
        contentStack.addArrangedSubview(previewLabel)

        warnRow.axis = .horizontal
        warnRow.spacing = 6
        warnRow.alignment = .center
        warnRow.translatesAutoresizingMaskIntoConstraints = false
        warnRow.isHidden = true

        let warnIcon = UIImageView(image: UIImage(systemName: "exclamationmark.triangle.fill",
                                                  withConfiguration: UIImage.SymbolConfiguration(pointSize: 12, weight: .medium)))
        warnIcon.tintColor = Theme.palette.hard
        warnIcon.contentMode = .scaleAspectFit
        warnIcon.translatesAutoresizingMaskIntoConstraints = false
        warnRow.addArrangedSubview(warnIcon)

        let warnLabel = Theme.makeLabel("通知已被关闭，前往系统设置开启",
                                        font: Theme.regular(12.5),
                                        color: Theme.palette.hard,
                                        alignment: .center)
        warnLabel.numberOfLines = 0
        warnRow.addArrangedSubview(warnLabel)

        let tap = UITapGestureRecognizer(target: self, action: #selector(openSystemSettings))
        warnRow.isUserInteractionEnabled = true
        warnRow.addGestureRecognizer(tap)
        contentStack.addArrangedSubview(warnRow)
    }

    /// 卡片 1：每日提醒开关
    private func makeEnableCard() -> UIView {
        let card = Theme.makeCard()

        let row = UIView()
        row.translatesAutoresizingMaskIntoConstraints = false
        row.heightAnchor.constraint(equalToConstant: 56).isActive = true

        let title = Theme.makeLabel("每日学习提醒", font: Theme.regular(15))
        row.addSubview(title)
        row.addSubview(reminderSwitch)
        NSLayoutConstraint.activate([
            title.leadingAnchor.constraint(equalTo: row.leadingAnchor, constant: 20),
            title.centerYAnchor.constraint(equalTo: row.centerYAnchor),
            reminderSwitch.trailingAnchor.constraint(equalTo: row.trailingAnchor, constant: -16),
            reminderSwitch.centerYAnchor.constraint(equalTo: row.centerYAnchor)
        ])
        card.addSubview(row)
        NSLayoutConstraint.activate([
            row.topAnchor.constraint(equalTo: card.topAnchor),
            row.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            row.trailingAnchor.constraint(equalTo: card.trailingAnchor)
        ])

        let divider = UIView()
        divider.backgroundColor = Theme.palette.border
        divider.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(divider)
        NSLayoutConstraint.activate([
            divider.topAnchor.constraint(equalTo: row.bottomAnchor),
            divider.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
            divider.trailingAnchor.constraint(equalTo: card.trailingAnchor),
            divider.heightAnchor.constraint(equalToConstant: 0.7)
        ])

        let caption = Theme.makeLabel("到点提醒你复习当天单词",
                                      font: Theme.regular(12.5),
                                      color: Theme.palette.secondaryText,
                                      numberOfLines: 0)
        card.addSubview(caption)
        NSLayoutConstraint.activate([
            caption.topAnchor.constraint(equalTo: divider.bottomAnchor, constant: 12),
            caption.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
            caption.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),
            caption.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -14)
        ])

        reminderSwitch.onTintColor = Theme.palette.primary
        reminderSwitch.isOn = settings.isReminderEnabled
        reminderSwitch.translatesAutoresizingMaskIntoConstraints = false
        reminderSwitch.addTarget(self, action: #selector(reminderSwitchChanged(_:)), for: .valueChanged)
        return card
    }

    /// 卡片 2：提醒时间选择
    private func makeTimeCard() -> UIView {
        let card = Theme.makeCard()

        datePicker.datePickerMode = .time
        datePicker.minuteInterval = 5
        datePicker.locale = Locale(identifier: "zh_CN")
        datePicker.preferredDatePickerStyle = .wheels
        datePicker.date = reminderDate()
        datePicker.addTarget(self, action: #selector(timeChanged(_:)), for: .valueChanged)
        datePicker.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(datePicker)
        datePicker.pinToSuperview(insets: UIEdgeInsets(top: 2, left: 8, bottom: 2, right: 8))
        return card
    }

    private func reminderDate() -> Date {
        var components = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        components.hour = settings.reminderHour
        components.minute = settings.reminderMinute
        return Calendar.current.date(from: components) ?? Date()
    }

    private func updatePreview() {
        previewLabel.text = "每天 \(settings.reminderTimeText) 提醒"
    }

    // MARK: - Actions

    @objc private func reminderSwitchChanged(_ sender: UISwitch) {
        Theme.haptic(.light)
        if sender.isOn {
            ReminderService.shared.requestAuthorizationIfNeeded { [weak self] granted in
                guard let self else { return }
                if granted {
                    self.enableReminder()
                } else {
                    self.reminderSwitch.setOn(false, animated: true)
                    self.presentPermissionDeniedAlert()
                }
            }
        } else {
            disableReminder()
        }
    }

    private func enableReminder() {
        settings.isReminderEnabled = true
        scheduleReminder()
        refreshPermissionStatus()
    }

    private func disableReminder() {
        settings.isReminderEnabled = false
        ReminderService.shared.cancel()
        refreshPermissionStatus()
    }

    private func scheduleReminder() {
        ReminderService.shared.scheduleDaily(hour: settings.reminderHour,
                                             minute: settings.reminderMinute,
                                             dueCount: StudyEngine().totalDueToday)
    }

    @objc private func timeChanged(_ picker: UIDatePicker) {
        let components = Calendar.current.dateComponents([.hour, .minute], from: picker.date)
        settings.reminderHour = components.hour ?? settings.reminderHour
        settings.reminderMinute = components.minute ?? settings.reminderMinute
        updatePreview()
        Theme.haptic(.light)
        // 提醒已开启时，让已排期的通知跟随新时间
        if settings.isReminderEnabled {
            scheduleReminder()
        }
    }

    private func presentPermissionDeniedAlert() {
        let alert = UIAlertController(title: "通知权限未开启",
                                      message: "请到 设置 > 通知 中允许通知，才能收到复习提醒。",
                                      preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        alert.addAction(UIAlertAction(title: "去设置", style: .default) { [weak self] _ in
            self?.openSystemSettings()
        })
        present(alert, animated: true)
    }

    @objc private func openSystemSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    // MARK: - Permission status

    private func refreshPermissionStatus() {
        ReminderService.shared.authorizationStatus { [weak self] status in
            guard let self else { return }
            self.warnRow.isHidden = status != .denied
        }
    }
}
