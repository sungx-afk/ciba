import Foundation

/// One vocabulary entry, as exported from the Excel database (words.json).
struct Word: Codable, Equatable, Hashable {
    let id: Int
    let cat: String        // top-level category, e.g. 行为 / 品质 / 人物
    let sub: String        // secondary meaning-group, "" when the word is directly under `cat`
    let word: String       // headword
    let meaning: String    // Chinese gloss
    let note: String       // memory tips / example sentences (may embed 【记】/【例】 markers)
}

// MARK: - Note parsing

extension Word {
    /// Splits the raw note into a memory-tip block and example sentences.
    struct NoteParts: Equatable {
        var memory: String = ""
        var examples: [String] = []
        var hasContent: Bool { !memory.isEmpty || !examples.isEmpty }
    }

    func parsedNote() -> NoteParts {
        var parts = NoteParts()
        guard !note.isEmpty else { return parts }

        // Normalize newlines so both \n and the rare \r\n split cleanly.
        let text = note.replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")

        enum Bucket { case memory, example }
        let markers: [(String, Bucket)] = [
            ("【记】", .memory), ("【 记 】", .memory), ("【记忆】", .memory), ("【 记忆 】", .memory),
            ("[记]", .memory), ("（记）", .memory), ("【例】", .example), ("【 例 】", .example),
            ("【例句】", .example), ("[例]", .example), ("（例）", .example)
        ]

        var memoryLines: [String] = []
        var exampleLines: [String] = []
        var current: Bucket? = nil

        for rawLine in text.components(separatedBy: "\n") {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.isEmpty { continue }

            var matched: (String, Bucket)? = nil
            for (marker, bucket) in markers where line.hasPrefix(marker) {
                matched = (marker, bucket)
                break
            }
            if let (marker, bucket) = matched {
                current = bucket
                let rest = String(line.dropFirst(marker.count))
                    .trimmingCharacters(in: .whitespaces)
                if !rest.isEmpty { append(rest, to: bucket) }
            } else {
                append(line, to: current ?? .memory)
            }
        }

        func append(_ line: String, to bucket: Bucket) {
            switch bucket {
            case .memory: memoryLines.append(line)
            case .example: exampleLines.append(line)
            }
        }

        if !memoryLines.isEmpty { parts.memory = memoryLines.joined(separator: " ") }
        parts.examples = exampleLines
        return parts
    }
}
