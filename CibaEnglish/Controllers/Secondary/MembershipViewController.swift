import UIKit
import StoreKit

/// 会员中心。
///
/// The app is fully usable without paying, so this screen has one job: make the
/// offer legible. It leads with what a member gets, then shows the plan ladder
/// with per-month arithmetic already done, because "¥78/年" and "¥6.5/月" are
/// the same number and only one of them reads as cheap.
///
/// It renders the same way whether or not StoreKit has products yet — when
/// unconfigured it falls back to `AppConfig.plannedPlans` and disables the CTA,
/// rather than replacing the offer with an apology.
final class MembershipViewController: UIViewController {

    private let settings = SettingsStore.shared

    private let scrollView = UIScrollView()
    private let contentStack = UIStackView()
    private let bodyStack = UIStackView()
    private let footerBar = UIView()
    private var footerHeight: NSLayoutConstraint?
    private var footerButtons: [UIButton] = []

    private var products: [Product] = []
    private var planRows: [PlanRowView] = []
    private var selectedProductIndex = 0
    private var hasRequestedProducts = false
    private var isBusy = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Theme.palette.background
        title = "会员中心"

        setupScrollAndFooter()
        buildStaticContent()
        render()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        if hasRequestedProducts {
            render()
        } else {
            hasRequestedProducts = true
            Task { @MainActor [weak self] in
                await MembershipService.shared.refresh()
                self?.render()
            }
        }
    }

    // MARK: - Layout

    private func setupScrollAndFooter() {
        scrollView.backgroundColor = .clear
        scrollView.alwaysBounceVertical = true
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scrollView)

        footerBar.backgroundColor = Theme.palette.background
        footerBar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(footerBar)
        let height = footerBar.heightAnchor.constraint(equalToConstant: 0)
        footerHeight = height
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: footerBar.topAnchor),

            footerBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            footerBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            footerBar.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            height
        ])

        contentStack.axis = .vertical
        contentStack.spacing = 12
        contentStack.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(contentStack)
        NSLayoutConstraint.activate([
            contentStack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 16),
            contentStack.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor, constant: Theme.Metrics.hMargin),
            contentStack.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor, constant: -Theme.Metrics.hMargin),
            contentStack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -20),
            contentStack.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor, constant: -Theme.Metrics.hMargin * 2)
        ])
    }

    private func buildStaticContent() {
        let hero = makeHeroCard()
        contentStack.addArrangedSubview(hero)
        contentStack.addArrangedSubview(bodyStack)
        contentStack.setCustomSpacing(14, after: hero)

        let terms = Theme.makeLabel("自动续费订阅，可随时在 App Store 的「订阅」中管理或取消。",
                                    font: Theme.regular(11.5),
                                    color: Theme.palette.tertiaryText,
                                    alignment: .center,
                                    numberOfLines: 0)
        contentStack.setCustomSpacing(16, after: bodyStack)
        contentStack.addArrangedSubview(terms)
        contentStack.addArrangedSubview(makeLegalLinksRow())
    }

    /// 权益卡。深色只在这一屏出现，让付费页和其余界面拉开距离。
    private func makeHeroCard() -> UIView {
        let card = UIView()
        card.backgroundColor = Theme.palette.darkCard
        card.layer.cornerRadius = 16
        card.clipsToBounds = true
        card.translatesAutoresizingMaskIntoConstraints = false

        let title = Theme.makeLabel("解锁全部词库", font: Theme.bold(20), color: .white)
        let sub = Theme.makeLabel("一次开通，四本词库全部打开",
                                  font: Theme.regular(12.5), color: .white, numberOfLines: 0)
        sub.alpha = 0.66

        let stack = UIStackView(arrangedSubviews: [title, sub])
        stack.axis = .vertical
        stack.spacing = 5
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.setCustomSpacing(15, after: sub)

        for line in AppConfig.membershipBenefits {
            stack.addArrangedSubview(makeBenefitRow(line))
        }

        card.addSubview(stack)
        stack.pinToSuperview(insets: UIEdgeInsets(top: 20, left: 20, bottom: 20, right: 20))
        return card
    }

    private func makeBenefitRow(_ text: String) -> UIView {
        let tick = UIImageView(image: UIImage(systemName: "checkmark",
                                              withConfiguration: UIImage.SymbolConfiguration(pointSize: 11, weight: .bold)))
        tick.tintColor = Theme.palette.gold
        tick.contentMode = .scaleAspectFit
        tick.setContentHuggingPriority(.required, for: .horizontal)
        tick.translatesAutoresizingMaskIntoConstraints = false
        tick.widthAnchor.constraint(equalToConstant: 14).isActive = true

        let label = Theme.makeLabel(text, font: Theme.regular(13), color: .white, numberOfLines: 0)
        label.alpha = 0.92

        let row = UIStackView(arrangedSubviews: [tick, label])
        row.axis = .horizontal
        row.spacing = 9
        row.alignment = .firstBaseline
        return row
    }

    private func makeLegalLinksRow() -> UIView {
        let row = UIStackView()
        row.axis = .horizontal
        row.spacing = 10
        row.alignment = .center
        row.distribution = .fillEqually
        row.translatesAutoresizingMaskIntoConstraints = false

        row.addArrangedSubview(makeLinkButton(title: "恢复购买", tag: 2))
        row.addArrangedSubview(makeLinkButton(title: "用户协议", tag: 0))
        row.addArrangedSubview(makeLinkButton(title: "隐私政策", tag: 1))
        return row
    }

    private func makeLinkButton(title: String, tag: Int) -> UIButton {
        let button = UIButton(type: .system)
        button.setTitle(title, for: .normal)
        button.setTitleColor(Theme.palette.secondaryText, for: .normal)
        button.titleLabel?.font = Theme.regular(12.5)
        button.addTarget(self, action: #selector(footerLinkTapped(_:)), for: .touchUpInside)
        button.tag = tag
        button.translatesAutoresizingMaskIntoConstraints = false
        button.heightAnchor.constraint(equalToConstant: 40).isActive = true
        return button
    }

    @objc private func footerLinkTapped(_ sender: UIButton) {
        switch sender.tag {
        case 0: pushWeb(title: "用户协议", resource: "terms")
        case 1: pushWeb(title: "隐私政策", resource: "privacy")
        default: restoreTapped()
        }
    }

    private func pushWeb(title: String, resource: String) {
        navigationController?.pushViewController(WebContentViewController(title: title, resourceName: resource), animated: true)
    }

    // MARK: - Render

    private func render() {
        renderBody()
        renderFooter()
    }

    private func renderBody() {
        bodyStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        bodyStack.axis = .vertical
        bodyStack.spacing = 9
        bodyStack.translatesAutoresizingMaskIntoConstraints = false
        planRows = []

        let state = MembershipService.shared.state
        if settings.isMember {
            if case .ready(let prods) = state {
                self.products = prods.sorted { $0.price > $1.price }
            }
            bodyStack.addArrangedSubview(makeMemberStatusCard())
            return
        }

        switch state {
        case .unknown, .loading:
            bodyStack.addArrangedSubview(makeLoadingCard())
        case .ready(let prods):
            // Most expensive first: the annual plan is the one worth anchoring on.
            self.products = prods.sorted { $0.price > $1.price }
            if selectedProductIndex >= self.products.count { selectedProductIndex = 0 }
            addPlanRows(self.products.enumerated().map { index, product in
                PlanRowView.Model(title: displayTitle(for: product),
                                  price: product.displayPrice,
                                  monthly: monthlyText(for: product),
                                  anchor: nil,
                                  badge: index == 0 && self.products.count > 1 ? "最超值" : nil,
                                  enabled: true)
            })
        case .unconfigured, .failed:
            addPlanRows(AppConfig.plannedPlans.map {
                PlanRowView.Model(title: $0.title, price: $0.price, monthly: $0.monthlyEquivalent,
                                  anchor: $0.anchor, badge: $0.badge, enabled: false)
            })
            bodyStack.addArrangedSubview(makeComingSoonNote())
        }
    }

    private func addPlanRows(_ models: [PlanRowView.Model]) {
        for (index, model) in models.enumerated() {
            let row = PlanRowView(model: model)
            row.tag = index
            row.accessibilityIdentifier = "plan-\(index)"
            row.addTarget(self, action: #selector(planTapped(_:)), for: .touchUpInside)
            row.isChosen = index == selectedProductIndex
            planRows.append(row)
            bodyStack.addArrangedSubview(row)
        }
    }

    /// StoreKit gives a localized period; turn it into "¥x.x / 月" so plans of
    /// different lengths can actually be compared.
    private func monthlyText(for product: Product) -> String? {
        guard let period = product.subscription?.subscriptionPeriod else { return nil }
        let months: Decimal
        switch period.unit {
        case .month: months = Decimal(period.value)
        case .year: months = Decimal(period.value * 12)
        case .week: months = Decimal(period.value) / 4
        case .day: months = Decimal(period.value) / 30
        @unknown default: return nil
        }
        guard months > 1 else { return nil }   // a 1-month plan needs no restating
        let perMonth = product.price / months
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = product.priceFormatStyle.locale
        formatter.maximumFractionDigits = 1
        guard let text = formatter.string(from: perMonth as NSDecimalNumber) else { return nil }
        return "\(text) / 月"
    }

    private func displayTitle(for product: Product) -> String {
        guard let period = product.subscription?.subscriptionPeriod else { return product.displayName }
        switch period.unit {
        case .year: return period.value == 1 ? "12 个月" : "\(period.value * 12) 个月"
        case .month: return "\(period.value) 个月"
        case .week: return "\(period.value) 周"
        case .day: return "\(period.value) 天"
        @unknown default: return product.displayName
        }
    }

    private func renderFooter() {
        footerBar.subviews.forEach { $0.removeFromSuperview() }
        footerButtons = []

        if settings.isMember {
            addFooterContent(makeMemberBanner(), height: 76)
        } else if case .ready = MembershipService.shared.state, !products.isEmpty {
            addFooterContent(makePurchaseBar(), height: 82)
        } else {
            footerHeight?.constant = 0
            footerBar.isHidden = true
        }
    }

    private func addFooterContent(_ content: UIView, height: CGFloat) {
        content.translatesAutoresizingMaskIntoConstraints = false
        footerBar.addSubview(content)
        NSLayoutConstraint.activate([
            content.leadingAnchor.constraint(equalTo: footerBar.leadingAnchor, constant: Theme.Metrics.hMargin),
            content.trailingAnchor.constraint(equalTo: footerBar.trailingAnchor, constant: -Theme.Metrics.hMargin),
            content.centerYAnchor.constraint(equalTo: footerBar.centerYAnchor, constant: -2)
        ])
        footerHeight?.constant = height
        footerBar.isHidden = false
    }

    // MARK: - Body cards

    private func makeLoadingCard() -> UIView {
        let card = Theme.makeCard()
        let spinner = UIActivityIndicatorView(style: .medium)
        spinner.color = Theme.palette.secondaryText
        spinner.startAnimating()
        let label = Theme.makeLabel("正在加载…", font: Theme.regular(13), color: Theme.palette.tertiaryText, alignment: .center)
        let stack = UIStackView(arrangedSubviews: [spinner, label])
        stack.axis = .vertical
        stack.spacing = 10
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(stack)
        stack.pinToSuperview(insets: UIEdgeInsets(top: 30, left: 20, bottom: 30, right: 20))
        return card
    }

    /// Shown under the (inert) plan ladder while StoreKit has no products.
    private func makeComingSoonNote() -> UIView {
        let container = UIStackView()
        container.axis = .vertical
        container.spacing = 10
        container.alignment = .center
        container.translatesAutoresizingMaskIntoConstraints = false

        let note = Theme.makeLabel("会员通道尚未开放——当前版本全部功能免费，价格仅供参考。",
                                   font: Theme.regular(12.5),
                                   color: Theme.palette.secondaryText,
                                   alignment: .center,
                                   numberOfLines: 0)
        container.addArrangedSubview(note)

        let refreshButton = Theme.makeGhostButton(title: "刷新状态")
        refreshButton.heightAnchor.constraint(equalToConstant: 38).isActive = true
        refreshButton.widthAnchor.constraint(equalToConstant: 120).isActive = true
        refreshButton.addTarget(self, action: #selector(refreshTapped), for: .touchUpInside)
        container.addArrangedSubview(refreshButton)
        return container
    }

    /// 会员已开通时展示的状态卡
    private func makeMemberStatusCard() -> UIView {
        let card = UIView()
        card.backgroundColor = Theme.palette.darkCard
        card.layer.cornerRadius = Theme.Metrics.cardRadius
        card.translatesAutoresizingMaskIntoConstraints = false

        let icon = UIImageView(image: UIImage(systemName: "checkmark.seal.fill",
                                              withConfiguration: UIImage.SymbolConfiguration(pointSize: 24, weight: .medium)))
        icon.tintColor = Theme.palette.gold
        icon.contentMode = .scaleAspectFit
        icon.translatesAutoresizingMaskIntoConstraints = false
        icon.widthAnchor.constraint(equalToConstant: 28).isActive = true

        let title = Theme.makeLabel("会员已开通", font: Theme.semibold(16), color: .white)
        let sub = Theme.makeLabel("全部词库与专属权益已生效，感谢支持",
                                  font: Theme.regular(12.5), color: .white, numberOfLines: 0)
        sub.alpha = 0.66

        let textStack = UIStackView(arrangedSubviews: [title, sub])
        textStack.axis = .vertical
        textStack.spacing = 3

        let row = UIStackView(arrangedSubviews: [icon, textStack])
        row.axis = .horizontal
        row.spacing = 13
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(row)
        row.pinToSuperview(insets: UIEdgeInsets(top: 18, left: 20, bottom: 18, right: 20))
        return card
    }

    @objc private func planTapped(_ sender: PlanRowView) {
        selectedProductIndex = sender.tag
        Theme.haptic(.light)
        planRows.forEach { $0.isChosen = $0.tag == selectedProductIndex }
    }

    @objc private func refreshTapped() {
        Task { @MainActor [weak self] in
            await MembershipService.shared.refresh()
            self?.render()
        }
    }

    // MARK: - Footer

    private func makeMemberBanner() -> UIView {
        let banner = UIView()
        banner.backgroundColor = Theme.palette.primarySoft
        banner.layer.cornerRadius = Theme.Metrics.smallRadius
        banner.translatesAutoresizingMaskIntoConstraints = false
        banner.heightAnchor.constraint(equalToConstant: 52).isActive = true

        let icon = UIImageView(image: UIImage(systemName: "checkmark.circle.fill",
                                              withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .medium)))
        icon.tintColor = Theme.palette.primarySoftText
        icon.contentMode = .scaleAspectFit

        let label = Theme.makeLabel("已开通会员，感谢支持", font: Theme.medium(14), color: Theme.palette.primarySoftText)
        let row = UIStackView(arrangedSubviews: [icon, label])
        row.axis = .horizontal
        row.spacing = 8
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        banner.addSubview(row)
        row.centerInSuperview()
        return banner
    }

    private func makePurchaseBar() -> UIView {
        let primary = Theme.makePrimaryButton(title: "立即开通", size: .large)
        primary.heightAnchor.constraint(equalToConstant: 50).isActive = true
        primary.addTarget(self, action: #selector(purchaseTapped), for: .touchUpInside)
        footerButtons = [primary]
        syncBusyState()
        return primary
    }

    private func syncBusyState() {
        footerButtons.forEach {
            $0.isEnabled = !isBusy
            $0.alpha = isBusy ? 0.55 : 1
        }
    }

    // MARK: - Purchase / Restore

    private func productToPurchase() -> Product? {
        guard products.indices.contains(selectedProductIndex) else { return products.first }
        return products[selectedProductIndex]
    }

    @objc private func purchaseTapped() {
        guard !isBusy, let product = productToPurchase() else { return }
        isBusy = true
        syncBusyState()
        Task { @MainActor [weak self] in
            guard let self else { return }
            let result = await MembershipService.shared.purchase(product)
            self.isBusy = false
            self.syncBusyState()
            switch result {
            case .success:
                Theme.haptic(.medium)
                self.render()
                let alert = UIAlertController.simple(title: "开通成功，欢迎加入会员！",
                                                     message: "专属权益已生效，感谢你的支持。")
                self.present(alert, animated: true)
            case .failure(let error):
                if error == .cancelled { return }
                let alert = UIAlertController.simple(title: "未能完成开通",
                                                     message: error.errorDescription ?? "请稍后重试。")
                self.present(alert, animated: true)
            }
        }
    }

    @objc private func restoreTapped() {
        guard !isBusy else { return }
        isBusy = true
        syncBusyState()
        Task { @MainActor [weak self] in
            guard let self else { return }
            let result = await MembershipService.shared.restore()
            self.isBusy = false
            self.syncBusyState()
            switch result {
            case .success:
                Theme.haptic(.medium)
                self.render()
                let alert = UIAlertController.simple(title: "恢复成功",
                                                     message: "已恢复你的会员权益，欢迎回来！")
                self.present(alert, animated: true)
            case .failure(let error):
                if error == .nothingToRestore {
                    let alert = UIAlertController.simple(title: "未找到可恢复的购买记录",
                                                         message: "你还没有购买过会员，或购买记录不在当前 Apple ID 下。")
                    self.present(alert, animated: true)
                } else if error != .cancelled {
                    let alert = UIAlertController.simple(title: "恢复失败",
                                                         message: error.errorDescription ?? "请稍后重试。")
                    self.present(alert, animated: true)
                }
            }
        }
    }
}

// MARK: - Plan row

/// One selectable plan. A whole card rather than a table row, so the chosen
/// plan can carry a border and a tint without the list turning into stripes.
final class PlanRowView: UIControl {

    struct Model {
        let title: String
        let price: String
        let monthly: String?
        let anchor: String?
        let badge: String?
        let enabled: Bool
    }

    var isChosen: Bool = false { didSet { restyle() } }

    private let model: Model
    private let radio = UIView()
    private let radioDot = UIView()

    init(model: Model) {
        self.model = model
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = 13
        layer.borderWidth = 1.4
        backgroundColor = Theme.palette.card
        isEnabled = model.enabled
        heightAnchor.constraint(equalToConstant: 62).isActive = true

        radio.layer.cornerRadius = 9
        radio.layer.borderWidth = 1.5
        radio.isUserInteractionEnabled = false
        radio.translatesAutoresizingMaskIntoConstraints = false
        addSubview(radio)

        radioDot.backgroundColor = .white
        radioDot.layer.cornerRadius = 3
        radioDot.isUserInteractionEnabled = false
        radioDot.translatesAutoresizingMaskIntoConstraints = false
        radio.addSubview(radioDot)

        let title = Theme.makeLabel(model.title, font: Theme.semibold(15))
        // Badge sits inline after the title. It used to overhang the card's top
        // edge, but a CALayer border draws above its sublayers, so the border
        // sliced straight through the badge text.
        let titleRow = UIStackView(arrangedSubviews: [title])
        titleRow.axis = .horizontal
        titleRow.spacing = 7
        titleRow.alignment = .center
        if let badge = model.badge {
            titleRow.addArrangedSubview(makeBadge(badge))
            titleRow.addArrangedSubview(UIView())   // keeps the badge hugging the title
        }

        let text = UIStackView(arrangedSubviews: [titleRow])
        text.axis = .vertical
        text.spacing = 2
        text.isUserInteractionEnabled = false
        text.translatesAutoresizingMaskIntoConstraints = false
        if let monthly = model.monthly {
            text.addArrangedSubview(Theme.makeLabel(monthly, font: Theme.regular(11.5),
                                                    color: Theme.palette.secondaryText))
        }
        addSubview(text)

        let price = Theme.makeLabel(model.price, font: Theme.semibold(18), alignment: .right)
        price.isUserInteractionEnabled = false
        let priceStack = UIStackView(arrangedSubviews: [price])
        priceStack.axis = .vertical
        priceStack.spacing = 1
        priceStack.alignment = .trailing
        priceStack.isUserInteractionEnabled = false
        priceStack.translatesAutoresizingMaskIntoConstraints = false
        if let anchor = model.anchor {
            let struck = Theme.makeLabel(font: Theme.regular(11.5), color: Theme.palette.tertiaryText, alignment: .right)
            struck.attributedText = NSAttributedString(
                string: anchor,
                attributes: [.strikethroughStyle: NSUnderlineStyle.single.rawValue,
                             .strikethroughColor: Theme.palette.tertiaryText,
                             .foregroundColor: Theme.palette.tertiaryText,
                             .font: Theme.regular(11.5)])
            priceStack.addArrangedSubview(struck)
        }
        addSubview(priceStack)

        NSLayoutConstraint.activate([
            radio.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            radio.centerYAnchor.constraint(equalTo: centerYAnchor),
            radio.widthAnchor.constraint(equalToConstant: 18),
            radio.heightAnchor.constraint(equalToConstant: 18),
            radioDot.centerXAnchor.constraint(equalTo: radio.centerXAnchor),
            radioDot.centerYAnchor.constraint(equalTo: radio.centerYAnchor),
            radioDot.widthAnchor.constraint(equalToConstant: 6),
            radioDot.heightAnchor.constraint(equalToConstant: 6),

            text.leadingAnchor.constraint(equalTo: radio.trailingAnchor, constant: 12),
            text.centerYAnchor.constraint(equalTo: centerYAnchor),
            text.trailingAnchor.constraint(lessThanOrEqualTo: priceStack.leadingAnchor, constant: -10),

            priceStack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            priceStack.centerYAnchor.constraint(equalTo: centerYAnchor)
        ])

        restyle()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    private func makeBadge(_ text: String) -> UIView {
        let label = PaddedLabel(insets: UIEdgeInsets(top: 2, left: 7, bottom: 2, right: 7))
        label.text = text
        label.font = Theme.semibold(10.5)
        label.textColor = .white
        label.textAlignment = .center
        label.backgroundColor = Theme.palette.flame
        label.layer.cornerRadius = 5
        label.clipsToBounds = true
        label.isUserInteractionEnabled = false
        label.setContentHuggingPriority(.required, for: .horizontal)
        label.setContentCompressionResistancePriority(.required, for: .horizontal)
        label.translatesAutoresizingMaskIntoConstraints = false
        return label
    }

    /// The highlight tracks `isChosen` alone. When the plans are inert (StoreKit
    /// not configured yet) the recommended one still has to be visibly
    /// recommended — a ladder with no anchor sells nothing.
    private func restyle() {
        layer.borderColor = (isChosen ? Theme.palette.primary : Theme.palette.border).cgColor
        backgroundColor = isChosen ? Theme.palette.primarySoft : Theme.palette.card
        radio.backgroundColor = isChosen ? Theme.palette.primary : .clear
        radio.layer.borderColor = (isChosen ? Theme.palette.primary : Theme.palette.tertiaryText).cgColor
        radioDot.isHidden = !isChosen
        alpha = isEnabled ? 1 : 0.9
    }
}
