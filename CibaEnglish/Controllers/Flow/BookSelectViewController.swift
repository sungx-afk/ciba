import UIKit

/// 选择词库 (mockup 1): a 2×2 grid of book cards under a short intro block.
/// Only the TOEFL book ships real data in v1.0; the other entries render as
/// locked "敬请期待" cards. Selecting a card updates its green border + radio
/// check; 确定 pops back to wherever the flow started.
final class BookSelectViewController: UIViewController {

    private var selectedID = AppConfig.currentBook.id
    private var cards: [BookCardView] = []

    private let confirmButton = Theme.makePrimaryButton(title: "确定")

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Theme.palette.background
        title = "选择词库"

        confirmButton.addTarget(self, action: #selector(confirmTapped), for: .touchUpInside)

        let contentStack = buildContent()
        let bottomStack = buildBottom()

        view.addSubview(contentStack)
        view.addSubview(bottomStack)

        NSLayoutConstraint.activate([
            contentStack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24),
            contentStack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: Theme.Metrics.hMargin),
            contentStack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -Theme.Metrics.hMargin),
            contentStack.bottomAnchor.constraint(lessThanOrEqualTo: bottomStack.topAnchor, constant: -24),

            bottomStack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: Theme.Metrics.hMargin),
            bottomStack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -Theme.Metrics.hMargin),
            bottomStack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12)
        ])
    }

    // MARK: - Content

    private func buildContent() -> UIStackView {
        let heading = Theme.makeLabel("英语单词分类记忆",
                                      font: Theme.semibold(26),
                                      color: Theme.palette.ink)
        heading.adjustsFontSizeToFitWidth = true
        heading.minimumScaleFactor = 0.6

        let slogan = Theme.makeLabel("顺应大脑规律，把零散单词打包为语义组块，降低记忆压力，让复习节奏更科学。",
                                     font: Theme.regular(13.5),
                                     color: Theme.palette.secondaryText,
                                     numberOfLines: 0)

        let hint = Theme.makeLabel("请选择需要的词库",
                                   font: Theme.regular(13),
                                   color: Theme.palette.tertiaryText)

        let grid = buildGrid()

        let stack = UIStackView(arrangedSubviews: [heading, slogan, hint, grid])
        stack.axis = .vertical
        stack.alignment = .fill
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.setCustomSpacing(6, after: heading)
        stack.setCustomSpacing(16, after: slogan)
        stack.setCustomSpacing(20, after: hint)
        return stack
    }

    private func buildGrid() -> UIStackView {
        let metas = AppConfig.books
        for meta in metas {
            let card = BookCardView(meta: meta)
            card.onTap = { [weak self] in
                self?.cardTapped(meta)
            }
            card.isSelected = (meta.id == selectedID)
            cards.append(card)
        }

        let grid = UIStackView()
        grid.axis = .vertical
        grid.spacing = 12
        grid.translatesAutoresizingMaskIntoConstraints = false

        var index = 0
        while index < cards.count {
            let end = min(index + 2, cards.count)
            let row = UIStackView(arrangedSubviews: Array(cards[index..<end]))
            row.axis = .horizontal
            row.distribution = .fillEqually
            row.spacing = 12
            grid.addArrangedSubview(row)
            index = end
        }
        cards.forEach { $0.heightAnchor.constraint(equalToConstant: 92).isActive = true }
        return grid
    }

    private func buildBottom() -> UIStackView {
        let caption = Theme.makeLabel("可随时在「我」中更换词库",
                                      font: Theme.regular(12),
                                      color: Theme.palette.tertiaryText,
                                      alignment: .center)

        let stack = UIStackView(arrangedSubviews: [confirmButton, caption])
        stack.axis = .vertical
        stack.spacing = 8
        stack.translatesAutoresizingMaskIntoConstraints = false
        confirmButton.heightAnchor.constraint(equalToConstant: 50).isActive = true
        return stack
    }

    // MARK: - Actions

    private func cardTapped(_ meta: AppConfig.BookMeta) {
        guard meta.available else {
            let alert = UIAlertController.simple(title: "敬请期待", message: "该词库即将上线，敬请期待")
            present(alert, animated: true)
            return
        }
        guard meta.id != selectedID else { return }
        Theme.haptic()
        selectedID = meta.id
        cards.forEach { $0.isSelected = ($0.meta.id == selectedID) }
    }

    @objc private func confirmTapped() {
        Theme.haptic()
        guard let selected = AppConfig.books.first(where: { $0.id == selectedID }), selected.available else {
            let alert = UIAlertController.simple(title: "敬请期待", message: "该词库即将上线，敬请期待")
            present(alert, animated: true)
            return
        }
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
}

// MARK: - Book card

/// One tappable book tile: title + subtitle (词数 or 敬请期待) + status glyph.
private final class BookCardView: UIView {

    let meta: AppConfig.BookMeta
    var onTap: (() -> Void)?

    var isSelected: Bool = false {
        didSet { refreshAppearance() }
    }

    private let titleLabel = Theme.makeLabel("", font: Theme.semibold(16), numberOfLines: 1)
    private let subtitleLabel = Theme.makeLabel("", font: Theme.mono(12.5), numberOfLines: 1)
    private let statusIcon = UIImageView()

    init(meta: AppConfig.BookMeta) {
        self.meta = meta
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false

        backgroundColor = Theme.palette.card
        layer.cornerRadius = Theme.Metrics.cardRadius
        layer.borderWidth = 1
        layer.borderColor = Theme.palette.border.cgColor

        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        subtitleLabel.translatesAutoresizingMaskIntoConstraints = false
        statusIcon.translatesAutoresizingMaskIntoConstraints = false
        statusIcon.contentMode = .scaleAspectFit

        addSubview(titleLabel)
        addSubview(subtitleLabel)
        addSubview(statusIcon)

        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: topAnchor, constant: 20),
            titleLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            titleLabel.trailingAnchor.constraint(lessThanOrEqualTo: statusIcon.leadingAnchor, constant: -10),

            subtitleLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 5),
            subtitleLabel.leadingAnchor.constraint(equalTo: titleLabel.leadingAnchor),
            subtitleLabel.trailingAnchor.constraint(lessThanOrEqualTo: statusIcon.leadingAnchor, constant: -10),

            statusIcon.topAnchor.constraint(equalTo: topAnchor, constant: 14),
            statusIcon.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14),
            statusIcon.widthAnchor.constraint(equalToConstant: 22),
            statusIcon.heightAnchor.constraint(equalToConstant: 22)
        ])

        titleLabel.setContentHuggingPriority(.defaultLow, for: .horizontal)
        subtitleLabel.setContentHuggingPriority(.defaultLow, for: .horizontal)

        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped))
        addGestureRecognizer(tap)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    @objc private func tapped() { onTap?() }

    private func refreshAppearance() {
        let locked = !meta.available

        layer.borderWidth = isSelected ? 1.6 : 1
        layer.borderColor = isSelected ? Theme.palette.primary.cgColor : Theme.palette.border.cgColor

        titleLabel.text = meta.title
        titleLabel.textColor = locked ? Theme.palette.secondaryText : Theme.palette.ink

        let iconConfig = UIImage.SymbolConfiguration(pointSize: 17, weight: .medium)
        if locked {
            subtitleLabel.text = "敬请期待"
            subtitleLabel.font = Theme.regular(12.5)
            subtitleLabel.textColor = Theme.palette.tertiaryText
            statusIcon.image = UIImage(systemName: "lock.fill", withConfiguration: iconConfig)?
                .withTintColor(Theme.palette.tertiaryText, renderingMode: .alwaysOriginal)
        } else if isSelected {
            subtitleLabel.text = "\(meta.wordCount.groupedString) 词"
            subtitleLabel.font = Theme.mono(12.5)
            subtitleLabel.textColor = Theme.palette.tertiaryText
            let checkConfig = UIImage.SymbolConfiguration(pointSize: 20, weight: .semibold)
            statusIcon.image = UIImage(systemName: "checkmark.circle.fill", withConfiguration: checkConfig)?
                .withTintColor(Theme.palette.primary, renderingMode: .alwaysOriginal)
        } else {
            subtitleLabel.text = "\(meta.wordCount.groupedString) 词"
            subtitleLabel.font = Theme.mono(12.5)
            subtitleLabel.textColor = Theme.palette.tertiaryText
            statusIcon.image = UIImage(systemName: "circle", withConfiguration: iconConfig)?
                .withTintColor(Theme.palette.tertiaryText, renderingMode: .alwaysOriginal)
        }
    }
}
