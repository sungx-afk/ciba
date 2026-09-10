import UIKit

/// 本轮学习/复习完成后的结果页：绿色对勾奖章 + 本轮数据卡片
/// (本组单词 / 巩固成功 / 待巩固 / 连续打卡) 以及两个操作：
/// 完成 pops back to the word list; 再学一轮 immediately starts a new session
/// with the still-unlearned (or still-due) words of the same scope.
final class StudyResultViewController: UIViewController {

    private let stats: StudyRoundStats

    init(stats: StudyRoundStats) {
        self.stats = stats
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Theme.palette.background
        title = stats.mode.resultTitle

        buildLayout()
    }

    // MARK: - Layout

    private func buildLayout() {
        // Celebration medallion
        let medallion = UIView()
        medallion.backgroundColor = Theme.palette.primary
        medallion.layer.cornerRadius = 60
        medallion.translatesAutoresizingMaskIntoConstraints = false
        medallion.widthAnchor.constraint(equalToConstant: 120).isActive = true
        medallion.heightAnchor.constraint(equalToConstant: 120).isActive = true

        let checkConfig = UIImage.SymbolConfiguration(pointSize: 48, weight: .heavy)
        let check = UIImageView(image: UIImage(systemName: "checkmark", withConfiguration: checkConfig)?
            .withTintColor(.white, renderingMode: .alwaysOriginal))
        check.contentMode = .scaleAspectFit
        check.translatesAutoresizingMaskIntoConstraints = false
        medallion.addSubview(check)
        NSLayoutConstraint.activate([
            check.centerXAnchor.constraint(equalTo: medallion.centerXAnchor),
            check.centerYAnchor.constraint(equalTo: medallion.centerYAnchor)
        ])

        // Decorative soft ring behind the medallion.
        let halo = UIView()
        halo.backgroundColor = Theme.palette.primarySoft
        halo.layer.cornerRadius = 80
        halo.translatesAutoresizingMaskIntoConstraints = false
        halo.widthAnchor.constraint(equalToConstant: 160).isActive = true
        halo.heightAnchor.constraint(equalToConstant: 160).isActive = true
        view.addSubview(halo)   // behind the medallion

        let titleLabel = Theme.makeLabel(stats.mode.resultTitle,
                                         font: Theme.semibold(22),
                                         color: Theme.palette.ink,
                                         alignment: .center)
        let subtitle = Theme.makeLabel(subtitleText(),
                                       font: Theme.regular(13),
                                       color: Theme.palette.tertiaryText,
                                       alignment: .center)
        let feedback = Theme.makeLabel(stats.isClean ? "全部掌握，太棒了！" : "「稍后」的单词明天会再次出现",
                                       font: Theme.regular(13),
                                       color: stats.isClean ? Theme.palette.primary : Theme.palette.secondaryText,
                                       alignment: .center)

        let topStack = UIStackView(arrangedSubviews: [medallion, titleLabel, subtitle, feedback])
        topStack.axis = .vertical
        topStack.alignment = .center
        topStack.spacing = 12
        topStack.translatesAutoresizingMaskIntoConstraints = false
        topStack.setCustomSpacing(6, after: medallion)
        view.addSubview(topStack)

        // Stats card
        let statsCard = Theme.makeCard()
        let rows = UIStackView()
        rows.axis = .vertical
        rows.spacing = 0
        rows.translatesAutoresizingMaskIntoConstraints = false
        statsCard.addSubview(rows)

        let againColor = stats.again > 0 ? Theme.palette.hard : Theme.palette.secondaryText
        let rowViews = [
            makeStatRow(title: "本组单词", value: stats.total.groupedString),
            makeStatRow(title: "巩固成功", value: stats.success.groupedString, divider: true),
            makeStatRow(title: "待巩固", value: stats.again.groupedString, valueColor: againColor, divider: true),
            makeStatRow(title: "连续打卡", value: "\(ProgressStore.shared.streakDays()) 天", divider: true)
        ]
        rowViews.forEach { rows.addArrangedSubview($0) }

        view.addSubview(statsCard)

        NSLayoutConstraint.activate([
            rows.topAnchor.constraint(equalTo: statsCard.topAnchor, constant: 4),
            rows.bottomAnchor.constraint(equalTo: statsCard.bottomAnchor, constant: -4),
            rows.leadingAnchor.constraint(equalTo: statsCard.leadingAnchor),
            rows.trailingAnchor.constraint(equalTo: statsCard.trailingAnchor)
        ])

        // Bottom actions
        let doneButton = Theme.makePrimaryButton(title: "完成")
        doneButton.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
        let againButton = Theme.makeGhostButton(title: "再学一轮")
        againButton.addTarget(self, action: #selector(againTapped), for: .touchUpInside)

        let buttonStack = UIStackView(arrangedSubviews: [doneButton, againButton])
        buttonStack.axis = .vertical
        buttonStack.spacing = 10
        buttonStack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(buttonStack)
        doneButton.heightAnchor.constraint(equalToConstant: 50).isActive = true
        againButton.heightAnchor.constraint(equalToConstant: 44).isActive = true

        NSLayoutConstraint.activate([
            halo.centerXAnchor.constraint(equalTo: medallion.centerXAnchor),
            halo.centerYAnchor.constraint(equalTo: medallion.centerYAnchor),

            topStack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 36),
            topStack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            topStack.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 48),
            topStack.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -48),

            statsCard.topAnchor.constraint(equalTo: topStack.bottomAnchor, constant: 26),
            statsCard.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: Theme.Metrics.hMargin),
            statsCard.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -Theme.Metrics.hMargin),
            statsCard.bottomAnchor.constraint(lessThanOrEqualTo: buttonStack.topAnchor, constant: -20),

            buttonStack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: Theme.Metrics.hMargin),
            buttonStack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -Theme.Metrics.hMargin),
            buttonStack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -14)
        ])
    }

    private func subtitleText() -> String {
        switch stats.scope {
        case .wordbook: return "来自：生词本"
        case .allDue: return "来自：今日复习"
        default: return "分类：\(stats.scope.title)"
        }
    }

    private func makeStatRow(title: String, value: String,
                             valueColor: UIColor = Theme.palette.ink,
                             divider: Bool = false) -> UIView {
        let row = UIView()
        row.translatesAutoresizingMaskIntoConstraints = false
        row.heightAnchor.constraint(equalToConstant: 44).isActive = true

        let titleLabel = Theme.makeLabel(title, font: Theme.regular(15), color: Theme.palette.ink)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        row.addSubview(titleLabel)

        let valueLabel = Theme.makeLabel(value,
                                         font: Theme.monoMedium(15),
                                         color: valueColor,
                                         alignment: .right)
        valueLabel.translatesAutoresizingMaskIntoConstraints = false
        valueLabel.setContentCompressionResistancePriority(.required, for: .horizontal)
        row.addSubview(valueLabel)

        NSLayoutConstraint.activate([
            titleLabel.leadingAnchor.constraint(equalTo: row.leadingAnchor, constant: 20),
            titleLabel.centerYAnchor.constraint(equalTo: row.centerYAnchor),
            titleLabel.trailingAnchor.constraint(lessThanOrEqualTo: valueLabel.leadingAnchor, constant: -12),

            valueLabel.trailingAnchor.constraint(equalTo: row.trailingAnchor, constant: -20),
            valueLabel.centerYAnchor.constraint(equalTo: row.centerYAnchor)
        ])

        if divider {
            let line = UIView()
            line.backgroundColor = Theme.palette.border
            line.translatesAutoresizingMaskIntoConstraints = false
            row.addSubview(line)
            NSLayoutConstraint.activate([
                line.topAnchor.constraint(equalTo: row.topAnchor),
                line.leadingAnchor.constraint(equalTo: row.leadingAnchor, constant: 20),
                line.trailingAnchor.constraint(equalTo: row.trailingAnchor),
                line.heightAnchor.constraint(equalToConstant: 0.7)
            ])
        }
        return row
    }

    // MARK: - Actions

    @objc private func doneTapped() {
        Theme.haptic()
        guard let nav = navigationController else {
            dismiss(animated: true)
            return
        }
        if nav.viewControllers.count > 1 {
            nav.popViewController(animated: true)
        } else {
            dismiss(animated: true)
        }
    }

    @objc private func againTapped() {
        let engine = StudyEngine()
        let next: [Word]
        switch stats.mode {
        case .reviewDue:
            next = engine.dueWords(in: stats.scope)
        case .learnNew:
            next = engine.words(in: stats.scope, filter: .unremembered)
        }
        guard !next.isEmpty else {
            let alert = UIAlertController.simple(title: nil, message: "本轮没有更多需要学习的单词了")
            present(alert, animated: true)
            return
        }
        Theme.haptic()
        let session = StudySessionViewController(scope: stats.scope, mode: stats.mode, queue: next)
        session.hidesBottomBarWhenPushed = true
        guard let nav = navigationController else { return }
        var vcs = nav.viewControllers
        if !vcs.isEmpty { vcs.removeLast() }
        vcs.append(session)
        nav.setViewControllers(vcs, animated: true)
    }
}
