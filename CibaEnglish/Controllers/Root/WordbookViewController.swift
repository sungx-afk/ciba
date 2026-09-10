import UIKit

/// 生词本 tab (screenshot 5): stats card (生词 / 今日复习 / 连续天数),
/// 今日复习 CTA, filter segments and the bookmarked word list.
final class WordbookViewController: UIViewController {

    private let engine = StudyEngine()
    private let tableView = UITableView(frame: .zero, style: .plain)

    private let segmented = PillSegmentedControl(items: StatusFilter.allCases.map(\.title), selectedIndex: 0)
    private let statNewValue = StatTileView(value: "0", caption: "生词")
    private let statDueValue = StatTileView(value: "0", caption: "今日复习")
    private let statStreakValue = StatTileView(value: "0", caption: "连续天数")
    private let reviewButton = Theme.makePrimaryButton(title: "开始今日复习")
    private let emptyView = EmptyStateView(icon: "bookmark",
                                           title: "生词本还是空的",
                                           subtitle: "在单词列表或详情页点击书签，把不熟的单词收进来，随时集中复习",
                                           actionTitle: "去分类背单词")

    private var rows: [Word] = []
    private var dueCount = 0
    private var lastSegment = 0

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Theme.palette.background
        title = "生词本"
        tabBarItem = UITabBarItem(title: "生词本",
                                  image: UIImage(systemName: "bookmark"),
                                  selectedImage: UIImage(systemName: "bookmark.fill"))

        setupLayout()
        segmented.onSelect = { [weak self] index in
            self?.lastSegment = index
            self?.reloadData()
        }
        reviewButton.addTarget(self, action: #selector(startReview), for: .touchUpInside)
        emptyView.action = { [weak self] in
            self?.tabBarController?.selectedIndex = 0
        }

        NotificationCenter.default.addObserver(self, selector: #selector(reloadData),
                                               name: .progressDidChange, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(reloadData),
                                               name: .appDidBecomeActive, object: nil)
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        reloadData()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: Layout

    private func setupLayout() {
        // Fixed-height frame container; Auto Layout used inside it.
        let headerHeight: CGFloat = 220
        let header = UIView(frame: CGRect(x: 0, y: 0, width: view.bounds.width, height: headerHeight))
        header.backgroundColor = .clear

        // Stats card
        let statsCard = Theme.makeCard()
        let dividerV1 = UIView(), dividerV2 = UIView()
        dividerV1.backgroundColor = Theme.palette.border
        dividerV2.backgroundColor = Theme.palette.border
        dividerV1.translatesAutoresizingMaskIntoConstraints = false
        dividerV2.translatesAutoresizingMaskIntoConstraints = false

        statsCard.addSubview(statNewValue)
        statsCard.addSubview(statDueValue)
        statsCard.addSubview(statStreakValue)
        statsCard.addSubview(dividerV1)
        statsCard.addSubview(dividerV2)
        NSLayoutConstraint.activate([
            statNewValue.topAnchor.constraint(equalTo: statsCard.topAnchor, constant: 18),
            statNewValue.bottomAnchor.constraint(equalTo: statsCard.bottomAnchor, constant: -18),
            statNewValue.leadingAnchor.constraint(equalTo: statsCard.leadingAnchor),
            statNewValue.widthAnchor.constraint(equalTo: statsCard.widthAnchor, multiplier: 1 / 3),

            dividerV1.centerYAnchor.constraint(equalTo: statsCard.centerYAnchor),
            dividerV1.leadingAnchor.constraint(equalTo: statNewValue.trailingAnchor),
            dividerV1.widthAnchor.constraint(equalToConstant: 1),
            dividerV1.heightAnchor.constraint(equalToConstant: 44),

            statDueValue.centerXAnchor.constraint(equalTo: statsCard.centerXAnchor),
            statDueValue.topAnchor.constraint(equalTo: statNewValue.topAnchor),
            statDueValue.widthAnchor.constraint(equalTo: statsCard.widthAnchor, multiplier: 1 / 3),

            dividerV2.centerYAnchor.constraint(equalTo: statsCard.centerYAnchor),
            dividerV2.leadingAnchor.constraint(equalTo: statDueValue.trailingAnchor),
            dividerV2.widthAnchor.constraint(equalToConstant: 1),
            dividerV2.heightAnchor.constraint(equalToConstant: 44),

            statStreakValue.topAnchor.constraint(equalTo: statNewValue.topAnchor),
            statStreakValue.trailingAnchor.constraint(equalTo: statsCard.trailingAnchor),
            statStreakValue.widthAnchor.constraint(equalTo: statsCard.widthAnchor, multiplier: 1 / 3)
        ])

        // Review CTA
        reviewButton.translatesAutoresizingMaskIntoConstraints = false

        header.addSubview(statsCard)
        header.addSubview(reviewButton)
        header.addSubview(segmented)

        NSLayoutConstraint.activate([
            statsCard.topAnchor.constraint(equalTo: header.topAnchor, constant: 4),
            statsCard.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: Theme.Metrics.hMargin),
            statsCard.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -Theme.Metrics.hMargin),
            statsCard.heightAnchor.constraint(equalToConstant: 96),

            reviewButton.topAnchor.constraint(equalTo: statsCard.bottomAnchor, constant: 12),
            reviewButton.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: Theme.Metrics.hMargin),
            reviewButton.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -Theme.Metrics.hMargin),
            reviewButton.heightAnchor.constraint(equalToConstant: 50),

            segmented.topAnchor.constraint(equalTo: reviewButton.bottomAnchor, constant: 14),
            segmented.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: Theme.Metrics.hMargin),
            segmented.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -Theme.Metrics.hMargin),
            segmented.heightAnchor.constraint(equalToConstant: 34)
        ])

        tableView.backgroundColor = .clear
        tableView.separatorStyle = .none
        tableView.register(WordCell.self, forCellReuseIdentifier: WordCell.reuseID)
        tableView.dataSource = self
        tableView.delegate = self
        tableView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(tableView)

        tableView.tableHeaderView = header

        emptyView.isHidden = true
        view.addSubview(emptyView)
        NSLayoutConstraint.activate([
            emptyView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: headerHeight),
            emptyView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            emptyView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            emptyView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])

        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.topAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
    }

    // MARK: Data

    @objc private func reloadData() {
        guard WordDatabase.shared.isLoaded else {
            WordDatabase.shared.loadIfNeeded { [weak self] in self?.reloadData() }
            return
        }
        let bookmarks = engine.bookmarkedWords()
        let filter = StatusFilter(rawValue: lastSegment) ?? .unremembered
        rows = engine.apply(filter: filter, to: bookmarks)
        dueCount = engine.totalDueToday

        statNewValue.setValue("\(bookmarks.count)")
        statDueValue.setValue("\(dueCount)")
        statStreakValue.setValue("\(ProgressStore.shared.streakDays())")

        if dueCount > 0 {
            reviewButton.setTitle("开始今日复习 · \(dueCount)", for: .normal)
            reviewButton.backgroundColor = Theme.palette.primary
            reviewButton.setTitleColor(.white, for: .normal)
            reviewButton.isEnabled = true
        } else {
            reviewButton.setTitle("今日没有待复习的单词", for: .normal)
            reviewButton.backgroundColor = Theme.palette.track
            reviewButton.setTitleColor(Theme.palette.tertiaryText, for: .normal)
            reviewButton.isEnabled = false
        }

        emptyView.isHidden = !bookmarks.isEmpty
        emptyView.isUserInteractionEnabled = bookmarks.isEmpty
        tableView.reloadData()
    }

    @objc private func startReview() {
        let words = engine.dueWords()
        guard !words.isEmpty else { return }
        Theme.haptic()
        let vc = StudySessionViewController(scope: .allDue, mode: .reviewDue, queue: words)
        vc.hidesBottomBarWhenPushed = true
        navigationController?.pushViewController(vc, animated: true)
    }
}

// MARK: - Table

extension WordbookViewController: UITableViewDataSource, UITableViewDelegate {

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        rows.count
    }

    func tableView(_ tableView: UITableView, heightForRowAt indexPath: IndexPath) -> CGFloat {
        WordCell.rowHeight
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: WordCell.reuseID, for: indexPath) as! WordCell
        let word = rows[indexPath.row]
        let progress = ProgressStore.shared.progress(for: word.id)
        cell.configure(word: word.word,
                       meaning: word.meaning,
                       remembered: progress.remembered,
                       bookmarked: true,
                       mode: .bookmark)
        cell.onToggle = { [weak self] in
            ProgressStore.shared.setBookmarked(id: word.id, false)
        }
        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        let word = rows[indexPath.row]
        Theme.haptic()
        let vc = WordDetailViewController(word: word)
        navigationController?.pushViewController(vc, animated: true)
    }

    func tableView(_ tableView: UITableView,
                   trailingSwipeActionsConfigurationForRowAt indexPath: IndexPath) -> UISwipeActionsConfiguration? {
        let word = rows[indexPath.row]
        let action = UIContextualAction(style: .destructive, title: "移除") { _, _, done in
            ProgressStore.shared.setBookmarked(id: word.id, false)
            done(true)
        }
        action.backgroundColor = Theme.palette.grayButton
        return UISwipeActionsConfiguration(actions: [action])
    }
}
