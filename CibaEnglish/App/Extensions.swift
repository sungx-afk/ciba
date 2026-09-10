import UIKit

// MARK: - Auto Layout sugar

extension UIView {
    func pinToSuperview(insets: UIEdgeInsets = .zero) {
        guard let superview else { return }
        translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            topAnchor.constraint(equalTo: superview.topAnchor, constant: insets.top),
            leadingAnchor.constraint(equalTo: superview.leadingAnchor, constant: insets.left),
            trailingAnchor.constraint(equalTo: superview.trailingAnchor, constant: -insets.right),
            bottomAnchor.constraint(equalTo: superview.bottomAnchor, constant: -insets.bottom)
        ])
    }

    func centerInSuperview(offsetY: CGFloat = 0) {
        guard let superview else { return }
        translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            centerXAnchor.constraint(equalTo: superview.centerXAnchor),
            centerYAnchor.constraint(equalTo: superview.centerYAnchor, constant: offsetY)
        ])
    }

    func rounded(_ radius: CGFloat) {
        layer.cornerRadius = radius
        clipsToBounds = true
    }
}

extension UIViewController {
    /// Standard full-screen push: builds the nav stack if this controller is presented bare.
    func wrapInNavigation() -> UINavigationController {
        let nav = UINavigationController(rootViewController: self)
        nav.modalPresentationStyle = .fullScreen
        return nav
    }
}

// MARK: - Alerts

extension UIAlertController {
    static func simple(title: String?, message: String?, preferredActionTitle: String = "好") -> UIAlertController {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: preferredActionTitle, style: .default))
        return alert
    }
}

// MARK: - Formatting helpers

extension Int {
    var groupedString: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.groupingSeparator = " "
        return formatter.string(from: NSNumber(value: self)) ?? "\(self)"
    }
}

extension Date {
    var startOfDay: Date { Calendar.current.startOfDay(for: self) }

    func isSameDay(as other: Date) -> Bool {
        Calendar.current.isDate(self, inSameDayAs: other)
    }

    var friendlyDueText: String {
        if isSameDay(as: Date()) { return "今天" }
        let day = Calendar.current.dateComponents([.day], from: Date().startOfDay, to: startOfDay).day ?? 0
        if day == 1 { return "明天" }
        if day > 1 { return "\(day) 天后" }
        if day == -1 { return "昨天" }
        return "\(-day) 天前"
    }
}
