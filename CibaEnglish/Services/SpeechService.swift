import AVFoundation

/// Pronounces words with British / American voices via AVSpeechSynthesizer.
final class SpeechService: NSObject {

    static let shared = SpeechService()

    enum Accent: String, CaseIterable {
        case american = "en-US"
        case british = "en-GB"

        var title: String { self == .american ? "美" : "英" }
    }

    private let synthesizer = AVSpeechSynthesizer()

    private override init() {
        super.init()
        synthesizer.delegate = self
    }

    var isSpeaking: Bool { synthesizer.isSpeaking }

    func speak(_ text: String, accent: Accent = .american, rate: Float? = nil) {
        synthesizer.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: accent.rawValue)
        utterance.rate = rate ?? SettingsStore.shared.speechRate
        utterance.pitchMultiplier = 1.0
        utterance.postUtteranceDelay = 0.05
        synthesizer.speak(utterance)
    }

    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
    }
}

extension SpeechService: AVSpeechSynthesizerDelegate {
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {}
}
