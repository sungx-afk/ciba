import XCTest
@testable import CibaEnglish

/// Validates the bundled database produced by tools/export_words.py.
final class DatabaseTests: XCTestCase {

    private var db: WordDatabase!

    override func setUpWithError() throws {
        db = WordDatabase(fileURL: WordDatabase.defaultURL(bundle: Bundle(for: WordDatabase.self)))
        XCTAssertTrue(db.loadSynchronously())
    }

    func testWordCountMatchesDesign() {
        XCTAssertEqual(db.words.count, 4123, "TOEFL book must contain 4 123 words")
    }

    func testIDsAreSequential() {
        let ids = db.words.map(\.id)
        XCTAssertEqual(ids.first, 1)
        XCTAssertEqual(ids.last, 4123)
        XCTAssertEqual(ids, Array(1...4123))
    }

    func testCategoryCountAndNames() {
        XCTAssertEqual(db.categories.count, 34)
        let names = db.categories.map(\.name)
        // Order matches the source workbook chapter order.
        XCTAssertEqual(Array(names.prefix(3)), ["生物", "艺术", "动物"])
        for required in ["行为", "现实", "属性", "事物", "状态", "心理", "语言", "品质", "人物"] {
            XCTAssertTrue(names.contains(required), "missing category \(required)")
        }
        XCTAssertEqual(Set(names).count, names.count, "category names must be unique")
    }

    func testCategoryTotalsMatchDesign() {
        func total(_ name: String) -> Int {
            db.categories.first { $0.name == name }?.total ?? -1
        }
        // These exact numbers appear in the product mockups.
        XCTAssertEqual(total("行为"), 577)
        XCTAssertEqual(total("现实"), 444)
        XCTAssertEqual(total("属性"), 413)
        XCTAssertEqual(total("事物"), 344)
        XCTAssertEqual(total("状态"), 311)
        XCTAssertEqual(total("心理"), 245)
        XCTAssertEqual(total("语言"), 208)
        XCTAssertEqual(total("品质"), 184)
        XCTAssertEqual(total("人物"), 130)
    }

    func testGroupTotalsSumToCategoryTotal() {
        for shape in db.categories {
            let sum = shape.subs.reduce(0) { $0 + $1.count } + shape.directCount
            XCTAssertEqual(sum, shape.total, "sub totals must add up for \(shape.name)")
        }
    }

    func testCongyingGroupMatchesMockup() {
        // 品质 → 聪颖 has exactly 18 words; the mockup's word list begins with
        // intelligent, smart, versatile …
        let shape = db.categories.first { $0.name == "品质" }
        let sub = shape?.subs.first { $0.name == "聪颖" }
        XCTAssertEqual(sub?.count, 18)
        let words = db.words(category: "品质", sub: "聪颖")
        XCTAssertEqual(words.count, 18)
        XCTAssertEqual(words.prefix(3).map(\.word), ["intelligent", "smart", "versatile"])
    }

    func testEveryEntryHasMeaning() {
        let missing = db.words.filter { $0.meaning.isEmpty }
        XCTAssertTrue(missing.isEmpty, "\(missing.count) entries lack a gloss")
    }

    func testMeaningContainsOnlyValidCharacters() {
        // meanings should not contain raw 【记】 markers (they live in note)
        let bad = db.words.filter { $0.meaning.contains("【记】") || $0.meaning.contains("【例】") }
        XCTAssertTrue(bad.isEmpty)
    }
}
