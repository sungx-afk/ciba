import XCTest

/// Switches must sit at the trailing edge of their row, vertically aligned
/// with the row label (regression: missing translatesAutoresizingMask=false
/// used to drop them to the leading edge overlapping the text).
final class SwitchPositionTests: XCTestCase {

    func testSwitchPositions() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.staticTexts["生物"].waitForExistence(timeout: 10))
        app.tabBars.buttons["我"].tap()

        // 学习设置
        XCTAssertTrue(app.staticTexts["学习设置"].waitForExistence(timeout: 4))
        app.staticTexts["学习设置"].tap()
        XCTAssertTrue(app.navigationBars["学习设置"].waitForExistence(timeout: 5))
        assertSwitchTrailingAndCentered(app, labelText: "自动朗读单词")
        app.navigationBars.buttons.element(boundBy: 0).tap()

        // 学习提醒
        XCTAssertTrue(app.staticTexts["学习提醒"].waitForExistence(timeout: 4))
        app.staticTexts["学习提醒"].tap()
        XCTAssertTrue(app.navigationBars["学习提醒"].waitForExistence(timeout: 5))
        assertSwitchTrailingAndCentered(app, labelText: "每日学习提醒")
    }

    private func assertSwitchTrailingAndCentered(_ app: XCUIApplication, labelText: String) {
        let screenWidth = app.windows.firstMatch.frame.width
        let switchElement = app.switches.firstMatch
        XCTAssertTrue(switchElement.waitForExistence(timeout: 3), "switch missing on \(labelText)")
        XCTAssertGreaterThan(switchElement.frame.minX, screenWidth / 2,
                             "switch on '\(labelText)' should be on the trailing side, got x=\(switchElement.frame.minX)")

        let label = app.staticTexts[labelText].firstMatch
        XCTAssertTrue(label.exists)
        XCTAssertLessThan(abs(switchElement.frame.midY - label.frame.midY), 6,
                          "switch and '\(labelText)' label should share a vertical center")
    }
}
