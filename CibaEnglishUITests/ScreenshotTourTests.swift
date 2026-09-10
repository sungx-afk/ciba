import XCTest

/// Walks through the main flows and saves screenshots as test attachments,
/// exported afterwards for visual review.
final class ScreenshotTourTests: XCTestCase {

    private func shot(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testTour() throws {
        let app = XCUIApplication()
        app.launch()

        // 1. 分类首页
        XCTAssertTrue(app.staticTexts["生物"].waitForExistence(timeout: 10))
        shot(app, "01-分类首页")

        // 2. 单词列表 (生物 → first words)
        app.staticTexts["生物"].tap()
        XCTAssertTrue(app.staticTexts["parasite"].waitForExistence(timeout: 6))
        shot(app, "02-单词列表")

        // 3. 单词详情
        app.staticTexts["parasite"].tap()
        let meaning = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "寄生虫")).firstMatch
        XCTAssertTrue(meaning.waitForExistence(timeout: 6))
        shot(app, "03-单词详情")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.navigationBars.buttons.element(boundBy: 0).tap()

        // 4. 我
        app.tabBars.buttons["我"].tap()
        XCTAssertTrue(app.staticTexts["学习设置"].waitForExistence(timeout: 4))
        shot(app, "04-我")

        // 5. 学习设置
        app.staticTexts["学习设置"].tap()
        XCTAssertTrue(app.navigationBars["学习设置"].waitForExistence(timeout: 5))
        shot(app, "05-学习设置")
        app.navigationBars.buttons.element(boundBy: 0).tap()

        // 5B. 学习提醒
        XCTAssertTrue(app.staticTexts["学习提醒"].waitForExistence(timeout: 4))
        app.staticTexts["学习提醒"].tap()
        XCTAssertTrue(app.navigationBars["学习提醒"].waitForExistence(timeout: 5))
        shot(app, "05B-学习提醒")
        app.navigationBars.buttons.element(boundBy: 0).tap()

        // 6. 会员中心
        let memberButton = app.buttons["membership-entry"]
        XCTAssertTrue(memberButton.waitForExistence(timeout: 4))
        memberButton.tap()
        XCTAssertTrue(app.navigationBars["会员中心"].waitForExistence(timeout: 4))
        shot(app, "06-会员中心")
        app.navigationBars.buttons.element(boundBy: 0).tap()

        // 7. 生词本
        app.tabBars.buttons["生词本"].tap()
        XCTAssertTrue(app.staticTexts["连续天数"].waitForExistence(timeout: 4))
        shot(app, "07-生词本")

        // 8. 选择词库
        app.tabBars.buttons["我"].tap()
        XCTAssertTrue(app.staticTexts["当前词库"].waitForExistence(timeout: 4))
        app.staticTexts["当前词库"].tap()
        XCTAssertTrue(app.navigationBars["选择词库"].waitForExistence(timeout: 4))
        shot(app, "08-选择词库")
    }
}
