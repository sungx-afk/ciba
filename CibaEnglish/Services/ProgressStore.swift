import Foundation

extension Notification.Name {
    static let progressDidChange = Notification.Name("progressDidChange")
}

/// Persists per-word learning state (remembered/bookmark/review schedule), study
/// history and streak. Backed by a small JSON document in the app's Library folder.
final class ProgressStore {

    static let shared = ProgressStore()

    private struct Snapshot: Codable {
        var byWordID: [Int: WordProgress] = [:]
        var studiedDays: Set<String> = []   // yyyyMMdd keys
    }

    private var snapshot = Snapshot()
    private let lock = NSLock()
    let fileURL: URL
    private let calendar = Calendar.current

    init(fileURL: URL? = nil) {
        if let fileURL {
            try? FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(),
                                                     withIntermediateDirectories: true)
            self.fileURL = fileURL
        } else {
            let dir = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            self.fileURL = dir.appendingPathComponent("progress.json")
        }
        load()
    }

    // MARK: - Persistence

    private func load() {
        lock.lock()
        defer { lock.unlock() }
        guard let data = try? Data(contentsOf: fileURL),
              let decoded = try? JSONDecoder().decode(Snapshot.self, from: data) else { return }
        snapshot = decoded
    }

    private func persist() {
        lock.lock()
        let data: Data
        do { data = try JSONEncoder().encode(snapshot) }
        catch { lock.unlock(); return }
        lock.unlock()
        try? data.write(to: fileURL, options: .atomic)
    }

    /// Tests use this to re-read after a save.
    var storageFileExists: Bool { FileManager.default.fileExists(atPath: fileURL.path) }

    // MARK: - Read

    func progress(for id: Int) -> WordProgress {
        lock.lock(); defer { lock.unlock() }
        return snapshot.byWordID[id] ?? WordProgress()
    }

    var studiedDayKeys: Set<String> {
        lock.lock(); defer { lock.unlock() }
        return snapshot.studiedDays
    }

    func streakDays(asOf date: Date = Date()) -> Int {
        let keys = studiedDayKeys
        return Scheduler.computeStreak(studyDays: keys, asOf: date, calendar: calendar)
    }

    /// How many distinct words were answered today. Counted from `lastReviewedAt`
    /// rather than a separate tally, so it stays correct even if the app is
    /// killed mid-session or progress is edited from another screen.
    func studiedCount(on date: Date = Date()) -> Int {
        lock.lock(); defer { lock.unlock() }
        let day = calendar.startOfDay(for: date)
        return snapshot.byWordID.values.reduce(0) { count, p in
            guard let last = p.lastReviewedAt else { return count }
            return calendar.startOfDay(for: last) == day ? count + 1 : count
        }
    }

    // MARK: - Mutate

    @discardableResult
    func record(id: Int, choice: IntervalChoice, at date: Date = Date()) -> WordProgress {
        lock.lock()
        let prev = snapshot.byWordID[id] ?? WordProgress()
        let updated = Scheduler.apply(choice, to: prev, now: date, calendar: calendar)
        snapshot.byWordID[id] = updated
        snapshot.studiedDays.insert(Scheduler.dayKey(for: date, calendar: calendar))
        lock.unlock()
        persist()
        NotificationCenter.default.post(name: .progressDidChange, object: nil)
        return updated
    }

    @discardableResult
    func setRemembered(id: Int, _ value: Bool, at date: Date = Date()) -> WordProgress {
        lock.lock()
        let prev = snapshot.byWordID[id] ?? WordProgress()
        let updated = value
            ? Scheduler.markRemembered(prev, now: date, calendar: calendar)
            : Scheduler.markUnremembered(prev, now: date, calendar: calendar)
        snapshot.byWordID[id] = updated
        if value { snapshot.studiedDays.insert(Scheduler.dayKey(for: date, calendar: calendar)) }
        lock.unlock()
        persist()
        NotificationCenter.default.post(name: .progressDidChange, object: nil)
        return updated
    }

    func setBookmarked(id: Int, _ value: Bool) {
        lock.lock()
        var p = snapshot.byWordID[id] ?? WordProgress()
        p.bookmarked = value
        snapshot.byWordID[id] = p
        lock.unlock()
        persist()
        NotificationCenter.default.post(name: .progressDidChange, object: nil)
    }

    func toggleBookmark(id: Int) -> Bool {
        let current = progress(for: id).bookmarked
        setBookmarked(id: id, !current)
        return !current
    }

    func resetAll() {
        lock.lock()
        snapshot = Snapshot()
        lock.unlock()
        persist()
        NotificationCenter.default.post(name: .progressDidChange, object: nil)
    }
}
