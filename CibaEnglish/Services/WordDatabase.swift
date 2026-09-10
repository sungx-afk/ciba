import Foundation

/// Loads and indexes words.json. Kept UI-free so tests can exercise it directly.
final class WordDatabase {

    static let shared = WordDatabase()

    private(set) var words: [Word] = []
    private(set) var isLoaded = false

    /// Ordered top-level categories with their (ordered) sub-groups and raw totals.
    /// Sub-groups only list real 二级分类 names; directly-attached words are counted
    /// separately so the UI can show them as an "其他" bucket when needed.
    struct CategoryShape {
        let name: String
        let total: Int
        let directCount: Int            // words with empty sub
        let subs: [(name: String, count: Int)]
        var hasSubGroups: Bool { !subs.isEmpty }
    }

    private(set) var categories: [CategoryShape] = []
    private var indexByID: [Int: Word] = [:]
    private let lock = NSLock()
    private let fileURL: URL

    init(fileURL: URL? = nil) {
        self.fileURL = fileURL ?? WordDatabase.defaultURL()
    }

    static func defaultURL(bundle: Bundle = Bundle(for: WordDatabase.self)) -> URL {
        guard let url = bundle.url(forResource: "words", withExtension: "json") else {
            fatalError("words.json missing from bundle — run tools/export_words.py")
        }
        return url
    }

    // MARK: Loading

    func loadIfNeeded(completion: (() -> Void)? = nil) {
        lock.lock()
        let loaded = isLoaded
        lock.unlock()
        if loaded {
            completion?()
            return
        }
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.loadSynchronously()
            DispatchQueue.main.async { completion?() }
        }
    }

    /// Synchronous load — used at startup warm-up and in unit tests.
    @discardableResult
    func loadSynchronously() -> Bool {
        lock.lock()
        if isLoaded { lock.unlock(); return true }
        lock.unlock()

        guard let data = try? Data(contentsOf: fileURL),
              let payload = try? JSONDecoder().decode(Payload.self, from: data) else {
            assertionFailure("Failed to read \(fileURL.path)")
            return false
        }
        lock.lock()
        guard !isLoaded else { lock.unlock(); return true }
        words = payload.words
        indexByID = Dictionary(uniqueKeysWithValues: payload.words.map { ($0.id, $0) })
        categories = Self.buildCategories(from: payload.words)
        isLoaded = true
        lock.unlock()
        return true
    }

    private struct Payload: Decodable { let words: [Word] }

    static func buildCategories(from words: [Word]) -> [CategoryShape] {
        var order: [String] = []
        var direct: [String: Int] = [:]
        var subs: [String: [(String, Int)]] = [:]
        var subSeen: [String: Set<String>] = [:]

        for w in words {
            if order.last != w.cat && !order.contains(w.cat) {
                order.append(w.cat)
            }
            if w.sub.isEmpty {
                direct[w.cat, default: 0] += 1
            } else {
                if subSeen[w.cat, default: []].insert(w.sub).inserted {
                    subs[w.cat, default: []].append((w.sub, 1))
                } else if let idx = subs[w.cat]?.firstIndex(where: { $0.0 == w.sub }) {
                    subs[w.cat]?[idx].1 += 1
                }
            }
        }
        return order.map { name in
            CategoryShape(name: name,
                          total: (direct[name] ?? 0) + (subs[name]?.reduce(0) { $0 + $1.1 } ?? 0),
                          directCount: direct[name] ?? 0,
                          subs: subs[name] ?? [])
        }
    }

    // MARK: Lookups

    func word(id: Int) -> Word? {
        lock.lock(); defer { lock.unlock() }
        return indexByID[id]
    }

    func words(category: String) -> [Word] {
        words.filter { $0.cat == category }
    }

    func words(category: String, sub: String) -> [Word] {
        words.filter { $0.cat == category && $0.sub == sub }
    }

    func categoryShape(named name: String) -> CategoryShape? {
        categories.first { $0.name == name }
    }
}
