import ARKit
import AVFoundation
import CoreImage
import Foundation
import ImageIO
import SwiftUI
import UIKit
import simd

final class CaptureEngine: NSObject, ObservableObject, ARSessionDelegate {
    let session: ARSession
    @Published private(set) var state: CaptureState
    @Published private(set) var frameCount: Int
    @Published private(set) var droppedFrames: Int
    @Published private(set) var elapsedSeconds: Double
    @Published private(set) var bytesWritten: Int64
    @Published private(set) var thermalState: ProcessInfo.ThermalState
    @Published private(set) var aeLocked: Bool
    @Published var settings: CaptureSettings {
        didSet {
            let normalized = settings.normalized
            if normalized != settings {
                settings = normalized
            }
            Self.saveSettings(normalized)
        }
    }
    @Published private(set) var freeDiskBytes: Int64

    private static let settingsKey = "roomlog.capture.settings.v1"
    // A1: 비정상적으로 긴 스캔이 zip을 무한정 불리지 않도록 하는 얇은 안전 상한.
    // 재구성 파이프라인이 어차피 1000프레임으로 서브샘플하므로 여유 있게 1200에서 끊는다.
    // fps/스로틀 자체는 건드리지 않는다 — "유지"만 멈춘다.
    private static let maxKeptFrames = 1200

    private let ciContext: CIContext
    private let writeQueue: DispatchQueue
    private let recordingLock = NSLock()

    private var recordingContext: RecordingContext?
    private var metricsTimer: DispatchSourceTimer?

    override init() {
        session = ARSession()
        state = .idle
        frameCount = 0
        droppedFrames = 0
        elapsedSeconds = 0
        bytesWritten = 0
        thermalState = ProcessInfo.processInfo.thermalState
        aeLocked = false
        settings = Self.loadSettings()
        freeDiskBytes = 0
        ciContext = CIContext(options: [.cacheIntermediates: false])
        writeQueue = DispatchQueue(label: "roomlog.capture.writer", qos: .utility)
        super.init()
        session.delegate = self
        refreshFreeDiskBytes()
    }

    deinit {
        metricsTimer?.cancel()
    }

    static var isDeviceSupported: Bool {
        ARWorldTrackingConfiguration.isSupported &&
            ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)
    }

    func startSession() {
        guard Self.isDeviceSupported else {
            publishState(.error("LiDAR sceneDepth 미지원"))
            return
        }

        let configuration = ARWorldTrackingConfiguration()
        configuration.frameSemantics = [.sceneDepth]
        configuration.planeDetection = []
        session.delegate = self
        session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
        if case .error = state {
            publishState(.idle)
        }
    }

    func pauseSession() {
        if isRecordingOrSaving {
            requestStop(finalState: .idle)
        }
        session.pause()
    }

    func startRecording() {
        guard Self.isDeviceSupported else {
            publishState(.error("LiDAR sceneDepth 미지원"))
            return
        }

        recordingLock.lock()
        let canStart = recordingContext == nil
        recordingLock.unlock()
        guard canStart else {
            return
        }

        let startedAt = Date()
        let folderName = Self.captureFolderFormatter.string(from: startedAt)
        let rootURL = Self.capturesDirectory().appendingPathComponent(folderName, isDirectory: true)
        let fileManager = FileManager.default

        do {
            try fileManager.createDirectory(at: rootURL, withIntermediateDirectories: false)
            try fileManager.createDirectory(at: rootURL.appendingPathComponent("rgb", isDirectory: true), withIntermediateDirectories: false)
            try fileManager.createDirectory(at: rootURL.appendingPathComponent("depth", isDirectory: true), withIntermediateDirectories: false)
            try fileManager.createDirectory(at: rootURL.appendingPathComponent("conf", isDirectory: true), withIntermediateDirectories: false)
        } catch {
            publishState(.error("캡처 폴더 생성 실패: \(error.localizedDescription)"))
            return
        }

        let captureSettings = settings.normalized
        settings = captureSettings

        let context = RecordingContext(
            rootURL: rootURL,
            fps: captureSettings.fps,
            rgbWidth: captureSettings.resolution.width,
            rgbHeight: captureSettings.resolution.height,
            startDate: startedAt,
            startedAtString: Self.metadataDateFormatter.string(from: startedAt)
        )

        recordingLock.lock()
        recordingContext = context
        recordingLock.unlock()

        publish {
            self.frameCount = 0
            self.droppedFrames = 0
            self.elapsedSeconds = 0
            self.bytesWritten = 0
            self.thermalState = ProcessInfo.processInfo.thermalState
            self.aeLocked = false
            self.state = .recording
        }
        startMetricsTimer()
        if captureSettings.lockExposure {
            scheduleExposureAndWhiteBalanceLock(for: context)
        }
    }

    func stopRecording() {
        requestStop(finalState: .idle)
    }

    /// 진행 중인 캡처 폴더 URL — A1(RoomPlan 통합)이 같은 폴더에 roomplan.json을 얹을 때 쓴다.
    /// finalizeRecording이 recordingContext를 비동기로 비우므로(§finalizeRecording), 호출부는
    /// 녹화 종료를 요청하기 "직전"에 이 값을 읽어 보관해야 한다(레이스 방지 — CaptureEngine 쪽은
    /// 건드리지 않고 호출 시점 책임을 호출부에 둔다).
    var currentCaptureRootURL: URL? {
        recordingLock.lock()
        defer { recordingLock.unlock() }
        return recordingContext?.rootURL
    }

    static func capturesDirectory() -> URL {
        let baseURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        let url = baseURL.appendingPathComponent("Captures", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    static func listCaptures() -> [CaptureSummary] {
        let fileManager = FileManager.default
        let rootURL = capturesDirectory()
        let keys: Set<URLResourceKey> = [.isDirectoryKey, .creationDateKey, .contentModificationDateKey]
        guard let urls = try? fileManager.contentsOfDirectory(
            at: rootURL,
            includingPropertiesForKeys: Array(keys),
            options: [.skipsHiddenFiles]
        ) else {
            return []
        }

        return urls.compactMap { url in
            guard let values = try? url.resourceValues(forKeys: keys),
                  values.isDirectory == true else {
                return nil
            }

            let id = url.lastPathComponent
            let detail = detail(for: CaptureSummary(
                id: id,
                url: url,
                frameCount: 0,
                sizeBytes: 0,
                date: values.creationDate ?? values.contentModificationDate ?? Date.distantPast
            ))
            let date = Self.captureFolderFormatter.date(from: id)
                ?? values.creationDate
                ?? values.contentModificationDate
                ?? Date.distantPast
            let frameCount = detail?.frameCount ?? countRGBFrames(in: url)
            let sizeBytes = directorySize(url)
            return CaptureSummary(id: id, url: url, frameCount: frameCount, sizeBytes: sizeBytes, date: date)
        }
        .sorted { lhs, rhs in
            lhs.date > rhs.date
        }
    }

    static func deleteCapture(_ s: CaptureSummary) {
        try? FileManager.default.removeItem(at: s.url)
    }

    static func thumbnail(for s: CaptureSummary) -> UIImage? {
        let url = s.url
            .appendingPathComponent("rgb", isDirectory: true)
            .appendingPathComponent("0.jpg", isDirectory: false)
        guard let image = UIImage(contentsOfFile: url.path) else {
            return nil
        }

        if let thumbnail = image.preparingThumbnail(of: CGSize(width: 200, height: 200)) {
            return thumbnail
        }

        let scale = min(200 / max(image.size.width, 1), 200 / max(image.size.height, 1))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        return UIGraphicsImageRenderer(size: size).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }

    static func detail(for s: CaptureSummary) -> CaptureDetail? {
        let url = s.url.appendingPathComponent("metadata.json", isDirectory: false)
        guard let data = try? Data(contentsOf: url),
              let metadata = try? JSONDecoder().decode(CaptureMetadata.self, from: data) else {
            return nil
        }

        let duration: Double
        if let first = metadata.frameTimestamps.first,
           let last = metadata.frameTimestamps.last {
            duration = max(0, last - first)
        } else {
            duration = 0
        }

        return CaptureDetail(
            frameCount: metadata.frameTimestamps.count,
            duration: duration,
            fps: metadata.fps,
            aeLocked: metadata.aeLocked,
            droppedFrames: metadata.droppedFrames
        )
    }

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard let depthData = frame.sceneDepth else {
            return
        }

        let timestamp = frame.timestamp
        let context: RecordingContext

        recordingLock.lock()
        guard let current = recordingContext,
              !current.isStopping,
              !current.failed else {
            recordingLock.unlock()
            return
        }

        guard timestamp - current.lastKeptTimestamp >= current.throttleInterval else {
            recordingLock.unlock()
            return
        }

        guard current.nextFrameIndex + current.pendingWrites < Self.maxKeptFrames else {
            // 상한 도달 — 백프레셔 드롭이 아니라 "이미 충분히 찍었다"이므로 droppedFrames는 건드리지
            // 않는다. lastKeptTimestamp는 갱신해 스로틀 리듬을 유지(매 프레임 재검사 방지).
            current.lastKeptTimestamp = timestamp
            recordingLock.unlock()
            return
        }

        if current.pendingWrites > 20 {
            current.droppedFrames += 1
            current.lastKeptTimestamp = timestamp
            let dropped = current.droppedFrames
            recordingLock.unlock()
            publish {
                self.droppedFrames = dropped
            }
            return
        }

        current.lastKeptTimestamp = timestamp
        current.pendingWrites += 1
        context = current
        recordingLock.unlock()

        guard let payload = makePayload(from: frame, depthData: depthData, context: context) else {
            completePendingWrite(for: context)
            return
        }

        writeQueue.async { [weak self, weak context] in
            guard let self, let context else {
                return
            }
            self.write(payload, in: context)
        }
    }

    func sessionWasInterrupted(_ session: ARSession) {
        handleSessionProblem("AR 세션이 중단되었습니다")
    }

    func sessionInterruptionEnded(_ session: ARSession) {
        recordingLock.lock()
        let hasRecording = recordingContext != nil
        recordingLock.unlock()

        if hasRecording {
            requestStop(finalState: .error("AR 세션 중단이 종료되었습니다"))
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.startSession()
            }
        }
    }

    func session(_ session: ARSession, didFailWithError error: Error) {
        handleSessionProblem("AR 세션 실패: \(error.localizedDescription)")
    }
}

private extension CaptureEngine {
    final class RecordingContext {
        let id = UUID()
        let rootURL: URL
        let rgbURL: URL
        let depthURL: URL
        let confURL: URL
        let fps: Int
        let throttleInterval: Double
        let rgbWidth: Int
        let rgbHeight: Int
        let startDate: Date
        let startedAtString: String

        var lastKeptTimestamp = -Double.greatestFiniteMagnitude
        var pendingWrites = 0
        var nextFrameIndex = 0
        var poses: [[Double]] = []
        var frameTimestamps: [Double] = []
        var K: [Double]?
        var depthWidth = 0
        var depthHeight = 0
        var bytesWritten: Int64 = 0
        var droppedFrames = 0
        var aeLocked = false
        var isStopping = false
        var failed = false
        var finalizeEnqueued = false
        var finalState: CaptureState = .idle

        init(rootURL: URL, fps: Int, rgbWidth: Int, rgbHeight: Int, startDate: Date, startedAtString: String) {
            self.rootURL = rootURL
            self.rgbURL = rootURL.appendingPathComponent("rgb", isDirectory: true)
            self.depthURL = rootURL.appendingPathComponent("depth", isDirectory: true)
            self.confURL = rootURL.appendingPathComponent("conf", isDirectory: true)
            self.fps = fps
            self.throttleInterval = max(0, 1.0 / Double(fps) - 0.001)
            self.rgbWidth = rgbWidth
            self.rgbHeight = rgbHeight
            self.startDate = startDate
            self.startedAtString = startedAtString
        }
    }

    struct CapturedFramePayload {
        let imageBuffer: CVPixelBuffer
        let depthValues: [Float]
        let confidenceValues: [UInt8]
        let depthWidth: Int
        let depthHeight: Int
        let timestamp: Double
        let pose: [Double]
        let K: [Double]
    }

    enum CaptureWriteError: LocalizedError {
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

    var isRecordingOrSaving: Bool {
        switch state {
        case .recording, .saving:
            return true
        case .idle, .error:
            return false
        }
    }

    func makePayload(from frame: ARFrame, depthData: ARDepthData, context: RecordingContext) -> CapturedFramePayload? {
        guard let imageBuffer = Self.copyPixelBuffer(frame.capturedImage),
              let depthCopy = Self.copyDepthMap(depthData.depthMap) else {
            return nil
        }

        let confidenceCopy = Self.copyConfidenceMap(
            depthData.confidenceMap,
            expectedWidth: depthCopy.width,
            expectedHeight: depthCopy.height
        )

        // intrinsics는 capturedImage 원본 해상도 기준 → 선택한 RGB 해상도로 스케일(K도 함께 이동).
        let captureWidth = CVPixelBufferGetWidth(frame.capturedImage)
        let captureHeight = CVPixelBufferGetHeight(frame.capturedImage)
        let intrinsics = frame.camera.intrinsics
        let scaleX = Float(context.rgbWidth) / Float(max(captureWidth, 1))
        let scaleY = Float(context.rgbHeight) / Float(max(captureHeight, 1))
        let fx = intrinsics.columns.0.x * scaleX
        let fy = intrinsics.columns.1.y * scaleY
        let cx = intrinsics.columns.2.x * scaleX
        let cy = intrinsics.columns.2.y * scaleY

        let transform = frame.camera.transform
        let rotationMatrix = simd_float3x3(columns: (
            SIMD3<Float>(transform.columns.0.x, transform.columns.0.y, transform.columns.0.z),
            SIMD3<Float>(transform.columns.1.x, transform.columns.1.y, transform.columns.1.z),
            SIMD3<Float>(transform.columns.2.x, transform.columns.2.y, transform.columns.2.z)
        ))
        let quaternion = simd_quatf(rotationMatrix)
        let translation = transform.columns.3

        return CapturedFramePayload(
            imageBuffer: imageBuffer,
            depthValues: depthCopy.values,
            confidenceValues: confidenceCopy,
            depthWidth: depthCopy.width,
            depthHeight: depthCopy.height,
            timestamp: frame.timestamp,
            pose: [
                Double(quaternion.imag.x),
                Double(quaternion.imag.y),
                Double(quaternion.imag.z),
                Double(quaternion.real),
                Double(translation.x),
                Double(translation.y),
                Double(translation.z)
            ],
            K: [
                Double(fx), 0, 0,
                0, Double(fy), 0,
                Double(cx), Double(cy), 1
            ]
        )
    }

    func write(_ payload: CapturedFramePayload, in context: RecordingContext) {
        recordingLock.lock()
        guard recordingContext === context,
              !context.failed else {
            context.pendingWrites = max(0, context.pendingWrites - 1)
            recordingLock.unlock()
            return
        }
        let frameIndex = context.nextFrameIndex
        recordingLock.unlock()

        let rgbURL = context.rgbURL.appendingPathComponent("\(frameIndex).jpg", isDirectory: false)
        let depthURL = context.depthURL.appendingPathComponent("\(frameIndex).npy", isDirectory: false)
        let confURL = context.confURL.appendingPathComponent("\(frameIndex).npy", isDirectory: false)

        do {
            let jpgData = try jpegData(from: payload.imageBuffer, width: context.rgbWidth, height: context.rgbHeight)

            try jpgData.write(to: rgbURL, options: .atomic)
            let depthBytes = try NpyWriter.writeFloat32(
                payload.depthValues,
                rows: payload.depthHeight,
                columns: payload.depthWidth,
                to: depthURL
            )
            let confBytes = try NpyWriter.writeUInt8(
                payload.confidenceValues,
                rows: payload.depthHeight,
                columns: payload.depthWidth,
                to: confURL
            )
            let writtenBytes = Int64(jpgData.count) + depthBytes + confBytes

            recordingLock.lock()
            if recordingContext === context,
               !context.failed {
                context.nextFrameIndex += 1
                context.poses.append(payload.pose)
                context.frameTimestamps.append(payload.timestamp)
                if context.K == nil {
                    context.K = payload.K
                }
                context.depthWidth = payload.depthWidth
                context.depthHeight = payload.depthHeight
                context.bytesWritten += writtenBytes
                context.pendingWrites = max(0, context.pendingWrites - 1)

                let frameCount = context.nextFrameIndex
                let dropped = context.droppedFrames
                let bytes = context.bytesWritten
                let elapsed = Date().timeIntervalSince(context.startDate)
                recordingLock.unlock()

                publish {
                    self.frameCount = frameCount
                    self.droppedFrames = dropped
                    self.bytesWritten = bytes
                    self.elapsedSeconds = elapsed
                }
            } else {
                context.pendingWrites = max(0, context.pendingWrites - 1)
                recordingLock.unlock()
            }
        } catch {
            try? FileManager.default.removeItem(at: rgbURL)
            try? FileManager.default.removeItem(at: depthURL)
            try? FileManager.default.removeItem(at: confURL)
            markWriteFailure(context: context, error: error)
        }
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
            throw CaptureWriteError.colorSpaceUnavailable
        }

        let options: [CIImageRepresentationOption: Any] = [
            kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.85
        ]
        guard let data = ciContext.jpegRepresentation(of: image, colorSpace: colorSpace, options: options) else {
            throw CaptureWriteError.jpegEncodingFailed
        }
        return data
    }

    func requestStop(finalState: CaptureState) {
        let context: RecordingContext?

        recordingLock.lock()
        guard let current = recordingContext else {
            recordingLock.unlock()
            return
        }

        current.isStopping = true
        if case .error = current.finalState {
            // 에러 종료를 보존해야 실패 원인이 사라지지 않는다.
        } else if case .error = finalState {
            current.finalState = finalState
        } else {
            current.finalState = finalState
        }

        if current.finalizeEnqueued {
            recordingLock.unlock()
            publishState(.saving)
            return
        }

        current.finalizeEnqueued = true
        context = current
        recordingLock.unlock()

        stopMetricsTimer()
        releaseExposureAndWhiteBalanceLock()
        publishState(.saving)

        writeQueue.async { [weak self, weak context] in
            guard let self, let context else {
                return
            }
            self.finalizeRecording(context)
        }
    }

    func finalizeRecording(_ context: RecordingContext) {
        recordingLock.lock()
        guard recordingContext === context else {
            recordingLock.unlock()
            return
        }

        let metadata = CaptureMetadata(
            poses: context.poses,
            K: context.K ?? [0, 0, 0, 0, 0, 0, 0, 0, 1],
            w: context.rgbWidth,
            h: context.rgbHeight,
            dw: context.depthWidth,
            dh: context.depthHeight,
            fps: context.fps,
            frameTimestamps: context.frameTimestamps,
            device: Self.deviceIdentifier(),
            appVersion: Self.appVersionString(),
            aeLocked: context.aeLocked,
            droppedFrames: context.droppedFrames,
            startedAt: context.startedAtString
        )
        let fallbackState = context.finalState
        recordingLock.unlock()

        var finalState = fallbackState
        do {
            let metadataBytes = try Self.writeMetadata(metadata, in: context.rootURL)
            recordingLock.lock()
            if recordingContext === context {
                context.bytesWritten += metadataBytes
            }
            recordingLock.unlock()
        } catch {
            finalState = .error("metadata 저장 실패: \(error.localizedDescription)")
        }

        recordingLock.lock()
        let frameCount = context.nextFrameIndex
        let dropped = context.droppedFrames
        let bytes = context.bytesWritten
        let elapsed = Date().timeIntervalSince(context.startDate)
        let aeLocked = context.aeLocked
        if recordingContext === context {
            recordingContext = nil
        }
        recordingLock.unlock()

        refreshFreeDiskBytes()
        publish {
            self.frameCount = frameCount
            self.droppedFrames = dropped
            self.bytesWritten = bytes
            self.elapsedSeconds = elapsed
            self.aeLocked = aeLocked
            self.thermalState = ProcessInfo.processInfo.thermalState
            self.state = finalState
        }
    }

    func completePendingWrite(for context: RecordingContext) {
        recordingLock.lock()
        if recordingContext === context {
            context.pendingWrites = max(0, context.pendingWrites - 1)
        }
        recordingLock.unlock()
    }

    func markWriteFailure(context: RecordingContext, error: Error) {
        recordingLock.lock()
        if recordingContext === context {
            context.failed = true
            context.pendingWrites = max(0, context.pendingWrites - 1)
        }
        recordingLock.unlock()
        requestStop(finalState: .error("프레임 저장 실패: \(error.localizedDescription)"))
    }

    func handleSessionProblem(_ message: String) {
        recordingLock.lock()
        let hasRecording = recordingContext != nil
        recordingLock.unlock()

        if hasRecording {
            requestStop(finalState: .error(message))
        } else {
            publishState(.error(message))
        }
    }

    func scheduleExposureAndWhiteBalanceLock(for context: RecordingContext) {
        DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + 1.0) { [weak self, weak context] in
            guard let self, let context else {
                return
            }

            self.recordingLock.lock()
            let shouldLock = self.recordingContext === context && !context.isStopping && !context.failed
            self.recordingLock.unlock()
            guard shouldLock else {
                return
            }

            let locked = Self.lockExposureAndWhiteBalance()

            self.recordingLock.lock()
            if self.recordingContext === context {
                context.aeLocked = locked
            }
            self.recordingLock.unlock()

            self.publish {
                self.aeLocked = locked
            }
        }
    }

    static func lockExposureAndWhiteBalance() -> Bool {
        guard let device = ARWorldTrackingConfiguration.configurableCaptureDeviceForPrimaryCamera else {
            return false
        }

        do {
            try device.lockForConfiguration()
            defer {
                device.unlockForConfiguration()
            }

            var lockedExposure = false
            var lockedWhiteBalance = false

            if device.isExposureModeSupported(.locked) {
                device.exposureMode = .locked
                lockedExposure = true
            }

            if device.isWhiteBalanceModeSupported(.locked) {
                device.whiteBalanceMode = .locked
                lockedWhiteBalance = true
            }

            return lockedExposure && lockedWhiteBalance
        } catch {
            return false
        }
    }

    func releaseExposureAndWhiteBalanceLock() {
        guard aeLocked,
              let device = ARWorldTrackingConfiguration.configurableCaptureDeviceForPrimaryCamera else {
            return
        }

        do {
            try device.lockForConfiguration()
            defer {
                device.unlockForConfiguration()
            }

            if device.isExposureModeSupported(.continuousAutoExposure) {
                device.exposureMode = .continuousAutoExposure
            }
            if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
                device.whiteBalanceMode = .continuousAutoWhiteBalance
            }
        } catch {
            return
        }
    }

    func startMetricsTimer() {
        stopMetricsTimer()
        refreshFreeDiskBytes()

        let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .utility))
        timer.schedule(deadline: .now(), repeating: 1.0)
        timer.setEventHandler { [weak self] in
            guard let self else {
                return
            }

            self.refreshFreeDiskBytes()

            self.recordingLock.lock()
            let startDate = self.recordingContext?.startDate
            self.recordingLock.unlock()

            let elapsed = startDate.map { Date().timeIntervalSince($0) } ?? 0
            self.publish {
                self.elapsedSeconds = elapsed
                self.thermalState = ProcessInfo.processInfo.thermalState
            }
        }
        metricsTimer = timer
        timer.resume()
    }

    func stopMetricsTimer() {
        metricsTimer?.cancel()
        metricsTimer = nil
    }

    func refreshFreeDiskBytes() {
        let url = Self.capturesDirectory()
        let bytes: Int64
        do {
            let values = try url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
            bytes = values.volumeAvailableCapacityForImportantUsage ?? 0
        } catch {
            bytes = 0
        }

        publish {
            self.freeDiskBytes = bytes
        }
    }

    static func writeMetadata(_ metadata: CaptureMetadata, in rootURL: URL) throws -> Int64 {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .withoutEscapingSlashes]
        let data = try encoder.encode(metadata)
        let tempURL = rootURL.appendingPathComponent("metadata.json.tmp-\(UUID().uuidString)", isDirectory: false)
        let finalURL = rootURL.appendingPathComponent("metadata.json", isDirectory: false)

        // 최종 파일은 같은 디렉터리 rename으로 교체해야 부분 JSON을 남기지 않는다.
        try data.write(to: tempURL)
        if FileManager.default.fileExists(atPath: finalURL.path) {
            try FileManager.default.removeItem(at: finalURL)
        }
        try FileManager.default.moveItem(at: tempURL, to: finalURL)
        return Int64(data.count)
    }

    static func loadSettings() -> CaptureSettings {
        guard let data = UserDefaults.standard.data(forKey: settingsKey),
              let decoded = try? JSONDecoder().decode(CaptureSettings.self, from: data) else {
            return CaptureSettings()
        }
        return decoded.normalized
    }

    static func saveSettings(_ settings: CaptureSettings) {
        guard let data = try? JSONEncoder().encode(settings.normalized) else {
            return
        }
        UserDefaults.standard.set(data, forKey: settingsKey)
    }

    func publish(_ update: @escaping () -> Void) {
        if Thread.isMainThread {
            update()
        } else {
            DispatchQueue.main.async(execute: update)
        }
    }

    func publishState(_ state: CaptureState) {
        publish {
            self.state = state
        }
    }

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

    static func copyDepthMap(_ pixelBuffer: CVPixelBuffer) -> (values: [Float], width: Int, height: Int)? {
        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        guard width > 0, height > 0 else {
            return nil
        }

        guard CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly) == kCVReturnSuccess else {
            return nil
        }
        defer {
            CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly)
        }

        guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else {
            return nil
        }

        let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
        var values = Array(repeating: Float(0), count: width * height)

        for y in 0..<height {
            let row = baseAddress.advanced(by: y * bytesPerRow).assumingMemoryBound(to: Float.self)
            for x in 0..<width {
                let value = row[x]
                values[y * width + x] = value.isFinite ? value : 0
            }
        }

        return (values, width, height)
    }

    static func copyConfidenceMap(_ pixelBuffer: CVPixelBuffer?, expectedWidth: Int, expectedHeight: Int) -> [UInt8] {
        let fallback = Array(repeating: UInt8(0), count: expectedWidth * expectedHeight)
        guard let pixelBuffer else {
            return fallback
        }

        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        guard width == expectedWidth, height == expectedHeight else {
            return fallback
        }

        guard CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly) == kCVReturnSuccess else {
            return fallback
        }
        defer {
            CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly)
        }

        guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else {
            return fallback
        }

        let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
        var values = Array(repeating: UInt8(0), count: width * height)

        for y in 0..<height {
            let row = baseAddress.advanced(by: y * bytesPerRow).assumingMemoryBound(to: UInt8.self)
            for x in 0..<width {
                values[y * width + x] = row[x]
            }
        }

        return values
    }

    static func countRGBFrames(in captureURL: URL) -> Int {
        let rgbURL = captureURL.appendingPathComponent("rgb", isDirectory: true)
        guard let urls = try? FileManager.default.contentsOfDirectory(
            at: rgbURL,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) else {
            return 0
        }
        return urls.filter { $0.pathExtension.lowercased() == "jpg" }.count
    }

    static func directorySize(_ url: URL) -> Int64 {
        let keys: Set<URLResourceKey> = [.isRegularFileKey, .fileSizeKey]
        guard let enumerator = FileManager.default.enumerator(
            at: url,
            includingPropertiesForKeys: Array(keys),
            options: [.skipsHiddenFiles, .skipsPackageDescendants]
        ) else {
            return 0
        }

        var total: Int64 = 0
        for case let fileURL as URL in enumerator {
            guard let values = try? fileURL.resourceValues(forKeys: keys),
                  values.isRegularFile == true else {
                continue
            }
            total += Int64(values.fileSize ?? 0)
        }
        return total
    }

    static func deviceIdentifier() -> String {
        var systemInfo = utsname()
        uname(&systemInfo)
        let mirror = Mirror(reflecting: systemInfo.machine)
        return mirror.children.reduce(into: "") { identifier, element in
            guard let value = element.value as? Int8, value != 0 else {
                return
            }
            identifier.append(Character(UnicodeScalar(UInt8(value))))
        }
    }

    static func appVersionString() -> String {
        let bundle = Bundle.main
        if let version = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
           !version.isEmpty {
            return version
        }
        if let build = bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String,
           !build.isEmpty {
            return build
        }
        return "0.1.0"
    }

    static let captureFolderFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        return formatter
    }()

    static let metadataDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ssXXXXX"
        return formatter
    }()
}
