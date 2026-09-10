import UIKit

/// 分类 tab (screenshot 2): book title + 换词库, 未记住/已记住/全部 filter,
/// then the full list of 34 大类 with mastery counts and progress bars.
final class CategoryHomeViewController: UIViewController {

    private let engine = StudyEngine()
    private let tableView = UITableView(frame: .zero, style: .plain)
    private let segmented = PillSegmentedControl(items: StatusFilter.allCases.map(\.title), selectedIndex: 2) // 全部 default
    private let goalCard = DailyGoalCardView()

    private var stats: [CategoryStat] = []
    private var shownRows: [CategoryStat] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Theme.palette.background
        // Tab label stays "分类" (set on the tab item); the nav bar shows the book.
        navigationItem.title = AppConfig.currentBook.title
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "换词库",
                                                            style: .plain,
                                                            target: self,
                                                            action: #selector(openBookSelect))
        tabBarItem = UITabBarItem(title: "分类",
                                  image: UIImage(systemName: "square.grid.2x2"),
                                  selectedImage: UIImage(systemName: "square.grid.2x2.fill"))

        setupTable()
        segmented.onSelect = { [weak self] _ in self?.reloadRows() }
        reloadRows()

        NotificationCenter.default.addObserver(self, selector: #selector(reloadRows),
                                               name: .progressDidChange, object: nil)
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        reloadRows()
    }

    private func setupTable() {
        tableView.backgroundColor = .clear
        tableView.separatorStyle = .none
        tableView.register(CategoryRowCell.self, forCellReuseIdentifier: CategoryRowCell.reuseID)
        tableView.dataSource = self
        tableView.delegate = self
        tableView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(tableView)

        // Fixed header: segmented control + section label (frame-based container,
        // Auto Layout inside), matches the mockup rhythm.
        let header = UIView(frame: CGRect(x: 0, y: 0, width: view.bounds.width, height: 164))
        header.backgroundColor = .clear
        header.addSubview(goalCard)
        header.addSubview(segmented)
        NSLayoutConstraint.activate([
            goalCard.topAnchor.constraint(equalTo: header.topAnchor, constant: 4),
            goalCard.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: Theme.Metrics.hMargin),
            goalCard.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -Theme.Metrics.hMargin),

            segmented.topAnchor.constraint(equalTo: goalCard.bottomAnchor, constant: 14),
            segmented.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: Theme.Metrics.hMargin),
            segmented.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -Theme.Metrics.hMargin)
        ])
        let sectionLabel = Theme.makeLabel("按意群分类",
                                           font: Theme.medium(13),
                                           color: Theme.palette.tertiaryText)
        sectionLabel.translatesAutoresizingMaskIntoConstraints = false
        header.addSubview(sectionLabel)
        NSLayoutConstraint.activate([
            sectionLabel.topAnchor.constraint(equalTo: segmented.bottomAnchor, constant: 18),
            sectionLabel.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: Theme.Metrics.hMargin + 4),
            sectionLabel.heightAnchor.constraint(equalToConstant: 16)
        ])

        tableView.tableHeaderView = header

        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.topAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
    }

    @objc private func openBookSelect() {
        let vc = BookSelectViewController()
        navigationController?.pushViewController(vc, animated: true)
    }

    @objc private func reloadRows() {
        guard WordDatabase.shared.isLoaded else {
            WordDatabase.shared.loadIfNeeded { [weak self] in self?.reloadRows() }
            return
        }
        goalCard.update(studiedToday: ProgressStore.shared.studiedCount(),
                        goal: SettingsStore.shared.dailyGoal,
                        streakDays: ProgressStore.shared.streakDays(),
                        dueToday: engine.totalDueToday)

        stats = engine.categoryStats
        let filter = StatusFilter(rawValue: segmented.selectedIndex) ?? .all
        switch filter {
        case .all:
            shownRows = stats
        case .remembered:
            shownRows = stats.filter { $0.remembered > 0 }
        case .unremembered:
            shownRows = stats.filter { $0.unremembered > 0 }
        }
        tableView.reloadData()
    }

    private func caption(for stat: CategoryStat) -> String {
        let filter = StatusFilter(rawValue: segmented.selectedIndex) ?? .all
        switch filter {
        case .unremembered:
            return "\(stat.unremembered) / \(stat.total) 未掌握"
        default:
            return "\(stat.remembered) / \(stat.total) 已掌握"
        }
    }

    private func barRatio(for stat: CategoryStat) -> Float {
        let filter = StatusFilter(rawValue: segmented.selectedIndex) ?? .all
        switch filter {
        case .unremembered:
            return stat.total == 0 ? 0 : Float(stat.unremembered) / Float(stat.total)
        default:
            return stat.ratio
        }
    }
}

// MARK: - UITableViewDataSource / Delegate

extension CategoryHomeViewController: UITableViewDataSource, UITableViewDelegate {

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        shownRows.count
    }

    func tableView(_ tableView: UITableView, heightForRowAt indexPath: IndexPath) -> CGFloat {
        CategoryRowCell.rowHeight + CategoryRowCell.outerBottom
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: CategoryRowCell.reuseID, for: indexPath) as! CategoryRowCell
        let stat = shownRows[indexPath.row]
        cell.configure(title: stat.name,
                       countText: caption(for: stat),
                       ratio: barRatio(for: stat),
                       barColor: segmented.selectedIndex == 0 ? Theme.palette.grayButton : nil)
        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        let stat = shownRows[indexPath.row]
        Theme.haptic()
        if stat.subGroups.isEmpty {
            // Flat category → word list directly (人物 / 动物 / 学科类 …).
            let vc = WordListViewController(scope: .category(name: stat.name))
            navigationController?.pushViewController(vc, animated: true)
        } else {
            let vc = SubCategoryViewController(stat: stat)
            navigationController?.pushViewController(vc, animated: true)
        }
    }
}
