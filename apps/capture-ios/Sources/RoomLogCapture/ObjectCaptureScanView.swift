import Foundation
import RealityKit
import SwiftUI

/// 감지된 가구 1점을 정밀 스캔(Object Capture)해 실제 모습의 3D 모델로 바꾼다(C-2).
/// RoomScanView가 RoomPlan으로 만든 가구 항목을 "업그레이드"하는 흐름이다 — furnitureId를
/// 실어보내 서버가 기존 항목의 meshUrl을 채우게 한다(새 가구를 만드는 게 아니다).
///
/// 파이프라인: `ObjectCaptureSession`(가이드 촬영, 이미지) → `PhotogrammetrySession`(온디바이스
/// 재구성) → USDZ → `ObjectCaptureUploader`(presign → S3 PUT → complete).
/// **재구성은 온디바이스에서만 가능하다** — PhotogrammetrySession은 Apple 플랫폼 전용 API라
/// 우리 리눅스 GPU 박스로 보낼 수 없다(splat 파이프라인과 반대). 이미 정해진 설계.
@available(iOS 17.0, *)
struct ObjectCaptureScanView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var account: AccountStore
    @ObservedObject private var uploader = ObjectCaptureUploader.shared

    let furniture: TenantFurnitureSummary

    @State private var flow: Flow = .checkingSupport

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("정밀 스캔")
                .navigationBarTitleDisplayMode(.inline)
                .toolbarBackground(Woozu.primary900, for: .navigationBar)
                .toolbarBackground(.visible, for: .navigationBar)
                .toolbarColorScheme(.dark, for: .navigationBar)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button(closeButtonTitle) {
                            dismiss()
                        }
                        .disabled(flow.blocksDismissal)
                    }
                }
        }
        .tint(Woozu.secondarySoft)
        .interactiveDismissDisabled(flow.blocksDismissal)
        .onAppear(perform: evaluateEntry)
        .onChange(of: uploader.phase) { _, newPhase in
            syncUploadPhase(newPhase)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch flow {
        case .checkingSupport:
            ProgressView()
                .tint(Woozu.secondarySoft)

        case .unsupported(let message):
            brandedNotice(
                icon: "cube.transparent",
                title: "정밀 스캔 미지원",
                message: message
            )

        case .loginRequired:
            brandedNotice(
                icon: "person.crop.circle.badge.exclamationmark",
                title: "로그인이 필요합니다",
                message: "설정에서 임차인 계정으로 로그인한 뒤 정밀 스캔을 시작하세요."
            )

        case .capturing:
            ObjectCaptureCaptureScreen(
                onCompleted: startReconstruction,
                onFailed: { message in flow = .failed(message) }
            )

        case .reconstructing(let progress):
            statusView(
                message: "3D 모델 만드는 중… \(Int(progress * 100))%",
                detail: "기기에서 처리 중입니다. 화면을 켜둔 채 잠시 기다려 주세요.",
                progress: progress
            )

        case .uploading(let progress):
            statusView(message: uploadStatusText, detail: nil, progress: progress)

        case .succeeded:
            successView

        case .failed(let message):
            failureView(message: message)
        }
    }

    private var closeButtonTitle: String {
        if case .capturing = flow {
            return "취소"
        }
        return "닫기"
    }

    private func evaluateEntry() {
        guard case .checkingSupport = flow else { return }
        guard account.accessToken != nil else {
            flow = .loginRequired
            return
        }
        // 촬영(ObjectCaptureSession)과 재구성(PhotogrammetrySession) 둘 다 기기 지원 여부를
        // 각자 노출한다 — 이 화면을 쓰려면 둘 다 지원돼야 한다.
        guard ObjectCaptureSession.isSupported, PhotogrammetrySession.isSupported else {
            flow = .unsupported("정밀 스캔은 LiDAR가 탑재된 iPhone/iPad Pro에서만 사용할 수 있습니다.")
            return
        }
        flow = .capturing
    }

    // MARK: 재구성(온디바이스 PhotogrammetrySession)

    private func startReconstruction(imagesDirectory: URL) {
        flow = .reconstructing(0)
        Task {
            do {
                let usdzURL = try await Self.reconstruct(imagesDirectory: imagesDirectory) { progress in
                    Task { @MainActor in
                        if case .reconstructing = flow {
                            flow = .reconstructing(progress)
                        }
                    }
                }
                try? FileManager.default.removeItem(at: imagesDirectory)
                await MainActor.run { upload(usdzURL: usdzURL) }
            } catch {
                try? FileManager.default.removeItem(at: imagesDirectory)
                await MainActor.run {
                    flow = .failed("3D 변환 실패: \(error.localizedDescription)")
                }
            }
        }
    }

    /// 캡처된 이미지 폴더 → USDZ. `.reduced` 디테일 — 가구 1점을 매물 방 안에 넣어보는 용도로
    /// 충분하고, 온디바이스 처리 시간·업로드 용량을 줄인다(디테일을 올리고 싶으면 나중에 옵션화).
    private static func reconstruct(
        imagesDirectory: URL,
        onProgress: @escaping (Double) -> Void
    ) async throws -> URL {
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("object-capture-\(UUID().uuidString).usdz")

        let session = try PhotogrammetrySession(
            input: imagesDirectory,
            configuration: PhotogrammetrySession.Configuration()
        )
        let request = PhotogrammetrySession.Request.modelFile(url: outputURL, detail: .reduced)
        try session.process(requests: [request])

        for try await output in session.outputs {
            switch output {
            case .requestProgress(_, let fractionComplete):
                onProgress(fractionComplete)
            case .requestComplete(_, let result):
                if case .modelFile(let url) = result {
                    return url
                }
            case .requestError(_, let error):
                throw error
            case .processingCancelled:
                throw CancellationError()
            default:
                break
            }
        }
        return outputURL
    }

    // MARK: 업로드

    private func upload(usdzURL: URL) {
        guard let token = account.accessToken else {
            flow = .failed("로그인이 만료되었습니다. 설정에서 다시 로그인하세요.")
            return
        }
        flow = .uploading(0)
        uploader.start(context: ObjectCaptureUploadContext(
            usdzURL: usdzURL,
            furnitureId: furniture.id,
            category: furniture.category,
            label: furniture.label,
            baseURLString: account.baseURLString,
            token: token
        ))
    }

    private func syncUploadPhase(_ phase: ObjectCaptureUploadPhase?) {
        switch phase {
        case .presigning, .completing:
            if case .uploading = flow { flow = .uploading(0) }
        case .uploading(let progress):
            flow = .uploading(progress)
        case .succeeded:
            flow = .succeeded
        case .failed(let message):
            flow = .failed(message)
        case nil:
            break
        }
    }

    private var uploadStatusText: String {
        switch uploader.phase {
        case .presigning: return "업로드 준비 중…"
        case .uploading(let progress): return "업로드 중… \(Int(progress * 100))%"
        case .completing: return "접수 처리 중…"
        default: return "업로드 중…"
        }
    }

    // MARK: 상태 화면

    private func brandedNotice(icon: String, title: String, message: String) -> some View {
        ZStack {
            Woozu.night.ignoresSafeArea()
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
                    .padding(.horizontal, 32)
            }
        }
    }

    private func statusView(message: String, detail: String?, progress: Double) -> some View {
        ZStack {
            Woozu.night.ignoresSafeArea()
            VStack(spacing: 16) {
                ProgressView(value: progress)
                    .tint(Woozu.secondarySoft)
                    .frame(width: 200)
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(Woozu.secondarySoft)
                if let detail {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(Woozu.secondarySoft.opacity(0.8))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }
            }
        }
    }

    private var successView: some View {
        ZStack {
            Woozu.night.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(Woozu.secondarySoft)
                Text("정밀 스캔 접수됨")
                    .font(.system(.title3, design: .serif))
                    .foregroundStyle(Woozu.surfaceMuted)
                Text("3D 변환이 진행 중입니다. 완료되면 이 가구가 실제 모습으로 보여요.")
                    .font(.subheadline)
                    .foregroundStyle(Woozu.secondarySoft)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                Button("닫기") { dismiss() }
                    .buttonStyle(WoozuPrimaryButtonStyle())
                    .padding(.horizontal, 40)
            }
        }
    }

    private func failureView(message: String) -> some View {
        ZStack {
            Woozu.night.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(Woozu.accent)
                Text("정밀 스캔 실패")
                    .font(.headline)
                    .foregroundStyle(Woozu.surfaceMuted)
                Text(message)
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Woozu.secondarySoft)
                    .padding(.horizontal, 32)
                Button("다시 촬영") { flow = .capturing }
                    .buttonStyle(WoozuPrimaryButtonStyle())
                    .padding(.horizontal, 40)
            }
        }
    }
}

@available(iOS 17.0, *)
private enum Flow: Equatable {
    case checkingSupport
    case unsupported(String)
    case loginRequired
    case capturing
    case reconstructing(Double)
    case uploading(Double)
    case succeeded
    case failed(String)

    var blocksDismissal: Bool {
        switch self {
        case .reconstructing, .uploading:
            return true
        default:
            return false
        }
    }
}

// MARK: - 촬영 화면(ObjectCaptureSession + Apple ObjectCaptureView)

/// Apple의 가이드 촬영 세션을 감싼 화면. 상태(ready → detecting → capturing → finishing →
/// completed/failed)를 그대로 따라가며, 각 단계 전환은 사용자가 버튼을 눌러 명시적으로 트리거한다
/// (RoomScanView의 "스캔 완료" 버튼과 같은 패턴 — 자동으로 다음 단계로 넘기지 않는다).
@available(iOS 17.0, *)
private struct ObjectCaptureCaptureScreen: View {
    // ObjectCaptureSession은 Combine의 ObservableObject가 아니라 iOS 17 Observation 프레임워크의
    // @Observable 클래스다 → @StateObject(Combine용)가 아닌 @State로 보유해야 SwiftUI가 추적한다.
    @State private var session = ObjectCaptureSession()
    @State private var imagesDirectory: URL?

    let onCompleted: (URL) -> Void
    let onFailed: (String) -> Void

    /// 카메라 뷰를 띄우는 단계들. 이 조건이 바뀌지 않는 한 아래 ObjectCaptureView 인스턴스는 유지된다.
    private var showsCameraView: Bool {
        switch session.state {
        case .ready, .detecting, .capturing: return true
        default: return false
        }
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            // ⚠️ ObjectCaptureView는 switch **밖에 하나만** 둔다.
            // 상태 분기마다 각각 만들면 .ready→.detecting 전환에서 SwiftUI가 뷰를 파괴·재생성하고,
            // 그 순간 세션이 paused로 떨어져 촬영 시작이 통째로 무시된다:
            //   "startCapturing() called in state paused != .detecting in object mode. Dropping the call..."
            //   (2026-07-20 실기 콘솔 로그로 확인)
            if showsCameraView {
                RealityKit.ObjectCaptureView(session: session)
                    .ignoresSafeArea()
            } else {
                Woozu.night.ignoresSafeArea()
            }

            // 아래 분기는 **오버레이(안내 카드)만** 담당한다 — 카메라 뷰를 다시 만들지 않는다.
            switch session.state {
            case .initializing:
                ProgressView().tint(Woozu.secondarySoft)

            // startDetecting()은 세션이 .ready가 된 뒤에 호출해야 먹는다 — start() 직후에 부르면
            // 아직 .initializing이라 무시된다(실기 확인 2026-07-19).
            case .ready:
                instructionCard(
                    title: "가구를 화면 가운데 두세요",
                    message: "준비되면 물체 인식을 시작합니다.",
                    actionTitle: "물체 인식 시작",
                    action: { session.startDetecting() }
                )
                .onAppear { session.startDetecting() }

            case .detecting:
                instructionCard(
                    title: "가구를 사각형 안에 맞추세요",
                    message: "가구 전체가 프레임 안에 들어오면 촬영을 시작하세요.",
                    actionTitle: "촬영 시작",
                    action: { session.startCapturing() }
                )

            case .capturing:
                instructionCard(
                    title: "천천히 한 바퀴 돌며 촬영 중",
                    message: "촬영 \(session.numberOfShotsTaken)장 — 여러 각도에서 가구를 비춰 주세요.",
                    actionTitle: session.userCompletedScanPass ? "스캔 완료" : nil,
                    action: { session.finish() }
                )

            case .finishing:
                VStack(spacing: 12) {
                    ProgressView().tint(Woozu.secondarySoft)
                    Text("마무리 중…")
                        .font(.subheadline)
                        .foregroundStyle(Woozu.secondarySoft)
                }

            case .completed:
                Color.clear.onAppear { handOff() }

            case .failed(let error):
                Color.clear.onAppear { onFailed(error.localizedDescription) }

            @unknown default:
                ProgressView().tint(Woozu.secondarySoft)
            }
        }
        .onAppear(perform: start)
        .onDisappear {
            // 사용자가 상단 "취소"로 시트를 닫거나(dismiss) 화면이 다른 이유로 사라질 때 세션을
            // 정리한다. completed/failed 이후 재호출돼도 ObjectCaptureSession 문서상 안전한
            // no-op이라고 가정한다(기기에서 검증 필요 — 아래 미검증 가정 참고).
            session.cancel()
        }
    }

    private func start() {
        guard imagesDirectory == nil else { return }
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("object-capture-\(UUID().uuidString)", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        } catch {
            onFailed("캡처 폴더를 만들지 못했습니다: \(error.localizedDescription)")
            return
        }
        imagesDirectory = directory

        // start(imagesDirectory:)는 Bool이 아니라 Void를 반환한다 — 시작 실패는 반환값이 아니라
        // 세션 상태(.failed)로 전달되므로, 아래 body의 switch가 그 경로를 이미 처리한다.
        // startDetecting()은 여기서 부르지 않는다 — 이 시점 세션은 아직 .initializing이라 무시된다.
        // .ready 케이스의 onAppear(또는 사용자 버튼)에서 호출한다.
        session.start(imagesDirectory: directory)
    }

    private func handOff() {
        guard let imagesDirectory else { return }
        onCompleted(imagesDirectory)
    }

    private func instructionCard(
        title: String,
        message: String,
        actionTitle: String?,
        action: @escaping () -> Void
    ) -> some View {
        VStack(spacing: 12) {
            Text(title)
                .font(.system(.title3, design: .serif))
                .foregroundStyle(Woozu.surfaceMuted)
            Text(message)
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(Woozu.secondarySoft)

            if let actionTitle {
                Button(actionTitle, action: action)
                    .buttonStyle(WoozuPrimaryButtonStyle())
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Woozu.night)
                .opacity(0.94)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(Woozu.secondary.opacity(0.35), lineWidth: 1)
        )
        .padding(16)
    }
}
