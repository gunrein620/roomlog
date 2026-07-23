import Foundation
import SwiftUI
import UIKit

struct ContentView: View {
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @ObservedObject var engine: CaptureEngine

    @State private var showsSOP = false
    @State private var showsCaptures = false
    @State private var showsFurnitureCabinet = false
    @State private var showsSettings = false
    @State private var showsRoomScan = false
    @State private var showsUnifiedCapture = false
    @State private var pausedDepthSessionForCaptures = false
    @State private var pausedDepthSessionForFurnitureCabinet = false
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
        .sheet(isPresented: $showsFurnitureCabinet, onDismiss: resumeDepthSessionAfterFurnitureCabinet) {
            FurnitureCabinetView()
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

            topActionButtonsLayout
        }
    }

    @ViewBuilder
    private var topActionButtonsLayout: some View {
        if verticalSizeClass == .compact {
            LazyVGrid(columns: compactActionColumns, spacing: 8) {
                topActionButtons
            }
            .frame(width: 96)
        } else {
            VStack(spacing: 8) {
                topActionButtons
            }
        }
    }

    @ViewBuilder
    private var topActionButtons: some View {
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
            systemName: "square.grid.2x2",
            accessibilityLabel: "내 가구함 열기"
        ) {
            presentFurnitureCabinet()
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

    private var compactActionColumns: [GridItem] {
        [
            GridItem(.fixed(44), spacing: 8),
            GridItem(.fixed(44), spacing: 0)
        ]
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

    private func presentFurnitureCabinet() {
        pausedDepthSessionForFurnitureCabinet = pauseDepthSessionForSheet()
        showsFurnitureCabinet = true
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

    private func resumeDepthSessionAfterFurnitureCabinet() {
        guard pausedDepthSessionForFurnitureCabinet else {
            return
        }

        pausedDepthSessionForFurnitureCabinet = false
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

private struct FurnitureCabinetView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var account: AccountStore

    @State private var loadState: FurnitureCabinetLoadState = .loading
    @State private var activeLoadID: UUID?
    @State private var isRefreshing = false
    @State private var pendingDeletion: FurnitureDeletionTarget?
    @State private var deletingTargetID: String?
    @State private var deletionErrorMessage: String?

    // 기존 가구 항목에 썸네일을 나중에 붙이는 플로우 — ObjectCaptureScanView(신규 촬영 직후)와
    // 별개로, 이미 등록된 가구를 목록에서 골라 촬영한다.
    @State private var thumbnailTarget: FurnitureCabinetItem?
    @State private var showsThumbnailCamera = false
    @State private var uploadingThumbnailID: String?
    @State private var thumbnailErrorMessage: String?

    // 이름 수정 — completeObjectCapture가 한동안 label을 버려서 label=null(카테고리명 표시)인
    // 기존 가구가 있다. 재스캔 없이 이름만 고칠 수 있게 한다.
    @State private var renameTarget: FurnitureCabinetItem?
    @State private var renameDraft = ""
    @State private var renamingTargetID: String?
    @State private var renameErrorMessage: String?

    var body: some View {
        NavigationStack {
            ZStack {
                Woozu.night
                    .ignoresSafeArea()

                if account.accessToken == nil {
                    loginRequiredView
                } else {
                    loadedContent
                }
            }
            .navigationTitle("내 가구함")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Woozu.primary900, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("닫기") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task {
                            await loadFurniture(showLoading: false)
                        }
                    } label: {
                        if isRefreshing {
                            ProgressView()
                                .tint(Woozu.secondarySoft)
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                    .disabled(isLoading || deletingTargetID != nil || account.accessToken == nil)
                    .accessibilityLabel(isRefreshing ? "가구 목록 새로고침 중" : "가구 목록 새로고침")
                }
            }
        }
        .tint(Woozu.secondarySoft)
        .task(id: account.isAuthenticated) {
            await loadFurniture(showLoading: true)
        }
        .confirmationDialog(
            pendingDeletion?.dialogTitle ?? "삭제 확인",
            isPresented: deletionConfirmationIsPresented,
            titleVisibility: .visible
        ) {
            if let target = pendingDeletion {
                Button(target.actionTitle, role: .destructive) {
                    pendingDeletion = nil
                    Task {
                        await deleteFurniture(target)
                    }
                }
            }
            Button("취소", role: .cancel) {
                pendingDeletion = nil
            }
        } message: {
            if let target = pendingDeletion {
                Text(target.dialogMessage)
            }
        }
        .alert("삭제하지 못했습니다", isPresented: deletionErrorIsPresented) {
            Button("확인", role: .cancel) {
                deletionErrorMessage = nil
            }
        } message: {
            Text(deletionErrorMessage ?? "알 수 없는 오류가 발생했습니다.")
        }
        .fullScreenCover(isPresented: $showsThumbnailCamera) {
            SquareThumbnailCamera { image in
                showsThumbnailCamera = false
                let target = thumbnailTarget
                thumbnailTarget = nil
                guard let target else { return }
                Task {
                    await uploadThumbnail(image?.squareThumbnail(), for: target)
                }
            }
            .ignoresSafeArea()
        }
        .alert("썸네일 저장 실패", isPresented: thumbnailErrorIsPresented) {
            Button("확인", role: .cancel) {
                thumbnailErrorMessage = nil
            }
        } message: {
            Text(thumbnailErrorMessage ?? "알 수 없는 오류가 발생했습니다.")
        }
        .alert("이름 수정", isPresented: renameDialogIsPresented) {
            TextField("예: 거실 소파", text: $renameDraft)
            Button("확인", action: confirmRename)
            Button("취소", role: .cancel) {
                renameTarget = nil
            }
        } message: {
            Text("가구의 이름을 입력하세요.")
        }
        .alert("이름을 저장하지 못했습니다", isPresented: renameErrorIsPresented) {
            Button("확인", role: .cancel) {
                renameErrorMessage = nil
            }
        } message: {
            Text(renameErrorMessage ?? "알 수 없는 오류가 발생했습니다.")
        }
    }

    @ViewBuilder
    private var loadedContent: some View {
        switch loadState {
        case .loading:
            loadingView
        case .loaded(let items):
            if items.isEmpty {
                emptyView
            } else {
                furnitureList(items)
            }
        case .failure(let message):
            failureView(message)
        }
    }

    private var loadingView: some View {
        VStack(spacing: 14) {
            ProgressView()
                .controlSize(.large)
                .tint(Woozu.secondarySoft)
            Text("가구 목록을 불러오는 중…")
                .font(.subheadline)
                .foregroundStyle(Woozu.secondarySoft)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("가구 목록을 불러오는 중")
    }

    private var loginRequiredView: some View {
        noticeView(
            icon: "person.crop.circle.badge.exclamationmark",
            title: "로그인이 필요합니다",
            message: "설정에서 임차인 계정으로 로그인한 뒤 내 가구함을 확인하세요."
        )
    }

    private var emptyView: some View {
        noticeView(
            icon: "square.grid.2x2",
            title: "등록된 가구가 없습니다",
            message: "방 스캔으로 가구를 등록해 보세요."
        )
    }

    private func failureView(_ message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 40, weight: .light))
                .foregroundStyle(Woozu.accent)
            Text("가구 목록을 불러오지 못했습니다")
                .font(.system(.title2, design: .serif))
                .foregroundStyle(Woozu.surfaceMuted)
            Text(message)
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(Woozu.secondarySoft)

            Button("다시 시도") {
                Task {
                    await loadFurniture(showLoading: true)
                }
            }
            .buttonStyle(WoozuPrimaryButtonStyle())
            .padding(.top, 4)
        }
        .padding(.horizontal, 40)
        .frame(maxWidth: 480)
    }

    private func noticeView(icon: String, title: String, message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 44, weight: .light))
                .foregroundStyle(Woozu.secondarySoft)
            Text(title)
                .font(.system(.title2, design: .serif))
                .foregroundStyle(Woozu.surfaceMuted)
            Text(message)
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(Woozu.secondarySoft)
        }
        .padding(.horizontal, 32)
    }

    private func furnitureList(_ items: [FurnitureCabinetItem]) -> some View {
        let sections = FurnitureCabinetSections(items: items)

        return ScrollView {
            LazyVStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 12) {
                    sectionHeader(
                        title: "내 가구",
                        count: sections.myFurniture.count,
                        subtitle: "사진을 찍어 실물 메시가 준비된 가구"
                    )

                    if sections.myFurniture.isEmpty {
                        sectionEmptyMessage("실물 메시가 있는 가구가 아직 없습니다.")
                    } else {
                        ForEach(sections.myFurniture) { item in
                            furnitureRow(item)
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    sectionHeader(
                        title: "스캔에서 감지됨",
                        count: sections.detectedCount,
                        subtitle: "RoomPlan 스캔 배치별 감지 항목"
                    )

                    if sections.detectedCount == 0 {
                        sectionEmptyMessage("스캔에서 감지된 메시 없는 가구가 없습니다.")
                    } else {
                        ForEach(sections.batches) { batch in
                            scanBatchGroup(batch)
                        }

                        if !sections.unbatchedItems.isEmpty {
                            unbatchedGroup(sections.unbatchedItems)
                        }
                    }
                }
            }
            .padding(16)
        }
        .refreshable {
            guard deletingTargetID == nil, !isRefreshing else {
                return
            }
            await loadFurniture(showLoading: false)
        }
    }

    private func sectionHeader(title: String, count: Int, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(title)
                    .font(.system(.title3, design: .serif).weight(.semibold))
                    .foregroundStyle(Woozu.surfaceMuted)
                Spacer()
                Text("\(count)개")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Woozu.secondarySoft)
            }
            Text(subtitle)
                .font(.caption)
                .foregroundStyle(Woozu.secondarySoft)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    private func sectionEmptyMessage(_ message: String) -> some View {
        Text(message)
            .font(.subheadline)
            .foregroundStyle(Woozu.secondarySoft)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(
                Woozu.primary.opacity(0.72),
                in: RoundedRectangle(cornerRadius: 14, style: .continuous)
            )
    }

    private func scanBatchGroup(_ batch: FurnitureScanBatch) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("스캔 배치")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Woozu.surfaceMuted)
                    Text(batch.headerDetail)
                        .font(.caption)
                        .foregroundStyle(Woozu.secondarySoft)
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)

                Spacer(minLength: 8)

                if deletingTargetID == FurnitureDeletionTarget.batch(batch).id {
                    ProgressView()
                        .tint(Woozu.secondarySoft)
                        .frame(width: 44, height: 44)
                        .accessibilityLabel("스캔 배치 삭제 중")
                } else {
                    Button(role: .destructive) {
                        pendingDeletion = .batch(batch)
                    } label: {
                        Label("배치 삭제", systemImage: "trash")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Woozu.accent)
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(deletingTargetID != nil || isRefreshing)
                    .accessibilityLabel("스캔 배치 가구 \(batch.totalItemCount)개 모두 삭제")
                }
            }
            .padding(12)
            .background(
                Woozu.primary.opacity(0.88),
                in: RoundedRectangle(cornerRadius: 14, style: .continuous)
            )

            ForEach(batch.items) { item in
                furnitureRow(item)
            }
        }
    }

    private func unbatchedGroup(_ items: [FurnitureCabinetItem]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("배치 정보 없음")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Woozu.surfaceMuted)
                Spacer()
                Text("\(items.count)개")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Woozu.secondarySoft)
            }
            .padding(12)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            .background(
                Woozu.primary.opacity(0.88),
                in: RoundedRectangle(cornerRadius: 14, style: .continuous)
            )

            ForEach(items) { item in
                furnitureRow(item)
            }
        }
    }

    private func furnitureRow(_ item: FurnitureCabinetItem) -> some View {
        HStack(alignment: .top, spacing: 12) {
            furnitureThumbnail(item)

            VStack(alignment: .leading, spacing: 5) {
                Text(item.displayName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Woozu.surfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)
                Text(item.dimensionText)
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(Woozu.secondarySoft)
                    .fixedSize(horizontal: false, vertical: true)
                Label(
                    item.hasMesh ? "실물 메시 있음" : "메시 없음",
                    systemImage: item.hasMesh ? "checkmark.circle.fill" : "circle.dashed"
                )
                .font(.caption2.weight(.medium))
                .foregroundStyle(item.hasMesh ? Woozu.surfaceMuted : Woozu.secondarySoft)
            }

            Spacer(minLength: 8)

            if uploadingThumbnailID == item.id {
                ProgressView()
                    .tint(Woozu.secondarySoft)
                    .frame(width: 44, height: 44)
                    .accessibilityLabel("썸네일 업로드 중")
            } else {
                Button {
                    thumbnailTarget = item
                    showsThumbnailCamera = true
                } label: {
                    Image(systemName: "camera")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Woozu.secondarySoft)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(deletingTargetID != nil || isRefreshing || uploadingThumbnailID != nil || renamingTargetID != nil)
                .accessibilityLabel("\(item.displayName) 썸네일 촬영")
            }

            if renamingTargetID == item.id {
                ProgressView()
                    .tint(Woozu.secondarySoft)
                    .frame(width: 44, height: 44)
                    .accessibilityLabel("이름 저장 중")
            } else {
                Button {
                    renameDraft = item.displayName
                    renameTarget = item
                } label: {
                    Image(systemName: "pencil")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Woozu.secondarySoft)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(deletingTargetID != nil || isRefreshing || uploadingThumbnailID != nil || renamingTargetID != nil)
                .accessibilityLabel("\(item.displayName) 이름 수정")
            }

            if deletingTargetID == FurnitureDeletionTarget.item(item).id {
                ProgressView()
                    .tint(Woozu.secondarySoft)
                    .frame(width: 44, height: 44)
                    .accessibilityLabel("삭제 중")
            } else {
                Button(role: .destructive) {
                    pendingDeletion = .item(item)
                } label: {
                    Image(systemName: "trash")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Woozu.accent)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(deletingTargetID != nil || isRefreshing)
                .accessibilityLabel("\(item.displayName) 삭제")
            }
        }
        .padding(12)
        .background(
            Woozu.primary.opacity(0.72),
            in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Woozu.secondary.opacity(0.25), lineWidth: 1)
        }
    }

    /// 좌측 아이콘 — 썸네일이 있으면 사진을, 없으면 메시 유무에 따른 큐브 아이콘을 보여준다.
    @ViewBuilder
    private func furnitureThumbnail(_ item: FurnitureCabinetItem) -> some View {
        if let thumbnailUrl = item.thumbnailUrl, let url = URL(string: thumbnailUrl) {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image
                        .resizable()
                        .scaledToFill()
                } else {
                    Image(systemName: item.hasMesh ? "cube.fill" : "cube")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(item.hasMesh ? Woozu.surfaceMuted : Woozu.secondarySoft)
                }
            }
            .frame(width: 34, height: 34)
            .background(Woozu.secondary.opacity(0.24))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .accessibilityHidden(true)
        } else {
            Image(systemName: item.hasMesh ? "cube.fill" : "cube")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(item.hasMesh ? Woozu.surfaceMuted : Woozu.secondarySoft)
                .frame(width: 34, height: 34)
                .background(Woozu.secondary.opacity(0.24), in: Circle())
                .accessibilityHidden(true)
        }
    }

    private var isLoading: Bool {
        if isRefreshing {
            return true
        }
        if case .loading = loadState {
            return true
        }
        return false
    }

    private var deletionConfirmationIsPresented: Binding<Bool> {
        Binding(
            get: { pendingDeletion != nil },
            set: { isPresented in
                if !isPresented {
                    pendingDeletion = nil
                }
            }
        )
    }

    private var deletionErrorIsPresented: Binding<Bool> {
        Binding(
            get: { deletionErrorMessage != nil },
            set: { isPresented in
                if !isPresented {
                    deletionErrorMessage = nil
                }
            }
        )
    }

    private var thumbnailErrorIsPresented: Binding<Bool> {
        Binding(
            get: { thumbnailErrorMessage != nil },
            set: { isPresented in
                if !isPresented {
                    thumbnailErrorMessage = nil
                }
            }
        )
    }

    private var renameDialogIsPresented: Binding<Bool> {
        Binding(
            get: { renameTarget != nil },
            set: { isPresented in
                if !isPresented {
                    renameTarget = nil
                }
            }
        )
    }

    private var renameErrorIsPresented: Binding<Bool> {
        Binding(
            get: { renameErrorMessage != nil },
            set: { isPresented in
                if !isPresented {
                    renameErrorMessage = nil
                }
            }
        )
    }

    /// 기존 가구 항목에 썸네일을 붙인다 — USDZ 접수와 무관한 부가 기능이라 실패해도 목록 자체는
    /// 그대로 두고 안내만 띄운다. 성공하면 서버가 채운 thumbnailUrl을 보려고 목록을 새로고침한다.
    @MainActor
    private func uploadThumbnail(_ image: UIImage?, for target: FurnitureCabinetItem) async {
        guard let image else { return }
        guard let token = account.accessToken else {
            thumbnailErrorMessage = FurnitureCabinetAPIError.sessionExpired.localizedDescription
            return
        }
        uploadingThumbnailID = target.id
        defer { uploadingThumbnailID = nil }
        do {
            _ = try await TenantFurnitureThumbnailUploader.upload(
                furnitureId: target.id,
                image: image,
                baseURLString: account.baseURLString,
                token: token
            )
            await loadFurniture(showLoading: false)
        } catch {
            thumbnailErrorMessage = error.localizedDescription
        }
    }

    /// alert의 "확인" 버튼 액션 — 빈 입력이거나 기존 이름과 같으면 요청 자체를 생략한다.
    private func confirmRename() {
        guard let target = renameTarget else { return }
        renameTarget = nil
        let trimmed = renameDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != target.displayName else { return }
        Task {
            await rename(target, to: trimmed)
        }
    }

    /// 기존 가구의 이름(label)만 고친다 — 재스캔 없이 `PATCH tenant-furniture/{id}`로 label을
    /// 갱신한다. 성공하면 목록을 새로고침해 반영한다.
    @MainActor
    private func rename(_ target: FurnitureCabinetItem, to label: String) async {
        guard let token = account.accessToken else {
            renameErrorMessage = FurnitureCabinetAPIError.sessionExpired.localizedDescription
            return
        }
        renamingTargetID = target.id
        defer { renamingTargetID = nil }
        do {
            _ = try await TenantFurnitureRenamer.rename(
                furnitureId: target.id,
                label: label,
                baseURLString: account.baseURLString,
                token: token
            )
            await loadFurniture(showLoading: false)
        } catch {
            renameErrorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func loadFurniture(showLoading: Bool) async {
        guard let token = account.accessToken else {
            activeLoadID = nil
            isRefreshing = false
            return
        }
        guard let url = account.endpoint("/api/tenant-furniture") else {
            activeLoadID = nil
            isRefreshing = false
            loadState = .failure(FurnitureCabinetAPIError.badBaseURL.localizedDescription)
            return
        }

        let loadID = UUID()
        activeLoadID = loadID
        if showLoading {
            loadState = .loading
        } else {
            isRefreshing = true
        }
        defer {
            if activeLoadID == loadID {
                activeLoadID = nil
                isRefreshing = false
            }
        }

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

            let (data, response) = try await URLSession.shared.data(for: request)
            guard activeLoadID == loadID else {
                return
            }
            try validate(response: response, action: "가구 목록 조회")

            do {
                let items = try JSONDecoder().decode([FurnitureCabinetItem].self, from: data)
                loadState = .loaded(items)
            } catch {
                throw FurnitureCabinetAPIError.invalidFurnitureResponse
            }
        } catch {
            guard activeLoadID == loadID else {
                return
            }
            loadState = .failure(error.localizedDescription)
        }
    }

    @MainActor
    private func deleteFurniture(_ target: FurnitureDeletionTarget) async {
        guard let token = account.accessToken else {
            deletionErrorMessage = FurnitureCabinetAPIError.sessionExpired.localizedDescription
            return
        }
        guard let encodedID = target.rawID.addingPercentEncoding(withAllowedCharacters: Self.pathSegmentAllowed),
              let url = account.endpoint(target.endpointPrefix + encodedID) else {
            deletionErrorMessage = FurnitureCabinetAPIError.badBaseURL.localizedDescription
            return
        }

        deletingTargetID = target.id
        activeLoadID = nil
        isRefreshing = false
        defer {
            deletingTargetID = nil
        }

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "DELETE"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

            let (_, response) = try await URLSession.shared.data(for: request)
            try validate(response: response, action: "가구 삭제")
            await loadFurniture(showLoading: false)
        } catch {
            deletionErrorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func validate(response: URLResponse, action: String) throws {
        guard let http = response as? HTTPURLResponse else {
            throw FurnitureCabinetAPIError.invalidServerResponse
        }
        if http.statusCode == 401 {
            account.invalidateSession()
            throw FurnitureCabinetAPIError.sessionExpired
        }
        if http.statusCode == 403 {
            throw FurnitureCabinetAPIError.tenantPermissionRequired
        }
        guard (200 ..< 300).contains(http.statusCode) else {
            throw FurnitureCabinetAPIError.requestFailed(action: action, status: http.statusCode)
        }
    }

    private static let pathSegmentAllowed = CharacterSet(
        charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~"
    )
}

private enum FurnitureCabinetLoadState {
    case loading
    case loaded([FurnitureCabinetItem])
    case failure(String)
}

private struct FurnitureCabinetItem: Decodable, Identifiable, Equatable {
    let id: String
    let category: String
    let label: String?
    let sizeMm: FurnitureCabinetSizeMm
    let meshUrl: String?
    let thumbnailUrl: String?
    let importBatchId: String?
    let createdAt: String?

    var displayName: String {
        if let trimmedLabel = label?.trimmingCharacters(in: .whitespacesAndNewlines),
           !trimmedLabel.isEmpty {
            return trimmedLabel
        }
        return category
    }

    var hasMesh: Bool {
        meshUrl != nil
    }

    var normalizedImportBatchID: String? {
        let trimmedID = importBatchId?.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmedID?.isEmpty == false ? trimmedID : nil
    }

    var dimensionText: String {
        // API의 sizeMm은 밀리미터(mm)다. 화면에서는 10으로 나눠 센티미터(cm)로 표시한다.
        "가로 \(Self.centimeterText(sizeMm.width)) × 깊이 \(Self.centimeterText(sizeMm.depth)) × 높이 \(Self.centimeterText(sizeMm.height)) cm"
    }

    var createdDate: Date? {
        guard let createdAt, !createdAt.isEmpty else {
            return nil
        }

        let fractionalFormatter = ISO8601DateFormatter()
        fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractionalFormatter.date(from: createdAt) {
            return date
        }
        return ISO8601DateFormatter().date(from: createdAt)
    }

    private static func centimeterText(_ millimeters: Double) -> String {
        let centimeters = millimeters / 10.0
        if abs(centimeters - centimeters.rounded()) < 0.05 {
            return String(Int(centimeters.rounded()))
        }
        return String(format: "%.1f", centimeters)
    }
}

private struct FurnitureCabinetSizeMm: Decodable, Equatable {
    let width: Double
    let depth: Double
    let height: Double
}

private struct FurnitureScanBatch: Identifiable {
    let id: String
    let items: [FurnitureCabinetItem]
    let totalItemCount: Int
    let meshItemCount: Int
    let createdDate: Date?

    var headerDetail: String {
        var parts: [String] = []
        if let createdDate {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "ko_KR")
            formatter.dateFormat = "yyyy. M. d."
            parts.append(formatter.string(from: createdDate))
        }
        parts.append("감지 항목 \(items.count)개")
        if totalItemCount != items.count {
            parts.append("배치 전체 \(totalItemCount)개")
        }
        return parts.joined(separator: " · ")
    }
}

private struct FurnitureCabinetSections {
    let myFurniture: [FurnitureCabinetItem]
    let batches: [FurnitureScanBatch]
    let unbatchedItems: [FurnitureCabinetItem]

    init(items: [FurnitureCabinetItem]) {
        myFurniture = items.filter(\.hasMesh)

        let detectedItems = items.filter { !$0.hasMesh }
        var batchOrder: [String] = []
        var detectedByBatch: [String: [FurnitureCabinetItem]] = [:]
        var allItemsByBatch: [String: [FurnitureCabinetItem]] = [:]
        var unbatched: [FurnitureCabinetItem] = []

        for item in items {
            if let batchID = item.normalizedImportBatchID {
                allItemsByBatch[batchID, default: []].append(item)
            }
        }

        for item in detectedItems {
            guard let batchID = item.normalizedImportBatchID else {
                unbatched.append(item)
                continue
            }
            if detectedByBatch[batchID] == nil {
                batchOrder.append(batchID)
            }
            detectedByBatch[batchID, default: []].append(item)
        }

        batches = batchOrder.compactMap { batchID in
            guard let detected = detectedByBatch[batchID] else {
                return nil
            }
            let allBatchItems = allItemsByBatch[batchID] ?? detected
            return FurnitureScanBatch(
                id: batchID,
                items: detected,
                totalItemCount: allBatchItems.count,
                meshItemCount: allBatchItems.filter(\.hasMesh).count,
                createdDate: allBatchItems.compactMap(\.createdDate).max()
            )
        }
        unbatchedItems = unbatched
    }

    var detectedCount: Int {
        batches.reduce(unbatchedItems.count) { count, batch in
            count + batch.items.count
        }
    }
}

private enum FurnitureDeletionTarget {
    case item(FurnitureCabinetItem)
    case batch(FurnitureScanBatch)

    var id: String {
        switch self {
        case .item(let item):
            return "item:\(item.id)"
        case .batch(let batch):
            return "batch:\(batch.id)"
        }
    }

    var rawID: String {
        switch self {
        case .item(let item):
            return item.id
        case .batch(let batch):
            return batch.id
        }
    }

    var endpointPrefix: String {
        switch self {
        case .item:
            return "/api/tenant-furniture/"
        case .batch:
            return "/api/tenant-furniture/batches/"
        }
    }

    var dialogTitle: String {
        switch self {
        case .item:
            return "가구를 삭제할까요?"
        case .batch:
            return "스캔 배치를 삭제할까요?"
        }
    }

    var actionTitle: String {
        switch self {
        case .item:
            return "가구 삭제"
        case .batch:
            return "배치 전체 삭제"
        }
    }

    var dialogMessage: String {
        switch self {
        case .item(let item):
            return "‘\(item.displayName)’을 삭제합니다. 이 작업은 되돌릴 수 없습니다."
        case .batch(let batch):
            let meshWarning = batch.meshItemCount > 0
                ? " 내 가구에 표시된 실물 메시 항목 \(batch.meshItemCount)개도 함께 삭제됩니다."
                : ""
            return "이 스캔 배치의 가구 \(batch.totalItemCount)개를 모두 삭제합니다.\(meshWarning) 이 작업은 되돌릴 수 없습니다."
        }
    }
}

private enum FurnitureCabinetAPIError: LocalizedError {
    case badBaseURL
    case invalidServerResponse
    case invalidFurnitureResponse
    case sessionExpired
    case tenantPermissionRequired
    case requestFailed(action: String, status: Int)

    var errorDescription: String? {
        switch self {
        case .badBaseURL:
            return "서버 주소 형식이 올바르지 않습니다. 설정에서 확인하세요."
        case .invalidServerResponse:
            return "서버 응답을 읽을 수 없습니다."
        case .invalidFurnitureResponse:
            return "서버의 가구 목록 응답 형식이 올바르지 않습니다."
        case .sessionExpired:
            return "로그인이 만료되었습니다. 설정에서 다시 로그인하세요."
        case .tenantPermissionRequired:
            return "임차인 계정에 가구함 접근 권한이 없습니다."
        case .requestFailed(let action, let status):
            return "\(action)에 실패했습니다. (HTTP \(status))"
        }
    }
}
