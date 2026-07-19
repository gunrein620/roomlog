import Foundation
import Network

/// 업로드 진행 단계. captureId로 어느 캡처의 상태인지 구분한다.
enum UploadPhase: Equatable {
    case preparing              // zip 생성 + presign 확인
    case uploading(Double)      // 0.0 ~ 1.0 (bytesSent 기반)
    case succeeded(String)      // 접수 완료 안내 문구
    case failed(String)         // 실패 사유
}

/// 재시도를 위해 시작 파라미터를 보관한다.
struct UploadRequestContext {
    let capture: CaptureSummary
    let listing: TradeListingDTO
    let baseURLString: String
    let token: String
}

/// 이번 업로드가 어느 경로로 진행 중인지 — 백그라운드 세션 완료 델리게이트가 이걸로 후속 처리를 분기한다.
private enum UploadKind {
    case multipartIntake
    case directPut(key: String, context: UploadRequestContext)
}

/// presign 발급 성공 시 결과 — direct는 S3로 바로 PUT, multipart는 기존 경로로 폴백하라는 신호.
private enum PresignOutcome {
    case direct(uploadUrl: URL, key: String, headers: [String: String])
    case multipart
}

/// presign 호출 자체의 실패. `.rejected`는 서버가 명시적으로 거부한 것(400/403 등)이라
/// 폴백하면 안 되고, 그 외(네트워크 오류·404 구버전 api)는 호출부가 멀티파트로 폴백한다.
private enum PresignError: Error {
    case network(String)
    case rejected(status: Int, message: String)
}

private struct PresignRequestBody: Encodable {
    let listingId: String
    let fileName: String
    let sizeBytes: Int
    let mimeType: String?
}

/// SplatIntakePresignResponse(@roomlog/types) — discriminated union을 느슨하게 받아 mode로 분기한다.
private struct PresignResponseBody: Decodable {
    let mode: String
    let uploadUrl: String?
    let key: String?
    let headers: [String: String]?
    let expiresAt: String?
}

private struct CompleteRequestBody: Encodable {
    let listingId: String
    let key: String
    let title: String?
    let address: String?
}

/// 캡처 zip을 매물에 접수한다. 두 경로:
/// - **direct**: `POST intake/presign` → S3 presigned PUT → `POST intake/complete` (권장, 서버 힙 미통과)
/// - **multipart**: 구버전 서버(S3 비활성) 또는 presign 실패(네트워크/404) 시 기존
///   `POST intake` 멀티파트로 폴백.
/// - URLSession **background configuration**: 앱이 백그라운드로 가도 수백 MB 업로드가 지속.
///   실제 파일 바이트가 오가는 전송(멀티파트 POST 또는 S3 PUT)만 background 세션을 쓴다 —
///   presign/complete는 수 KB짜리 JSON이라 `URLSession.shared`로 즉시 처리한다.
/// - multipart body는 임시 파일로 스트리밍 조립 후 `uploadTask(with:fromFile:)` — 메모리에 통째로 올리지 않는다.
final class UploadManager: NSObject, ObservableObject {
    static let shared = UploadManager()

    /// 현재 진행 중/최근 업로드(캡처 1건 기준 MVP). 행 UI가 captureId로 매칭.
    @Published private(set) var activeCaptureId: String?
    @Published private(set) var phase: UploadPhase?

    /// 시스템이 백그라운드 세션 이벤트 처리 후 호출하도록 넘겨준 완료 핸들러(AppDelegate가 세팅).
    var backgroundCompletionHandler: (() -> Void)?

    private static let sessionIdentifier = "com.roomlog.capture.upload"
    private let boundary = "RoomLogBoundary-\(UUID().uuidString)"

    private var lastContext: UploadRequestContext?
    private var responseData = Data()
    /// 업로드가 끝나면 지워야 할 임시 파일들(zip, multipart body).
    private var scratchURLs: [URL] = []
    /// 현재 background 태스크가 끝났을 때 어떤 후속 처리를 해야 하는지(멀티파트 완료 vs S3 PUT→complete 호출).
    private var uploadKind: UploadKind = .multipartIntake

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
        if case .uploading = phase { return true }
        if case .preparing = phase { return true }
        return false
    }

    /// 특정 캡처의 현재 진행 단계(없으면 nil).
    func phase(for captureId: String) -> UploadPhase? {
        activeCaptureId == captureId ? phase : nil
    }

    @MainActor
    func start(context: UploadRequestContext) {
        guard !isUploading else { return }
        lastContext = context
        activeCaptureId = context.capture.id
        phase = .preparing
        responseData = Data()

        Task { await prepareAndSend(context) }
    }

    @MainActor
    func retry() {
        guard let context = lastContext else { return }
        start(context: context)
    }

    private func prepareAndSend(_ context: UploadRequestContext) async {
        do {
            // 1) 캡처 폴더 → zip 임시 파일
            let zipURL = try await ZipExporter.export(capture: context.capture) { _ in }
            let fileName = "\(context.capture.id).zip"

            // 2) presign 확인 — direct면 S3로 바로, multipart 신호(또는 폴백 대상 오류)면 기존 경로.
            let outcome: PresignOutcome
            do {
                let sizeBytes = try Self.fileSize(at: zipURL)
                outcome = try await requestPresign(context: context, fileName: fileName, sizeBytes: sizeBytes)
            } catch PresignError.rejected(let status, let message) where status != 404 {
                // 서버가 명시적으로 거부(400/403 등) — 폴백하지 않는다. 거부될 파일을 굳이
                // 멀티파트로 다시 밀어넣으면 서버 힙을 통과시켜 이 기능의 목적이 무너진다.
                try? FileManager.default.removeItem(at: zipURL)
                await fail(Self.presignFailureMessage(status: status, message: message))
                return
            } catch {
                // 네트워크 오류 / 404(구버전 api) / 응답 디코딩 실패 — 멀티파트로 폴백.
                outcome = .multipart
            }

            switch outcome {
            case .multipart:
                try await sendMultipart(context: context, zipURL: zipURL, fileName: fileName)
            case .direct(let uploadUrl, let key, let headers):
                await sendDirect(context: context, zipURL: zipURL, uploadUrl: uploadUrl, key: key, headers: headers)
            }
        } catch {
            await fail(error.localizedDescription)
        }
    }

    // MARK: 경로 A — S3 direct (presign → PUT → complete)

    private func requestPresign(
        context: UploadRequestContext,
        fileName: String,
        sizeBytes: Int
    ) async throws -> PresignOutcome {
        guard let url = Self.apiURL(base: context.baseURLString, path: "/api/splat-assets/intake/presign") else {
            throw PresignError.network("서버 주소 형식이 올바르지 않습니다.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(context.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(
            PresignRequestBody(listingId: context.listing.id, fileName: fileName, sizeBytes: sizeBytes, mimeType: "application/zip")
        )

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw PresignError.network(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw PresignError.network("응답을 읽을 수 없습니다.")
        }
        guard (200 ..< 300).contains(http.statusCode) else {
            let detail = String(data: data, encoding: .utf8) ?? ""
            throw PresignError.rejected(status: http.statusCode, message: detail)
        }

        let decoded = try JSONDecoder().decode(PresignResponseBody.self, from: data)
        if decoded.mode == "direct",
           let uploadUrlString = decoded.uploadUrl,
           let uploadUrl = URL(string: uploadUrlString),
           let key = decoded.key {
            return .direct(uploadUrl: uploadUrl, key: key, headers: decoded.headers ?? [:])
        }
        return .multipart
    }

    private static func presignFailureMessage(status: Int, message: String) -> String {
        if status == 401 || status == 403 {
            return "권한이 없습니다. LANDLORD 계정으로 다시 로그인하세요."
        }
        if status == 400 {
            return message.isEmpty ? "파일을 접수할 수 없습니다 (형식 또는 용량 제한)." : message
        }
        return "업로드 준비 실패 (HTTP \(status))"
    }

    /// S3 presigned URL로 zip을 그대로 PUT한다(멀티파트 아님 — 파일 바이트가 body 전체).
    /// presign 응답의 headers를 그대로 실어야 서명이 맞는다. cross-origin이라 roomlog
    /// Bearer 토큰은 절대 싣지 않는다(서명이 깨진다).
    private func sendDirect(
        context: UploadRequestContext,
        zipURL: URL,
        uploadUrl: URL,
        key: String,
        headers: [String: String]
    ) async {
        await MainActor.run {
            self.scratchURLs = [zipURL]
            self.uploadKind = .directPut(key: key, context: context)
        }

        var request = URLRequest(url: uploadUrl)
        request.httpMethod = "PUT"
        for (name, value) in headers {
            request.setValue(value, forHTTPHeaderField: name)
        }

        let task = session.uploadTask(with: request, fromFile: zipURL)
        task.taskDescription = context.capture.id
        await MainActor.run { self.phase = .uploading(0) }
        task.resume()
    }

    /// S3 PUT 완료 후 서버에 통보 — HEAD 검증 + SplatAsset 생성. 응답 SplatAsset JSON은
    /// 멀티파트 경로와 마찬가지로 현재 UI에서 소비하지 않는다(성공 여부만 본다).
    private func completeIntake(context: UploadRequestContext, key: String) async throws {
        guard let url = Self.apiURL(base: context.baseURLString, path: "/api/splat-assets/intake/complete") else {
            throw UploadError.network("서버 주소 형식이 올바르지 않습니다.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(context.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let listing = context.listing
        request.httpBody = try JSONEncoder().encode(
            CompleteRequestBody(
                listingId: listing.id,
                key: key,
                title: listing.title.isEmpty ? nil : listing.title,
                address: listing.location.isEmpty ? nil : listing.location
            )
        )

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw UploadError.network("서버 응답이 없습니다.")
        }
        guard (200 ..< 300).contains(http.statusCode) else {
            let detail = String(data: data, encoding: .utf8) ?? ""
            throw UploadError.network("접수 완료 처리 실패 (HTTP \(http.statusCode))\(detail.isEmpty ? "" : ": \(detail)")")
        }
    }

    @MainActor
    private func finishDirect(context: UploadRequestContext, key: String) async {
        do {
            try await completeIntake(context: context, key: key)
            self.phase = .succeeded("3D 제작 접수됨 — 완료되면 웹에서 정합하세요.")
        } catch {
            self.phase = .failed(error.localizedDescription)
        }
    }

    // MARK: 경로 B — 기존 멀티파트 (폴백)

    private func sendMultipart(context: UploadRequestContext, zipURL: URL, fileName: String) async throws {
        let fields = intakeFields(for: context.listing, capture: context.capture)
        let bodyURL = try Self.buildMultipartFile(
            zipURL: zipURL,
            fileName: fileName,
            fields: fields,
            boundary: boundary
        )

        await MainActor.run {
            self.scratchURLs = [zipURL, bodyURL]
            self.uploadKind = .multipartIntake
        }

        guard let url = Self.apiURL(base: context.baseURLString, path: "/api/splat-assets/intake") else {
            await fail("서버 주소 형식이 올바르지 않습니다.")
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(context.token)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        let task = session.uploadTask(with: request, fromFile: bodyURL)
        task.taskDescription = context.capture.id
        await MainActor.run { self.phase = .uploading(0) }
        task.resume()
    }

    private func intakeFields(for listing: TradeListingDTO, capture: CaptureSummary) -> [(String, String)] {
        var fields: [(String, String)] = [("listingId", listing.id)]
        if !listing.title.isEmpty { fields.append(("title", listing.title)) }
        if !listing.location.isEmpty { fields.append(("address", listing.location)) }
        return fields
    }

    @MainActor
    private func finishMultipart(status: Int) {
        if status == 400 {
            // 구버전 서버는 zip 접수를 거부한다(스플랫만 허용) — 안내.
            self.phase = .failed("서버가 이 파일을 접수하지 못했습니다. 서버가 구버전이면 zip 접수가 400으로 거부됩니다.")
            return
        }
        if status == 401 || status == 403 {
            self.phase = .failed("권한이 없습니다. LANDLORD 계정으로 다시 로그인하세요.")
            return
        }
        guard (200 ..< 300).contains(status) else {
            self.phase = .failed("접수 실패 (HTTP \(status))")
            return
        }
        self.phase = .succeeded("3D 제작 접수됨 — 완료되면 웹에서 정합하세요.")
    }

    // MARK: 공통 헬퍼

    private static func apiURL(base: String, path: String) -> URL? {
        let trimmed = base.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalized = trimmed.hasSuffix("/") ? String(trimmed.dropLast()) : trimmed
        return URL(string: normalized + path)
    }

    private static func fileSize(at url: URL) throws -> Int {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        guard let size = attributes[.size] as? Int else { throw UploadError.tempFile }
        return size
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

    // MARK: multipart 조립 (스트리밍)

    /// listingId 등 텍스트 필드 + 파일 파트를 임시 파일로 쓴다.
    /// zip 바이트는 chunk 단위로 읽어 복사(메모리에 전체 로드 금지).
    static func buildMultipartFile(
        zipURL: URL,
        fileName: String,
        fields: [(String, String)],
        boundary: String
    ) throws -> URL {
        let bodyURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("upload-\(UUID().uuidString).multipart")
        FileManager.default.createFile(atPath: bodyURL.path, contents: nil)

        guard let handle = try? FileHandle(forWritingTo: bodyURL) else {
            throw UploadError.tempFile
        }
        defer { try? handle.close() }

        func write(_ string: String) throws {
            guard let data = string.data(using: .utf8) else { throw UploadError.encoding }
            handle.write(data)
        }

        // 텍스트 필드
        for (name, value) in fields {
            try write("--\(boundary)\r\n")
            try write("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
            try write("\(value)\r\n")
        }

        // 파일 파트 헤더
        try write("--\(boundary)\r\n")
        try write("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n")
        try write("Content-Type: application/zip\r\n\r\n")

        // zip 스트림 복사
        guard let reader = try? FileHandle(forReadingFrom: zipURL) else {
            throw UploadError.tempFile
        }
        defer { try? reader.close() }
        let chunkSize = 4 * 1024 * 1024
        while true {
            let chunk = reader.readData(ofLength: chunkSize)
            if chunk.isEmpty { break }
            handle.write(chunk)
        }

        // 종료 경계
        try write("\r\n--\(boundary)--\r\n")
        return bodyURL
    }
}

enum UploadError: LocalizedError {
    case tempFile
    case encoding
    case network(String)

    var errorDescription: String? {
        switch self {
        case .tempFile: return "업로드 임시 파일을 만들지 못했습니다."
        case .encoding: return "요청 본문 인코딩에 실패했습니다."
        case .network(let message): return message
        }
    }
}

// MARK: - URLSession 델리게이트(백그라운드)

extension UploadManager: URLSessionDataDelegate {
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
        let kind = uploadKind
        Task { @MainActor in
            if let error {
                self.phase = .failed(error.localizedDescription)
                self.cleanupScratch()
                return
            }
            guard let status else {
                self.phase = .failed("서버 응답이 없습니다.")
                self.cleanupScratch()
                return
            }

            self.cleanupScratch()

            switch kind {
            case .multipartIntake:
                self.finishMultipart(status: status)
            case .directPut(let key, let context):
                guard (200 ..< 300).contains(status) else {
                    let detail = String(data: body, encoding: .utf8) ?? ""
                    self.phase = .failed("S3 업로드 실패 (HTTP \(status))\(detail.isEmpty ? "" : ": \(detail)")")
                    return
                }
                await self.finishDirect(context: context, key: key)
            }
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

/// 네트워크 종류 모니터 — 셀룰러에서 대용량 업로드 전 경고를 띄우기 위한 최신 상태 보관.
final class NetworkMonitor: ObservableObject {
    static let shared = NetworkMonitor()

    @Published private(set) var isOnWiFi = true
    @Published private(set) var isExpensive = false

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "com.roomlog.capture.netmonitor")

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let wifi = path.usesInterfaceType(.wifi)
            let expensive = path.isExpensive
            DispatchQueue.main.async {
                self?.isOnWiFi = wifi
                self?.isExpensive = expensive
            }
        }
        monitor.start(queue: queue)
    }
}
