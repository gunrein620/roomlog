import Foundation
import RoomPlan
import SwiftUI

struct RoomScanView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var account: AccountStore

    @State private var captureController = RoomScanSessionController()
    @State private var capturedRoom: CapturedRoom?
    @State private var phase: RoomScanPhase = .scanning
    /// "정밀 스캔"으로 넘어갈 대상(nil이 아니면 ObjectCaptureScanView를 시트로 띄운다).
    @State private var objectCaptureTarget: TenantFurnitureSummary?
    /// 이번 세션에서 실제로 정밀 스캔(Object Capture 업로드)까지 마친 항목 id.
    /// 화면을 나갈 때 여기 없는 RoomPlan 감지 항목은 서버에서 지운다(discardUncaptured).
    @State private var capturedFurnitureIds: Set<String> = []

    var body: some View {
        NavigationStack {
            Group {
                if !RoomCaptureSession.isSupported {
                    unsupportedView
                } else if account.accessToken == nil {
                    loginRequiredView
                } else {
                    captureView
                }
            }
            .navigationTitle("내 가구 스캔")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Woozu.primary900, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(closeButtonTitle) {
                        captureController.cancel()
                        dismiss()
                    }
                    .disabled(phase.blocksDismissal)
                }
            }
        }
        .tint(Woozu.secondarySoft)
        .interactiveDismissDisabled(phase.blocksDismissal)
        .onDisappear {
            captureController.cancel()
            discardUncapturedFurniture()
        }
        .sheet(item: $objectCaptureTarget) { furniture in
            // 프로젝트 deploymentTarget이 이미 iOS 17이라(project.yml) 별도 #available 분기 불필요.
            ObjectCaptureScanView(furniture: furniture, onCaptured: {
                capturedFurnitureIds.insert(furniture.id)
            })
            .environmentObject(account)
        }
    }

    /// success 화면에 뜨는 가구 1행 — "정밀 스캔"으로 Object Capture 플로우를 연다.
    private func furnitureRow(_ item: TenantFurnitureSummary) -> some View {
        HStack {
            Text((item.label?.isEmpty == false ? item.label : nil) ?? item.category)
                .font(.subheadline)
                .foregroundStyle(Woozu.surfaceMuted)
            Spacer()
            Button("정밀 스캔") {
                objectCaptureTarget = item
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(Woozu.secondarySoft)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Woozu.night.opacity(0.5), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var captureView: some View {
        ZStack(alignment: .bottom) {
            RoomCaptureRepresentable(
                controller: captureController,
                onResult: handleCapturedRoom,
                onError: handleCaptureError
            )
            .ignoresSafeArea(edges: .bottom)
            .onAppear {
                captureController.start()
            }

            VStack(spacing: 12) {
                switch phase {
                case .scanning:
                    Text("방을 천천히 둘러보세요")
                        .font(.system(.title3, design: .serif))
                        .foregroundStyle(Woozu.surfaceMuted)

                    Text("가구가 화면에 표시되도록 구석구석 비춰 주세요.")
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(Woozu.secondarySoft)

                    Button("스캔 완료") {
                        phase = .processing
                        captureController.finish()
                    }
                    .buttonStyle(WoozuPrimaryButtonStyle())

                case .processing:
                    ProgressView()
                        .tint(Woozu.secondarySoft)
                    Text("스캔 결과 처리 중…")
                        .font(.subheadline)
                        .foregroundStyle(Woozu.secondarySoft)

                case .uploading:
                    ProgressView()
                        .tint(Woozu.secondarySoft)
                    Text("감지된 가구 등록 중…")
                        .font(.subheadline)
                        .foregroundStyle(Woozu.secondarySoft)

                case .success(let items):
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 32))
                        .foregroundStyle(Woozu.secondarySoft)
                    Text("가구 \(items.count)개 등록됨")
                        .font(.system(.title3, design: .serif))
                        .foregroundStyle(Woozu.surfaceMuted)
                    Text("정밀하게 스캔하면 실제 모습으로 바꿀 수 있어요.")
                        .font(.subheadline)
                        .foregroundStyle(Woozu.secondarySoft)

                    if !items.isEmpty {
                        VStack(spacing: 8) {
                            ForEach(items) { item in
                                furnitureRow(item)
                            }
                        }
                        .padding(.top, 4)
                    }

                    Button("완료") {
                        dismiss()
                    }
                    .buttonStyle(WoozuPrimaryButtonStyle())

                case .failure(let message):
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 28))
                        .foregroundStyle(Woozu.accent)
                    Text("가구 등록 실패")
                        .font(.headline)
                        .foregroundStyle(Woozu.surfaceMuted)
                    Text(message)
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(Woozu.secondarySoft)

                    if let capturedRoom {
                        Button("다시 등록") {
                            upload(capturedRoom)
                        }
                        .buttonStyle(WoozuPrimaryButtonStyle())
                    }
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
            .accessibilityElement(children: .contain)
        }
    }

    private var unsupportedView: some View {
        brandedNotice(
            icon: "viewfinder",
            title: "RoomPlan 미지원",
            message: "가구 스캔은 LiDAR가 탑재된 iPhone Pro 또는 iPad Pro에서 사용할 수 있습니다."
        )
    }

    private var loginRequiredView: some View {
        brandedNotice(
            icon: "person.crop.circle.badge.exclamationmark",
            title: "로그인이 필요합니다",
            message: "설정에서 임차인 계정으로 로그인한 뒤 가구 스캔을 시작하세요."
        )
    }

    /// 밤하늘 그라데이션 위의 안내 화면 — 미지원 기기 / 로그인 필요 안내 공용.
    private func brandedNotice(icon: String, title: String, message: String) -> some View {
        ZStack {
            Woozu.night
                .ignoresSafeArea()

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

    private var closeButtonTitle: String {
        if case .scanning = phase {
            return "취소"
        }
        return "닫기"
    }

    private func handleCapturedRoom(_ room: CapturedRoom) {
        capturedRoom = room
        upload(room)
    }

    private func handleCaptureError(_ error: Error) {
        phase = .failure("스캔 결과를 처리하지 못했습니다: \(error.localizedDescription)")
    }

    private func upload(_ room: CapturedRoom) {
        guard let token = account.accessToken else {
            phase = .failure("로그인이 만료되었습니다. 설정에서 다시 로그인하세요.")
            return
        }
        guard let url = account.endpoint("/api/tenant-furniture/roomplan-import") else {
            phase = .failure("서버 주소 형식이 올바르지 않습니다. 설정에서 확인하세요.")
            return
        }

        let objects = room.objects.map { object in
            let dimensions = object.dimensions
            return RoomPlanImportObject(
                category: Self.categoryName(for: object.category),
                dimensions: RoomPlanImportDimensions(
                    // RoomPlan의 로컬 x/y/z bounding-box 축은 width/height/length(미터)다.
                    // 서버는 바닥 footprint(w/d)와 수직 높이(h)를 쓰므로 x/z/y 순서로 보낸다.
                    w: Double(dimensions.x),
                    d: Double(dimensions.z),
                    h: Double(dimensions.y)
                )
            )
        }
        let payload = RoomPlanImportPayload(
            source: "roomplan",
            capturedAt: ISO8601DateFormatter().string(from: Date()),
            objects: objects
        )

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(payload)
            phase = .uploading

            URLSession.shared.dataTask(with: request) { data, response, error in
                DispatchQueue.main.async {
                    if let error {
                        self.phase = .failure(error.localizedDescription)
                        return
                    }
                    guard let http = response as? HTTPURLResponse else {
                        self.phase = .failure("서버 응답을 읽을 수 없습니다.")
                        return
                    }
                    if http.statusCode == 401 || http.statusCode == 403 {
                        self.phase = .failure("로그인이 만료되었거나 가구 등록 권한이 없습니다.")
                        return
                    }
                    guard (200 ..< 300).contains(http.statusCode) else {
                        self.phase = .failure("가구 등록 실패 (HTTP \(http.statusCode))")
                        return
                    }
                    // 응답은 TenantFurniture[] 전체지만 여기선 정밀 스캔(Object Capture) 진입에
                    // 필요한 id/category/label만 뽑아 쓴다.
                    guard let data, let created = try? JSONDecoder().decode([TenantFurnitureSummary].self, from: data) else {
                        self.phase = .success([])
                        return
                    }
                    self.phase = .success(created)
                }
            }.resume()
        } catch {
            phase = .failure("요청 본문을 만들지 못했습니다: \(error.localizedDescription)")
        }
    }

    /// 화면을 나갈 때(완료 버튼·상단 닫기·스와이프 전부 여기로 모인다 — onDisappear) RoomPlan이
    /// 감지했지만 정밀 스캔(Object Capture 업로드)까지 이어지지 않은 항목을 서버에서 지운다.
    /// 안 그러면 스캔 한 번마다 감지된 물체 수만큼 meshUrl 없는 회색 박스가 영구히 쌓인다.
    /// 응답을 기다리지 않는 fire-and-forget — 실패해도 다음 스캔에서 다시 시도되는 게 아니라
    /// 그냥 남아 있을 뿐이라 사용자 흐름을 막을 이유가 없다.
    private func discardUncapturedFurniture() {
        guard case .success(let items) = phase else { return }
        let uncaptured = items.filter { !capturedFurnitureIds.contains($0.id) }
        guard !uncaptured.isEmpty, let token = account.accessToken else { return }

        for item in uncaptured {
            guard let url = account.endpoint("/api/tenant-furniture/\(item.id)") else { continue }
            var request = URLRequest(url: url)
            request.httpMethod = "DELETE"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            URLSession.shared.dataTask(with: request).resume()
        }
    }

    private static func categoryName(for category: CapturedRoom.Object.Category) -> String {
        switch category {
        case .bed: return "bed"
        case .sofa: return "sofa"
        case .chair: return "chair"
        case .table: return "table"
        case .storage: return "storage"
        case .refrigerator: return "refrigerator"
        case .washerDryer: return "washerDryer"
        case .stove: return "stove"
        case .oven: return "oven"
        case .dishwasher: return "dishwasher"
        case .television: return "television"
        case .sink: return "sink"
        case .toilet: return "toilet"
        case .bathtub: return "bathtub"
        case .fireplace: return "fireplace"
        case .stairs: return "stairs"
        default: return "unknown"
        }
    }
}

/// 우주(WOOZU) 브랜드 토큰 — woo-zu-design-system tokens.css의 hex를 sRGB 0–1로 변환한 값.
/// 새 파일 추가 없이 인라인으로 둔 팔레트. ObjectCaptureScanView.swift도 재사용하므로 internal.
enum Woozu {
    static let primary = Color(red: 0.125, green: 0.094, blue: 0.290)       // #20184A
    static let primary900 = Color(red: 0.090, green: 0.075, blue: 0.227)    // #17133A
    static let secondary = Color(red: 0.545, green: 0.514, blue: 0.753)     // #8B83C0
    static let secondarySoft = Color(red: 0.796, green: 0.749, blue: 0.961) // #CBBFF5
    static let surfaceMuted = Color(red: 0.937, green: 0.925, blue: 0.980)  // #EFECFA
    static let accent = Color(red: 0.949, green: 0.537, blue: 0.616)        // #F2899D
    static let accentDeep = Color(red: 0.761, green: 0.325, blue: 0.439)    // #C25370
    static let onAccent = Color(red: 0.043, green: 0.043, blue: 0.071)      // #0B0B12
    static let nightStart = Color(red: 0.106, green: 0.090, blue: 0.275)    // #1B1746
    static let nightEnd = Color(red: 0.165, green: 0.122, blue: 0.322)      // #2A1F52

    /// --gradient-night (160deg #1B1746 → #2A1F52)
    static let night = LinearGradient(
        colors: [nightStart, nightEnd],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

/// 코랄 키 액션 버튼 — 화면당 하나의 핵심 CTA에만 사용. ObjectCaptureScanView.swift도 재사용.
struct WoozuPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Woozu.onAccent)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .background(
                configuration.isPressed ? Woozu.accentDeep : Woozu.accent,
                in: RoundedRectangle(cornerRadius: 16, style: .continuous)
            )
    }
}

private enum RoomScanPhase {
    case scanning
    case processing
    case uploading
    case success([TenantFurnitureSummary])
    case failure(String)

    var blocksDismissal: Bool {
        switch self {
        case .processing, .uploading:
            return true
        case .scanning, .success, .failure:
            return false
        }
    }
}

/// `POST tenant-furniture/roomplan-import` 응답(TenantFurniture[])에서 정밀 스캔(Object Capture)
/// 진입에 필요한 필드만 뽑아 디코드한다 — @roomlog/types TenantFurniture의 부분집합.
struct TenantFurnitureSummary: Decodable, Equatable, Identifiable {
    let id: String
    let category: String
    let label: String?
}

private struct RoomPlanImportPayload: Encodable {
    let source: String
    let capturedAt: String
    let objects: [RoomPlanImportObject]
}

private struct RoomPlanImportObject: Encodable {
    let category: String
    let dimensions: RoomPlanImportDimensions
}

private struct RoomPlanImportDimensions: Encodable {
    let w: Double
    let d: Double
    let h: Double
}

private struct RoomCaptureRepresentable: UIViewRepresentable {
    let controller: RoomScanSessionController
    let onResult: (CapturedRoom) -> Void
    let onError: (Error) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(controller: controller, onResult: onResult, onError: onError)
    }

    func makeUIView(context: Context) -> RoomCaptureView {
        let captureView = RoomCaptureView(frame: .zero)
        captureView.delegate = context.coordinator
        controller.attach(to: captureView)
        return captureView
    }

    func updateUIView(_ uiView: RoomCaptureView, context: Context) {
        context.coordinator.onResult = onResult
        context.coordinator.onError = onError
    }

    static func dismantleUIView(_ uiView: RoomCaptureView, coordinator: Coordinator) {
        coordinator.controller.detach()
        uiView.delegate = nil
    }

    @objc(RoomLogRoomCaptureCoordinator)
    final class Coordinator: NSObject, RoomCaptureViewDelegate {
        let controller: RoomScanSessionController
        var onResult: (CapturedRoom) -> Void
        var onError: (Error) -> Void

        init(
            controller: RoomScanSessionController,
            onResult: @escaping (CapturedRoom) -> Void,
            onError: @escaping (Error) -> Void
        ) {
            self.controller = controller
            self.onResult = onResult
            self.onError = onError
        }

        // RoomCaptureViewDelegate가 NSCoding을 상속하는 SDK 제약을 만족시키는 스텁.
        // 이 Coordinator는 실제로 아카이빙되지 않는다.
        func encode(with coder: NSCoder) {}

        required init?(coder: NSCoder) { nil }

        func captureView(
            shouldPresent roomDataForProcessing: CapturedRoomData,
            error: Error?
        ) -> Bool {
            guard let error else {
                return controller.acceptsResults
            }
            if controller.acceptsResults {
                DispatchQueue.main.async {
                    self.onError(error)
                }
            }
            return false
        }

        func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
            guard controller.acceptsResults else {
                return
            }
            DispatchQueue.main.async {
                if let error {
                    self.onError(error)
                } else {
                    self.onResult(processedResult)
                }
            }
        }
    }
}

private final class RoomScanSessionController {
    private var captureSession: RoomCaptureSession?
    private(set) var acceptsResults = true
    private var isRunning = false

    func attach(to captureView: RoomCaptureView) {
        captureSession = captureView.captureSession
        acceptsResults = true
    }

    func start() {
        guard RoomCaptureSession.isSupported,
              acceptsResults,
              !isRunning,
              let captureSession else {
            return
        }
        captureSession.run(configuration: RoomCaptureSession.Configuration())
        isRunning = true
    }

    func finish() {
        guard isRunning, let captureSession else {
            return
        }
        acceptsResults = true
        isRunning = false
        captureSession.stop()
    }

    func cancel() {
        acceptsResults = false
        if isRunning {
            isRunning = false
            captureSession?.stop()
        }
    }

    func detach() {
        cancel()
        captureSession = nil
    }
}
