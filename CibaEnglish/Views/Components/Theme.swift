import UIKit

/// Central design system.
///
/// Colours come from the app logo — a four-blade pinwheel in red / green /
/// amber / blue on a pale ground. Amber leads (it carries the warmth the
/// product needs); the other three blades are spent on category identity, and
/// deep gold is reserved for membership so the paywall reads differently from
/// ordinary UI.
enum Theme {

    struct Palette {
        let background = UIColor(hex: 0xFDFAF4)
        let card = UIColor.white
        let border = UIColor(hex: 0xEFE7D8)
        let track = UIColor(hex: 0xF2EADC)
        let ink = UIColor(hex: 0x1F1A12)
        let secondaryText = UIColor(hex: 0x7A7062)
        let tertiaryText = UIColor(hex: 0xB3A996)
        let primary = UIColor(hex: 0xE8890F)
        let primaryDark = UIColor(hex: 0xC5730A)
        let primarySoft = UIColor(hex: 0xFDF2E1)
        /// Text/glyph colour for use on `primarySoft` — dark enough to pass AA.
        let primarySoftText = UIColor(hex: 0x94550A)
        /// Study answer buttons: 困难 / 一般 / 容易 (稍后 uses `grayButton`).
        let hard = UIColor(hex: 0xE07B39)
        let normal = UIColor(hex: 0xDBA21F)
        let easy = UIColor(hex: 0x7CAE1C)
        let grayButton = UIColor(hex: 0xA79C8C)
        /// Membership surfaces only — a warm near-black that lets gold sing.
        let darkCard = UIColor(hex: 0x342A1C)
        let gold = UIColor(hex: 0xE9A81B)
        let danger = UIColor(hex: 0xD14B44)
        /// Streak / “keep going” accent. The logo red, used sparingly.
        let flame = UIColor(hex: 0xF95452)
    }

    static let palette = Palette()

    // MARK: - Category identity

    /// The pinwheel blades. Used for category dots and progress bars only —
    /// never for text, since the green and amber fail contrast at body sizes.
    static let categoryColors: [UIColor] = [
        UIColor(hex: 0xF4C225),   // amber
        UIColor(hex: 0x7CAE1C),   // green (logo green, darkened so a 4pt bar reads)
        UIColor(hex: 0x588CFC),   // blue
        UIColor(hex: 0xF95452)    // red
    ]

    /// Stable colour for a category name.
    ///
    /// Deliberately not `hashValue`: Swift seeds that per process, so a category
    /// would change colour on every launch. Summing scalars is stable forever,
    /// which matters because the colour becomes part of how a user recognises
    /// the row.
    static func categoryColor(for name: String) -> UIColor {
        let sum = name.unicodeScalars.reduce(0) { $0 &+ Int($1.value) }
        return categoryColors[sum % categoryColors.count]
    }

    /// Screen metrics used across controllers.
    enum Metrics {
        static let hMargin: CGFloat = 24
        static let cardRadius: CGFloat = 14
        static let smallRadius: CGFloat = 12
        static let pillRadius: CGFloat = 9
    }

    // MARK: - Fonts

    static func regular(_ size: CGFloat) -> UIFont { .systemFont(ofSize: size, weight: .regular) }
    static func medium(_ size: CGFloat) -> UIFont { .systemFont(ofSize: size, weight: .medium) }
    static func semibold(_ size: CGFloat) -> UIFont { .systemFont(ofSize: size, weight: .semibold) }
    static func bold(_ size: CGFloat) -> UIFont { .systemFont(ofSize: size, weight: .bold) }
    static func mono(_ size: CGFloat) -> UIFont { .monospacedSystemFont(ofSize: size, weight: .regular) }
    static func monoMedium(_ size: CGFloat) -> UIFont { .monospacedSystemFont(ofSize: size, weight: .medium) }
    static func monoSemibold(_ size: CGFloat) -> UIFont { .monospacedSystemFont(ofSize: size, weight: .semibold) }

    // MARK: - Card

    /// Wraps content in the standard white rounded card used everywhere.
    static func makeCard(cornerRadius: CGFloat = Metrics.cardRadius) -> UIView {
        let view = UIView()
        view.backgroundColor = palette.card
        view.layer.cornerRadius = cornerRadius
        view.layer.borderWidth = 1
        view.layer.borderColor = palette.border.cgColor
        view.clipsToBounds = true
        view.translatesAutoresizingMaskIntoConstraints = false
        return view
    }

    // MARK: - Buttons

    enum ButtonSize { case large, medium, small }

    static func makePrimaryButton(title: String, size: ButtonSize = .large) -> UIButton {
        let button = UIButton(type: .system)
        button.setTitle(title, for: .normal)
        button.setTitleColor(.white, for: .normal)
        button.backgroundColor = palette.primary
        button.titleLabel?.font = semibold(size == .large ? 16 : (size == .medium ? 15 : 13))
        button.layer.cornerRadius = size == .large ? 13 : (size == .medium ? 11 : 9)
        button.translatesAutoresizingMaskIntoConstraints = false
        return button
    }

    static func makeGhostButton(title: String) -> UIButton {
        let button = UIButton(type: .system)
        button.setTitle(title, for: .normal)
        button.setTitleColor(palette.primary, for: .normal)
        button.titleLabel?.font = medium(14)
        button.layer.borderWidth = 1
        button.layer.borderColor = palette.primary.cgColor
        button.layer.cornerRadius = 11
        button.translatesAutoresizingMaskIntoConstraints = false
        return button
    }

    // MARK: - Labels

    static func makeLabel(_ text: String? = nil,
                          font: UIFont = regular(15),
                          color: UIColor = Theme.palette.ink,
                          alignment: NSTextAlignment = .left,
                          numberOfLines: Int = 1) -> UILabel {
        let label = UILabel()
        label.text = text
        label.font = font
        label.textColor = color
        label.textAlignment = alignment
        label.numberOfLines = numberOfLines
        label.translatesAutoresizingMaskIntoConstraints = false
        return label
    }

    /// Small right-pointing chevron (gray), as in the mockups.
    static func makeChevron() -> UIImageView {
        let config = UIImage.SymbolConfiguration(pointSize: 14, weight: .semibold)
        let image = UIImage(systemName: "chevron.right", withConfiguration: config)?
            .withTintColor(palette.tertiaryText, renderingMode: .alwaysOriginal)
        let view = UIImageView(image: image)
        view.contentMode = .scaleAspectFit
        view.translatesAutoresizingMaskIntoConstraints = false
        return view
    }

    /// Standard tap feedback.
    static func haptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }
}

// MARK: - UIColor hex helper

extension UIColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255.0,
                  green: CGFloat((hex >> 8) & 0xFF) / 255.0,
                  blue: CGFloat(hex & 0xFF) / 255.0,
                  alpha: alpha)
    }
}
