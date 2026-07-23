import Foundation
import UIKit

/// 가구 썸네일(정사각 사진 1장)을 `POST tenant-furniture/{id}/thumbnail`로 올린다.
/// USDZ/스플랫 업로드(ObjectCaptureUploader, UploadManager)와 달리 파일이 작아(≤5MB) 백그라운드
/// 세션 없이 `URLSession.shared`로 즉시 처리한다 — 썸네일은 부가 기능이라 실패해도 호출부가
/// 각자 알아서 무시하거나 안내 문구만 띄우면 된다(본 업로드를 막지 않는다).
enum TenantFurnitureThumbnailUploader {
    enum UploadError: LocalizedError {
        case invalidBaseURL
        case invalidImage
        case invalidResponse
        case server(status: Int, message: String)

        var errorDescription: String? {
            switch self {
            case .invalidBaseURL:
                return "서버 주소 형식이 올바르지 않습니다."
            case .invalidImage:
                return "이미지를 저장 가능한 형식으로 변환하지 못했습니다."
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
                return message.isEmpty ? "이미지를 접수할 수 없습니다 (형식 또는 용량 제한: 5MB)." : message
            }
            return "썸네일 업로드 실패 (HTTP \(status))"
        }
    }

    static func upload(
        furnitureId: String,
        image: UIImage,
        baseURLString: String,
        token: String
    ) async throws -> TenantFurnitureSummary {
        guard let jpegData = image.jpegData(compressionQuality: 0.8) else {
            throw UploadError.invalidImage
        }
        guard let url = Self.apiURL(base: baseURLString, path: "/api/tenant-furniture/\(furnitureId)/thumbnail") else {
            throw UploadError.invalidBaseURL
        }

        let boundary = "RoomLogThumbnail-\(UUID().uuidString)"
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = Self.multipartBody(
            fieldName: "file",
            fileName: "thumbnail.jpg",
            mimeType: "image/jpeg",
            fileData: jpegData,
            boundary: boundary
        )

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw UploadError.invalidResponse
        }
        guard (200 ..< 300).contains(http.statusCode) else {
            let detail = String(data: data, encoding: .utf8) ?? ""
            throw UploadError.server(status: http.statusCode, message: detail)
        }
        return try JSONDecoder().decode(TenantFurnitureSummary.self, from: data)
    }

    private static func multipartBody(
        fieldName: String,
        fileName: String,
        mimeType: String,
        fileData: Data,
        boundary: String
    ) -> Data {
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        return body
    }

    private static func apiURL(base: String, path: String) -> URL? {
        let trimmed = base.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalized = trimmed.hasSuffix("/") ? String(trimmed.dropLast()) : trimmed
        return URL(string: normalized + path)
    }
}
