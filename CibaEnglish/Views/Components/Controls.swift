import UIKit

// MARK: - Progress bar (3pt rounded, green fill)

final class ProgressBarView: UIView {
    private let trackView = UIView()
    private let fillView = UIView()
    private var fillWidth: NSLayoutConstraint?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        translatesAutoresizingMaskIntoConstraints = false

        trackView.backgroundColor = Theme.palette.track
        trackView.layer.cornerRadius = 1.5
        trackView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(trackView)

        fillView.backgroundColor = Theme.palette.primary
        fillView.layer.cornerRadius = 1.5
        fillView.translatesAutoresizingMaskIntoConstraints = false
        trackView.addSubview(fillView)

        NSLayoutConstraint.activate([
            trackView.topAnchor.constraint(equalTo: topAnchor),
            trackView.bottomAnchor.constraint(equalTo: bottomAnchor),
            trackView.leadingAnchor.constraint(equalTo: leadingAnchor),
            trackView.trailingAnchor.constraint(equalTo: trailingAnchor),
            heightAnchor.constraint(equalToConstant: 3)
        ])
        let width = fillView.widthAnchor.constraint(equalTo: trackView.widthAnchor, multiplier: 0)
        fillWidth = width
        NSLayoutConstraint.activate([
            fillView.topAnchor.constraint(equalTo: trackView.topAnchor),
            fillView.bottomAnchor.constraint(equalTo: trackView.bottomAnchor),
            fillView.leadingAnchor.constraint(equalTo: trackView.leadingAnchor),
            width
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func setProgress(_ value: Float, color: UIColor? = nil, animated: Bool = true) {
        let clamped = max(0, min(value, 1))
        fillView.backgroundColor = color ?? Theme.palette.primary
        fillWidth?.isActive = false
        let width = fillView.widthAnchor.constraint(equalTo: trackView.widthAnchor, multiplier: CGFloat(clamped))
        width.isActive = true
        fillWidth = width
        if animated {
            UIView.animate(withDuration: 0.25, delay: 0, options: [.curveEaseOut]) {
                self.trackView.layoutIfNeeded()
            }
        }
    }
}

// MARK: - Padded label (pills and badges)

/// A label that reports its intrinsic size with insets, so a pill sizes itself
/// to its text instead of needing a hand-set width per string.
final class PaddedLabel: UILabel {
    private let insets: UIEdgeInsets

    init(insets: UIEdgeInsets) {
        self.insets = insets
        super.init(frame: .zero)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func drawText(in rect: CGRect) {
        super.drawText(in: rect.inset(by: insets))
    }

    override var intrinsicContentSize: CGSize {
        let size = super.intrinsicContentSize
        return CGSize(width: size.width + insets.left + insets.right,
                      height: size.height + insets.top + insets.bottom)
    }
}

// MARK: - Ring progress (today's goal)

/// Thin circular progress ring with a percentage in the middle.
final class RingProgressView: UIView {
    private let track = CAShapeLayer()
    private let fill = CAShapeLayer()
    private let label = UILabel()
    private let lineWidth: CGFloat = 4

    init(diameter: CGFloat) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        isUserInteractionEnabled = false

        for shape in [track, fill] {
            shape.fillColor = UIColor.clear.cgColor
            shape.lineWidth = lineWidth
            shape.lineCap = .round
            layer.addSublayer(shape)
        }
        track.strokeColor = Theme.palette.track.cgColor
        fill.strokeColor = Theme.palette.primary.cgColor
        fill.strokeEnd = 0

        label.font = Theme.semibold(diameter * 0.26)
        label.textColor = Theme.palette.primary
        label.textAlignment = .center
        label.adjustsFontSizeToFitWidth = true
        label.minimumScaleFactor = 0.6
        label.translatesAutoresizingMaskIntoConstraints = false
        addSubview(label)

        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: diameter),
            heightAnchor.constraint(equalToConstant: diameter),
            label.centerXAnchor.constraint(equalTo: centerXAnchor),
            label.centerYAnchor.constraint(equalTo: centerYAnchor),
            label.widthAnchor.constraint(equalTo: widthAnchor, constant: -lineWidth * 3)
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layoutSubviews() {
        super.layoutSubviews()
        let inset = lineWidth / 2
        let rect = bounds.insetBy(dx: inset, dy: inset)
        guard rect.width > 0 else { return }
        // Start at 12 o'clock and sweep clockwise.
        let path = UIBezierPath(arcCenter: CGPoint(x: bounds.midX, y: bounds.midY),
                                radius: rect.width / 2,
                                startAngle: -.pi / 2,
                                endAngle: .pi * 1.5,
                                clockwise: true).cgPath
        track.path = path
        fill.path = path
        track.frame = bounds
        fill.frame = bounds
    }

    /// `ratio` 0…1. The label always shows a whole percentage.
    func setProgress(_ ratio: Float, animated: Bool = false) {
        let clamped = CGFloat(max(0, min(ratio, 1)))
        label.text = "\(Int((clamped * 100).rounded()))%"
        if animated {
            fill.strokeEnd = clamped
        } else {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            fill.strokeEnd = clamped
            CATransaction.commit()
        }
    }
}

// MARK: - Daily goal header (今日学习 · 连续天数)

/// The 分类 tab's header card. Exists so the home screen opens on something
/// that moves — a static list of 34 categories gives a returning user nothing
/// to come back for.
final class DailyGoalCardView: UIView {

    private let ring = RingProgressView(diameter: 46)
    private let titleLabel = Theme.makeLabel("今日学习", font: Theme.semibold(14))
    private let detailLabel = Theme.makeLabel(font: Theme.regular(12), color: Theme.palette.secondaryText)
    private let streakValue = Theme.makeLabel(font: Theme.semibold(19), color: Theme.palette.flame, alignment: .right)
    private let streakCaption = Theme.makeLabel("连续天数", font: Theme.regular(10.5),
                                                color: Theme.palette.tertiaryText, alignment: .right)

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Theme.palette.card
        layer.cornerRadius = 15
        layer.borderWidth = 1
        layer.borderColor = Theme.palette.border.cgColor

        let text = UIStackView(arrangedSubviews: [titleLabel, detailLabel])
        text.axis = .vertical
        text.spacing = 3

        let streak = UIStackView(arrangedSubviews: [streakValue, streakCaption])
        streak.axis = .vertical
        streak.spacing = 1
        streak.alignment = .trailing

        let row = UIStackView(arrangedSubviews: [ring, text, UIView(), streak])
        row.axis = .horizontal
        row.spacing = 13
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        row.pinToSuperview(insets: UIEdgeInsets(top: 14, left: 16, bottom: 14, right: 16))
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func update(studiedToday: Int, goal: Int, streakDays: Int, dueToday: Int) {
        let safeGoal = max(goal, 1)
        ring.setProgress(Float(studiedToday) / Float(safeGoal))
        if dueToday > 0 {
            detailLabel.text = "已学 \(studiedToday) · 目标 \(goal) 词 · 待复习 \(dueToday)"
        } else {
            detailLabel.text = "已学 \(studiedToday) · 目标 \(goal) 词"
        }
        titleLabel.text = studiedToday >= safeGoal ? "今日目标已完成" : "今日学习"
        streakValue.text = "\(streakDays)"
        streakValue.textColor = streakDays > 0 ? Theme.palette.flame : Theme.palette.tertiaryText
    }
}

// MARK: - Pill segmented control (未记住 / 已记住 / 全部)

final class PillSegmentedControl: UIView {
    var onSelect: ((Int) -> Void)?
    private let trackView = UIView()
    private let pillView = UIView()
    private var buttons: [UIButton] = []
    private var pillLeading: NSLayoutConstraint?
    private let trackHeight: CGFloat = 34

    private(set) var selectedIndex: Int

    init(items: [String], selectedIndex: Int = 0) {
        self.selectedIndex = selectedIndex
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false

        trackView.backgroundColor = Theme.palette.track
        trackView.layer.cornerRadius = Theme.Metrics.pillRadius
        trackView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(trackView)

        pillView.backgroundColor = .white
        pillView.layer.cornerRadius = Theme.Metrics.pillRadius - 1
        pillView.layer.shadowColor = UIColor.black.withAlphaComponent(0.06).cgColor
        pillView.layer.shadowOpacity = 1
        pillView.layer.shadowRadius = 2
        pillView.layer.shadowOffset = CGSize(width: 0, height: 1)
        pillView.translatesAutoresizingMaskIntoConstraints = false
        trackView.addSubview(pillView)

        NSLayoutConstraint.activate([
            trackView.topAnchor.constraint(equalTo: topAnchor),
            trackView.leadingAnchor.constraint(equalTo: leadingAnchor),
            trackView.trailingAnchor.constraint(equalTo: trailingAnchor),
            trackView.heightAnchor.constraint(equalToConstant: trackHeight),
            heightAnchor.constraint(equalToConstant: trackHeight)
        ])

        let stack = UIStackView()
        stack.axis = .horizontal
        stack.distribution = .fillEqually
        stack.translatesAutoresizingMaskIntoConstraints = false
        trackView.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: trackView.topAnchor),
            stack.bottomAnchor.constraint(equalTo: trackView.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: trackView.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trackView.trailingAnchor)
        ])

        let width = pillView.widthAnchor.constraint(equalTo: trackView.widthAnchor, multiplier: 1 / CGFloat(max(items.count, 1)))
        let leading = pillView.leadingAnchor.constraint(equalTo: trackView.leadingAnchor)
        NSLayoutConstraint.activate([
            pillView.topAnchor.constraint(equalTo: trackView.topAnchor, constant: 3),
            pillView.bottomAnchor.constraint(equalTo: trackView.bottomAnchor, constant: -3),
            leading, width
        ])
        pillLeading = leading

        for (idx, title) in items.enumerated() {
            let button = UIButton(type: .system)
            button.setTitle(title, for: .normal)
            button.titleLabel?.font = Theme.medium(13)
            button.tag = idx
            button.addTarget(self, action: #selector(tapped(_:)), for: .touchUpInside)
            buttons.append(button)
            stack.addArrangedSubview(button)
        }
        updateColors(animated: false)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.width > 0, let pillLeading else { return }
        let step = bounds.width / CGFloat(max(buttons.count, 1))
        let target = step * CGFloat(selectedIndex)
        if abs(pillLeading.constant - target) > 0.5 {
            pillLeading.constant = target
        }
    }

    @objc private func tapped(_ sender: UIButton) {
        setSelected(sender.tag, animated: true)
        onSelect?(sender.tag)
    }

    func setSelected(_ index: Int, animated: Bool = true) {
        guard index != selectedIndex || !animated else { return }
        selectedIndex = index
        updateColors(animated: animated)
    }

    private func updateColors(animated: Bool) {
        let count = max(buttons.count, 1)
        let target = pillLeading?.constant ?? 0
        let step = bounds.width / CGFloat(count)
        let newConstant = step * CGFloat(selectedIndex)

        for (idx, button) in buttons.enumerated() {
            let selected = idx == selectedIndex
            button.setTitleColor(selected ? Theme.palette.ink : Theme.palette.secondaryText, for: .normal)
            button.titleLabel?.font = Theme.medium(selected ? 13 : 13)
        }
        let apply = { [weak self] in
            self?.pillLeading?.constant = newConstant
            self?.layoutIfNeeded()
        }
        if animated && newConstant != target {
            UIView.animate(withDuration: 0.22, delay: 0, options: [.curveEaseOut], animations: apply)
        } else {
            apply()
        }
    }
}

// MARK: - Avatar (colored disc with initial)

final class AvatarView: UIView {
    private let label = UILabel()
    private var sizeValue: CGFloat

    init(index: Int, size: CGFloat, glyph: String? = nil) {
        self.sizeValue = size
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false

        backgroundColor = AvatarPalette.backgrounds[max(0, min(index, AvatarPalette.count - 1))]
        layer.cornerRadius = size / 2
        clipsToBounds = true

        label.text = glyph ?? "学"
        label.font = Theme.semibold(size * 0.42)
        label.textColor = .white
        label.textAlignment = .center
        label.adjustsFontSizeToFitWidth = true
        label.minimumScaleFactor = 0.5
        label.translatesAutoresizingMaskIntoConstraints = false
        addSubview(label)
        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: topAnchor, constant: size * 0.18),
            label.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -size * 0.18),
            label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: size * 0.12),
            label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -size * 0.12),
            widthAnchor.constraint(equalToConstant: size),
            heightAnchor.constraint(equalToConstant: size)
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func setContent(index: Int, glyph: String?) {
        backgroundColor = AvatarPalette.backgrounds[max(0, min(index, AvatarPalette.count - 1))]
        label.text = glyph ?? "学"
    }
}

// MARK: - Empty state

final class EmptyStateView: UIView {
    var action: (() -> Void)?
    private let stack = UIStackView()
    private let iconView = UIImageView()
    private let titleLabel = UILabel()
    private let subLabel = UILabel()

    init(icon: String, title: String, subtitle: String, actionTitle: String? = nil) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false

        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 8
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor, constant: -20),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 48),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -48)
        ])

        iconView.tintColor = Theme.palette.tertiaryText
        iconView.contentMode = .scaleAspectFit
        iconView.translatesAutoresizingMaskIntoConstraints = false
        stack.addArrangedSubview(iconView)
        iconView.widthAnchor.constraint(equalToConstant: 56).isActive = true
        iconView.heightAnchor.constraint(equalToConstant: 56).isActive = true

        titleLabel.font = Theme.semibold(16)
        titleLabel.textColor = Theme.palette.ink
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 0
        stack.addArrangedSubview(titleLabel)

        subLabel.font = Theme.regular(13)
        subLabel.textColor = Theme.palette.secondaryText
        subLabel.textAlignment = .center
        subLabel.numberOfLines = 0
        stack.addArrangedSubview(subLabel)

        if let actionTitle {
            stack.setCustomSpacing(16, after: subLabel)
            let button = Theme.makePrimaryButton(title: actionTitle, size: .medium)
            button.addTarget(self, action: #selector(tappedAction), for: .touchUpInside)
            stack.addArrangedSubview(button)
            button.widthAnchor.constraint(greaterThanOrEqualToConstant: 160).isActive = true
            button.heightAnchor.constraint(equalToConstant: 40).isActive = true
        }
        apply(icon: icon, title: title, subtitle: subtitle)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    /// Swap content of an already-configured empty state (keeps the action button).
    func replace(icon: String, title: String, subtitle: String) {
        apply(icon: icon, title: title, subtitle: subtitle)
    }

    private func apply(icon: String, title: String, subtitle: String) {
        iconView.image = UIImage(systemName: icon)
        titleLabel.text = title
        subLabel.text = subtitle
    }

    @objc private func tappedAction() { action?() }
}

// MARK: - Note box (memory tip: light-green box with 记 badge)

final class NoteBoxView: UIView {
    init(badge: String, text: String) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Theme.palette.primarySoft
        layer.cornerRadius = Theme.Metrics.smallRadius
        clipsToBounds = true

        let badgeLabel = Theme.makeLabel(badge, font: Theme.semibold(12), color: Theme.palette.primarySoftText)
        let textLabel = Theme.makeLabel(text, font: Theme.regular(13.5), color: Theme.palette.primarySoftText, numberOfLines: 0)
        textLabel.lineBreakMode = .byWordWrapping

        badgeLabel.translatesAutoresizingMaskIntoConstraints = false
        textLabel.translatesAutoresizingMaskIntoConstraints = false
        addSubview(badgeLabel)
        addSubview(textLabel)
        NSLayoutConstraint.activate([
            badgeLabel.topAnchor.constraint(equalTo: topAnchor, constant: 12),
            badgeLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 14),
            badgeLabel.widthAnchor.constraint(equalToConstant: 20),
            textLabel.topAnchor.constraint(equalTo: topAnchor, constant: 12),
            textLabel.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor, constant: -12),
            textLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 44),
            textLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14)
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
}

// MARK: - Study answer bar (稍后 / 1 天 / 3 天 / 7 天)

final class IntervalAnswerBar: UIView {
    var onChoose: ((IntervalChoice) -> Void)?
    private var buttons: [UIButton] = []

    override init(frame: CGRect) {
        super.init(frame: frame)
        translatesAutoresizingMaskIntoConstraints = false
        let stack = UIStackView()
        stack.axis = .horizontal
        stack.distribution = .fillEqually
        stack.spacing = 8
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        stack.pinToSuperview()

        // 稍后 / 困难 / 一般 / 容易 — grey → orange → gold → green, so difficulty
        // reads off the colour alone. (Using `primary` for 容易 would make the
        // last two buttons near-identical now that the primary is amber.)
        let colors: [UIColor] = [
            Theme.palette.grayButton,
            Theme.palette.hard,
            Theme.palette.normal,
            Theme.palette.easy
        ]
        for (idx, choice) in IntervalChoice.allCases.enumerated() {
            let button = makeButton(title: choice.title,
                                    subtitle: choice.subtitle,
                                    color: colors[idx])
            button.tag = idx
            button.addTarget(self, action: #selector(chosen(_:)), for: .touchUpInside)
            buttons.append(button)
            stack.addArrangedSubview(button)
            button.heightAnchor.constraint(equalToConstant: 64).isActive = true
        }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    private func makeButton(title: String, subtitle: String, color: UIColor) -> UIButton {
        let button = UIButton(type: .system)
        button.backgroundColor = color
        button.layer.cornerRadius = Theme.Metrics.smallRadius
        button.clipsToBounds = true

        let titleLabel = Theme.makeLabel(title, font: Theme.semibold(14), color: .white)
        titleLabel.textAlignment = .center
        titleLabel.isUserInteractionEnabled = false
        let subLabel = Theme.makeLabel(subtitle, font: Theme.regular(11), color: .white)
        subLabel.textAlignment = .center
        subLabel.alpha = 0.85
        subLabel.isUserInteractionEnabled = false

        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        subLabel.translatesAutoresizingMaskIntoConstraints = false
        button.addSubview(titleLabel)
        button.addSubview(subLabel)
        NSLayoutConstraint.activate([
            titleLabel.centerXAnchor.constraint(equalTo: button.centerXAnchor),
            titleLabel.topAnchor.constraint(equalTo: button.topAnchor, constant: 10),
            subLabel.centerXAnchor.constraint(equalTo: button.centerXAnchor),
            subLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 2)
        ])
        return button
    }

    @objc private func chosen(_ sender: UIButton) {
        guard let choice = IntervalChoice(rawValue: sender.tag) else { return }
        onChoose?(choice)
    }

    func setEnabled(_ enabled: Bool) {
        buttons.forEach { $0.isEnabled = enabled }
        alpha = enabled ? 1 : 0.45
    }
}

// MARK: - Stat tile (生词本 header numbers)

final class StatTileView: UIView {
    init(value: String, caption: String) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        let valueLabel = Theme.makeLabel(value, font: Theme.monoSemibold(26), color: Theme.palette.ink, alignment: .center)
        let captionLabel = Theme.makeLabel(caption, font: Theme.regular(11.5), color: Theme.palette.tertiaryText, alignment: .center)
        let stack = UIStackView(arrangedSubviews: [valueLabel, captionLabel])
        stack.axis = .vertical
        stack.spacing = 2
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        stack.pinToSuperview()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func setValue(_ value: String) {
        guard let label = subviews.first?.subviews.first as? UILabel else { return }
        label.text = value
    }
}
