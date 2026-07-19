import Foundation

enum CaptureState: Equatable {
    case idle
    case recording
    case saving
    case error(String)
}

struct CaptureSummary: Identifiable {
    let id: String
    let url: URL
    let frameCount: Int
    let sizeBytes: Int64
    let date: Date
}

/// RGB 캡처 해상도 프리셋. 4:3 고정, depth(256×192 LiDAR)와 무관.
/// metadata.json의 w/h와 K 스케일이 이 값에서 파생된다(파이프라인 intrinsics 스케일의 기준).
enum CaptureResolution: String, Codable, CaseIterable, Equatable {
    case standard   // 960×720 (0.69MP) — 현행 기본
    case high       // 1920×1440 (2.76MP) — 고화질=1440p 캡처(디테일↑, 발열·용량↑)

    var width: Int { self == .high ? 1920 : 960 }
    var height: Int { self == .high ? 1440 : 720 }

    var label: String {
        switch self {
        case .standard: return "표준(960)"
        case .high: return "고화질(1440)"
        }
    }
}

struct CaptureSettings: Codable, Equatable {
    var fps: Int = 10
    var lockExposure: Bool = true
    var resolution: CaptureResolution = .standard

    init(fps: Int = 10, lockExposure: Bool = true, resolution: CaptureResolution = .standard) {
        self.fps = fps
        self.lockExposure = lockExposure
        self.resolution = resolution
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        fps = try container.decodeIfPresent(Int.self, forKey: .fps) ?? 10
        lockExposure = try container.decodeIfPresent(Bool.self, forKey: .lockExposure) ?? true
        resolution = try container.decodeIfPresent(CaptureResolution.self, forKey: .resolution) ?? .standard
    }
}

struct CaptureDetail {
    let frameCount: Int
    let duration: Double
    let fps: Int
    let aeLocked: Bool
    let droppedFrames: Int
}

struct CaptureMetadata: Codable {
    let poses: [[Double]]
    let K: [Double]
    let w: Int
    let h: Int
    let dw: Int
    let dh: Int
    let fps: Int
    let frameTimestamps: [Double]
    let device: String
    let appVersion: String
    let aeLocked: Bool
    let droppedFrames: Int
    let startedAt: String
}

extension CaptureSettings {
    static let allowedFPS: Set<Int> = [5, 10, 15, 30, 60]

    var normalized: CaptureSettings {
        CaptureSettings(
            fps: Self.allowedFPS.contains(fps) ? fps : 10,
            lockExposure: lockExposure,
            resolution: resolution
        )
    }
}
