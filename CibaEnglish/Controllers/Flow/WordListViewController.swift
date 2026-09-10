import UIKit

/// 单词列表 (mockup 3): segmented 未记住/已记住/全部 header + search + word rows.
/// Tapping a row opens the word detail; the "开始" button pushes a study session
/// with the currently visible rows as its queue (复习 when everything is already
/// remembered, otherwise 学习). A direct-only variant lists just the words that
/// are attached straight to a category (sub == "", the "其他" bucket).
final class WordListViewController: UIViewController {

    private let engine = StudyEngine()

    private let scope: SessionScope
    private let directOnlyCategory: String?

    private let tableView = UITableView(frame: .zero, style: .plain)
    private let segmented = PillSegmentedControl(items: StatusFilter.allCases.map(\.title), selectedIndex: 2)
    private let searchController = UISearchController(searchResultsController: nil)

    private lazy var happyView = EmptyStateView(icon: "checkmark.circle",
                                                title: "太棒了，全部记住啦",
                                                subtitle: "这个分组没有未记住的单词了")
    private lazy var genericView = EmptyStateView(icon: "tray",
                                                  title: "暂无单词",
                                                  subtitle: "换个筛选或分组看看吧")
    private lazy var searchView = EmptyStateView(icon: "magnifyingglass",
                                                 title: "未找到相关单词",
                                                 subtitle: "换个关键词试试吧")

    private var baseWords: [Word] = []
    private var rows: [Word] = []
    private var searchText = ""
    private var isSearching: Bool { !searchText.isEmpty }

    private var startItem: UIBarButtonItem?

    // MARK: - Init

    init(scope: SessionScope, directOnlyCategory: String?) {
        self.scope = scope
        self.directOnlyCategory = directOnlyCategory
        super.init(nibName: nil, bundle: nil)
        title = scope.title
    }

    convenience init(scope: SessionScope) {
        self.init(scope: scope, directOnlyCategory: nil)
    }

    /// List limited to words attached directly under a category (sub == "").
    convenience init(directWordsOfCategory name: String) {
        self.init(scope: .category(name: name), directOnlyCategory: name)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Theme.palette.background

        setupSearch()
        setupTable()
        segmented.onSelect = { [weak self] _ in self?.reloadData() }

        NotificationCenter.default.addObserver(self, selector: #selector(reloadData),
                                               name: .progressDidChange, object: nil)

        reloadData()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        reloadData()
    }

    // MARK: - Layout

    private func setupSearch() {
        searchController.searchResultsUpdater = self
        searchController.obscuresBackgroundDuringPresentation = false
        searchController.hidesNavigationBarDuringPresentation = false
        let bar = searchController.searchBar
        bar.placeholder = "搜索单词或释义"
        bar.tintColor = Theme.palette.primary
        bar.backgroundColor = Theme.palette.background
        navigationItem.searchController = searchController
        definesPresentationContext = true
    }

    private func setupTable() {
        segmented.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(segmented)

        tableView.backgroundColor = .clear
        tableView.separatorStyle = .none
        tableView.register(WordCell.self, forCellReuseIdentifier: WordCell.reuseID)
        tableView.dataSource = self
        tableView.delegate = self
        tableView.keyboardDismissMode = .onDrag
        tableView.contentInset = UIEdgeInsets(top: 6, left: 0, bottom: 12, right: 0)
        tableView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(tableView)

        NSLayoutConstraint.activate([
            segmented.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
            segmented.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: Theme.Metrics.hMargin),
            segmented.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -Theme.Metrics.hMargin),

            tableView.topAnchor.constraint(equalTo: segmented.bottomAnchor, constant: 2),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])

        for empty in [happyView, genericView, searchView] {
            empty.isHidden = true
            view.addSubview(empty)
            NSLayoutConstraint.activate([
                empty.topAnchor.constraint(equalTo: tableView.topAnchor, constant: 8),
                empty.leadingAnchor.constraint(equalTo: tableView.leadingAnchor),
                empty.trailingAnchor.constraint(equalTo: tableView.trailingAnchor),
                empty.bottomAnchor.constraint(equalTo: tableView.bottomAnchor)
            ])
        }

        let item = UIBarButtonItem(title: "开始 (0)", style: .plain, target: self, action: #selector(startTapped))
        item.tintColor = Theme.palette.primary
        navigationItem.rightBarButtonItem = item
        startItem = item
    }

    // MARK: - Data

    private var currentBase: [Word] {
        if let category = directOnlyCategory {
            return WordDatabase.shared.words(category: category).filter { $0.sub.isEmpty }
        }
        return engine.words(in: scope, filter: .all)
    }

    @objc private func reloadData() {
        guard WordDatabase.shared.isLoaded else {
            WordDatabase.shared.loadIfNeeded { [weak self] in self?.reloadData() }
            return
        }
        baseWords = currentBase

        if isSearching {
            rows = baseWords.filter {
                $0.word.localizedCaseInsensitiveContains(searchText)
                    || $0.meaning.localizedCaseInsensitiveContains(searchText)
            }
        } else {
            let filter = StatusFilter(rawValue: segmented.selectedIndex) ?? .all
            rows = engine.apply(filter: filter, to: baseWords)
        }

        updateEmptyState()
        updateStartButton()
        tableView.reloadData()
    }

    private func updateEmptyState() {
        let showHappy = !isSearching && segmented.selectedIndex == StatusFilter.unremembered.rawValue
            && !baseWords.isEmpty && rows.isEmpty
        let showSearch = isSearching && rows.isEmpty
        let showGeneric = rows.isEmpty && !showHappy && !showSearch

        happyView.isHidden = !showHappy
        searchView.isHidden = !showSearch
        genericView.isHidden = !showGeneric
        happyView.isUserInteractionEnabled = !happyView.isHidden
        searchView.isUserInteractionEnabled = !searchView.isHidden
        genericView.isUserInteractionEnabled = !genericView.isHidden
    }

    private func updateStartButton() {
        startItem?.title = "开始 (\(rows.count))"
    }

    // MARK: - Actions

    @objc private func startTapped() {
        guard !rows.isEmpty else {
            let alert = UIAlertController.simple(title: nil, message: "当前列表为空，先去别的分组看看吧")
            present(alert, animated: true)
            return
        }
        Theme.haptic()
        let allRemembered = rows.allSatisfy { engine.isRemembered($0) }
        let mode: SessionMode = allRemembered ? .reviewDue : .learnNew
        let vc = StudySessionViewController(scope: scope, mode: mode, queue: rows)
        vc.hidesBottomBarWhenPushed = true
        navigationController?.pushViewController(vc, animated: true)
    }

    private func openDetail(_ word: Word) {
        Theme.haptic()
        let vc = WordDetailViewController(word: word)
        navigationController?.pushViewController(vc, animated: true)
    }
}

// MARK: - Search

extension WordListViewController: UISearchResultsUpdating {
    func updateSearchResults(for searchController: UISearchController) {
        searchText = (searchController.searchBar.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        reloadData()
    }
}

// MARK: - UITableViewDataSource / Delegate

extension WordListViewController: UITableViewDataSource, UITableViewDelegate {

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
                       bookmarked: progress.bookmarked,
                       mode: .check)
        let wasRemembered = progress.remembered
        cell.onToggle = { [weak self] in
            guard let self else { return }
            ProgressStore.shared.setRemembered(id: word.id, !wasRemembered)
            self.reloadData()
        }
        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        guard indexPath.row < rows.count else { return }
        openDetail(rows[indexPath.row])
    }

    func tableView(_ tableView: UITableView,
                   trailingSwipeActionsConfigurationForRowAt indexPath: IndexPath) -> UISwipeActionsConfiguration? {
        guard indexPath.row < rows.count else { return nil }
        let word = rows[indexPath.row]
        let bookmarked = ProgressStore.shared.progress(for: word.id).bookmarked
        let action = UIContextualAction(style: .normal, title: bookmarked ? "移出生词本" : "加生词本") { _, _, done in
            ProgressStore.shared.setBookmarked(id: word.id, !bookmarked)
            done(true)
        }
        action.backgroundColor = bookmarked ? Theme.palette.grayButton : Theme.palette.primary
        return UISwipeActionsConfiguration(actions: [action])
    }
}
