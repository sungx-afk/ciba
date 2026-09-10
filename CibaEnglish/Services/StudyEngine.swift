import Foundation

/// Aggregates the raw word database with learning progress into everything the
/// screens need: category stats, filtered word lists and study-session queues.
final class StudyEngine {

    let db: WordDatabase
    let store: ProgressStore

    init(db: WordDatabase = .shared, store: ProgressStore = .shared) {
        self.db = db
        self.store = store
    }

    // MARK: - Category stats

    var categoryStats: [CategoryStat] {
        db.categories.map { shape in
            let remembered = words(inCategory: shape.name).reduce(0) { $0 + (isRemembered($1) ? 1 : 0) }
            let subs: [SubGroupStat]
            if shape.hasSubGroups {
                var list = shape.subs.map { sub in
                    let count = subWords(shape.name, sub.name).reduce(0) { $0 + (isRemembered($1) ? 1 : 0) }
                    return SubGroupStat(name: sub.name, total: sub.count, remembered: count)
                }
                if shape.directCount > 0 {
                    let directWords = directWords(inCategory: shape.name)
                    let rememberedDirect = directWords.reduce(0) { $0 + (isRemembered($1) ? 1 : 0) }
                    list.append(SubGroupStat(name: "其他", total: shape.directCount, remembered: rememberedDirect))
                }
                subs = list
            } else {
                subs = []
            }
            return CategoryStat(name: shape.name, total: shape.total, remembered: remembered, subGroups: subs)
        }
    }

    func categoryStat(named name: String) -> CategoryStat? {
        categoryStats.first { $0.name == name }
    }

    // MARK: - Word lookup helpers

    private func words(inCategory name: String) -> [Word] { db.words(category: name) }
    private func subWords(_ category: String, _ sub: String) -> [Word] { db.words(category: category, sub: sub) }
    private func directWords(inCategory name: String) -> [Word] { db.words(category: name).filter { $0.sub.isEmpty } }

    // MARK: - Scoped word lists

    /// Words in one 大类, optionally restricted to one 意群.
    func words(category: String, sub: String? = nil) -> [Word] {
        if let sub { return subWords(category, sub) }
        return words(inCategory: category)
    }

    func words(in scope: SessionScope, filter: StatusFilter) -> [Word] {
        let base: [Word]
        switch scope {
        case .category(let name): base = words(inCategory: name)
        case .group(let cat, let sub):
            // "其他" is the display bucket for words directly attached to the category.
            base = sub == "其他" ? words(inCategory: cat).filter { $0.sub.isEmpty } : subWords(cat, sub)
        case .wordbook: base = bookmarkedWords()
        case .allDue: base = dueWords()
        }
        return apply(filter: filter, to: base)
    }

    func apply(filter: StatusFilter, to words: [Word]) -> [Word] {
        switch filter {
        case .all: return words
        case .remembered: return words.filter { isRemembered($0) }
        case .unremembered: return words.filter { !isRemembered($0) }
        }
    }

    // MARK: - Bookmarks & due queue

    func bookmarkedWords() -> [Word] {
        db.words.filter { store.progress(for: $0.id).bookmarked }
    }

    func dueWords(asOf date: Date = Date()) -> [Word] {
        db.words.filter { w in
            let p = store.progress(for: w.id)
            return p.remembered && p.isDue(now: date)
        }
    }

    /// Due words inside a scope (used by 今日复习 when launched from a list screen).
    func dueWords(in scope: SessionScope, asOf date: Date = Date()) -> [Word] {
        let pool: [Word]
        switch scope {
        case .category(let name): pool = words(inCategory: name)
        case .group(let cat, let sub):
            pool = sub == "其他" ? words(inCategory: cat).filter { $0.sub.isEmpty } : subWords(cat, sub)
        case .wordbook: pool = bookmarkedWords()
        case .allDue: pool = db.words
        }
        return pool.filter { w in
            let p = store.progress(for: w.id)
            return p.remembered && p.isDue(now: date)
        }
    }

    // MARK: - Counts

    var totalRemembered: Int { db.words.reduce(0) { $0 + (isRemembered($1) ? 1 : 0) } }
    var totalBookmarked: Int { bookmarkedWords().count }
    var totalDueToday: Int { dueWords().count }
    var totalWords: Int { db.words.count }

    func isRemembered(_ word: Word) -> Bool {
        store.progress(for: word.id).remembered
    }

    func isBookmarked(_ word: Word) -> Bool {
        store.progress(for: word.id).bookmarked
    }

    func summary(for words: [Word]) -> WordStatusSummary {
        let remembered = words.reduce(0) { $0 + (isRemembered($1) ? 1 : 0) }
        return WordStatusSummary(remembered: remembered, unremembered: words.count - remembered)
    }
}
