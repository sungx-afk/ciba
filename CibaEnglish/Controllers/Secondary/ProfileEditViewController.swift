import UIKit

/// 编辑个人资料：昵称 + 头像底色。数据仅保存在本机，无需登录。
final class ProfileEditViewController: UIViewController, UITextFieldDelegate, UIGestureRecognizerDelegate {

    private let settings = SettingsStore.shared
    private let maxNicknameLength = 12

    private let scrollView = UIScrollView()
    private let contentStack = UIStackView()

    private let avatar = AvatarView(index: 0, size: 84)
    private let nicknameField = UITextField()
    private var avatarButtons: [UIButton] = []
    private var selectionDisks: [UIView] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Theme.palette.background
        title = "个人资料"

        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "保存",
                                                            style: .plain,
                                                            target: self,
                                                            action: #selector(saveTapped))

        setupScrollAndStack()
        buildContent()

        // 点击空白处收起键盘
        let tap = UITapGestureRecognizer(target: self, action: #selector(backgroundTapped))
        tap.cancelsTouchesInView = false
        tap.delegate = self
        view.addGestureRecognizer(tap)

        // 键盘避让
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardWillShow(_:)),
                                               name: UIResponder.keyboardWillShowNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardWillHide(_:)),
                                               name: UIResponder.keyboardWillHideNotification, object: nil)

        refreshAvatarSelection()
        updatePreviewGlyph()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - Layout

    private func setupScrollAndStack() {
        scrollView.backgroundColor = .clear
        scrollView.alwaysBounceVertical = true
        scrollView.keyboardDismissMode = .none
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scrollView)
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])

        contentStack.axis = .vertical
        contentStack.spacing = 22
        contentStack.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(contentStack)
        NSLayoutConstraint.activate([
            contentStack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 20),
            contentStack.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor, constant: Theme.Metrics.hMargin),
            contentStack.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor, constant: -Theme.Metrics.hMargin),
            contentStack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -28),
            contentStack.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor, constant: -Theme.Metrics.hMargin * 2)
        ])
    }

    private func buildContent() {
        contentStack.addArrangedSubview(makeAvatarBlock())
        contentStack.addArrangedSubview(makeNicknameBlock())
        contentStack.addArrangedSubview(makeAvatarGridBlock())

        let footnote = Theme.makeLabel("学习数据仅保存在本机，安全私密",
                                       font: Theme.regular(11.5),
                                       color: Theme.palette.tertiaryText,
                                       alignment: .center)
        contentStack.addArrangedSubview(footnote)

        let saveButton = Theme.makePrimaryButton(title: "保存资料", size: .large)
        saveButton.heightAnchor.constraint(equalToConstant: 50).isActive = true
        saveButton.addTarget(self, action: #selector(saveTapped), for: .touchUpInside)
        contentStack.addArrangedSubview(saveButton)
    }

    /// 顶部大头像预览（随昵称首字 / 底色实时更新）
    private func makeAvatarBlock() -> UIView {
        let wrap = UIView()
        wrap.translatesAutoresizingMaskIntoConstraints = false
        avatar.setContent(index: settings.avatarIndex, glyph: nil)
        wrap.addSubview(avatar)
        NSLayoutConstraint.activate([
            avatar.topAnchor.constraint(equalTo: wrap.topAnchor, constant: 6),
            avatar.centerXAnchor.constraint(equalTo: wrap.centerXAnchor),
            avatar.bottomAnchor.constraint(equalTo: wrap.bottomAnchor, constant: -6)
        ])
        return wrap
    }

    private func makeCaption(_ text: String) -> UILabel {
        Theme.makeLabel(text, font: Theme.medium(13), color: Theme.palette.secondaryText)
    }

    private func makeNicknameBlock() -> UIView {
        let block = UIStackView()
        block.axis = .vertical
        block.spacing = 8
        block.translatesAutoresizingMaskIntoConstraints = false
        block.addArrangedSubview(makeCaption("昵称"))

        let card = Theme.makeCard()
        card.heightAnchor.constraint(equalToConstant: 52).isActive = true

        nicknameField.font = Theme.regular(16)
        nicknameField.textColor = Theme.palette.ink
        nicknameField.tintColor = Theme.palette.primary
        nicknameField.text = settings.nickname
        nicknameField.clearButtonMode = .whileEditing
        nicknameField.returnKeyType = .done
        nicknameField.delegate = self
        nicknameField.addTarget(self, action: #selector(nicknameChanged), for: .editingChanged)
        nicknameField.attributedPlaceholder = NSAttributedString(
            string: "输入你的昵称（可选）",
            attributes: [.foregroundColor: Theme.palette.tertiaryText])
        nicknameField.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(nicknameField)
        NSLayoutConstraint.activate([
            nicknameField.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),
            nicknameField.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),
            nicknameField.centerYAnchor.constraint(equalTo: card.centerYAnchor),
            nicknameField.heightAnchor.constraint(equalToConstant: 40)
        ])
        block.addArrangedSubview(card)
        return block
    }

    /// “选择头像底色”标题 + 4×2 圆点选择网格
    private func makeAvatarGridBlock() -> UIView {
        let block = UIStackView()
        block.axis = .vertical
        block.spacing = 12
        block.translatesAutoresizingMaskIntoConstraints = false
        block.addArrangedSubview(makeCaption("选择头像底色"))
        block.addArrangedSubview(makeAvatarGrid())
        return block
    }

    private func makeAvatarGrid() -> UIStackView {
        let grid = UIStackView()
        grid.axis = .vertical
        grid.spacing = 12
        grid.translatesAutoresizingMaskIntoConstraints = false

        var index = 0
        while index < AvatarPalette.count {
            let end = min(index + 4, AvatarPalette.count)
            grid.addArrangedSubview(makeAvatarRow(indices: index..<end))
            index = end
        }
        return grid
    }

    private func makeAvatarRow(indices: Range<Int>) -> UIView {
        let row = UIView()
        row.translatesAutoresizingMaskIntoConstraints = false
        row.heightAnchor.constraint(equalToConstant: 44).isActive = true

        var previous: UIButton?
        for i in indices {
            let button = makeAvatarOption(index: i)
            row.addSubview(button)
            NSLayoutConstraint.activate([
                button.centerYAnchor.constraint(equalTo: row.centerYAnchor)
            ])
            if let previous {
                button.leadingAnchor.constraint(equalTo: previous.trailingAnchor, constant: 16).isActive = true
            } else {
                button.leadingAnchor.constraint(equalTo: row.leadingAnchor).isActive = true
            }
            previous = button
        }
        return row
    }

    private func makeAvatarOption(index: Int) -> UIButton {
        let button = UIButton(type: .custom)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.backgroundColor = AvatarPalette.backgrounds[index]
        button.layer.cornerRadius = 22
        button.clipsToBounds = true
        button.tag = index
        button.widthAnchor.constraint(equalToConstant: 44).isActive = true
        button.heightAnchor.constraint(equalToConstant: 44).isActive = true
        button.addTarget(self, action: #selector(avatarTapped(_:)), for: .touchUpInside)

        // 选中态：绿色描边 + 白色圆底对勾
        let disk = UIView()
        disk.translatesAutoresizingMaskIntoConstraints = false
        disk.backgroundColor = .white
        disk.layer.cornerRadius = 9
        disk.isUserInteractionEnabled = false
        button.addSubview(disk)
        NSLayoutConstraint.activate([
            disk.centerXAnchor.constraint(equalTo: button.centerXAnchor),
            disk.centerYAnchor.constraint(equalTo: button.centerYAnchor),
            disk.widthAnchor.constraint(equalToConstant: 18),
            disk.heightAnchor.constraint(equalToConstant: 18)
        ])

        let check = UIImageView(image: UIImage(systemName: "checkmark",
                                               withConfiguration: UIImage.SymbolConfiguration(pointSize: 10, weight: .bold)))
        check.tintColor = Theme.palette.primary
        check.contentMode = .scaleAspectFit
        check.translatesAutoresizingMaskIntoConstraints = false
        disk.addSubview(check)
        check.pinToSuperview(insets: UIEdgeInsets(top: 4, left: 4, bottom: 4, right: 4))

        avatarButtons.append(button)
        selectionDisks.append(disk)
        return button
    }

    private func refreshAvatarSelection() {
        for (index, button) in avatarButtons.enumerated() {
            let selected = index == settings.avatarIndex
            button.layer.borderWidth = selected ? 2.5 : 0
            button.layer.borderColor = selected ? Theme.palette.primary.cgColor : UIColor.clear.cgColor
            selectionDisks[index].isHidden = !selected
        }
    }

    // MARK: - Actions

    @objc private func avatarTapped(_ sender: UIButton) {
        let index = sender.tag
        guard index != settings.avatarIndex else {
            refreshAvatarSelection()
            return
        }
        settings.avatarIndex = index
        Theme.haptic(.medium)
        refreshAvatarSelection()
        updatePreviewGlyph()
    }

    @objc private func nicknameChanged() {
        updatePreviewGlyph()
    }

    private func currentGlyph() -> String {
        let text = (nicknameField.text ?? "").trimmingCharacters(in: .whitespaces)
        return text.isEmpty ? "学" : String(text.prefix(1))
    }

    private func updatePreviewGlyph() {
        avatar.setContent(index: settings.avatarIndex, glyph: currentGlyph())
    }

    @objc private func saveTapped() {
        nicknameField.resignFirstResponder()
        var name = (nicknameField.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if name.count > maxNicknameLength {
            name = String(name.prefix(maxNicknameLength))
        }
        settings.nickname = name
        settings.avatarIndex = settings.avatarIndex   // setter 已做范围钳制
        Theme.haptic(.medium)
        navigationController?.popViewController(animated: true)
    }

    @objc private func backgroundTapped() {
        view.endEditing(true)
    }

    // MARK: - Keyboard

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

    // MARK: - UITextFieldDelegate

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        textField.resignFirstResponder()
        return true
    }

    func textField(_ textField: UITextField,
                   shouldChangeCharactersIn range: NSRange,
                   replacementString string: String) -> Bool {
        // 输入法组词中的临时文本不做长度拦截
        if let marked = textField.markedTextRange, !marked.isEmpty { return true }
        let current = textField.text ?? ""
        guard let swiftRange = Range(range, in: current) else { return false }
        let newText = current.replacingCharacters(in: swiftRange, with: string)
        return newText.count <= maxNicknameLength
    }

    // MARK: - UIGestureRecognizerDelegate

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        // 允许在输入框内正常聚焦/滚动，点击其它区域收起键盘
        !(touch.view is UITextField) && !(touch.view is UITextView)
    }
}
