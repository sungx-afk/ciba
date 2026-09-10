import UIKit

/// 学习设置：发音（自动朗读 / 语速）+ 数据（导出 / 清空）。
final class SettingsViewController: UIViewController {

    private let settings = SettingsStore.shared
    private let scrollView = UIScrollView()
    private let contentStack = UIStackView()
    private var speedValueLabel: UILabel!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Theme.palette.background
        title = "学习设置"

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
            contentStack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 12),
            contentStack.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor, constant: Theme.Metrics.hMargin),
            contentStack.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor, constant: -Theme.Metrics.hMargin),
            contentStack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -24),
            contentStack.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor, constant: -Theme.Metrics.hMargin * 2)
        ])

        buildContent()
    }

    // MARK: - Build

    private func buildContent() {
        contentStack.addArrangedSubview(GroupTitleLabel("学习"))
        contentStack.addArrangedSubview(makeGoalCard())

        contentStack.addArrangedSubview(GroupTitleLabel("发音"))
        contentStack.addArrangedSubview(makePronunciationCard())

        contentStack.addArrangedSubview(GroupTitleLabel("数据"))
        contentStack.addArrangedSubview(makeDataCard())

        let footnote = Theme.makeLabel("学习数据保存在本机；删除 App 会一并清除。",
                                       font: Theme.regular(11.5),
                                       color: Theme.palette.tertiaryText,
                                       alignment: .center,
                                       numberOfLines: 0)
        contentStack.addArrangedSubview(footnote)
    }

    // MARK: - 学习

    /// 每日目标 drives the ring on the 分类 home header, so it needs somewhere to
    /// be changed — otherwise the ring is measured against a number the user
    /// never chose.
    private func makeGoalCard() -> UIView {
        let card = Theme.makeCard()
        let row = MenuRowView(title: "每日目标", value: "\(settings.dailyGoal) 词 / 天")
        row.onTap = { [weak self, weak row] in
            guard let self, let row else { return }
            self.pickDailyGoal(from: row)
        }
        row.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(row)
        NSLayoutConstraint.activate([
            row.topAnchor.constraint(equalTo: card.topAnchor, constant: 6),
            row.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -6),
            row.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            row.trailingAnchor.constraint(equalTo: card.trailingAnchor)
        ])
        return card
    }

    private func pickDailyGoal(from anchor: UIView) {
        let sheet = UIAlertController(title: "每日目标", message: nil, preferredStyle: .actionSheet)
        for option in SettingsStore.dailyGoalOptions {
            let mark = option == settings.dailyGoal ? " ✓" : ""
            sheet.addAction(UIAlertAction(title: "\(option) 词 / 天\(mark)", style: .default) { [weak self] _ in
                guard let self else { return }
                self.settings.dailyGoal = option
                Theme.haptic(.light)
                NotificationCenter.default.post(name: .progressDidChange, object: nil)
                self.rebuild()
            })
        }
        sheet.addAction(UIAlertAction(title: "取消", style: .cancel))
        if let popover = sheet.popoverPresentationController {
            popover.sourceView = anchor
            popover.sourceRect = anchor.bounds
        }
        present(sheet, animated: true)
    }

    private func rebuild() {
        contentStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        buildContent()
    }

    // MARK: - 发音

    private func makePronunciationCard() -> UIView {
        let card = Theme.makeCard()

        // 行 1：自动朗读单词
        let autoRow = makeRowView(height: 52)
        let autoTitle = Theme.makeLabel("自动朗读单词", font: Theme.regular(15))
        let autoSwitch = UISwitch()
        autoSwitch.onTintColor = Theme.palette.primary
        autoSwitch.isOn = settings.autoSpeakWord
        autoSwitch.translatesAutoresizingMaskIntoConstraints = false
        autoSwitch.addTarget(self, action: #selector(autoSpeakChanged(_:)), for: .valueChanged)
        autoRow.addSubview(autoTitle)
        autoRow.addSubview(autoSwitch)
        NSLayoutConstraint.activate([
            autoTitle.leadingAnchor.constraint(equalTo: autoRow.leadingAnchor, constant: 20),
            autoTitle.centerYAnchor.constraint(equalTo: autoRow.centerYAnchor),
            autoSwitch.trailingAnchor.constraint(equalTo: autoRow.trailingAnchor, constant: -16),
            autoSwitch.centerYAnchor.constraint(equalTo: autoRow.centerYAnchor)
        ])
        card.addSubview(autoRow)
        NSLayoutConstraint.activate([
            autoRow.topAnchor.constraint(equalTo: card.topAnchor),
            autoRow.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            autoRow.trailingAnchor.constraint(equalTo: card.trailingAnchor)
        ])

        // 分隔线
        let divider = makeDivider()
        card.addSubview(divider)
        NSLayoutConstraint.activate([
            divider.topAnchor.constraint(equalTo: autoRow.bottomAnchor),
            divider.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
            divider.trailingAnchor.constraint(equalTo: card.trailingAnchor)
        ])

        // 行 2：发音语速（标题 + 动态值，下方滑杆）
        let rate = settings.speechRate
        let speedTitle = Theme.makeLabel("发音语速", font: Theme.regular(15))
        speedValueLabel = Theme.makeLabel(speedName(rate),
                                          font: Theme.monoMedium(14),
                                          color: Theme.palette.secondaryText,
                                          alignment: .right)
        card.addSubview(speedTitle)
        card.addSubview(speedValueLabel)
        NSLayoutConstraint.activate([
            speedTitle.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
            speedTitle.topAnchor.constraint(equalTo: divider.bottomAnchor, constant: 14),
            speedValueLabel.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),
            speedValueLabel.centerYAnchor.constraint(equalTo: speedTitle.centerYAnchor),
            speedValueLabel.leadingAnchor.constraint(greaterThanOrEqualTo: speedTitle.trailingAnchor, constant: 12)
        ])

        let slider = UISlider()
        slider.minimumValue = 0.25
        slider.maximumValue = 0.75
        slider.value = max(0.25, min(rate, 0.75))
        slider.minimumTrackTintColor = Theme.palette.primary
        slider.maximumTrackTintColor = Theme.palette.track
        slider.addTarget(self, action: #selector(speechRateChanged(_:)), for: .valueChanged)
        slider.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(slider)
        NSLayoutConstraint.activate([
            slider.topAnchor.constraint(equalTo: speedTitle.bottomAnchor, constant: 10),
            slider.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
            slider.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),
            slider.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -18)
        ])
        return card
    }

    private func makeRowView(height: CGFloat) -> UIView {
        let row = UIView()
        row.translatesAutoresizingMaskIntoConstraints = false
        row.heightAnchor.constraint(equalToConstant: height).isActive = true
        return row
    }

    private func makeDivider() -> UIView {
        let view = UIView()
        view.backgroundColor = Theme.palette.border
        view.translatesAutoresizingMaskIntoConstraints = false
        view.heightAnchor.constraint(equalToConstant: 0.7).isActive = true
        return view
    }

    private func speedName(_ rate: Float) -> String {
        if rate < 0.4 { return "慢" }
        if rate < 0.62 { return "正常" }
        return "快"
    }

    @objc private func autoSpeakChanged(_ sender: UISwitch) {
        settings.autoSpeakWord = sender.isOn
        Theme.haptic(.light)
    }

    @objc private func speechRateChanged(_ sender: UISlider) {
        settings.speechRate = sender.value
        speedValueLabel.text = speedName(settings.speechRate)
    }

    // MARK: - 数据

    private func makeDataCard() -> UIView {
        let card = Theme.makeCard()
        let inner = UIStackView()
        inner.axis = .vertical
        inner.spacing = 0
        inner.translatesAutoresizingMaskIntoConstraints = false

        let exportRow = MenuRowView(title: "导出学习记录")
        exportRow.onTap = { [weak self, weak exportRow] in
            guard let self, let exportRow else { return }
            self.exportLearningRecords(from: exportRow)
        }
        inner.addArrangedSubview(exportRow)

        let clearRow = MenuRowView(title: "清空学习记录", titleColor: Theme.palette.danger)
        clearRow.showTopDivider(true)
        clearRow.onTap = { [weak self] in
            self?.confirmClearRecords()
        }
        inner.addArrangedSubview(clearRow)

        card.addSubview(inner)
        NSLayoutConstraint.activate([
            inner.topAnchor.constraint(equalTo: card.topAnchor, constant: 6),
            inner.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -6),
            inner.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            inner.trailingAnchor.constraint(equalTo: card.trailingAnchor)
        ])
        return card
    }

    // MARK: - Export CSV

    private func exportLearningRecords(from anchor: UIView) {
        WordDatabase.shared.loadIfNeeded { [weak self] in
            guard let self else { return }
            let words = WordDatabase.shared.words
            guard !words.isEmpty else {
                let alert = UIAlertController.simple(title: "暂无学习数据",
                                                     message: "先开始学习，再来导出记录吧。")
                self.present(alert, animated: true)
                return
            }

            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = "yyyy-MM-dd"

            var lines: [String] = ["单词,词义,大类,二级分类,已记住,生词本,下次复习"]
            for word in words {
                let progress = ProgressStore.shared.progress(for: word.id)
                let due = progress.dueAt.map { formatter.string(from: $0) } ?? "—"
                let fields = [
                    word.word,
                    word.meaning,
                    word.cat,
                    word.sub.isEmpty ? "—" : word.sub,
                    progress.remembered ? "是" : "否",
                    progress.bookmarked ? "是" : "否",
                    due
                ]
                lines.append(fields.map { Self.csvField($0) }.joined(separator: ","))
            }

            let csv = lines.joined(separator: "\n")
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("word-progress.csv")
            do {
                try csv.write(to: url, atomically: true, encoding: .utf8)
            } catch {
                let alert = UIAlertController.simple(title: "导出失败",
                                                     message: "无法写入导出文件，请稍后重试。")
                self.present(alert, animated: true)
                return
            }

            let activity = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            if let popover = activity.popoverPresentationController {
                popover.sourceView = anchor
                popover.sourceRect = anchor.bounds
            }
            self.present(activity, animated: true)
        }
    }

    private static func csvField(_ raw: String) -> String {
        if raw.contains(",") || raw.contains("\"") || raw.contains("\n") || raw.contains("\r") {
            return "\"" + raw.replacingOccurrences(of: "\"", with: "\"\"") + "\""
        }
        return raw
    }

    // MARK: - Clear

    private func confirmClearRecords() {
        let alert = UIAlertController(title: "清空学习记录",
                                      message: "将删除全部「已记住」「生词本」与复习进度，且无法恢复。确定继续吗？",
                                      preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        alert.addAction(UIAlertAction(title: "清空", style: .destructive) { [weak self] _ in
            guard let self else { return }
            ProgressStore.shared.resetAll()
            Theme.haptic(.medium)
            let done = UIAlertController.simple(title: "已清空学习记录",
                                                message: "所有学习进度已重置，随时可以重新开始。")
            self.present(done, animated: true)
        })
        present(alert, animated: true)
    }
}
