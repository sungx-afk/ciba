import XCTest
@testable import CibaEnglish

final class NoteParsingTests: XCTestCase {

    private func makeWord(note: String) -> Word {
        Word(id: 1, cat: "品质", sub: "聪颖", word: "sample", meaning: "释义", note: note)
    }

    func testMemoryOnlyNote() {
        let parts = makeWord(note: "【记】para(旁边)+site(坐)→寄生虫").parsedNote()
        XCTAssertEqual(parts.memory, "para(旁边)+site(坐)→寄生虫")
        XCTAssertTrue(parts.examples.isEmpty)
    }

    func testExampleOnlyNote() {
        let parts = makeWord(note: "【例】The cat sat on the mat.").parsedNote()
        XCTAssertTrue(parts.memory.isEmpty)
        XCTAssertEqual(parts.examples, ["The cat sat on the mat."])
    }

    func testMemoryAndExampleCombined() {
        let parts = makeWord(note: "【记】mimic(模仿)+ry\n【例】The stick caterpillar’s vivid mimicry enlarged its chances of survival.")
            .parsedNote()
        XCTAssertEqual(parts.memory, "mimic(模仿)+ry")
        XCTAssertEqual(parts.examples, ["The stick caterpillar’s vivid mimicry enlarged its chances of survival."])
    }

    func testMultiLineExampleSplitsLines() {
        let parts = makeWord(note: "【例】Line one.\nLine two.").parsedNote()
        XCTAssertEqual(parts.examples, ["Line one.", "Line two."])
    }

    func testRawTextFallsBackToMemory() {
        let parts = makeWord(note: "con + nois (知道) → 懂行的人").parsedNote()
        XCTAssertEqual(parts.memory, "con + nois (知道) → 懂行的人")
    }

    func testEmptyNote() {
        let parts = makeWord(note: "").parsedNote()
        XCTAssertFalse(parts.hasContent)
    }

    func testRealisticDatabaseEntries() {
        let a = Word(id: 2, cat: "生物", sub: "", word: "parasite",
                     meaning: "寄生虫", note: "【记】para(旁边)+site(坐)→坐在旁边的→寄生虫").parsedNote()
        XCTAssertEqual(a.memory, "para(旁边)+site(坐)→坐在旁边的→寄生虫")

        let b = Word(id: 3, cat: "生物", sub: "", word: "mimicry",
                     meaning: "模仿", note: "【记】mimic(模仿)+ry\n【例】The stick caterpillar’s vivid mimicry enlarged its chances of survival.").parsedNote()
        XCTAssertEqual(b.memory, "mimic(模仿)+ry")
        XCTAssertEqual(b.examples.count, 1)
    }
}
