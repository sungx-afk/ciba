import XCTest
@testable import CibaEnglish

final class ProgressStoreTests: XCTestCase {

    private var storeURL: URL!
    private var calendar = Calendar.current

    override func setUpWithError() throws {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("ProgressStoreTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        storeURL = dir.appendingPathComponent("progress.json")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: storeURL.deletingLastPathComponent())
    }

    func testRecordMarksRememberedAndPersists() {
        let store = ProgressStore(fileURL: storeURL)

        let p = store.record(id: 7, choice: .day3)
        XCTAssertTrue(p.remembered)
        XCTAssertEqual(store.progress(for: 7).intervalDays, 3)
        XCTAssertEqual(store.streakDays(), 1)
    }

    func testReloadAfterSaveRoundTrips() {
        let first = ProgressStore(fileURL: storeURL)
        first.record(id: 1, choice: .day1)
        first.setRemembered(id: 2, true)
        first.setBookmarked(id: 3, true)
        first.setBookmarked(id: 4, true)
        first.setBookmarked(id: 4, false)

        let second = ProgressStore(fileURL: storeURL)
        XCTAssertEqual(second.progress(for: 1).intervalDays, 1)
        XCTAssertTrue(second.progress(for: 2).remembered)
        XCTAssertTrue(second.progress(for: 3).bookmarked)
        XCTAssertFalse(second.progress(for: 4).bookmarked)
        XCTAssertEqual(second.streakDays(), 1)
    }

    func testResetAllClearsEverything() {
        let store = ProgressStore(fileURL: storeURL)
        store.record(id: 1, choice: .day7)
        store.resetAll()
        XCTAssertFalse(store.progress(for: 1).remembered)
        XCTAssertEqual(store.streakDays(), 0)
        XCTAssertEqual(store.studiedDayKeys.count, 0)
    }

    func testStreakExtendsAcrossDays() {
        let store = ProgressStore(fileURL: storeURL)
        let today = Date()
        let yesterday = calendar.date(byAdding: .day, value: -1, to: today)!
        let dayBefore = calendar.date(byAdding: .day, value: -2, to: today)!
        store.record(id: 1, choice: .day1, at: dayBefore)
        store.record(id: 2, choice: .day1, at: yesterday)
        XCTAssertEqual(store.streakDays(asOf: today), 2)
        store.record(id: 3, choice: .day1, at: today)
        XCTAssertEqual(store.streakDays(asOf: today), 3)
    }
}

final class StudyEngineTests: XCTestCase {

    private var store: ProgressStore!
    private var engine: StudyEngine!
    private var db: WordDatabase!

    override func setUpWithError() throws {
        db = WordDatabase(fileURL: WordDatabase.defaultURL(bundle: Bundle(for: WordDatabase.self)))
        XCTAssertTrue(db.loadSynchronously())

        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("EngineTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        store = ProgressStore(fileURL: dir.appendingPathComponent("progress.json"))
        engine = StudyEngine(db: db, store: store)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: store.storageFileURLForTests)
    }

    func testCategoryStatsStartZero() {
        let stat = engine.categoryStat(named: "行为")
        XCTAssertEqual(stat?.total, 577)
        XCTAssertEqual(stat?.remembered, 0)
    }

    func testRememberingUpdatesCategoryStat() {
        let words = db.words(category: "行为").prefix(3)
        for w in words { store.setRemembered(id: w.id, true) }
        let stat = engine.categoryStat(named: "行为")
        XCTAssertEqual(stat?.remembered, 3)
        XCTAssertEqual(stat?.unremembered, 574)
    }

    func testFilters() {
        let words = db.words(category: "行为")
        store.setRemembered(id: words[0].id, true)
        store.setRemembered(id: words[1].id, true)

        let all = engine.words(in: .category(name: "行为"), filter: .all)
        let remembered = engine.words(in: .category(name: "行为"), filter: .remembered)
        let unremembered = engine.words(in: .category(name: "行为"), filter: .unremembered)

        XCTAssertEqual(all.count, 577)
        XCTAssertEqual(remembered.count, 2)
        XCTAssertEqual(unremembered.count, 575)
    }

    func testDueQueueOnlyContainsDueRememberedWords() {
        let catWords = db.words(category: "心理")
        store.setRemembered(id: catWords[0].id, true)         // due in 3 days
        store.record(id: catWords[1].id, choice: .again)      // unremembered, due tomorrow
        let due = engine.dueWords()
        XCTAssertFalse(due.contains { $0.id == catWords[0].id }, "3-day word must not be due today")
        XCTAssertFalse(due.contains { $0.id == catWords[1].id }, "again word is not remembered")
    }

    func testBookmarks() {
        let words = db.words(category: "人物").prefix(4)
        for w in words { store.setBookmarked(id: w.id, true) }
        XCTAssertEqual(engine.bookmarkedWords().count, 4)
        store.setBookmarked(id: words[0].id, false)
        XCTAssertEqual(engine.bookmarkedWords().count, 3)
    }

    func testSummaryCounts() {
        XCTAssertEqual(engine.totalWords, 4123)
        let group = db.words(category: "品质", sub: "聪颖")
        store.setRemembered(id: group[0].id, true)
        let summary = engine.summary(for: group)
        XCTAssertEqual(summary.remembered, 1)
        XCTAssertEqual(summary.unremembered, 17)
    }
}

extension ProgressStore {
    /// Test-only hook to remove the backing file directory.
    var storageFileURLForTests: URL { fileURL }
}
