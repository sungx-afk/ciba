import UIKit

/// 关于糍粑英语：应用信息 + 数据说明 / 支持与反馈 / 评分 / 协议。
final class AboutViewController: UIViewController {

    private let scrollView = UIScrollView()
    private let contentStack = UIStackView()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Theme.palette.background
        title = "关于"

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
            contentStack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 24),
            contentStack.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor, constant: Theme.Metrics.hMargin),
            contentStack.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor, constant: -Theme.Metrics.hMargin),
            contentStack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -24),
            contentStack.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor, constant: -Theme.Metrics.hMargin * 2)
        ])

        buildContent()
    }

    private func buildContent() {
        contentStack.addArrangedSubview(makeHeaderBlock())

        let card = Theme.makeCard()
        let rows = UIStackView()
        rows.axis = .vertical
        rows.spacing = 0
        rows.translatesAutoresizingMaskIntoConstraints = false

        let dataRow = MenuRowView(title: "数据说明")
        dataRow.onTap = { [weak self] in self?.showDataInfo() }
        rows.addArrangedSubview(dataRow)

        let feedbackRow = MenuRowView(title: "支持与反馈")
        feedbackRow.showTopDivider(true)
        feedbackRow.onTap = { [weak self] in
            self?.navigationController?.pushViewController(FeedbackViewController(), animated: true)
        }
        rows.addArrangedSubview(feedbackRow)

        let rateRow = MenuRowView(title: "去评分")
        rateRow.showTopDivider(true)
        rateRow.onTap = { [weak self] in
            guard let self else { return }
            ReviewService.requestRating(in: self)
        }
        rows.addArrangedSubview(rateRow)

        let privacyRow = MenuRowView(title: "隐私政策")
        privacyRow.showTopDivider(true)
        privacyRow.onTap = { [weak self] in
            self?.pushWeb(title: "隐私政策", resourceName: "privacy")
        }
        rows.addArrangedSubview(privacyRow)

        let termsRow = MenuRowView(title: "用户协议")
        termsRow.showTopDivider(true)
        termsRow.onTap = { [weak self] in
            self?.pushWeb(title: "用户协议", resourceName: "terms")
        }
        rows.addArrangedSubview(termsRow)

        card.addSubview(rows)
        NSLayoutConstraint.activate([
            rows.topAnchor.constraint(equalTo: card.topAnchor, constant: 6),
            rows.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -6),
            rows.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            rows.trailingAnchor.constraint(equalTo: card.trailingAnchor)
        ])
        contentStack.addArrangedSubview(card)

        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        let footnote = Theme.makeLabel("© 2026 糍粑英语 · 保留所有权利\n本地优先 · 无广告 · 无第三方统计",
                                       font: Theme.regular(11.5),
                                       color: Theme.palette.tertiaryText,
                                       alignment: .center,
                                       numberOfLines: 0)
        contentStack.addArrangedSubview(footnote)
    }

    private func makeHeaderBlock() -> UIView {
        let block = UIStackView()
        block.axis = .vertical
        block.alignment = .center
        block.spacing = 6
        block.translatesAutoresizingMaskIntoConstraints = false

        let avatar = AvatarView(index: 0, size: 88, glyph: "词")
        block.addArrangedSubview(avatar)

        let name = Theme.makeLabel("糍粑英语", font: Theme.semibold(20), alignment: .center)
        block.setCustomSpacing(14, after: avatar)
        block.addArrangedSubview(name)

        let version = Theme.makeLabel("版本 \(AppConfig.version) (Build \(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"))",
                                      font: Theme.regular(12.5),
                                      color: Theme.palette.tertiaryText,
                                      alignment: .center)
        block.addArrangedSubview(version)

        let tagline = Theme.makeLabel("顺应大脑规律记单词\n把零散单词打包成语义组块，让复习更高效",
                                      font: Theme.regular(13),
                                      color: Theme.palette.secondaryText,
                                      alignment: .center,
                                      numberOfLines: 0)
        block.setCustomSpacing(12, after: version)
        block.addArrangedSubview(tagline)
        return block
    }

    private func pushWeb(title: String, resourceName: String) {
        navigationController?.pushViewController(WebContentViewController(title: title, resourceName: resourceName), animated: true)
    }

    private func showDataInfo() {
        let alert = UIAlertController.simple(title: "数据说明",
                                             message: "词汇数据整理自《词以类记 TOEFL 词汇》公开学习资料（4 123 词，34 个分类），仅供个人学习使用。")
        present(alert, animated: true)
    }
}
