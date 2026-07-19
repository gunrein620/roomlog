import Foundation

/// USDZ(Object Capture 산출물) 업로드 진행 단계.
enum ObjectCaptureUploadPhase: Equatable {
    case presigning
    case uploading(Double)   // 0.0 ~ 1.0 (bytesSent 기반)
    case completing
    case succeeded(TenantFurnitureSummary)
    case failed(String)
}

/// presign 재시도를 위해 시작 파라미터를 보관한다.
struct ObjectCaptureUploadContext {
    let usdzURL: URL
    /// 업그레이드 대상 기존 가구(RoomPlan이 만든 항목). 이 플로우는 항상 값을 채운다 —
    /// furnitureId 없이 새로 만드는 경로는 지금 화면에서 쓰지 않는다.
    let furnitureId: String?
    let category: String?
    let label: String?
    let baseURLString: String
    let token: String
}

private struct ObjectCapturePresignBody: Encodable {
    let furnitureId: String?
    let fileName: String
    let sizeBytes: Int
    let mimeType: String
}

/// ObjectCapturePresignResponse(@roomlog/types) — discriminated union을 느슨하게 받아 mode로 분기.
private struct ObjectCapturePresignResponseBody: Decodable {
    let mode: String
    let uploadUrl: String?
    let key: String?
    let headers: [String: String]?
}

private struct ObjectCaptureCompleteBody: Encodable {
    let furnitureId: String?
    let key: String
    let category: String?
    let label: String?
}

/// USDZ를 `POST tenant-furniture/object-capture/presign` → S3 presigned PUT →
/// `POST tenant-furniture/object-capture/complete`로 접수한다. UploadManager(splat-assets intake)와
/// 같은 3단계 패턴이지만 이 엔드포인트는 **멀티파트 폴백이 없다** — 서버가 S3 비활성 시
/// `{mode:"multipart"}`를 돌려주는데, tenant-furniture.service.ts가 "이 스코프는 멀티파트 폴백을
/// 구현하지 않는다"고 명시하므로 이 경로는 그걸 실패로 취급하고 명확한 에러를 보여준다.
///
/// background URLSession으로 앱이 백그라운드로 가도 업로드가 지속된다(UploadManager와 동일 이유,
/// 별도 세션 identifier라 서로 간섭하지 않는다).
final class ObjectCaptureUploader: NSObject, ObservableObject {
    static let shared = ObjectCaptureUploader()

    @Published private(set) var phase: ObjectCaptureUploadPhase?

    /// 시스템이 백그라운드 세션 이벤트 처리 후 호출하도록 넘겨준 완료 핸들러(AppDelegate가 세팅).
    var backgroundCompletionHandler: (() -> Void)?

    /// AppDelegate가 백그라운드 세션 완료 이벤트를 UploadManager 것과 구분해 라우팅하는 데 쓴다.
    static let sessionIdentifier = "com.roomlog.capture.objectcapture.upload"

    private var responseData = Data()
    private var scratchURLs: [URL] = []
    private var pendingContext: ObjectCaptureUploadContext?
    private var pendingKey: String?

    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
        config.isDiscretionary = false          // 즉시 시작(예약 대기 금지)
        config.sessionSendsLaunchEvents = true  // 종료 상태에서도 완료 시 앱 깨우기
        config.allowsCellularAccess = true      // 셀룰러 경고는 UI에서 별도 확인
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()

    private override init() {
        super.init()
    }

    var isUploading: Bool {
        switch phase {
        case .presigning, .uploading, .completing:
            return true
        default:
            return false
        }
    }

    @MainActor
    func start(context: ObjectCaptureUploadContext) {
        guard !isUploading else { return }
        pendingContext = context
        responseData = Data()
        phase = .presigning
        Task { await presignAndUpload(context) }
    }

    @MainActor
    func retry() {
        guard let context = pendingContext else { return }
        start(context: context)
    }

    private func presignAndUpload(_ context: ObjectCaptureUploadContext) async {
        do {
            let sizeBytes = try Self.fileSize(at: context.usdzURL)
            let fileName = context.usdzURL.lastPathComponent

            guard let url = Self.apiURL(base: context.baseURLString, path: "/api/tenant-furniture/object-capture/presign") else {
                await fail("서버 주소 형식이 올바르지 않습니다.")
                return
            }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("Bearer \(context.token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(
                ObjectCapturePresignBody(
                    furnitureId: context.furnitureId,
                    fileName: fileName,
                    sizeBytes: sizeBytes,
                    mimeType: "model/vnd.usdz+zip"
                )
            )

            let data: Data
            let response: URLResponse
            (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                await fail("서버 응답을 읽을 수 없습니다.")
                return
            }
            guard (200 ..< 300).contains(http.statusCode) else {
                let detail = String(data: data, encoding: .utf8) ?? ""
                await fail(Self.presignFailureMessage(status: http.statusCode, message: detail))
                return
            }

            let decoded = try JSONDecoder().decode(ObjectCapturePresignResponseBody.self, from: data)
            guard decoded.mode == "direct",
                  let uploadUrlString = decoded.uploadUrl,
                  let uploadUrl = URL(string: uploadUrlString),
                  let key = decoded.key else {
                // mode == "multipart"(S3 비활성) — 이 엔드포인트는 폴백이 없다, 명확히 실패 처리.
                await fail("이 서버는 정밀 스캔 업로드를 지원하지 않습니다 (S3 저장소가 꺼져 있음).")
                return
            }

            await putToS3(context: context, key: key, uploadUrl: uploadUrl, headers: decoded.headers ?? [:])
        } catch {
            await fail(error.localizedDescription)
        }
    }

    /// S3 presigned URL로 USDZ를 그대로 PUT한다. cross-origin이라 roomlog Bearer 토큰은
    /// 절대 싣지 않는다(서명이 깨진다) — presign 응답의 headers만 그대로 실어야 한다.
    @MainActor
    private func putToS3(
        context: ObjectCaptureUploadContext,
        key: String,
        uploadUrl: URL,
        headers: [String: String]
    ) {
        pendingKey = key
        scratchURLs = [context.usdzURL]

        var request = URLRequest(url: uploadUrl)
        request.httpMethod = "PUT"
        for (name, value) in headers {
            request.setValue(value, forHTTPHeaderField: name)
        }

        let task = session.uploadTask(with: request, fromFile: context.usdzURL)
        phase = .uploading(0)
        task.resume()
    }

    /// S3 PUT 완료 후 서버에 통보 — HEAD 검증 + meshUrl 변환 큐잉. 응답 TenantFurniture를
    /// 디코드해 후속(완료 화면 표시)에 쓴다.
    @MainActor
    private func completeUpload(context: ObjectCaptureUploadContext, key: String) async {
        phase = .completing
        guard let url = Self.apiURL(base: context.baseURLString, path: "/api/tenant-furniture/object-capture/complete") else {
            fail("서버 주소 형식이 올바르지 않습니다.")
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(context.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        do {
            request.httpBody = try JSONEncoder().encode(
                ObjectCaptureCompleteBody(
                    furnitureId: context.furnitureId,
                    key: key,
                    category: context.category,
                    label: context.label
                )
            )
        } catch {
            fail("요청 본문을 만들지 못했습니다: \(error.localizedDescription)")
            return
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                fail("서버 응답을 읽을 수 없습니다.")
                return
            }
            guard (200 ..< 300).contains(http.statusCode) else {
                let detail = String(data: data, encoding: .utf8) ?? ""
                fail("접수 완료 처리 실패 (HTTP \(http.statusCode))\(detail.isEmpty ? "" : ": \(detail)")")
                return
            }
            let furniture = try JSONDecoder().decode(TenantFurnitureSummary.self, from: data)
            cleanupScratch()
            phase = .succeeded(furniture)
        } catch {
            fail(error.localizedDescription)
        }
    }

    private static func presignFailureMessage(status: Int, message: String) -> String {
        if status == 401 || status == 403 {
            return "권한이 없습니다. 임차인 계정으로 다시 로그인하세요."
        }
        if status == 400 {
            return message.isEmpty ? "파일을 접수할 수 없습니다 (형식 또는 용량 제한: 300MB)." : message
        }
        return "업로드 준비 실패 (HTTP \(status))"
    }

    private static func fileSize(at url: URL) throws -> Int {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        guard let size = attributes[.size] as? Int else { throw UploadError.tempFile }
        return size
    }

    private static func apiURL(base: String, path: String) -> URL? {
        let trimmed = base.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalized = trimmed.hasSuffix("/") ? String(trimmed.dropLast()) : trimmed
        return URL(string: normalized + path)
    }

    @MainActor
    private func fail(_ message: String) {
        phase = .failed(message)
        cleanupScratch()
    }

    @MainActor
    private func cleanupScratch() {
        for url in scratchURLs {
            try? FileManager.default.removeItem(at: url)
        }
        scratchURLs = []
    }
}

extension ObjectCaptureUploader: URLSessionDataDelegate {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didSendBodyData bytesSent: Int64,
        totalBytesSent: Int64,
        totalBytesExpectedToSend: Int64
    ) {
        guard totalBytesExpectedToSend > 0 else { return }
        let progress = Double(totalBytesSent) / Double(totalBytesExpectedToSend)
        Task { @MainActor in
            self.phase = .uploading(min(1, max(0, progress)))
        }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        responseData.append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let status = (task.response as? HTTPURLResponse)?.statusCode
        let body = responseData
        Task { @MainActor in
            if let error {
                self.fail(error.localizedDescription)
                return
            }
            guard let status, (200 ..< 300).contains(status) else {
                let detail = String(data: body, encoding: .utf8) ?? ""
                self.fail("S3 업로드 실패 (HTTP \(status ?? 0))\(detail.isEmpty ? "" : ": \(detail)")")
                return
            }
            guard let context = self.pendingContext, let key = self.pendingKey else {
                self.fail("업로드 컨텍스트를 잃어버렸습니다.")
                return
            }
            await self.completeUpload(context: context, key: key)
        }
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        Task { @MainActor in
            let handler = self.backgroundCompletionHandler
            self.backgroundCompletionHandler = nil
            handler?()
        }
    }
}
