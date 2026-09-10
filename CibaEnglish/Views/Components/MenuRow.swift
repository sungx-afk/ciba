import UIKit

/// One tappable row inside a white settings-style card:
/// title — value(gray, optional) — chevron. Optional hairline divider on top/bottom.
final class MenuRowView: UIControl {

    var onTap: (() -> Void)?

    private let nameLabel: UILabel
    private let valueLabel = UILabel()
    private let chevron = UIImageView()
    private let divider = UIView()
    private let stack = UIStackView()

    init(title: String, value: String? = nil, showsChevron: Bool = true,
         titleColor: UIColor = Theme.palette.ink, valueColor: UIColor = Theme.palette.tertiaryText) {
        nameLabel = Theme.makeLabel(title, font: Theme.regular(15), color: titleColor)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = .clear
        isUserInteractionEnabled = true
        accessibilityIdentifier = "menu-\(title)"

        valueLabel.font = Theme.regular(13)
        valueLabel.textColor = valueColor
        valueLabel.text = value
        valueLabel.textAlignment = .right
        valueLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        chevron.image = Theme.makeChevron().image
        chevron.contentMode = .scaleAspectFit
        chevron.setContentHuggingPriority(.required, for: .horizontal)

        stack.axis = .horizontal
        stack.alignment = .center
        stack.spacing = 8
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.addArrangedSubview(nameLabel)
        stack.addArrangedSubview(valueLabel)
        stack.addArrangedSubview(chevron)
        chevron.isHidden = !showsChevron
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            heightAnchor.constraint(greaterThanOrEqualToConstant: 52)
        ])
        nameLabel.setContentHuggingPriority(.defaultLow, for: .horizontal)
        valueLabel.setContentHuggingPriority(.required, for: .horizontal)

        divider.backgroundColor = Theme.palette.border
        divider.isHidden = true
        divider.translatesAutoresizingMaskIntoConstraints = false
        addSubview(divider)
        NSLayoutConstraint.activate([
            divider.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),
            divider.trailingAnchor.constraint(equalTo: trailingAnchor),
            divider.heightAnchor.constraint(equalToConstant: 0.7),
            divider.topAnchor.constraint(equalTo: topAnchor)
        ])

        addTarget(self, action: #selector(tapped), for: .touchUpInside)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func setValue(_ value: String?) {
        valueLabel.text = value
        valueLabel.isHidden = (value == nil)
    }

    func setTitleColor(_ color: UIColor) { nameLabel.textColor = color }

    /// Shows a hairline above the row (used for rows 2..n inside one card).
    func showTopDivider(_ show: Bool) {
        divider.isHidden = !show
    }

    @objc private func tapped() {
        onTap?()
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesBegan(touches, with: event)
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesEnded(touches, with: event)
        // Robust tap detection that does not depend on UIControl's internal
        // tracking (which can be suppressed by scroll-view gesture arbitration).
        if isEnabled, let touch = touches.first, bounds.contains(touch.location(in: self)) {
            tapped()
        }
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesCancelled(touches, with: event)
    }

    override var isHighlighted: Bool {
        didSet {
            backgroundColor = isHighlighted ? UIColor.black.withAlphaComponent(0.04) : .clear
        }
    }
}

/// Title shown above a settings group (gray, medium).
final class GroupTitleLabel: UILabel {
    init(_ text: String) {
        super.init(frame: .zero)
        self.text = text
        font = Theme.medium(13)
        textColor = Theme.palette.tertiaryText
        translatesAutoresizingMaskIntoConstraints = false
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
}
