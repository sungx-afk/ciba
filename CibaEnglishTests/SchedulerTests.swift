import XCTest
@testable import CibaEnglish

final class SchedulerTests: XCTestCase {

    private let calendar = Calendar.current
    private var now: Date!

    override func setUpWithError() throws {
        now = calendar.date(from: DateComponents(year: 2026, month: 9, day: 8, hour: 14, minute: 0))!
    }

    private func wordProgress(remembered: Bool = false, dueAt: Date? = nil, reps: Int = 0) -> WordProgress {
        WordProgress(remembered: remembered, reps: reps, intervalDays: 0, dueAt: dueAt, lastReviewedAt: nil, bookmarked: false)
    }

    func testAgainAnswerKeepsWordUnrememberedAndSchedulesTomorrow() {
        let p = wordProgress()
        let result = Scheduler.apply(.again, to: p, now: now, calendar: calendar)
        XCTAssertFalse(result.remembered)
        XCTAssertEqual(result.reps, 0)
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now))!
        XCTAssertEqual(result.dueAt, tomorrow)
    }

    func testSuccessAnswersRememberAndScheduleIntervals() {
        for choice in [IntervalChoice.day1, .day3, .day7] {
            let result = Scheduler.apply(choice, to: wordProgress(), now: now, calendar: calendar)
            XCTAssertTrue(result.remembered, "\(choice) must mark remembered")
            XCTAssertEqual(result.intervalDays, choice.intervalDays)
            let expected = calendar.date(byAdding: .day, value: choice.intervalDays,
                                         to: calendar.startOfDay(for: now))!
            XCTAssertEqual(result.dueAt, expected)
            XCTAssertEqual(result.reps, 1)
        }
    }

    func testSuccessAfterFailureIncrementsRepsFromZero() {
        let failed = Scheduler.apply(.again, to: wordProgress(), now: now, calendar: calendar)
        let retried = Scheduler.apply(.day3, to: failed, now: now, calendar: calendar)
        XCTAssertTrue(retried.remembered)
        XCTAssertEqual(retried.reps, 1)
    }

    func testAgainDemotesRememberedWord() {
        let learned = Scheduler.apply(.day7, to: wordProgress(), now: now, calendar: calendar)
        XCTAssertTrue(learned.remembered)
        let demoted = Scheduler.apply(.again, to: learned, now: now, calendar: calendar)
        XCTAssertFalse(demoted.remembered)
        XCTAssertEqual(demoted.reps, 0)
        XCTAssertEqual(demoted.intervalDays, 0)
    }

    func testMarkRememberedUsesThreeDayInterval() {
        let p = Scheduler.markRemembered(wordProgress(), now: now, calendar: calendar)
        XCTAssertTrue(p.remembered)
        XCTAssertEqual(p.intervalDays, 3)
    }

    func testIsDue() {
        let today = now
        let dueNow = wordProgress(remembered: true, dueAt: calendar.startOfDay(for: today!))
        XCTAssertTrue(dueNow.isDue(now: now))
        let dueFuture = wordProgress(remembered: true,
                                     dueAt: calendar.date(byAdding: .day, value: 2, to: calendar.startOfDay(for: now!)))
        XCTAssertFalse(dueFuture.isDue(now: now))
        XCTAssertFalse(wordProgress().isDue(now: now))
    }

    // MARK: Streak

    private func key(_ day: Int) -> String {
        let d = calendar.date(byAdding: .day, value: day, to: calendar.startOfDay(for: now!))!
        return Scheduler.dayKey(for: d, calendar: calendar)
    }

    func testStreakCountsConsecutiveDaysIncludingToday() {
        let days: Set<String> = [key(0), key(-1), key(-2), key(-3)]
        XCTAssertEqual(Scheduler.computeStreak(studyDays: days, asOf: now, calendar: calendar), 4)
    }

    func testStreakAliveWhenLastStudyWasYesterday() {
        let days: Set<String> = [key(-1), key(-2), key(-3)]
        XCTAssertEqual(Scheduler.computeStreak(studyDays: days, asOf: now, calendar: calendar), 3)
    }

    func testStreakBrokenByGap() {
        let days: Set<String> = [key(0), key(-2), key(-3)]
        XCTAssertEqual(Scheduler.computeStreak(studyDays: days, asOf: now, calendar: calendar), 1)
    }

    func testStreakZeroWithoutHistory() {
        XCTAssertEqual(Scheduler.computeStreak(studyDays: [], asOf: now, calendar: calendar), 0)
    }
}
