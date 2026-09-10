import UIKit

/// 意群 (sub-category) rows for one 大类, pushed from 分类.
/// First row "全部单词" opens the whole category; each following row is one
/// 二级分类. The engine synthesizes an "其他" bucket for words attached directly
/// to the category (sub == "") — those open a direct-only word list because the
/// engine's .group scope matches sub == name and would otherwise exclude them.
final class SubCategoryViewController: UIViewController {

    private enum Destination {
        case allWords
        case group(name: String)
        case directWords
    }

    private struct RowItem {
        let title: String
        let countText: String
        let ratio: Float
        let destination: Destination
    }

    private let engine = StudyEngine()
    private let categoryName: String
    private let tableView = UITableView(frame: .zero, style: .plain)
    private var rows: [RowItem] = []

    init(stat: CategoryStat) {
        self.categoryName = stat.name
        super.init(nibName: nil, bundle: nil)
        title = stat.name
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Theme.palette.background

        tableView.backgroundColor = .clear
        tableView.separatorStyle = .none
        tableView.register(CategoryRowCell.self, forCellReuseIdentifier: CategoryRowCell.reuseID)
        tableView.dataSource = self
        tableView.delegate = self
        tableView.contentInset = UIEdgeInsets(top: 4, left: 0, bottom: 12, right: 0)
        tableView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(tableView)
        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.topAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        reloadRows()
    }

    // MARK: - Data

    private func reloadRows() {
        guard WordDatabase.shared.isLoaded else {
            WordDatabase.shared.loadIfNeeded { [weak self] in self?.reloadRows() }
            return
        }
        guard let stat = engine.categoryStat(named: categoryName) else { return }
        var items: [RowItem] = []

        items.append(RowItem(title: "全部单词",
                             countText: "\(stat.total.groupedString) 词 · 已掌握 \(stat.remembered.groupedString)",
                             ratio: stat.ratio,
                             destination: .allWords))

        for group in stat.subGroups {
            let destination: Destination = (group.name == "其他") ? .directWords : .group(name: group.name)
            items.append(RowItem(title: group.name,
                                 countText: "\(group.total.groupedString) 词 · 已掌握 \(group.remembered.groupedString)",
                                 ratio: group.ratio,
                                 destination: destination))
        }
        rows = items
        tableView.reloadData()
    }

    private func pushWordList(_ destination: Destination) {
        switch destination {
        case .allWords:
            navigationController?.pushViewController(WordListViewController(scope: .category(name: categoryName)),
                                                     animated: true)
        case .group(let name):
            navigationController?.pushViewController(WordListViewController(scope: .group(category: categoryName, sub: name)),
                                                     animated: true)
        case .directWords:
            navigationController?.pushViewController(WordListViewController(directWordsOfCategory: categoryName),
                                                     animated: true)
        }
    }
}

// MARK: - UITableViewDataSource / Delegate

extension SubCategoryViewController: UITableViewDataSource, UITableViewDelegate {

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        rows.count
    }

    func tableView(_ tableView: UITableView, heightForRowAt indexPath: IndexPath) -> CGFloat {
        CategoryRowCell.rowHeight + CategoryRowCell.outerBottom
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: CategoryRowCell.reuseID, for: indexPath) as! CategoryRowCell
        let item = rows[indexPath.row]
        cell.configure(title: item.title, countText: item.countText, ratio: item.ratio)
        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        guard indexPath.row < rows.count else { return }
        Theme.haptic()
        pushWordList(rows[indexPath.row].destination)
    }
}
