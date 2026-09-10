import XCTest

/// Menu rows inside the Profile screen must open their destinations.
final class MenuNavigationTests: XCTestCase {

    func testPrivacyPolicyRowOpensWebContent() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.staticTexts["生物"].waitForExistence(timeout: 10))
        app.tabBars.buttons["我"].tap()
        XCTAssertTrue(app.staticTexts["隐私政策"].waitForExistence(timeout: 4))

        app.staticTexts["隐私政策"].tap()
        XCTAssertTrue(app.navigationBars["隐私政策"].waitForExistence(timeout: 6),
                      "隐私政策 row should push the web content screen")
    }
}
