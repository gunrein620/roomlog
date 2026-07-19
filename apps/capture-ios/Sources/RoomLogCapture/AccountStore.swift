import Foundation
import Security

/// 룸로그 서버 계정/세션 상태. 로그인 토큰은 Keychain, base URL·이메일은 UserDefaults에 둔다.
/// (토큰만 민감정보라 Keychain, 나머지는 편의값이라 UserDefaults.)
@MainActor
final class AccountStore: ObservableObject {
    /// 서버 주소. 기본은 운영, 로컬 테스트 시 설정에서 http://<mac-ip>:4000 등으로 교체.
    @Published var baseURLString: String {
        didSet { UserDefaults.standard.set(baseURLString, forKey: Keys.baseURL) }
    }
    @Published private(set) var email: String
    @Published private(set) var displayName: String?
    @Published private(set) var userId: String?
    @Published private(set) var roles: [String] = []
    @Published private(set) var isAuthenticated: Bool = false
    @Published var lastError: String?

    static let defaultBaseURL = "https://api.woo-zu.com"

    private enum Keys {
        static let baseURL = "roomlog.baseURL"
        static let email = "roomlog.email"
        static let token = "roomlog.accessToken"
    }

    init() {
        let defaults = UserDefaults.standard
        baseURLString = defaults.string(forKey: Keys.baseURL) ?? Self.defaultBaseURL
        email = defaults.string(forKey: Keys.email) ?? ""
        isAuthenticated = Keychain.get(Keys.token) != nil
    }

    /// 저장된 Bearer 토큰(없으면 nil). 업로드 매니저가 Authorization 헤더에 넣는다.
    var accessToken: String? { Keychain.get(Keys.token) }

    var isLandlord: Bool { roles.contains("LANDLORD") }

    /// base + "/api/..." 조립용. 잘못된 문자열이면 nil.
    func endpoint(_ path: String) -> URL? {
        let trimmed = baseURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        let base = trimmed.hasSuffix("/") ? String(trimmed.dropLast()) : trimmed
        return URL(string: base + path)
    }

    func login(email loginEmail: String, password: String) async throws {
        let normalizedEmail = loginEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = endpoint("/api/auth/login") else {
            throw AccountError.badBaseURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(LoginBody(email: normalizedEmail, password: password))

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw AccountError.network("응답을 읽을 수 없습니다.")
        }
        guard (200 ..< 300).contains(http.statusCode) else {
            throw AccountError.loginFailed(status: http.statusCode)
        }

        let result = try JSONDecoder().decode(AuthResponse.self, from: data)
        Keychain.set(result.accessToken, for: Keys.token)

        email = normalizedEmail
        UserDefaults.standard.set(normalizedEmail, forKey: Keys.email)
        displayName = result.name
        userId = result.userId
        roles = result.roles
        isAuthenticated = true
        lastError = nil
    }

    func logout() {
        Keychain.delete(Keys.token)
        displayName = nil
        userId = nil
        roles = []
        isAuthenticated = false
    }

    /// 401 등으로 세션이 죽었을 때 호출 — 토큰만 지우고 재로그인을 유도한다.
    func invalidateSession() {
        Keychain.delete(Keys.token)
        isAuthenticated = false
    }
}

private struct LoginBody: Encodable {
    let email: String
    let password: String
}

/// POST /api/auth/login 응답(AuthResult 계약).
private struct AuthResponse: Decodable {
    let userId: String
    let role: String
    let roles: [String]
    let accessToken: String
    let name: String
}

enum AccountError: LocalizedError {
    case badBaseURL
    case network(String)
    case loginFailed(status: Int)

    var errorDescription: String? {
        switch self {
        case .badBaseURL:
            return "서버 주소 형식이 올바르지 않습니다. 설정에서 확인하세요."
        case .network(let message):
            return message
        case .loginFailed(let status):
            if status == 401 {
                return "이메일 또는 비밀번호가 올바르지 않습니다."
            }
            return "로그인에 실패했습니다. (HTTP \(status))"
        }
    }
}

/// 최소 Keychain wrapper — 단일 계정 토큰 문자열 저장용.
enum Keychain {
    private static let service = "com.roomlog.capture"

    static func set(_ value: String, for key: String) {
        delete(key)
        guard let data = value.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    static func get(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    static func delete(_ key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }
}
