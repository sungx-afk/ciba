import UIKit

// MARK: - Card row (category / sub-category rows with progress)

final class CategoryRowCell: UITableViewCell {
    static let reuseID = "CategoryRowCell"
    static let rowHeight: CGFloat = 76
    static let outerBottom: CGFloat = 10 // extra visual gap below card

    private let card = UIView()
    private let dot = UIView()
    private let titleLabel = UILabel()
    private let countLabel = UILabel()
    private let bar = ProgressBarView()
    private let chevron = UIImageView()

    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        selectionStyle = .none
        backgroundColor = .clear
        contentView.backgroundColor = .clear

        card.backgroundColor = Theme.palette.card
        card.layer.cornerRadius = Theme.Metrics.cardRadius
        card.layer.borderWidth = 1
        card.layer.borderColor = Theme.palette.border.cgColor
        card.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(card)

        // Colour token: the only thing distinguishing one category row from the
        // next at a glance. Kept to a dot rather than a filled tile or a left
        // rail so 34 of them in a column stay quiet.
        dot.layer.cornerRadius = 3.5
        dot.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(dot)

        titleLabel.font = Theme.semibold(16.5)
        titleLabel.textColor = Theme.palette.ink
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(titleLabel)

        countLabel.font = Theme.mono(12)
        countLabel.textColor = Theme.palette.tertiaryText
        countLabel.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(countLabel)

        chevron.image = Theme.makeChevron().image
        chevron.tintColor = Theme.palette.tertiaryText
        chevron.contentMode = .scaleAspectFit
        chevron.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(chevron)

        bar.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(bar)

        NSLayoutConstraint.activate([
            card.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 1),
            card.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: Theme.Metrics.hMargin),
            card.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -Theme.Metrics.hMargin),
            card.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -11),

            dot.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
            dot.centerYAnchor.constraint(equalTo: titleLabel.centerYAnchor),
            dot.widthAnchor.constraint(equalToConstant: 7),
            dot.heightAnchor.constraint(equalToConstant: 7),

            titleLabel.topAnchor.constraint(equalTo: card.topAnchor, constant: 13),
            titleLabel.leadingAnchor.constraint(equalTo: dot.trailingAnchor, constant: 9),
            titleLabel.trailingAnchor.constraint(lessThanOrEqualTo: chevron.leadingAnchor, constant: -12),

            countLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 3),
            countLabel.leadingAnchor.constraint(equalTo: titleLabel.leadingAnchor),
            countLabel.trailingAnchor.constraint(lessThanOrEqualTo: chevron.leadingAnchor, constant: -12),

            chevron.centerYAnchor.constraint(equalTo: card.centerYAnchor),
            chevron.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),
            chevron.widthAnchor.constraint(equalToConstant: 16),

            bar.leadingAnchor.constraint(equalTo: titleLabel.leadingAnchor),
            bar.widthAnchor.constraint(equalToConstant: 200),
            bar.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -9)
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    /// `barColor` nil → the row takes its identity colour from the title, so a
    /// category keeps the same colour everywhere it appears. Pass a colour to
    /// override (the 未记住 filter greys the bars out).
    func configure(title: String, countText: String, ratio: Float, barColor: UIColor? = nil, showsBar: Bool = true) {
        titleLabel.text = title
        countLabel.text = countText
        let identity = Theme.categoryColor(for: title)
        dot.backgroundColor = identity
        bar.isHidden = !showsBar
        bar.setProgress(ratio, color: barColor ?? identity, animated: false)
    }
}

// MARK: - Word row (list rows with remember-check or bookmark)

final class WordCell: UITableViewCell {
    static let reuseID = "WordCell"
    static let rowHeight: CGFloat = 84

    enum Mode { case check, bookmark }
    var onToggle: (() -> Void)?

    private let card = UIView()
    private let wordLabel = UILabel()
    private let meaningLabel = UILabel()
    private let actionButton = UIButton(type: .custom)
    private var mode: Mode = .check

    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        selectionStyle = .none
        backgroundColor = .clear
        contentView.backgroundColor = .clear

        card.backgroundColor = Theme.palette.card
        card.layer.cornerRadius = Theme.Metrics.cardRadius
        card.layer.borderWidth = 1
        card.layer.borderColor = Theme.palette.border.cgColor
        card.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(card)

        wordLabel.font = Theme.semibold(17)
        wordLabel.textColor = Theme.palette.ink
        wordLabel.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(wordLabel)

        meaningLabel.font = Theme.regular(12.5)
        meaningLabel.textColor = Theme.palette.secondaryText
        meaningLabel.numberOfLines = 1
        meaningLabel.lineBreakMode = .byTruncatingTail
        meaningLabel.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(meaningLabel)

        actionButton.translatesAutoresizingMaskIntoConstraints = false
        actionButton.addTarget(self, action: #selector(toggleTapped), for: .touchUpInside)
        card.addSubview(actionButton)

        NSLayoutConstraint.activate([
            card.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 4),
            card.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: Theme.Metrics.hMargin),
            card.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -Theme.Metrics.hMargin),
            card.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -4),

            wordLabel.topAnchor.constraint(equalTo: card.topAnchor, constant: 15),
            wordLabel.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
            wordLabel.trailingAnchor.constraint(lessThanOrEqualTo: actionButton.leadingAnchor, constant: -12),

            meaningLabel.topAnchor.constraint(equalTo: wordLabel.bottomAnchor, constant: 5),
            meaningLabel.leadingAnchor.constraint(equalTo: wordLabel.leadingAnchor),
            meaningLabel.trailingAnchor.constraint(lessThanOrEqualTo: actionButton.leadingAnchor, constant: -12),

            actionButton.centerYAnchor.constraint(equalTo: card.centerYAnchor),
            actionButton.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),
            actionButton.widthAnchor.constraint(equalToConstant: 40),
            actionButton.heightAnchor.constraint(equalToConstant: 40)
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    @objc private func toggleTapped() { onToggle?() }

    /// mode .check → circular 记住 button; mode .bookmark → filled bookmark glyph.
    func configure(word: String, meaning: String, remembered: Bool, bookmarked: Bool, mode: Mode) {
        self.mode = mode
        wordLabel.text = word
        meaningLabel.text = meaning.isEmpty ? "（暂无释义）" : meaning

        if mode == .check {
            let diameter: CGFloat = 26
            actionButton.layer.cornerRadius = diameter / 2
            actionButton.layer.borderWidth = remembered ? 0 : 1.2
            actionButton.layer.borderColor = Theme.palette.border.cgColor
            actionButton.backgroundColor = remembered ? Theme.palette.primarySoft : .clear
            let config = UIImage.SymbolConfiguration(pointSize: 13, weight: .bold)
            let image = UIImage(systemName: "checkmark", withConfiguration: config)?
                .withTintColor(remembered ? Theme.palette.primary : .clear, renderingMode: .alwaysOriginal)
            actionButton.setImage(image, for: .normal)
            actionButton.imageView?.contentMode = .scaleAspectFit
            actionButton.accessibilityLabel = remembered ? "标记为未记住" : "标记为已记住"
        } else {
            actionButton.layer.cornerRadius = 0
            actionButton.layer.borderWidth = 0
            actionButton.backgroundColor = .clear
            let config = UIImage.SymbolConfiguration(pointSize: 18, weight: .medium)
            let color = bookmarked ? Theme.palette.primary : Theme.palette.tertiaryText
            let image = UIImage(systemName: "bookmark.fill", withConfiguration: config)?
                .withTintColor(color, renderingMode: .alwaysOriginal)
            actionButton.setImage(image, for: .normal)
            actionButton.accessibilityLabel = bookmarked ? "移出生词本" : "加入生词本"
        }
    }
}
