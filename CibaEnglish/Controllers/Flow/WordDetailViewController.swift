import UIKit

/// 单词详情 (flashcard-style detail, mockup 4-ish): hero card with the word and
/// 英/美 pronunciation buttons, then 释义 / 记忆提示 / 例句 sections. A sticky
/// bottom area holds the remember-state chip, the remember toggle and the
/// bookmark toggle — everything live-updates from ProgressStore.
final class WordDetailViewController: UIViewController {

    private let word: Word
    private let parts: Word.NoteParts

    private let scrollView = UIScrollView()
    private let contentStack = UIStackView()

    private let bookmarkItem = UIBarButtonItem()
    private let chipContainer = UIView()
    private let chipLabel = Theme.makeLabel("", font: Theme.medium(12))
    private let dueLabel = Theme.makeLabel("", font: Theme.mono(12), color: Theme.palette.secondaryText)
    private let rememberButton = Theme.makePrimaryButton(title: "标记为已记住", size: .large)
    private let bookmarkButton = Theme.makeGhostButton(title: "加入生词本")

    init(word: Word) {
        self.word = word
        self.parts = word.parsedNote()
        super.init(nibName: nil, bundle: nil)
        title = "单词详情"
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Theme.palette.background

        bookmarkItem.image = UIImage(systemName: "bookmark")
        bookmarkItem.target = self
        bookmarkItem.action = #selector(toggleBookmark)
        bookmarkItem.tintColor = Theme.palette.primary
        navigationItem.rightBarButtonItem = bookmarkItem

        rememberButton.addTarget(self, action: #selector(toggleRemember), for: .touchUpInside)
        bookmarkButton.addTarget(self, action: #selector(toggleBookmark), for: .touchUpInside)

        buildContent()
        buildStickyFooter()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        refresh()
        if SettingsStore.shared.autoSpeakWord {
            SpeechService.shared.speak(word.word, accent: .american)
        }
    }

    // MARK: - Layout

    private func buildContent() {
        scrollView.backgroundColor = .clear
        scrollView.alwaysBounceVertical = true
        scrollView.showsVerticalScrollIndicator = false
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scrollView)

        contentStack.axis = .vertical
        contentStack.spacing = 14
        contentStack.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(contentStack)
        NSLayoutConstraint.activate([
            contentStack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 16),
            contentStack.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor, constant: Theme.Metrics.hMargin),
            contentStack.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor, constant: -Theme.Metrics.hMargin),
            contentStack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -24),
            contentStack.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor, constant: -Theme.Metrics.hMargin * 2)
        ])

        contentStack.addArrangedSubview(makeHeroCard())
    }

    private func makeHeroCard() -> UIView {
        let card = Theme.makeCard()

        let wordLabel = Theme.makeLabel(word.word,
                                        font: Theme.semibold(38),
                                        color: Theme.palette.ink,
                                        alignment: .center,
                                        numberOfLines: 0)
        wordLabel.adjustsFontSizeToFitWidth = true
        wordLabel.minimumScaleFactor = 0.45

        let pills = makeSpeakRow()

        let divider = UIView()
        divider.backgroundColor = Theme.palette.border
        divider.heightAnchor.constraint(equalToConstant: 1).isActive = true

        let inner = UIStackView()
        inner.axis = .vertical
        inner.alignment = .fill
        inner.translatesAutoresizingMaskIntoConstraints = false

        inner.addArrangedSubview(wordLabel)
        inner.setCustomSpacing(16, after: wordLabel)
        inner.addArrangedSubview(pills)
        inner.setCustomSpacing(24, after: pills)
        inner.addArrangedSubview(divider)

        var addedContent = false

        if !word.meaning.isEmpty {
            inner.setCustomSpacing(20, after: divider)
            inner.addArrangedSubview(sectionCaption("释义"))
            let meaning = Theme.makeLabel(word.meaning,
                                          font: Theme.medium(18),
                                          color: Theme.palette.ink,
                                          numberOfLines: 0)
            meaning.lineBreakMode = .byWordWrapping
            inner.setCustomSpacing(8, after: inner.arrangedSubviews.last ?? meaning)
            inner.addArrangedSubview(meaning)
            addedContent = true
        }

        if !parts.memory.isEmpty {
            inner.setCustomSpacing(20, after: inner.arrangedSubviews.last ?? divider)
            let note = NoteBoxView(badge: "记", text: parts.memory)
            inner.addArrangedSubview(note)
            addedContent = true
        }

        if !parts.examples.isEmpty {
            inner.setCustomSpacing(20, after: inner.arrangedSubviews.last ?? divider)
            inner.addArrangedSubview(sectionCaption("例句"))
            for example in parts.examples {
                let line = Theme.makeLabel(example,
                                           font: Theme.regular(14),
                                           color: Theme.palette.secondaryText,
                                           numberOfLines: 0)
                line.lineBreakMode = .byWordWrapping
                inner.setCustomSpacing(8, after: inner.arrangedSubviews.last ?? divider)
                inner.addArrangedSubview(line)
            }
            addedContent = true
        }

        if !addedContent {
            inner.setCustomSpacing(20, after: divider)
            let placeholder = Theme.makeLabel("（暂无释义）",
                                              font: Theme.regular(14),
                                              color: Theme.palette.tertiaryText,
                                              alignment: .center)
            inner.addArrangedSubview(placeholder)
        }

        card.addSubview(inner)
        NSLayoutConstraint.activate([
            inner.topAnchor.constraint(equalTo: card.topAnchor, constant: 26),
            inner.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -26),
            inner.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 22),
            inner.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -22)
        ])
        return card
    }

    private func sectionCaption(_ title: String) -> UILabel {
        Theme.makeLabel(title,
                        font: Theme.semibold(12),
                        color: Theme.palette.tertiaryText)
    }

    private func makeSpeakRow() -> UIView {
        let container = UIView()
        container.translatesAutoresizingMaskIntoConstraints = false
        let row = UIStackView()
        row.axis = .horizontal
        row.spacing = 12
        row.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(row)

        for accent in SpeechService.Accent.allCases {
            let button = makeAccentButton(accent)
            button.addTarget(self, action: #selector(accentTapped(_:)), for: .touchUpInside)
            row.addArrangedSubview(button)
        }
        NSLayoutConstraint.activate([
            row.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            row.centerYAnchor.constraint(equalTo: container.centerYAnchor),
            row.topAnchor.constraint(equalTo: container.topAnchor),
            row.bottomAnchor.constraint(equalTo: container.bottomAnchor)
        ])
        return container
    }

    private func makeAccentButton(_ accent: SpeechService.Accent) -> UIButton {
        let button = UIButton(type: .system)
        button.backgroundColor = Theme.palette.card
        button.layer.cornerRadius = 9
        button.layer.borderWidth = 1
        button.layer.borderColor = Theme.palette.border.cgColor
        button.tintColor = Theme.palette.primary
        button.setTitleColor(Theme.palette.primary, for: .normal)
        button.titleLabel?.font = Theme.semibold(13)
        button.setTitle(" \(accent.title)", for: .normal)
        let config = UIImage.SymbolConfiguration(pointSize: 11, weight: .semibold)
        button.setImage(UIImage(systemName: "speaker.wave.2.fill", withConfiguration: config), for: .normal)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.widthAnchor.constraint(equalToConstant: 68).isActive = true
        button.heightAnchor.constraint(equalToConstant: 34).isActive = true
        return button
    }

    @objc private func accentTapped(_ sender: UIButton) {
        guard let stack = sender.superview as? UIStackView,
              let index = stack.arrangedSubviews.firstIndex(of: sender),
              index < SpeechService.Accent.allCases.count else { return }
        Theme.haptic(.light)
        let accent = SpeechService.Accent.allCases[index]
        SpeechService.shared.speak(word.word, accent: accent)
    }

    // MARK: - Sticky footer

    private func buildStickyFooter() {
        let footer = UIView()
        footer.backgroundColor = Theme.palette.background
        footer.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(footer)

        let hairline = UIView()
        hairline.backgroundColor = Theme.palette.border
        hairline.translatesAutoresizingMaskIntoConstraints = false
        footer.addSubview(hairline)

        // Status chip
        chipContainer.layer.cornerRadius = 13
        chipContainer.clipsToBounds = true
        chipContainer.translatesAutoresizingMaskIntoConstraints = false
        chipLabel.translatesAutoresizingMaskIntoConstraints = false
        chipContainer.addSubview(chipLabel)
        NSLayoutConstraint.activate([
            chipLabel.topAnchor.constraint(equalTo: chipContainer.topAnchor, constant: 4),
            chipLabel.bottomAnchor.constraint(equalTo: chipContainer.bottomAnchor, constant: -4),
            chipLabel.leadingAnchor.constraint(equalTo: chipContainer.leadingAnchor, constant: 11),
            chipLabel.trailingAnchor.constraint(equalTo: chipContainer.trailingAnchor, constant: -11),
            chipContainer.heightAnchor.constraint(equalToConstant: 26)
        ])

        let statusRow = UIStackView(arrangedSubviews: [chipContainer, dueLabel])
        statusRow.axis = .horizontal
        statusRow.alignment = .center
        statusRow.spacing = 10
        statusRow.translatesAutoresizingMaskIntoConstraints = false

        rememberButton.translatesAutoresizingMaskIntoConstraints = false
        bookmarkButton.translatesAutoresizingMaskIntoConstraints = false

        let stack = UIStackView(arrangedSubviews: [statusRow, rememberButton, bookmarkButton])
        stack.axis = .vertical
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false
        footer.addSubview(stack)

        rememberButton.heightAnchor.constraint(equalToConstant: 50).isActive = true
        bookmarkButton.heightAnchor.constraint(equalToConstant: 42).isActive = true

        NSLayoutConstraint.activate([
            footer.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            footer.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            footer.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),

            hairline.topAnchor.constraint(equalTo: footer.topAnchor),
            hairline.leadingAnchor.constraint(equalTo: footer.leadingAnchor),
            hairline.trailingAnchor.constraint(equalTo: footer.trailingAnchor),
            hairline.heightAnchor.constraint(equalToConstant: 0.7),

            stack.topAnchor.constraint(equalTo: footer.topAnchor, constant: 10),
            stack.leadingAnchor.constraint(equalTo: footer.leadingAnchor, constant: Theme.Metrics.hMargin),
            stack.trailingAnchor.constraint(equalTo: footer.trailingAnchor, constant: -Theme.Metrics.hMargin),
            stack.bottomAnchor.constraint(equalTo: footer.bottomAnchor, constant: -10),

            scrollView.topAnchor.constraint(equalTo: view.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: footer.topAnchor)
        ])
    }

    // MARK: - State

    @objc private func refresh() {
        let progress = ProgressStore.shared.progress(for: word.id)
        let remembered = progress.remembered

        chipLabel.text = remembered ? "已记住" : "未记住"
        chipContainer.backgroundColor = remembered ? Theme.palette.primarySoft : Theme.palette.track
        chipLabel.textColor = remembered ? Theme.palette.primarySoftText : Theme.palette.secondaryText

        if let dueAt = progress.dueAt {
            dueLabel.text = "下次复习 \(dueAt.friendlyDueText)"
        } else {
            dueLabel.text = "尚未安排复习"
        }

        rememberButton.setTitle(remembered ? "标记为未记住" : "标记为已记住", for: .normal)

        let bookmarked = progress.bookmarked
        bookmarkButton.setTitle(bookmarked ? "移出生词本" : "加入生词本", for: .normal)
        let config = UIImage.SymbolConfiguration(pointSize: 20, weight: .medium)
        let name = bookmarked ? "bookmark.fill" : "bookmark"
        bookmarkItem.image = UIImage(systemName: name, withConfiguration: config)?
            .withTintColor(Theme.palette.primary, renderingMode: .alwaysOriginal)
    }

    @objc private func toggleRemember() {
        Theme.haptic()
        let current = ProgressStore.shared.progress(for: word.id).remembered
        ProgressStore.shared.setRemembered(id: word.id, !current)
        refresh()
    }

    @objc private func toggleBookmark() {
        Theme.haptic()
        let current = ProgressStore.shared.progress(for: word.id).bookmarked
        ProgressStore.shared.setBookmarked(id: word.id, !current)
        refresh()
    }
}
