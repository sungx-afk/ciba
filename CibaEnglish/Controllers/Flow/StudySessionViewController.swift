import UIKit

/// 单词卡 study session (mockup 4): one flashcard at a time. Tap the card to
/// flip from the hidden state (word + 英/美 pronunciation) to the revealed state
/// (释义 + memory tip + example sentences), then pick an interval in the answer
/// bar. Answers are recorded through ProgressStore; when the queue is done the
/// session replaces itself with the result screen so "back" returns to the list.
final class StudySessionViewController: UIViewController {

    private let scope: SessionScope
    private let mode: SessionMode
    private let queue: [Word]

    private var index = 0          // words answered so far == next card index
    private var success = 0
    private var again = 0
    private var isRevealed = false

    private let counterLabel = Theme.makeLabel("", font: Theme.mono(12.5), color: Theme.palette.tertiaryText)
    private let progressView = ProgressBarView()
    private let card = Theme.makeCard()
    private let cardContent = UIStackView()
    private let answerBar = IntervalAnswerBar()
    private var cardHeightConstraint: NSLayoutConstraint?

    // MARK: - Init

    init(scope: SessionScope, mode: SessionMode, queue: [Word]) {
        self.scope = scope
        self.mode = mode
        self.queue = queue
        super.init(nibName: nil, bundle: nil)
        title = scope.title
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    deinit {
        NotificationCenter.default.removeObserver(self)
        SpeechService.shared.stop()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Theme.palette.background

        guard !queue.isEmpty else {
            let empty = EmptyStateView(icon: "tray",
                                       title: "暂时没有可学习的单词",
                                       subtitle: "先去别的分组看看吧")
            view.addSubview(empty)
            empty.centerInSuperview()
            return
        }

        buildLayout()
        answerBar.onChoose = { [weak self] choice in
            self?.answer(choice)
        }
        answerBar.setEnabled(false)

        let tap = UITapGestureRecognizer(target: self, action: #selector(cardTapped))
        tap.delegate = self
        card.addGestureRecognizer(tap)

        updateCounter()
        applyCardContent(revealed: false)
    }

    // MARK: - Layout

    private func buildLayout() {
        counterLabel.translatesAutoresizingMaskIntoConstraints = false
        progressView.translatesAutoresizingMaskIntoConstraints = false
        card.translatesAutoresizingMaskIntoConstraints = false
        answerBar.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(counterLabel)
        view.addSubview(progressView)
        view.addSubview(card)
        view.addSubview(answerBar)

        cardContent.axis = .vertical
        cardContent.alignment = .fill
        cardContent.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(cardContent)

        let height = card.heightAnchor.constraint(equalToConstant: 340)
        height.isActive = true
        cardHeightConstraint = height

        let cardBottomToAnswerBar = card.bottomAnchor.constraint(lessThanOrEqualTo: answerBar.topAnchor, constant: -20)
        cardBottomToAnswerBar.priority = .defaultHigh

        NSLayoutConstraint.activate([
            counterLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            counterLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: Theme.Metrics.hMargin),

            progressView.topAnchor.constraint(equalTo: counterLabel.bottomAnchor, constant: 10),
            progressView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: Theme.Metrics.hMargin),
            progressView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -Theme.Metrics.hMargin),

            card.topAnchor.constraint(equalTo: progressView.bottomAnchor, constant: 18),
            card.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: Theme.Metrics.hMargin),
            card.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -Theme.Metrics.hMargin),
            cardBottomToAnswerBar,

            cardContent.centerXAnchor.constraint(equalTo: card.centerXAnchor),
            cardContent.centerYAnchor.constraint(equalTo: card.centerYAnchor),
            cardContent.topAnchor.constraint(greaterThanOrEqualTo: card.topAnchor, constant: 28),
            cardContent.bottomAnchor.constraint(lessThanOrEqualTo: card.bottomAnchor, constant: -28),
            cardContent.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 24),
            cardContent.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -24),

            answerBar.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: Theme.Metrics.hMargin),
            answerBar.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -Theme.Metrics.hMargin),
            answerBar.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12),
            answerBar.heightAnchor.constraint(equalToConstant: 64)
        ])
    }

    private func currentWord() -> Word? {
        guard index < queue.count else { return nil }
        return queue[index]
    }

    private func updateCounter() {
        counterLabel.text = "\(index + 1) / \(queue.count)"
    }

    // MARK: - Card content

    private func applyCardContent(revealed: Bool) {
        cardContent.arrangedSubviews.forEach { $0.removeFromSuperview() }

        cardContent.spacing = revealed ? 20 : 14
        if revealed {
            for view in revealedViews() { cardContent.addArrangedSubview(view) }
        } else {
            for view in hiddenViews() { cardContent.addArrangedSubview(view) }
        }

        // Height is measured against the fixed card width, then the card height
        // constraint is updated before the layout pass — no transient conflicts.
        let cardWidth = card.bounds.width > 0 ? card.bounds.width : view.bounds.width - Theme.Metrics.hMargin * 2
        let target = CGSize(width: max(0, cardWidth - 48),
                            height: UIView.layoutFittingCompressedSize.height)
        let measured = cardContent.systemLayoutSizeFitting(target,
                                                           withHorizontalFittingPriority: .required,
                                                           verticalFittingPriority: .fittingSizeLevel)
        cardHeightConstraint?.constant = max(340, ceil(measured.height) + 48)

        cardContent.alpha = 0
        UIView.animate(withDuration: 0.26, delay: 0, options: [.curveEaseOut], animations: { [weak self] in
            guard let self else { return }
            self.cardContent.alpha = 1
            self.view.layoutIfNeeded()
        }, completion: nil)
    }

    private func hiddenViews() -> [UIView] {
        guard let word = currentWord() else { return [] }

        let wordLabel = Theme.makeLabel(word.word,
                                        font: Theme.semibold(38),
                                        color: Theme.palette.ink,
                                        alignment: .center,
                                        numberOfLines: 0)
        wordLabel.adjustsFontSizeToFitWidth = true
        wordLabel.minimumScaleFactor = 0.45

        let hint = Theme.makeLabel("点击卡片查看释义",
                                   font: Theme.regular(13),
                                   color: Theme.palette.secondaryText,
                                   alignment: .center)
        return [wordLabel, hint, makeSpeakRow()]
    }

    private func revealedViews() -> [UIView] {
        guard let word = currentWord() else { return [] }
        let parts = word.parsedNote()
        var views: [UIView] = []

        let meaningText = word.meaning.isEmpty ? "（暂无释义）" : word.meaning
        let meaning = Theme.makeLabel(meaningText,
                                      font: Theme.medium(18),
                                      color: Theme.palette.ink,
                                      alignment: .center,
                                      numberOfLines: 0)
        meaning.lineBreakMode = .byWordWrapping
        views.append(meaning)

        if !parts.memory.isEmpty {
            views.append(NoteBoxView(badge: "记", text: parts.memory))
        }
        for example in parts.examples {
            let line = Theme.makeLabel(example,
                                       font: Theme.regular(14),
                                       color: Theme.palette.secondaryText,
                                       numberOfLines: 0)
            line.lineBreakMode = .byWordWrapping
            views.append(line)
        }
        views.append(makeSpeakRow())
        return views
    }

    private func makeSpeakRow() -> UIView {
        let container = UIView()
        container.translatesAutoresizingMaskIntoConstraints = false
        let row = UIStackView()
        row.axis = .horizontal
        row.spacing = 12
        row.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(row)
        NSLayoutConstraint.activate([
            row.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            row.centerYAnchor.constraint(equalTo: container.centerYAnchor),
            row.topAnchor.constraint(equalTo: container.topAnchor),
            row.bottomAnchor.constraint(equalTo: container.bottomAnchor)
        ])

        for accent in SpeechService.Accent.allCases {
            let button = UIButton(type: .system)
            button.backgroundColor = Theme.palette.card
            button.layer.cornerRadius = 8
            button.layer.borderWidth = 1
            button.layer.borderColor = Theme.palette.border.cgColor
            button.tintColor = Theme.palette.primary
            button.setTitleColor(Theme.palette.primary, for: .normal)
            button.titleLabel?.font = Theme.semibold(12.5)
            button.setTitle(" \(accent.title)", for: .normal)
            let config = UIImage.SymbolConfiguration(pointSize: 10, weight: .semibold)
            button.setImage(UIImage(systemName: "speaker.wave.2.fill", withConfiguration: config), for: .normal)
            button.translatesAutoresizingMaskIntoConstraints = false
            button.widthAnchor.constraint(equalToConstant: 62).isActive = true
            button.heightAnchor.constraint(equalToConstant: 32).isActive = true
            button.addTarget(self, action: #selector(accentTapped(_:)), for: .touchUpInside)
            row.addArrangedSubview(button)
        }
        return container
    }

    @objc private func accentTapped(_ sender: UIButton) {
        guard let stack = sender.superview as? UIStackView,
              let idx = stack.arrangedSubviews.firstIndex(of: sender),
              idx < SpeechService.Accent.allCases.count,
              let word = currentWord() else { return }
        SpeechService.shared.speak(word.word, accent: SpeechService.Accent.allCases[idx])
    }

    // MARK: - Card tap

    @objc private func cardTapped() {
        guard currentWord() != nil else { return }
        Theme.haptic(.light)
        isRevealed.toggle()
        answerBar.setEnabled(isRevealed)
        applyCardContent(revealed: isRevealed)

        if isRevealed && SettingsStore.shared.autoSpeakWord, let word = currentWord() {
            SpeechService.shared.speak(word.word, accent: .american)
        }
    }

    // MARK: - Answering

    private func answer(_ choice: IntervalChoice) {
        guard isRevealed, let word = currentWord() else { return }

        ProgressStore.shared.record(id: word.id, choice: choice)
        if choice.isSuccess {
            success += 1
        } else {
            again += 1
        }
        index += 1
        progressView.setProgress(Float(index) / Float(queue.count), animated: true)

        if index >= queue.count {
            finishRound()
            return
        }

        isRevealed = false
        answerBar.setEnabled(false)
        updateCounter()
        applyCardContent(revealed: false)
    }

    private func finishRound() {
        let stats = StudyRoundStats(scope: scope, mode: mode, total: queue.count, success: success, again: again)
        let result = StudyResultViewController(stats: stats)
        guard let nav = navigationController else { return }
        var vcs = nav.viewControllers
        if !vcs.isEmpty { vcs.removeLast() }
        vcs.append(result)
        nav.setViewControllers(vcs, animated: true)
    }
}

// MARK: - Gesture delegate: don't steal taps from the pronunciation buttons

extension StudySessionViewController: UIGestureRecognizerDelegate {
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        var view: UIView? = touch.view
        while let current = view {
            if current is UIControl { return false }
            view = current.superview
        }
        return true
    }
}
