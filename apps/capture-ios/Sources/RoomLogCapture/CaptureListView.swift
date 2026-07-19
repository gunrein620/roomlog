import SwiftUI
import UIKit

struct CaptureListView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var captures: [CaptureSummary] = []
    @State private var selectedCapture: CaptureSummary?

    var body: some View {
        NavigationStack {
            Group {
                if captures.isEmpty {
                    emptyView
                } else {
                    captureList
                }
            }
            .navigationTitle("캡처")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("닫기") {
                        dismiss()
                    }
                }
            }
            .onAppear(perform: refresh)
            .sheet(item: $selectedCapture) { summary in
                CaptureDetailSheet(summary: summary)
            }
        }
    }

    private var captureList: some View {
        List {
            Section {
                ForEach(captures) { summary in
                    CaptureRow(summary: summary)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            selectedCapture = summary
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                deleteCapture(summary)
                            } label: {
                                Label("삭제", systemImage: "trash")
                            }
                        }
                }
                .onDelete(perform: deleteCaptures)
            }

            Section {
                Text("공유: Files 앱 → 이 폴더 길게 눌러 압축 → AirDrop")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var emptyView: some View {
        VStack(spacing: 12) {
            Image(systemName: "folder")
                .font(.system(size: 42, weight: .semibold))
                .foregroundStyle(.secondary)

            Text("저장된 캡처 없음")
                .font(.headline)

            Text("공유: Files 앱 → 이 폴더 길게 눌러 압축 → AirDrop")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(24)
    }

    private func refresh() {
        captures = CaptureEngine.listCaptures()
    }

    private func deleteCaptures(at offsets: IndexSet) {
        for index in offsets {
            CaptureEngine.deleteCapture(captures[index])
        }
        refresh()
    }

    private func deleteCapture(_ summary: CaptureSummary) {
        CaptureEngine.deleteCapture(summary)
        refresh()
    }
}

private struct CaptureRow: View {
    let summary: CaptureSummary

    @State private var thumbnail: UIImage?
    @State private var detail: CaptureDetail?

    var body: some View {
        HStack(spacing: 12) {
            thumbnailView

            VStack(alignment: .leading, spacing: 5) {
                Text(summary.id)
                    .font(.headline)
                    .lineLimit(1)

                Text(rowMetadata)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)
            }

            Spacer(minLength: 8)

            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
        .onAppear(perform: loadPreviewData)
    }

    @ViewBuilder
    private var thumbnailView: some View {
        if let thumbnail {
            Image(uiImage: thumbnail)
                .resizable()
                .scaledToFill()
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        } else {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(.secondary.opacity(0.14))
                .frame(width: 64, height: 64)
                .overlay {
                    Image(systemName: "photo")
                        .foregroundStyle(.secondary)
                }
        }
    }

    private var rowMetadata: String {
        "\(detail?.frameCount ?? summary.frameCount)프레임 · \(durationText(detail?.duration)) · \(byteText(summary.sizeBytes))"
    }

    private func loadPreviewData() {
        thumbnail = CaptureEngine.thumbnail(for: summary)
        detail = CaptureEngine.detail(for: summary)
    }
}

private struct CaptureDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var account: AccountStore
    @ObservedObject private var uploads = UploadManager.shared
    @ObservedObject private var network = NetworkMonitor.shared
    let summary: CaptureSummary

    @State private var detail: CaptureDetail?
    @State private var thumbnail: UIImage?
    @State private var isExporting = false
    @State private var exportProgress = 0.0
    @State private var shareItem: ShareItem?
    @State private var exportError: ExportError?

    // 매물 업로드 플로우 상태
    @State private var showsLogin = false
    @State private var showsListingPicker = false
    @State private var pendingListing: TradeListingDTO?
    @State private var showsWiFiConfirm = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    largeThumbnail

                    VStack(alignment: .leading, spacing: 10) {
                        Text(summary.id)
                            .font(.title3.bold())
                            .lineLimit(2)

                        detailGrid
                    }

                    uploadSection

                    exportSection

                    Text("공유: Files 앱 → 이 폴더 길게 눌러 압축 → AirDrop")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(18)
            }
            .navigationTitle("상세")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("닫기") {
                        dismiss()
                    }
                }
            }
            .onAppear(perform: loadDetail)
            .sheet(item: $shareItem) { item in
                ActivityView(activityItems: [item.url])
            }
            .sheet(isPresented: $showsLogin) {
                LoginView(onSuccess: { showsListingPicker = true })
            }
            .sheet(isPresented: $showsListingPicker) {
                ListingPicker(onSelect: handleListingSelected)
            }
            .alert(item: $exportError) { error in
                Alert(
                    title: Text("공유 실패"),
                    message: Text(error.message),
                    dismissButton: .default(Text("확인"))
                )
            }
            .alert("Wi-Fi 권장", isPresented: $showsWiFiConfirm, presenting: pendingListing) { listing in
                Button("계속") { beginUpload(listing: listing) }
                Button("취소", role: .cancel) { pendingListing = nil }
            } message: { _ in
                Text("\(byteText(summary.sizeBytes)) 업로드 — Wi-Fi가 아닙니다. 셀룰러로 계속할까요?")
            }
        }
    }

    private var uploadSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            switch uploads.phase(for: summary.id) {
            case .preparing:
                ProgressView { Text("업로드 준비 중 (ZIP 생성)") }
            case .uploading(let progress):
                ProgressView(value: progress) {
                    Text("매물로 업로드 중")
                } currentValueLabel: {
                    Text("\(Int((progress * 100).rounded()))%")
                }
            case .succeeded(let message):
                Label(message, systemImage: "checkmark.circle.fill")
                    .font(.subheadline)
                    .foregroundStyle(.green)
            case .failed(let message):
                VStack(alignment: .leading, spacing: 8) {
                    Label(message, systemImage: "exclamationmark.triangle.fill")
                        .font(.subheadline)
                        .foregroundStyle(.orange)
                    Button {
                        uploads.retry()
                    } label: {
                        Label("재시도", systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(.bordered)
                }
            case nil:
                Button(action: handleUploadTap) {
                    Label("매물로 업로드", systemImage: "arrow.up.to.line")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(uploads.isUploading)
                if uploads.isUploading {
                    Text("다른 캡처 업로드가 진행 중입니다.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func handleUploadTap() {
        if account.isAuthenticated {
            showsListingPicker = true
        } else {
            showsLogin = true
        }
    }

    private func handleListingSelected(_ listing: TradeListingDTO) {
        pendingListing = listing
        if network.isOnWiFi {
            beginUpload(listing: listing)
        } else {
            showsWiFiConfirm = true
        }
    }

    private func beginUpload(listing: TradeListingDTO) {
        pendingListing = nil
        guard let token = account.accessToken else {
            showsLogin = true
            return
        }
        let context = UploadRequestContext(
            capture: summary,
            listing: listing,
            baseURLString: account.baseURLString,
            token: token
        )
        uploads.start(context: context)
    }

    @ViewBuilder
    private var largeThumbnail: some View {
        if let thumbnail {
            Image(uiImage: thumbnail)
                .resizable()
                .scaledToFill()
                .frame(maxWidth: .infinity)
                .frame(height: 240)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        } else {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(.secondary.opacity(0.14))
                .frame(maxWidth: .infinity)
                .frame(height: 240)
                .overlay {
                    VStack(spacing: 8) {
                        Image(systemName: "photo")
                            .font(.system(size: 32, weight: .semibold))
                        Text("썸네일 없음")
                            .font(.footnote)
                    }
                    .foregroundStyle(.secondary)
                }
        }
    }

    private var detailGrid: some View {
        VStack(spacing: 8) {
            DetailRow(title: "프레임", value: "\(detail?.frameCount ?? summary.frameCount)")
            DetailRow(title: "길이", value: durationText(detail?.duration))
            DetailRow(title: "fps", value: detail.map { "\($0.fps)" } ?? "-")
            DetailRow(title: "AE", value: detail.map { $0.aeLocked ? "고정" : "미고정" } ?? "-")
            DetailRow(title: "드롭", value: detail.map { "\($0.droppedFrames)" } ?? "-")
            DetailRow(title: "크기", value: byteText(summary.sizeBytes))
        }
    }

    private var exportSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            if isExporting {
                ProgressView(value: exportProgress) {
                    Text("ZIP 생성 중")
                } currentValueLabel: {
                    Text("\(Int((exportProgress * 100).rounded()))%")
                }
            }

            Button {
                exportCapture()
            } label: {
                Label(isExporting ? "공유 준비 중" : "AirDrop 공유", systemImage: "square.and.arrow.up")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(isExporting)
        }
    }

    private func loadDetail() {
        thumbnail = CaptureEngine.thumbnail(for: summary)
        detail = CaptureEngine.detail(for: summary)
    }

    @MainActor
    private func exportCapture() {
        guard !isExporting else {
            return
        }

        isExporting = true
        exportProgress = 0

        Task {
            do {
                let url = try await ZipExporter.export(capture: summary) { progress in
                    exportProgress = min(1, max(0, progress))
                }
                shareItem = ShareItem(url: url)
            } catch {
                exportError = ExportError(message: error.localizedDescription)
            }

            isExporting = false
        }
    }
}

private struct DetailRow: View {
    let title: String
    let value: String

    var body: some View {
        HStack {
            Text(title)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .fontWeight(.medium)
                .monospacedDigit()
        }
        .font(.subheadline)
    }
}

private struct ActivityView: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

private struct ShareItem: Identifiable {
    let id = UUID()
    let url: URL
}

private struct ExportError: Identifiable {
    let id = UUID()
    let message: String
}

private func durationText(_ seconds: Double?) -> String {
    guard let seconds else {
        return "-"
    }

    let totalSeconds = max(0, Int(seconds.rounded()))
    return "\(totalSeconds / 60):\(twoDigits(totalSeconds % 60))"
}

private func twoDigits(_ value: Int) -> String {
    value < 10 ? "0\(value)" : "\(value)"
}

private func byteText(_ bytes: Int64) -> String {
    let value = max(0, bytes)

    if value < 1_024 {
        return "\(value) B"
    }

    if value < 1_048_576 {
        let tenths = Int((Double(value) / 102.4).rounded())
        return "\(tenths / 10).\(tenths % 10) KB"
    }

    if value < 1_073_741_824 {
        let tenths = Int((Double(value) / 104_857.6).rounded())
        return "\(tenths / 10).\(tenths % 10) MB"
    }

    let tenths = Int((Double(value) / 107_374_182.4).rounded())
    return "\(tenths / 10).\(tenths % 10) GB"
}
