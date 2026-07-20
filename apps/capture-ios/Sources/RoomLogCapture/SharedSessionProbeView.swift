import ARKit
import CoreImage
import Foundation
import RoomPlan
import SwiftUI
import UIKit

/// 진단 전용 화면 — 제품 기능 아님.
///
/// 물음: RoomPlan과 카메라 프레임 하베스트(향후 splat 파이프라인 입력)를 ARSession 하나로
/// 같이 돌릴 수 있는가? 이 파일은 그 질문에 답하기 위한 측정 도구일 뿐, 결과물을 어디에도
/// 업로드하거나 저장하지 않는다.
@available(iOS 17.0, *)
final class SharedSessionProbe: NSObject, ObservableObject, ARSessionDelegate, RoomCaptureSessionDelegate {
    let session = ARSession()

    @Published private(set) var capturedWidth: Int = 0
    @Published private(set) var capturedHeight: Int = 0
    @Published private(set) var depthAvailable: Bool = false
    @Published private(set) var harvestedFrames: Int = 0
    @Published private(set) var keptFrames: Int = 0
    @Published private(set) var droppedFrames: Int = 0
    @Published private(set) var bytesWritten: Int64 = 0
    @Published private(set) var thermal: ProcessInfo.ThermalState = ProcessInfo.processInfo.thermalState
    @Published private(set) var elapsed: Double = 0
    @Published private(set) var roomUpdates: Int = 0
    @Published private(set) var wallCount: Int = 0
    @Published private(set) var doorCount: Int = 0
    @Published private(set) var windowCount: Int = 0
    @Published private(set) var openingCount: Int = 0
    @Published private(set) var objectCount: Int = 0
    @Published private(set) var note: String?
    @Published private(set) var running: Bool = false

    /// RoomCaptureView가 만든 세션 — stop()에서 같이 정지시키려고만 들고 있는다(소유는 View 쪽).
    weak var roomCaptureSession: RoomCaptureSession?

    private let ciContext: CIContext
    private let writeQueue: DispatchQueue
    private let lock = NSLock()
    private let probeFolderURL: URL

    private var startDate: Date?
    private var lastKeptTimestamp = -Double.greatestFiniteMagnitude
    private var pendingWrites = 0
    private var metricsTimer: DispatchSourceTimer?

    // CaptureEngine과 동일하게 ~10fps로 스로틀 — 발열/처리량 부하를 실제 캡처와 비슷하게 맞춘다.
    private let throttleInterval = max(0, 1.0 / 10.0 - 0.001)
    private static let probeJPEGWidth = 1920
    private static let probeJPEGHeight = 1440

    override init() {
        ciContext = CIContext(options: [.cacheIntermediates: false])
        writeQueue = DispatchQueue(label: "roomlog.probe.writer", qos: .utility)
        probeFolderURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("shared-session-probe", isDirectory: true)
        super.init()
        try? FileManager.default.createDirectory(at: probeFolderURL, withIntermediateDirectories: true)
    }

    deinit {
        metricsTimer?.cancel()
    }

    func start() {
        let configuration = ARWorldTrackingConfiguration()
        configuration.frameSemantics = [.sceneDepth]
        configuration.planeDetection = []
        session.delegate = self
        // 우리가 만든 ARWorldTrackingConfiguration(.sceneDepth 포함)으로 세션을 직접 돌린다.
        // RoomPlan은 커스텀 ARSession을 넘겨받아 구동할 수 있다(WWDC23) — 이 프로브가 측정하는
        // 것은 바로 그 상태에서도 depth/해상도/델리게이트 하베스트가 살아남는지다.
        session.run(configuration, options: [.resetTracking, .removeExistingAnchors])

        startDate = Date()
        startMetricsTimer()
        publish {
            self.running = true
            self.elapsed = 0
            self.note = nil
        }
    }

    func stop() {
        roomCaptureSession?.stop()
        session.pause()
        stopMetricsTimer()
        publish {
            self.running = false
        }
    }

    // MARK: - ARSessionDelegate (카메라 프레임 하베스트)

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        let width = CVPixelBufferGetWidth(frame.capturedImage)
        let height = CVPixelBufferGetHeight(frame.capturedImage)
        let hasDepth = frame.sceneDepth != nil
        let timestamp = frame.timestamp

        lock.lock()
        harvestedFrames += 1
        let harvestedCount = harvestedFrames

        guard timestamp - lastKeptTimestamp >= throttleInterval else {
            lock.unlock()
            publish {
                self.capturedWidth = width
                self.capturedHeight = height
                self.depthAvailable = hasDepth
                self.harvestedFrames = harvestedCount
            }
            return
        }

        if pendingWrites > 20 {
            droppedFrames += 1
            lastKeptTimestamp = timestamp
            let droppedCount = droppedFrames
            lock.unlock()
            publish {
                self.capturedWidth = width
                self.capturedHeight = height
                self.depthAvailable = hasDepth
                self.harvestedFrames = harvestedCount
                self.droppedFrames = droppedCount
            }
            return
        }

        lastKeptTimestamp = timestamp
        pendingWrites += 1
        lock.unlock()

        publish {
            self.capturedWidth = width
            self.capturedHeight = height
            self.depthAvailable = hasDepth
            self.harvestedFrames = harvestedCount
        }

        guard let imageCopy = Self.copyPixelBuffer(frame.capturedImage) else {
            completePendingWrite()
            return
        }

        writeQueue.async { [weak self] in
            self?.writeProbeJPEG(imageCopy)
        }
    }

    func session(_ session: ARSession, didFailWithError error: Error) {
        publish {
            self.note = "AR 세션 실패: \(error.localizedDescription)"
        }
    }

    // MARK: - RoomCaptureSessionDelegate (RoomPlan 델리게이트 공존 확인)

    func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
        let walls = room.walls.count
        let doors = room.doors.count
        let windows = room.windows.count
        let openings = room.openings.count
        let objects = room.objects.count
        publish {
            self.wallCount = walls
            self.doorCount = doors
            self.windowCount = windows
            self.openingCount = openings
            self.objectCount = objects
            self.roomUpdates += 1
        }
    }

    func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: Error?) {
        guard let error else {
            return
        }
        publish {
            self.note = "RoomPlan 세션 종료 오류: \(error.localizedDescription)"
        }
    }
}

private extension SharedSessionProbe {
    func writeProbeJPEG(_ pixelBuffer: CVPixelBuffer) {
        defer {
            completePendingWrite()
        }

        do {
            let data = try jpegData(from: pixelBuffer, width: Self.probeJPEGWidth, height: Self.probeJPEGHeight)
            let url = probeFolderURL.appendingPathComponent("\(UUID().uuidString).jpg", isDirectory: false)
            try data.write(to: url, options: .atomic)
            // 진단 목적은 인코드+쓰기 부하 자체 — 결과 파일은 디스크에 쌓아둘 필요가 없어 바로 지운다.
            try? FileManager.default.removeItem(at: url)

            lock.lock()
            keptFrames += 1
            bytesWritten += Int64(data.count)
            let kept = keptFrames
            let bytes = bytesWritten
            lock.unlock()

            publish {
                self.keptFrames = kept
                self.bytesWritten = bytes
            }
        } catch {
            publish {
                self.note = "JPEG 쓰기 실패: \(error.localizedDescription)"
            }
        }
    }

    func completePendingWrite() {
        lock.lock()
        pendingWrites = max(0, pendingWrites - 1)
        lock.unlock()
    }

    func jpegData(from pixelBuffer: CVPixelBuffer, width: Int, height: Int) throws -> Data {
        let sourceWidth = CVPixelBufferGetWidth(pixelBuffer)
        let sourceHeight = CVPixelBufferGetHeight(pixelBuffer)
        let image = CIImage(cvPixelBuffer: pixelBuffer)
            .transformed(by: CGAffineTransform(
                scaleX: CGFloat(width) / CGFloat(max(sourceWidth, 1)),
                y: CGFloat(height) / CGFloat(max(sourceHeight, 1))
            ))
            .cropped(to: CGRect(x: 0, y: 0, width: width, height: height))

        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else {
            throw ProbeWriteError.colorSpaceUnavailable
        }

        let options: [CIImageRepresentationOption: Any] = [
            kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.85
        ]
        guard let data = ciContext.jpegRepresentation(of: image, colorSpace: colorSpace, options: options) else {
            throw ProbeWriteError.jpegEncodingFailed
        }
        return data
    }

    enum ProbeWriteError: LocalizedError {
        case jpegEncodingFailed
        case colorSpaceUnavailable

        var errorDescription: String? {
            switch self {
            case .jpegEncodingFailed:
                return "JPEG 인코딩 실패"
            case .colorSpaceUnavailable:
                return "sRGB 색공간 생성 실패"
            }
        }
    }

    func startMetricsTimer() {
        stopMetricsTimer()
        let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .utility))
        timer.schedule(deadline: .now(), repeating: 1.0)
        timer.setEventHandler { [weak self] in
            guard let self, let startDate = self.startDate else {
                return
            }
            let elapsed = Date().timeIntervalSince(startDate)
            self.publish {
                self.elapsed = elapsed
                self.thermal = ProcessInfo.processInfo.thermalState
            }
        }
        metricsTimer = timer
        timer.resume()
    }

    func stopMetricsTimer() {
        metricsTimer?.cancel()
        metricsTimer = nil
    }

    func publish(_ update: @escaping () -> Void) {
        if Thread.isMainThread {
            update()
        } else {
            DispatchQueue.main.async(execute: update)
        }
    }

    // CaptureEngine.copyPixelBuffer와 동일한 로직(private라 재사용 불가 — 자체 포함을 위해 복제).
    static func copyPixelBuffer(_ source: CVPixelBuffer) -> CVPixelBuffer? {
        let width = CVPixelBufferGetWidth(source)
        let height = CVPixelBufferGetHeight(source)
        let pixelFormat = CVPixelBufferGetPixelFormatType(source)
        let attributes: [String: Any] = [
            kCVPixelBufferIOSurfacePropertiesKey as String: [:]
        ]

        var destination: CVPixelBuffer?
        guard CVPixelBufferCreate(
            kCFAllocatorDefault,
            width,
            height,
            pixelFormat,
            attributes as CFDictionary,
            &destination
        ) == kCVReturnSuccess,
            let copy = destination else {
            return nil
        }

        guard CVPixelBufferLockBaseAddress(source, .readOnly) == kCVReturnSuccess else {
            return nil
        }
        guard CVPixelBufferLockBaseAddress(copy, []) == kCVReturnSuccess else {
            CVPixelBufferUnlockBaseAddress(source, .readOnly)
            return nil
        }
        defer {
            CVPixelBufferUnlockBaseAddress(copy, [])
            CVPixelBufferUnlockBaseAddress(source, .readOnly)
        }

        let planeCount = CVPixelBufferGetPlaneCount(source)
        if planeCount > 0 {
            for plane in 0..<planeCount {
                guard let sourceBase = CVPixelBufferGetBaseAddressOfPlane(source, plane),
                      let destinationBase = CVPixelBufferGetBaseAddressOfPlane(copy, plane) else {
                    return nil
                }

                let rows = CVPixelBufferGetHeightOfPlane(source, plane)
                let sourceBytesPerRow = CVPixelBufferGetBytesPerRowOfPlane(source, plane)
                let destinationBytesPerRow = CVPixelBufferGetBytesPerRowOfPlane(copy, plane)
                let bytesToCopy = min(sourceBytesPerRow, destinationBytesPerRow)

                for row in 0..<rows {
                    memcpy(
                        destinationBase.advanced(by: row * destinationBytesPerRow),
                        sourceBase.advanced(by: row * sourceBytesPerRow),
                        bytesToCopy
                    )
                }
            }
        } else {
            guard let sourceBase = CVPixelBufferGetBaseAddress(source),
                  let destinationBase = CVPixelBufferGetBaseAddress(copy) else {
                return nil
            }

            let rows = CVPixelBufferGetHeight(source)
            let sourceBytesPerRow = CVPixelBufferGetBytesPerRow(source)
            let destinationBytesPerRow = CVPixelBufferGetBytesPerRow(copy)
            let bytesToCopy = min(sourceBytesPerRow, destinationBytesPerRow)

            for row in 0..<rows {
                memcpy(
                    destinationBase.advanced(by: row * destinationBytesPerRow),
                    sourceBase.advanced(by: row * sourceBytesPerRow),
                    bytesToCopy
                )
            }
        }

        CVBufferPropagateAttachments(source, copy)
        return copy
    }
}

// MARK: - View

@available(iOS 17.0, *)
struct SharedSessionProbeView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var probe = SharedSessionProbe()

    var body: some View {
        ZStack(alignment: .bottom) {
            SharedSessionProbeRepresentable(probe: probe)
                .ignoresSafeArea()

            hud
        }
        .navigationTitle("공유세션 프로브")
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear {
            probe.stop()
        }
    }

    private var hud: some View {
        VStack(alignment: .leading, spacing: 8) {
            row("capturedImage", "\(probe.capturedWidth)×\(probe.capturedHeight)",
                tint: probe.capturedWidth >= 1920 ? .green : .orange)
            row("sceneDepth", probe.depthAvailable ? "있음" : "없음",
                tint: probe.depthAvailable ? .green : .red)
            row("프레임", "\(probe.harvestedFrames) / 유지 \(probe.keptFrames) / 드롭 \(probe.droppedFrames)")
            row("발열", thermalLabel, tint: thermalTint)
            row("쓰기", megabyteText(probe.bytesWritten))
            row("경과", elapsedText(probe.elapsed))
            row(
                "RoomPlan",
                "벽 \(probe.wallCount) · 문 \(probe.doorCount) · 창 \(probe.windowCount) · 개구부 \(probe.openingCount) (업데이트 \(probe.roomUpdates))"
            )

            if let note = probe.note {
                row("note", note, tint: .red)
            }

            Button("닫기") {
                probe.stop()
                dismiss()
            }
            .buttonStyle(.borderedProminent)
            .padding(.top, 4)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .padding(16)
    }

    private func row(_ label: String, _ value: String, tint: Color = .white) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(.footnote, design: .monospaced))
                .foregroundStyle(tint)
        }
    }

    private var thermalLabel: String {
        switch probe.thermal {
        case .nominal: return "정상"
        case .fair: return "양호"
        case .serious: return "심각"
        case .critical: return "위험"
        @unknown default: return "알수없음"
        }
    }

    private var thermalTint: Color {
        switch probe.thermal {
        case .nominal, .fair: return .white
        case .serious: return .orange
        case .critical: return .red
        @unknown default: return .white
        }
    }

    private func elapsedText(_ seconds: Double) -> String {
        let totalSeconds = max(0, Int(seconds))
        let secondsPart = totalSeconds % 60
        let secondsText = secondsPart < 10 ? "0\(secondsPart)" : "\(secondsPart)"
        return "\(totalSeconds / 60):\(secondsText)"
    }

    private func megabyteText(_ bytes: Int64) -> String {
        let megabytes = max(0, Double(bytes)) / 1_048_576.0
        let tenths = Int((megabytes * 10).rounded())
        return "\(tenths / 10).\(tenths % 10) MB"
    }
}

@available(iOS 17.0, *)
private struct SharedSessionProbeRepresentable: UIViewRepresentable {
    let probe: SharedSessionProbe

    func makeCoordinator() -> SharedSessionProbe {
        probe
    }

    func makeUIView(context: Context) -> RoomCaptureView {
        // iOS 17 "bring your own session" 핸드셰이크 — RoomCaptureView(frame:arSession:)로
        // 우리가 만든(=.sceneDepth 포함) ARSession을 RoomPlan에 넘긴다. 기기에서 가장 먼저
        // 조정이 필요할 가능성이 높은 지점이 바로 이 시퀀스다.
        let captureView = RoomCaptureView(frame: .zero, arSession: probe.session)
        captureView.captureSession.delegate = probe
        probe.roomCaptureSession = captureView.captureSession
        probe.start()
        captureView.captureSession.run(configuration: RoomCaptureSession.Configuration())
        return captureView
    }

    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}

    static func dismantleUIView(_ uiView: RoomCaptureView, coordinator: SharedSessionProbe) {
        coordinator.stop()
    }
}
