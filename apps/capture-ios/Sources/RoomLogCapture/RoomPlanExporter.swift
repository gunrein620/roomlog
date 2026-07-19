import Foundation
import RoomPlan
import simd

/// A1: 최종 CapturedRoom → roomplan.json. 프레임은 ARKit 미터(RoomLog Capture Format v1의
/// poses와 같은 세션 원점) — splat과 좌표계가 공유되므로 월드 정렬·보정은 하지 않는다.
enum RoomPlanExporter {
    /// CaptureEngine.finalizeRecording의 metadata.json 원자적 쓰기 관례(임시파일→rename)를 그대로 따른다.
    static func export(_ room: CapturedRoom, capturedAt: Date, to rootURL: URL) throws {
        let payload = RoomPlanCapturePayload(
            frame: "arkit-metric",
            capturedAt: ISO8601DateFormatter().string(from: capturedAt),
            walls: room.walls.map(wallSegment),
            openings: room.doors.map { openingSegment($0, kind: "door") }
                + room.windows.map { openingSegment($0, kind: "window") }
        )

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .withoutEscapingSlashes]
        let data = try encoder.encode(payload)

        let tempURL = rootURL.appendingPathComponent("roomplan.json.tmp-\(UUID().uuidString)", isDirectory: false)
        let finalURL = rootURL.appendingPathComponent("roomplan.json", isDirectory: false)
        try data.write(to: tempURL)
        if FileManager.default.fileExists(atPath: finalURL.path) {
            try FileManager.default.removeItem(at: finalURL)
        }
        try FileManager.default.moveItem(at: tempURL, to: finalURL)
    }

    /// 벽의 로컬 X축(폭 방향)을 따라 중심에서 ±width/2 만큼 이동한 두 끝점을 바닥면([x,z])에 투영한다.
    /// dimensions은 로컬 프레임에서 x=폭·y=높이·z=두께(RoomPlan CapturedRoom.Surface 관례).
    private static func wallSegment(_ surface: CapturedRoom.Surface) -> RoomPlanCapturePayload.WallSegment {
        let transform = surface.transform
        let center = SIMD3<Float>(transform.columns.3.x, transform.columns.3.y, transform.columns.3.z)
        let xAxis = SIMD3<Float>(transform.columns.0.x, transform.columns.0.y, transform.columns.0.z)
        let widthDir = simd_length(xAxis) > 0 ? simd_normalize(xAxis) : SIMD3<Float>(1, 0, 0)
        let halfWidth = surface.dimensions.x / 2
        let start = center - widthDir * halfWidth
        let end = center + widthDir * halfWidth

        return RoomPlanCapturePayload.WallSegment(
            start: [Double(start.x), Double(start.z)],
            end: [Double(end.x), Double(end.z)],
            height: Double(surface.dimensions.y),
            thickness: Double(surface.dimensions.z)
        )
    }

    private static func openingSegment(_ surface: CapturedRoom.Surface, kind: String) -> RoomPlanCapturePayload.OpeningSegment {
        let translation = surface.transform.columns.3
        return RoomPlanCapturePayload.OpeningSegment(
            kind: kind,
            center: [Double(translation.x), Double(translation.z)],
            width: Double(surface.dimensions.x),
            height: Double(surface.dimensions.y)
        )
    }
}

/// roomplan.json의 Swift 표현 — packages/types/src/roomplan-capture.ts(RoomPlanCaptureFloorPlan)와 필드가 같다.
/// Codable(Encodable+Decodable)로 둬서 여기서 쓰고(export), UploadManager가 그대로 다시 읽어(decode)
/// intake/complete 요청 body의 captureFloorPlan으로 재인코딩할 수 있게 한다.
struct RoomPlanCapturePayload: Codable {
    let frame: String
    let capturedAt: String
    let walls: [WallSegment]
    let openings: [OpeningSegment]

    struct WallSegment: Codable {
        let start: [Double]
        let end: [Double]
        let height: Double
        let thickness: Double
    }

    struct OpeningSegment: Codable {
        let kind: String
        let center: [Double]
        let width: Double
        let height: Double
    }
}
