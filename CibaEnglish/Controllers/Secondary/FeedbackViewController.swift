import UIKit
import MessageUI

/// 反馈问题：类型 + 描述 + 联系方式，经系统邮件发送；无邮件账户时退回 mailto / 分享。
final class FeedbackViewController: UIViewController,
                                    MFMailComposeViewControllerDelegate,
                                    UITextViewDelegate,
                                    UITextFieldDelegate,
                                    UIGestureRecognizerDelegate {

    private let maxDescriptionLength = 500

    private let scrollView = UIScrollView()
    private let contentStack = UIStackView()

    private let typeControl = PillSegmentedControl(items: ["问题", "建议", "其他"], selectedIndex: 0)
    private let descriptionTextView = UITextView()
    private let placeholderLabel = Theme.makeLabel("请描述你遇到的问题或建议…",
                                                   font: Theme.regular(14.5),
                                                   color: Theme.palette.tertiaryText,
                                                   numberOfLines: 0)
    private let counterLabel = Theme.makeLabel("0/\(500)", font: Theme.regular(11.5), color: Theme.palette.tertiaryText, alignment: .right)
    private let contactField = UITextField()
    private var sendButton: UIButton!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Theme.palette.background
        title = "反馈问题"

        setupScroll()
        buildContent()
        setupKeyboard()

        let tap = UITapGestureRecognizer(target: self, action: #selector(backgroundTapped))
        tap.cancelsTouchesInView = false
        tap.delegate = self
        view.addGestureRecognizer(tap)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - Layout

    private func setupScroll() {
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
            contentStack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 16),
            contentStack.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor, constant: Theme.Metrics.hMargin),
            contentStack.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor, constant: -Theme.Metrics.hMargin),
            contentStack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -28),
            contentStack.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor, constant: -Theme.Metrics.hMargin * 2)
        ])
    }

    private func makeCaption(_ text: String) -> UILabel {
        Theme.makeLabel(text, font: Theme.medium(13), color: Theme.palette.secondaryText)
    }

    private func makeFieldCard(height: CGFloat) -> UIView {
        let card = Theme.makeCard()
        card.heightAnchor.constraint(equalToConstant: height).isActive = true
        return card
    }

    private func buildContent() {
        // 类型
        contentStack.addArrangedSubview(makeCaption("类型"))
        contentStack.addArrangedSubview(typeControl)

        // 描述
        contentStack.addArrangedSubview(makeCaption("描述"))

        let textCard = makeFieldCard(height: 180)
        descriptionTextView.backgroundColor = .clear
        descriptionTextView.font = Theme.regular(15)
        descriptionTextView.textColor = Theme.palette.ink
        descriptionTextView.tintColor = Theme.palette.primary
        descriptionTextView.textContainerInset = UIEdgeInsets(top: 12, left: 12, bottom: 12, right: 12)
        descriptionTextView.delegate = self
        descriptionTextView.translatesAutoresizingMaskIntoConstraints = false
        textCard.addSubview(descriptionTextView)
        descriptionTextView.pinToSuperview()

        placeholderLabel.isUserInteractionEnabled = false
        placeholderLabel.translatesAutoresizingMaskIntoConstraints = false
        descriptionTextView.addSubview(placeholderLabel)
        NSLayoutConstraint.activate([
            placeholderLabel.leadingAnchor.constraint(equalTo: descriptionTextView.leadingAnchor,
                                                      constant: descriptionTextView.textContainerInset.left + 5),
            placeholderLabel.topAnchor.constraint(equalTo: descriptionTextView.topAnchor,
                                                   constant: descriptionTextView.textContainerInset.top),
            placeholderLabel.trailingAnchor.constraint(lessThanOrEqualTo: descriptionTextView.trailingAnchor,
                                                       constant: -descriptionTextView.textContainerInset.right)
        ])
        contentStack.addArrangedSubview(textCard)
        contentStack.addArrangedSubview(counterLabel)

        // 联系方式
        contentStack.addArrangedSubview(makeCaption("联系方式（选填）"))

        let contactCard = makeFieldCard(height: 52)
        contactField.font = Theme.regular(15)
        contactField.textColor = Theme.palette.ink
        contactField.tintColor = Theme.palette.primary
        contactField.clearButtonMode = .whileEditing
        contactField.returnKeyType = .done
        contactField.delegate = self
        contactField.attributedPlaceholder = NSAttributedString(
            string: "邮箱 / 微信号，便于我们回复",
            attributes: [.foregroundColor: Theme.palette.tertiaryText])
        contactField.translatesAutoresizingMaskIntoConstraints = false
        contactCard.addSubview(contactField)
        NSLayoutConstraint.activate([
            contactField.leadingAnchor.constraint(equalTo: contactCard.leadingAnchor, constant: 16),
            contactField.trailingAnchor.constraint(equalTo: contactCard.trailingAnchor, constant: -16),
            contactField.centerYAnchor.constraint(equalTo: contactCard.centerYAnchor),
            contactField.heightAnchor.constraint(equalToConstant: 40)
        ])
        contentStack.addArrangedSubview(contactCard)

        // 发送
        sendButton = Theme.makePrimaryButton(title: "发送反馈", size: .large)
        sendButton.heightAnchor.constraint(equalToConstant: 50).isActive = true
        sendButton.addTarget(self, action: #selector(sendTapped), for: .touchUpInside)
        contentStack.addArrangedSubview(sendButton)
    }

    private func setupKeyboard() {
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardWillShow(_:)),
                                               name: UIResponder.keyboardWillShowNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardWillHide(_:)),
                                               name: UIResponder.keyboardWillHideNotification, object: nil)
    }

    @objc private func keyboardWillShow(_ notification: Notification) {
        guard let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
        let inset = frame.height - view.safeAreaInsets.bottom
        scrollView.contentInset.bottom = inset
        scrollView.verticalScrollIndicatorInsets.bottom = inset
        if let field = firstResponder(in: view) {
            let rect = scrollView.convert(field.bounds, from: field)
            scrollView.scrollRectToVisible(rect.insetBy(dx: 0, dy: -16), animated: true)
        }
    }

    @objc private func keyboardWillHide(_ notification: Notification) {
        scrollView.contentInset.bottom = 0
        scrollView.verticalScrollIndicatorInsets.bottom = 0
    }

    private func firstResponder(in container: UIView) -> UIView? {
        if container.isFirstResponder { return container }
        for subview in container.subviews {
            if let hit = firstResponder(in: subview) { return hit }
        }
        return nil
    }

    @objc private func backgroundTapped() {
        view.endEditing(true)
    }

    // MARK: - Description text

    @objc private func descriptionChanged() {
        let text = descriptionTextView.text ?? ""
        if text.count > maxDescriptionLength {
            descriptionTextView.text = String(text.prefix(maxDescriptionLength))
        }
        let count = (descriptionTextView.text ?? "").count
        counterLabel.text = "\(count)/\(maxDescriptionLength)"
        placeholderLabel.isHidden = !(descriptionTextView.text ?? "").isEmpty
    }

    func textViewDidChange(_ textView: UITextView) {
        descriptionChanged()
    }

    func textView(_ textView: UITextView,
                  shouldChangeTextIn range: NSRange,
                  replacementText text: String) -> Bool {
        // 输入法组词中的临时文本不做拦截
        if let marked = textView.markedTextRange, !marked.isEmpty { return true }
        let current = textView.text ?? ""
        guard let swiftRange = Range(range, in: current) else { return false }
        return current.replacingCharacters(in: swiftRange, with: text).count <= maxDescriptionLength
    }

    // MARK: - UITextFieldDelegate

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        textField.resignFirstResponder()
        return true
    }

    // MARK: - Send

    private var bodyText: String? {
        let description = (descriptionTextView.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !description.isEmpty else {
            present(UIAlertController.simple(title: "请先填写描述", message: "告诉我们你遇到的问题或建议吧。"), animated: true)
            return nil
        }
        let typeNames = ["问题", "建议", "其他"]
        let type = typeNames.indices.contains(typeControl.selectedIndex) ? typeNames[typeControl.selectedIndex] : "问题"
        let contact = (contactField.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return """
        类型：\(type)
        联系方式：\(contact.isEmpty ? "未填写" : contact)
        版本：糍粑英语 v\(AppConfig.version)

        \(description)
        """
    }

    @objc private func sendTapped() {
        guard let body = bodyText else { return }
        Theme.haptic(.light)

        if MFMailComposeViewController.canSendMail() {
            let composer = MFMailComposeViewController()
            composer.mailComposeDelegate = self
            composer.setToRecipients([AppConfig.supportEmail])
            composer.setSubject("糍粑英语 反馈")
            composer.setMessageBody(body, isHTML: false)
            present(composer, animated: true)
            return
        }

        // 无邮件账户：退回 mailto
        var components = URLComponents()
        components.scheme = "mailto"
        components.path = AppConfig.supportEmail
        components.queryItems = [
            URLQueryItem(name: "subject", value: "糍粑英语 反馈"),
            URLQueryItem(name: "body", value: body)
        ]
        if let url = components.url {
            UIApplication.shared.open(url, options: [:]) { [weak self] opened in
                guard let self else { return }
                if opened {
                    self.markHandedOff()
                } else {
                    self.presentShareSheet(with: body)
                }
            }
        } else {
            presentShareSheet(with: body)
        }
    }

    private func presentShareSheet(with text: String) {
        let activity = UIActivityViewController(activityItems: [text], applicationActivities: nil)
        activity.completionWithItemsHandler = { [weak self] _, completed, _, _ in
            guard let self, completed else { return }
            self.markSent()
        }
        if let popover = activity.popoverPresentationController {
            popover.sourceView = sendButton
            popover.sourceRect = sendButton.bounds
        }
        present(activity, animated: true)
    }

    private func markHandedOff() {
        resetFields()
        Theme.haptic(.medium)
        let alert = UIAlertController.simple(title: "已为你打开邮件应用",
                                             message: "请完成发送，感谢你的反馈！")
        present(alert, animated: true)
    }

    private func markSent() {
        resetFields()
        Theme.haptic(.medium)
        let alert = UIAlertController.simple(title: "已发送",
                                             message: "感谢你的反馈，我们会认真对待每一条建议！")
        present(alert, animated: true)
    }

    private func resetFields() {
        descriptionTextView.text = ""
        contactField.text = ""
        typeControl.setSelected(0, animated: false)
        descriptionChanged()
        view.endEditing(true)
    }

    // MARK: - MFMailComposeViewControllerDelegate

    func mailComposeController(_ controller: MFMailComposeViewController,
                               didFinishWith result: MFMailComposeResult,
                               error: Error?) {
        controller.dismiss(animated: true) { [weak self] in
            guard let self else { return }
            switch result {
            case .sent:
                self.markSent()
            case .saved:
                self.resetFields()
                let alert = UIAlertController.simple(title: "已存为草稿", message: "你的反馈已保存到邮件草稿。")
                self.present(alert, animated: true)
            case .failed:
                let alert = UIAlertController.simple(title: "发送失败",
                                                     message: error?.localizedDescription ?? "请稍后重试。")
                self.present(alert, animated: true)
            case .cancelled:
                break
            @unknown default:
                break
            }
        }
    }

    // MARK: - UIGestureRecognizerDelegate

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        // 输入区域内的点击交给输入框自己处理（聚焦 / 滚动）
        !(touch.view is UITextField) && !(touch.view is UITextView)
    }
}
