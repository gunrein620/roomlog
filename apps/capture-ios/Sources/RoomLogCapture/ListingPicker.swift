import SwiftUI

/// GET /api/trade/listings 응답 항목(계약: trade.service.ts TradeListing).
/// 필요한 필드만 디코드한다(나머지 필드는 무시).
struct TradeListingDTO: Decodable, Identifiable, Equatable {
    let id: String
    let title: String
    let location: String
    let tradeType: String
    let roomType: String?
    let ownerId: String?
    let status: String?

    var subtitle: String {
        let deal = tradeType.isEmpty ? "" : tradeType
        return [location, deal].filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

/// 매물 선택 시트 — 캡처를 어떤 매물의 3D로 접수할지 고른다.
struct ListingPicker: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var account: AccountStore

    /// 선택 완료 콜백(선택한 매물 전달). 시트는 스스로 닫는다.
    let onSelect: (TradeListingDTO) -> Void

    @State private var listings: [TradeListingDTO] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("매물 불러오는 중")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let errorMessage {
                    errorView(errorMessage)
                } else if listings.isEmpty {
                    emptyView
                } else {
                    listView
                }
            }
            .navigationTitle("매물 선택")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("취소") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await load() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .disabled(isLoading)
                }
            }
            .task { await load() }
        }
    }

    private var listView: some View {
        List(listings) { listing in
            Button {
                onSelect(listing)
                dismiss()
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(listing.title)
                            .font(.headline)
                            .foregroundStyle(.primary)
                        if listing.status == "계약완료" {
                            Text("계약완료")
                                .font(.caption2.bold())
                                .foregroundStyle(.secondary)
                        }
                    }
                    Text(listing.subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
        }
    }

    private var emptyView: some View {
        VStack(spacing: 12) {
            Image(systemName: "house")
                .font(.system(size: 40, weight: .semibold))
                .foregroundStyle(.secondary)
            Text("등록된 매물이 없습니다")
                .font(.headline)
            Text("웹에서 매물을 먼저 등록한 뒤 캡처를 업로드하세요.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(24)
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 36, weight: .semibold))
                .foregroundStyle(.orange)
            Text("매물을 불러오지 못했습니다")
                .font(.headline)
            Text(message)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("다시 시도") {
                Task { await load() }
            }
            .buttonStyle(.bordered)
        }
        .padding(24)
    }

    @MainActor
    private func load() async {
        guard let token = account.accessToken else {
            errorMessage = "로그인이 필요합니다."
            return
        }
        // mine=1 — 서버가 Bearer 소유자 스코프로 내 매물만 반환(기본 경로는 전체 공개).
        guard let url = account.endpoint("/api/trade/listings?mine=1") else {
            errorMessage = "서버 주소 형식이 올바르지 않습니다."
            return
        }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                errorMessage = "응답을 읽을 수 없습니다."
                return
            }
            if http.statusCode == 401 {
                account.invalidateSession()
                errorMessage = "세션이 만료되었습니다. 다시 로그인하세요."
                return
            }
            guard (200 ..< 300).contains(http.statusCode) else {
                errorMessage = "매물 목록 오류 (HTTP \(http.statusCode))"
                return
            }
            // 서버가 소유자 스코프를 결정한다(응답 그대로 노출) — 클라 필터 없음.
            listings = try JSONDecoder().decode([TradeListingDTO].self, from: data)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
