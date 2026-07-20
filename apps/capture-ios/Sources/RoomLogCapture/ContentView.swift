import SwiftUI

struct ContentView: View {
    @ObservedObject var engine: CaptureEngine

    @State private var showsSOP = false
    @State private var showsCaptures = false
    @State private var showsSettings = false
    @State private var showsRoomScan = false
    @State private var showsUnifiedCapture = false
    @State private var pausedDepthSessionForCaptures = false
    @State private var pausedDepthSessionForSettings = false

    var body: some View {
        Group {
            if CaptureEngine.isDeviceSupported {
                captureInterface
            } else {
                unsupportedView
            }
        }
        .sheet(isPresented: $showsCaptures, onDismiss: resumeDepthSessionAfterCaptures) {
            CaptureListView()
        }
        .sheet(isPresented: $showsSettings, onDismiss: resumeDepthSessionAfterSettings) {
            SettingsView(engine: engine)
        }
        .sheet(isPresented: $showsRoomScan, onDismiss: resumeDepthSession) {
            RoomScanView()
        }
        .fullScreenCover(isPresented: $showsUnifiedCapture, onDismiss: resumeDepthSession) {
            UnifiedCaptureView(engine: engine)
        }
    }

    private var captureInterface: some View {
        ZStack {
            ARPreviewView(engine: engine)
                .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 12) {
                topOverlay

                if showsSOP {
                    sopOverlay
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }

                Spacer()

                recordControls
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .onAppear {
            engine.startSession()
        }
        .onDisappear {
            engine.pauseSession()
        }
        .animation(.easeInOut(duration: 0.18), value: showsSOP)
    }

    private var topOverlay: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                hud

                if let message = errorMessage {
                    HUDChip(text: "오류 \(message)", tint: .red)
                        .lineLimit(2)
                }
            }

            Spacer(minLength: 8)

            VStack(spacing: 8) {
                circleActionButton(
                    systemName: showsSOP ? "xmark" : "list.bullet.clipboard",
                    accessibilityLabel: showsSOP ? "SOP 닫기" : "SOP 열기"
                ) {
                    showsSOP.toggle()
                }

                circleActionButton(
                    systemName: "viewfinder",
                    accessibilityLabel: "내 가구 RoomPlan 스캔 열기",
                    isDisabled: isRecording || isSaving
                ) {
                    engine.pauseSession()
                    showsRoomScan = true
                }

                circleActionButton(
                    systemName: "cube.transparent",
                    accessibilityLabel: "3D 캡처(도면 포함) 열기",
                    isDisabled: isRecording || isSaving
                ) {
                    engine.pauseSession()
                    showsUnifiedCapture = true
                }

                circleActionButton(
                    systemName: "folder",
                    accessibilityLabel: "캡처 목록 열기"
                ) {
                    presentCaptures()
                }

                circleActionButton(
                    systemName: "gearshape",
                    accessibilityLabel: "설정 열기",
                    isDisabled: isRecording
                ) {
                    presentSettings()
                }
            }
        }
    }

    private var hud: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                HUDChip(text: "\(recordingSymbol) \(engine.frameCount)f", tint: isRecording ? .red : .white)
                HUDChip(text: elapsedText(engine.elapsedSeconds))
                HUDChip(text: megabyteText(engine.bytesWritten))
            }

            HStack(spacing: 6) {
                HUDChip(text: "드롭 \(engine.droppedFrames)")
                HUDChip(text: diskText(engine.freeDiskBytes))

                if shouldShowThermalWarning {
                    HUDChip(text: "⚠️ 발열", tint: .orange)
                }

                HUDChip(
                    text: engine.aeLocked ? "AE 고정" : (engine.settings.lockExposure ? "AE 대기" : "AE 자동"),
                    tint: engine.aeLocked ? .green : (engine.settings.lockExposure ? .white : .orange)
                )
            }
        }
    }

    private var sopOverlay: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("촬영 SOP")
                .font(.headline)

            VStack(alignment: .leading, spacing: 7) {
                SOPLine("가로로")
                SOPLine("천천히 옆걸음")
                SOPLine("다중 높이 3패스(눈높이/아래/위)")
                SOPLine("물체는 여러 각도, 벽은 정면 커버리지")
                SOPLine("반사면 정면 오래 금지")
            }
            .font(.subheadline)
        }
        .foregroundStyle(.white)
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(.white.opacity(0.18), lineWidth: 1)
        }
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
            .accessibilityLabel(recordButtonAccessibilityLabel)

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

    private var unsupportedView: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 14) {
                Image(systemName: "camera.metering.matrix")
                    .font(.system(size: 42, weight: .semibold))

                Text("LiDAR 필요")
                    .font(.title2.bold())

                Text("RoomLog Capture는 sceneDepth를 지원하는 iPhone Pro에서만 사용할 수 있습니다.")
                    .font(.body)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }
            .padding(22)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .padding(24)
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

    private var recordButtonAccessibilityLabel: String {
        switch engine.state {
        case .recording:
            return "녹화 중지"
        case .saving:
            return "저장 중"
        default:
            return "녹화 시작"
        }
    }

    private var recordingSymbol: String {
        isRecording ? "⏺" : "○"
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

    private var shouldShowThermalWarning: Bool {
        switch engine.thermalState {
        case .serious, .critical:
            return true
        default:
            return false
        }
    }

    private var errorMessage: String? {
        if case .error(let message) = engine.state {
            return message
        }
        return nil
    }

    private func handleRecordTap() {
        switch engine.state {
        case .recording:
            engine.stopRecording()
        case .idle, .error(_):
            engine.startRecording()
        case .saving:
            break
        }
    }

    private func resumeDepthSession() {
        guard CaptureEngine.isDeviceSupported else {
            return
        }
        engine.startSession()
    }

    private func presentCaptures() {
        pausedDepthSessionForCaptures = pauseDepthSessionForSheet()
        showsCaptures = true
    }

    private func presentSettings() {
        pausedDepthSessionForSettings = pauseDepthSessionForSheet()
        showsSettings = true
    }

    private func pauseDepthSessionForSheet() -> Bool {
        // SwiftUI sheet은 배경 뷰를 언마운트하지 않아 ARPreviewView의 depth 세션이 계속 돈다.
        // 녹화·저장 중에는 pauseSession()이 촬영을 중단하므로 pause하면 안 된다.
        guard CaptureEngine.isDeviceSupported, !isRecording, !isSaving else {
            return false
        }

        engine.pauseSession()
        return true
    }

    private func resumeDepthSessionAfterCaptures() {
        guard pausedDepthSessionForCaptures else {
            return
        }

        pausedDepthSessionForCaptures = false
        resumeDepthSession()
    }

    private func resumeDepthSessionAfterSettings() {
        guard pausedDepthSessionForSettings else {
            return
        }

        pausedDepthSessionForSettings = false
        resumeDepthSession()
    }

    private func circleActionButton(
        systemName: String,
        accessibilityLabel: String,
        isDisabled: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(.ultraThinMaterial, in: Circle())
                .overlay {
                    Circle().stroke(.white.opacity(0.18), lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.46 : 1)
        .accessibilityLabel(accessibilityLabel)
    }

    private func elapsedText(_ seconds: Double) -> String {
        let totalSeconds = max(0, Int(seconds))
        return "\(totalSeconds / 60):\(twoDigits(totalSeconds % 60))"
    }

    private func twoDigits(_ value: Int) -> String {
        value < 10 ? "0\(value)" : "\(value)"
    }

    private func megabyteText(_ bytes: Int64) -> String {
        let megabytes = max(0, Double(bytes)) / 1_048_576.0
        let tenths = Int((megabytes * 10).rounded())
        return "\(tenths / 10).\(tenths % 10) MB"
    }

    private func diskText(_ bytes: Int64) -> String {
        let gigabytes = max(0, Double(bytes)) / 1_073_741_824.0
        let tenths = Int((gigabytes * 10).rounded())
        return "남음 \(tenths / 10).\(tenths % 10) GB"
    }
}

private struct HUDChip: View {
    let text: String
    var tint: Color = .white

    var body: some View {
        Text(text)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(tint)
            .lineLimit(1)
            .minimumScaleFactor(0.82)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay {
                Capsule().stroke(.white.opacity(0.18), lineWidth: 1)
            }
    }
}

private struct SOPLine: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("•")
            Text(text)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
