import ARKit
import RoomPlan
import SwiftUI

/// A1: video-frame harvest(CaptureEngine)와 RoomPlan을 한 ARSession으로 같이 돌리는 실제 캡처 화면.
/// SharedSessionProbeView(kjw-ios-session-probe, 기기 검증됨)의 핸드셰이크를 그대로 재사용한다 —
/// RoomCaptureView(frame:arSession:)에 CaptureEngine.session을 넘기고 captureSession.delegate만
/// 우리 것으로 잡는다. 기존 ContentView 캡처 화면(ARPreviewView, RoomPlan 없음)과 RoomScanView
/// (가구만 스캔하는 별도 화면)는 그대로 둔다 — 이 화면은 추가 진입점이다.
@available(iOS 17.0, *)
struct UnifiedCaptureView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var engine: CaptureEngine
    @StateObject private var roomPlan = RoomPlanCaptureCoordinator()

    var body: some View {
        ZStack {
            UnifiedCaptureRepresentable(engine: engine, coordinator: roomPlan)
                .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 12) {
                topOverlay
                Spacer()
                recordControls
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .onDisappear {
            roomPlan.cancel()
            engine.pauseSession()
        }
    }

    private var topOverlay: some View {
        HStack(alignment: .top, spacing: 12) {
            hud
            Spacer(minLength: 8)
            closeButton
        }
    }

    private var hud: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                chip("\(isRecording ? "⏺" : "○") \(engine.frameCount)f", tint: isRecording ? .red : .white)
                chip(elapsedText(engine.elapsedSeconds))
                chip("드롭 \(engine.droppedFrames)")
            }
            HStack(spacing: 6) {
                chip("벽 \(roomPlan.wallCount) · 문 \(roomPlan.doorCount) · 창 \(roomPlan.windowCount)")
            }
            exportStatusChip
        }
    }

    @ViewBuilder
    private var exportStatusChip: some View {
        switch roomPlan.exportStatus {
        case .idle:
            EmptyView()
        case .building:
            chip("도면 저장 중…")
        case .saved:
            chip("도면 저장됨", tint: .green)
        case .failed(let message):
            chip("도면 저장 실패: \(message)", tint: .red)
        }
    }

    private var closeButton: some View {
        Button(action: { dismiss() }) {
            Image(systemName: "xmark")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(.ultraThinMaterial, in: Circle())
                .overlay {
                    Circle().stroke(.white.opacity(0.18), lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
        // 녹화 중엔 강제 종료 대신 정지 버튼으로 유도한다 — 그래야 roomPlan.finish(rootURL:)가
        // 정상 경로로 걸려 roomplan.json이 만들어진다.
        .disabled(isRecording || isSaving)
        .opacity(isRecording || isSaving ? 0.46 : 1)
    }

    private var recordControls: some View {
        HStack {
            Spacer()

            Button(action: handleRecordTap) {
                ZStack {
                    Circle()
                        .fill(recordButtonColor)
                        .frame(width: 78, height: 78)
                        .shadow(color: .black.opacity(0.28), radius: 18, y: 8)

                    Circle()
                        .stroke(.white.opacity(0.7), lineWidth: 2)
                        .frame(width: 88, height: 88)

                    recordButtonContent
                }
                .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .disabled(isSaving)
            .accessibilityLabel(isRecording ? "녹화 중지" : "녹화 시작")

            Spacer()
        }
        .padding(.bottom, 28)
    }

    @ViewBuilder
    private var recordButtonContent: some View {
        switch engine.state {
        case .recording:
            Image(systemName: "stop.fill")
                .font(.system(size: 29, weight: .bold))
                .foregroundStyle(.white)
        case .saving:
            ProgressView()
                .controlSize(.large)
                .tint(.white)
        default:
            Circle()
                .fill(.white)
                .frame(width: 56, height: 56)
        }
    }

    private var recordButtonColor: Color {
        switch engine.state {
        case .recording:
            return .red
        case .saving:
            return .white.opacity(0.24)
        default:
            return .white
        }
    }

    private var isRecording: Bool {
        if case .recording = engine.state {
            return true
        }
        return false
    }

    private var isSaving: Bool {
        if case .saving = engine.state {
            return true
        }
        return false
    }

    private func handleRecordTap() {
        switch engine.state {
        case .recording:
            // rootURL은 지금(=engine이 recordingContext를 비동기로 비우기 전에) 읽어서 코디네이터에
            // 건네야 한다 — finalizeRecording과 RoomBuilder 후처리가 둘 다 비동기라 나중에 다시
            // engine에 물어보면 레이스가 생긴다.
            roomPlan.finish(rootURL: engine.currentCaptureRootURL)
            engine.stopRecording()
        case .idle, .error:
            roomPlan.reset()
            engine.startRecording()
        case .saving:
            break
        }
    }

    private func chip(_ text: String, tint: Color = .white) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(tint)
            .lineLimit(2)
            .minimumScaleFactor(0.82)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay {
                Capsule().stroke(.white.opacity(0.18), lineWidth: 1)
            }
    }

    private func elapsedText(_ seconds: Double) -> String {
        let totalSeconds = max(0, Int(seconds))
        let secondsPart = totalSeconds % 60
        let secondsText = secondsPart < 10 ? "0\(secondsPart)" : "\(secondsPart)"
        return "\(totalSeconds / 60):\(secondsText)"
    }
}

/// SharedSessionProbe와 같은 역할을 RoomPlan 쪽에서 맡는 실서비스용 델리게이트.
/// RoomCaptureViewDelegate(내장 시각화/후처리)는 쓰지 않는다 — captureSession.delegate 슬롯을
/// 우리가 점유하면 RoomCaptureView 내부 처리 경로와는 공존하지 않으므로(프로브가 검증한 지점),
/// 최종 방 모델은 didEndWith가 주는 원시 CapturedRoomData를 RoomBuilder로 직접 후처리해서 얻는다
/// (WWDC23 "여러 방 병합" 패턴과 같은 API — RoomCaptureView가 내부적으로 쓰는 것과 동일한 후처리 단계).
@available(iOS 17.0, *)
final class RoomPlanCaptureCoordinator: NSObject, ObservableObject, RoomCaptureSessionDelegate {
    enum ExportStatus: Equatable {
        case idle
        case building
        case saved
        case failed(String)
    }

    @Published private(set) var wallCount: Int = 0
    @Published private(set) var doorCount: Int = 0
    @Published private(set) var windowCount: Int = 0
    @Published private(set) var exportStatus: ExportStatus = .idle

    /// RoomCaptureView가 소유한 세션 — stop()에서 같이 정지시키려고만 들고 있는다(소유는 View 쪽).
    weak var roomCaptureSession: RoomCaptureSession?

    private var pendingExportRootURL: URL?
    private var didRequestFinish = false

    func attach(_ session: RoomCaptureSession) {
        roomCaptureSession = session
    }

    /// 새 녹화를 시작할 때 호출 — 이전 스캔의 상태를 지운다.
    func reset() {
        didRequestFinish = false
        pendingExportRootURL = nil
        exportStatus = .idle
        wallCount = 0
        doorCount = 0
        windowCount = 0
    }

    /// 녹화 종료(정지 버튼) 시점에 호출 — RoomCaptureSession을 멈추고, roomplan.json을 쓸 폴더를
    /// 고정한다. rootURL은 호출부가 CaptureEngine.currentCaptureRootURL을 미리 읽어 넘겨야 한다.
    func finish(rootURL: URL?) {
        didRequestFinish = true
        pendingExportRootURL = rootURL
        roomCaptureSession?.stop()
    }

    /// 화면 이탈(스캔 중 취소) 시점에 호출. finish()가 이미 걸려 있으면 아무것도 하지 않는다 —
    /// didEndWith가 아직 안 왔을 뿐인 정상 종료 흐름을 여기서 지워버리면 roomplan.json이 안 만들어진다.
    func cancel() {
        guard !didRequestFinish else {
            return
        }
        pendingExportRootURL = nil
        roomCaptureSession?.stop()
    }

    // MARK: - RoomCaptureSessionDelegate

    func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
        publish {
            self.wallCount = room.walls.count
            self.doorCount = room.doors.count
            self.windowCount = room.windows.count
        }
    }

    func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: Error?) {
        guard let rootURL = pendingExportRootURL else {
            // finish()가 호출되지 않은 채(스캔 중 취소 등) 세션이 끝났다 — roomplan.json도 만들지 않는다.
            return
        }
        pendingExportRootURL = nil

        if let error {
            publish {
                self.exportStatus = .failed(error.localizedDescription)
            }
            return
        }

        publish {
            self.exportStatus = .building
        }
        let capturedAt = Date()

        Task {
            do {
                // RoomCaptureView 내장 처리와 동일한 후처리 단계 — captureSession.delegate를 우리가
                // 점유했으므로 최종 CapturedRoom은 직접 만들어야 한다.
                let room = try await RoomBuilder(options: [.beautifyObjects]).capturedRoom(from: data)
                try RoomPlanExporter.export(room, capturedAt: capturedAt, to: rootURL)
                await MainActor.run {
                    self.exportStatus = .saved
                }
            } catch {
                await MainActor.run {
                    self.exportStatus = .failed(error.localizedDescription)
                }
            }
        }
    }

    func captureSession(_ session: RoomCaptureSession, didProvide instruction: RoomCaptureSession.Instruction) {}

    private func publish(_ update: @escaping () -> Void) {
        if Thread.isMainThread {
            update()
        } else {
            DispatchQueue.main.async(execute: update)
        }
    }
}

@available(iOS 17.0, *)
private struct UnifiedCaptureRepresentable: UIViewRepresentable {
    let engine: CaptureEngine
    let coordinator: RoomPlanCaptureCoordinator

    func makeCoordinator() -> RoomPlanCaptureCoordinator {
        coordinator
    }

    func makeUIView(context: Context) -> RoomCaptureView {
        // SharedSessionProbeView와 정확히 같은 순서: 우리 ARSession으로 RoomCaptureView를 먼저
        // 만들고, captureSession.delegate를 우리 것으로 잡은 뒤, CaptureEngine의 세션 설정
        // (.sceneDepth 포함)을 돌리고, 마지막에 RoomCaptureSession을 run한다.
        let captureView = RoomCaptureView(frame: .zero, arSession: engine.session)
        captureView.captureSession.delegate = coordinator
        coordinator.attach(captureView.captureSession)
        engine.startSession()
        captureView.captureSession.run(configuration: RoomCaptureSession.Configuration())
        return captureView
    }

    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}

    static func dismantleUIView(_ uiView: RoomCaptureView, coordinator: RoomPlanCaptureCoordinator) {
        coordinator.roomCaptureSession?.stop()
    }
}
