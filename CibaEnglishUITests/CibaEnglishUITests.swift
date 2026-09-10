import XCTest

/// Smoke tests: app boots, tab bar works, navigation reaches real data.
final class CibaEnglishUITests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testTabsExistAndSwitch() throws {
        let app = XCUIApplication()
        app.launch()

        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(tabBar.waitForExistence(timeout: 10), "Tab bar should appear after launch")
        let labels = tabBar.buttons.allElementsBoundByIndex.map(\.label)
        XCTAssertTrue(tabBar.buttons["分类"].exists, "tabs found: \(labels)")
        XCTAssertTrue(tabBar.buttons["生词本"].exists, "tabs found: \(labels)")
        XCTAssertTrue(tabBar.buttons["我"].exists, "tabs found: \(labels)")

        // 分类 tab: first workbook chapter renders from the bundled database.
        XCTAssertTrue(app.staticTexts["生物"].waitForExistence(timeout: 10),
                      "First category row should render after database load")

        tabBar.buttons["我"].tap()
        XCTAssertTrue(app.staticTexts["学习设置"].waitForExistence(timeout: 4))

        tabBar.buttons["生词本"].tap()
        XCTAssertTrue(app.staticTexts["连续天数"].waitForExistence(timeout: 4),
                      "Wordbook stats header should render")
    }

    func testDrillIntoCategoryWordList() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.staticTexts["生物"].waitForExistence(timeout: 10))
        app.staticTexts["生物"].tap()

        // 生物 is a flat category → straight into its word list (first word: parasite).
        XCTAssertTrue(app.staticTexts["parasite"].waitForExistence(timeout: 6),
                      "Word rows should appear when opening a flat category")
        XCTAssertTrue(app.navigationBars.buttons.element(boundBy: 0).exists)

        // Back returns to the category home.
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.staticTexts["艺术"].waitForExistence(timeout: 4))
    }
}
