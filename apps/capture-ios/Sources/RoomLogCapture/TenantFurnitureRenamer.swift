import Foundation

/// 가구 이름(label)만 고친다 — `PATCH tenant-furniture/{id}` (`{"label": "..."}`).
/// 재스캔 없이 이름을 바로잡는 용도(completeObjectCapture가 한동안 label을 버려 카테고리명으로
/// 표시되던 기존 가구 구제). TenantFurnitureThumbnailUploader와 같은 모양의 작은 전용 헬퍼 —
/// 파일이 작아 `URLSession.shared`로 즉시 처리한다.
enum TenantFurnitureRenamer {
    enum UpdateError: LocalizedError {
        case invalidBaseURL
        case invalidResponse
        case server(status: Int, message: String)

        var errorDescription: String? {
            switch self {
            case .invalidBaseURL:
                return "서버 주소 형식이 올바르지 않습니다."
            case .invalidResponse:
                return "서버 응답을 읽을 수 없습니다."
            case .server(let status, let message):
                return Self.serverMessage(status: status, message: message)
            }
        }

        private static func serverMessage(status: Int, message: String) -> String {
            if status == 401 || status == 403 {
                return "권한이 없습니다. 임차인 계정으로 다시 로그인하세요."
            }
            if status == 400 {
                return message.isEmpty ? "이름을 저장할 수 없습니다." : message
            }
            return "이름 수정 실패 (HTTP \(status))"
        }
    }

    private struct RenameBody: Encodable {
        let label: String
    }

    static func rename(
        furnitureId: String,
        label: String,
        baseURLString: String,
        token: String
    ) async throws -> TenantFurnitureSummary {
        guard let url = Self.apiURL(base: baseURLString, path: "/api/tenant-furniture/\(furnitureId)") else {
            throw UpdateError.invalidBaseURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(RenameBody(label: label))

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw UpdateError.invalidResponse
        }
        guard (200 ..< 300).contains(http.statusCode) else {
            let detail = String(data: data, encoding: .utf8) ?? ""
            throw UpdateError.server(status: http.statusCode, message: detail)
        }
        return try JSONDecoder().decode(TenantFurnitureSummary.self, from: data)
    }

    private static func apiURL(base: String, path: String) -> URL? {
        let trimmed = base.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalized = trimmed.hasSuffix("/") ? String(trimmed.dropLast()) : trimmed
        return URL(string: normalized + path)
    }
}
