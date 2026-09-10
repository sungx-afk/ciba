import UIKit

/// 我 tab (screenshot 6): profile card, membership card, settings/menu rows.
final class ProfileViewController: UIViewController {

    private let scrollView = UIScrollView()
    private let stack = UIStackView()

    private let avatar = AvatarView(index: 0, size: 52)
    private let nameLabel = Theme.makeLabel("词汇学习者", font: Theme.semibold(17))
    private let subtitleLabel = Theme.makeLabel("", font: Theme.regular(12), color: Theme.palette.secondaryText)
    private let profileButton = Theme.makeGhostButton(title: "编辑资料")
    private var membershipCard: UIView?
    private var membershipButton: UIButton?
    private let settings = SettingsStore.shared

    private var engine = StudyEngine()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Theme.palette.background
        title = "我"
        tabBarItem = UITabBarItem(title: "我",
                                  image: UIImage(systemName: "person"),
                                  selectedImage: UIImage(systemName: "person.fill"))

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

        stack.axis = .vertical
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 8),
            stack.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor, constant: Theme.Metrics.hMargin),
            stack.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor, constant: -Theme.Metrics.hMargin),
            stack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -24),
            stack.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor, constant: -Theme.Metrics.hMargin * 2)
        ])

        profileButton.addTarget(self, action: #selector(openProfileEdit), for: .touchUpInside)
        NotificationCenter.default.addObserver(self, selector: #selector(refresh),
                                               name: .progressDidChange, object: nil)
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        refresh()
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    @objc private func refresh() {
        guard WordDatabase.shared.isLoaded else {
            WordDatabase.shared.loadIfNeeded { [weak self] in self?.refresh() }
            return
        }
        // Rebuild stack each time to reflect nickname / member changes cheaply.
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        engine = StudyEngine()

        let total = engine.totalWords
        let remembered = engine.totalRemembered
        let streak = ProgressStore.shared.streakDays()
        nameLabel.text = settings.displayName
        avatar.setContent(index: settings.avatarIndex,
                          glyph: String(settings.displayName.prefix(1)))
        subtitleLabel.text = "已掌握 \(remembered) / \(total.groupedString) 词 · 连续 \(streak) 天"

        stack.addArrangedSubview(makeProfileCard())
        stack.addArrangedSubview(makeMembershipCard())
        stack.addArrangedSubview(makeMenuCard(rows: makeMainRows()))
        stack.addArrangedSubview(makeMenuCard(rows: makeSupportRows()))
        stack.addArrangedSubview(makeMenuCard(rows: makeLegalRows()))

        let footer = Theme.makeLabel("糍粑英语 v\(AppConfig.version)\n本地学习 · 数据安全存储在设备",
                                     font: Theme.regular(11.5),
                                     color: Theme.palette.tertiaryText,
                                     alignment: .center,
                                     numberOfLines: 0)
        stack.addArrangedSubview(footer)
    }

    // MARK: - Cards

    private func makeProfileCard() -> UIView {
        let card = Theme.makeCard()
        avatar.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(avatar)
        card.addSubview(nameLabel)
        card.addSubview(subtitleLabel)
        card.addSubview(profileButton)
        nameLabel.numberOfLines = 1
        subtitleLabel.numberOfLines = 1

        NSLayoutConstraint.activate([
            card.heightAnchor.constraint(equalToConstant: 104),
            avatar.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
            avatar.centerYAnchor.constraint(equalTo: card.centerYAnchor),
            nameLabel.leadingAnchor.constraint(equalTo: avatar.trailingAnchor, constant: 16),
            nameLabel.topAnchor.constraint(equalTo: avatar.topAnchor, constant: 2),
            nameLabel.trailingAnchor.constraint(lessThanOrEqualTo: profileButton.leadingAnchor, constant: -8),
            subtitleLabel.leadingAnchor.constraint(equalTo: nameLabel.leadingAnchor),
            subtitleLabel.topAnchor.constraint(equalTo: nameLabel.bottomAnchor, constant: 4),
            subtitleLabel.trailingAnchor.constraint(lessThanOrEqualTo: profileButton.leadingAnchor, constant: -8),
            profileButton.centerYAnchor.constraint(equalTo: card.centerYAnchor),
            profileButton.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),
            profileButton.widthAnchor.constraint(equalToConstant: 84),
            profileButton.heightAnchor.constraint(equalToConstant: 34)
        ])
        return card
    }

    private func makeMembershipCard() -> UIView {
        let card = UIView()
        card.backgroundColor = Theme.palette.darkCard
        card.layer.cornerRadius = Theme.Metrics.cardRadius
        card.translatesAutoresizingMaskIntoConstraints = false
        card.heightAnchor.constraint(equalToConstant: 88).isActive = true

        let isMember = settings.isMember
        let title = Theme.makeLabel(isMember ? "会员已开通" : "解锁全部词库",
                                    font: Theme.semibold(17), color: .white)
        // The cheapest per-month figure, not the sticker price: this card has one
        // line to make the offer sound small.
        let cheapest = AppConfig.plannedPlans.first(where: \.isBest)?.monthlyEquivalent ?? "¥6.5 / 月"
        let subtitle = Theme.makeLabel(isMember ? "感谢支持，专属权益已生效" : "高中 / 四级 / 考研 / 托福 · \(cheapest)起",
                                       font: Theme.regular(12.5), color: .white, numberOfLines: 1)
        subtitle.alpha = 0.66

        let button = UIButton(type: .system)
        button.backgroundColor = isMember ? .white : Theme.palette.gold
        button.setTitleColor(Theme.palette.darkCard, for: .normal)
        button.titleLabel?.font = Theme.semibold(13)
        button.setTitle(isMember ? "会员中心" : "去开通", for: .normal)
        button.accessibilityIdentifier = "membership-entry"
        button.layer.cornerRadius = 9
        button.translatesAutoresizingMaskIntoConstraints = false
        button.addTarget(self, action: #selector(openMembership), for: .touchUpInside)

        let textStack = UIStackView(arrangedSubviews: [title, subtitle])
        textStack.axis = .vertical
        textStack.spacing = 4
        textStack.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(textStack)
        card.addSubview(button)
        NSLayoutConstraint.activate([
            textStack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 22),
            textStack.centerYAnchor.constraint(equalTo: card.centerYAnchor),
            textStack.trailingAnchor.constraint(lessThanOrEqualTo: button.leadingAnchor, constant: -12),
            button.centerYAnchor.constraint(equalTo: card.centerYAnchor),
            button.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -18),
            button.widthAnchor.constraint(equalToConstant: 86),
            button.heightAnchor.constraint(equalToConstant: 36)
        ])
        membershipCard = card
        membershipButton = button
        return card
    }

    private func makeMenuCard(rows: [UIView]) -> UIView {
        let card = Theme.makeCard()
        let inner = UIStackView(arrangedSubviews: rows)
        inner.axis = .vertical
        inner.spacing = 0
        inner.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(inner)
        NSLayoutConstraint.activate([
            inner.topAnchor.constraint(equalTo: card.topAnchor, constant: 6),
            inner.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -6),
            inner.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            inner.trailingAnchor.constraint(equalTo: card.trailingAnchor)
        ])
        return card
    }

    private func makeMainRows() -> [UIView] {
        let book = AppConfig.currentBook
        let row1 = MenuRowView(title: "当前词库", value: "\(book.title) · \(book.wordCount.groupedString) 词")
        row1.onTap = { [weak self] in
            self?.push(BookSelectViewController())
        }
        let row2 = MenuRowView(title: "学习提醒", value: "每天 \(settings.reminderTimeText)")
        row2.showTopDivider(true)
        row2.onTap = { [weak self] in
            self?.push(ReminderViewController())
        }
        let row3 = MenuRowView(title: "学习设置", value: "发音 · 显示 · 数据")
        row3.showTopDivider(true)
        row3.onTap = { [weak self] in
            self?.push(SettingsViewController())
        }
        return [row1, row2, row3]
    }

    private func makeSupportRows() -> [UIView] {
        let row1 = MenuRowView(title: "评价一下")
        row1.onTap = { [weak self] in
            guard let self else { return }
            ReviewService.requestRating(in: self)
        }
        let row2 = MenuRowView(title: "反馈问题")
        row2.showTopDivider(true)
        row2.onTap = { [weak self] in self?.push(FeedbackViewController()) }
        let row3 = MenuRowView(title: "关于糍粑英语", value: "v\(AppConfig.version)")
        row3.showTopDivider(true)
        row3.onTap = { [weak self] in self?.push(AboutViewController()) }
        return [row1, row2, row3]
    }

    private func makeLegalRows() -> [UIView] {
        let row1 = MenuRowView(title: "隐私政策")
        row1.onTap = { [weak self] in
            self?.push(WebContentViewController(title: "隐私政策", resourceName: "privacy"))
        }
        let row2 = MenuRowView(title: "用户协议")
        row2.showTopDivider(true)
        row2.onTap = { [weak self] in
            self?.push(WebContentViewController(title: "用户协议", resourceName: "terms"))
        }
        return [row1, row2]
    }

    private func push(_ vc: UIViewController) {
        vc.hidesBottomBarWhenPushed = true
        navigationController?.pushViewController(vc, animated: true)
    }

    @objc private func openProfileEdit() {
        push(ProfileEditViewController())
    }

    @objc private func openMembership() {
        push(MembershipViewController())
    }
}
