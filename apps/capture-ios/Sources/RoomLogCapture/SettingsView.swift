import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var engine: CaptureEngine
    @EnvironmentObject private var account: AccountStore

    private let fpsOptions = [5, 10, 15, 30, 60]

    @State private var showsLogin = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("fps", selection: fpsBinding) {
                        ForEach(fpsOptions, id: \.self) { fps in
                            Text("\(fps) fps").tag(fps)
                        }
                    }
                    .disabled(isRecording)
                } footer: {
                    Text("높을수록 발열·드롭 증가, 파이프라인은 600~1000프레임만 사용 — 10fps 권장")
                }

                Section {
                    Picker("촬영 해상도", selection: resolutionBinding) {
                        ForEach(CaptureResolution.allCases, id: \.self) { resolution in
                            Text(resolution.label).tag(resolution)
                        }
                    }
                    .pickerStyle(.segmented)
                    .disabled(isRecording)
                } header: {
                    Text("촬영 해상도")
                } footer: {
                    Text("고화질은 1440p 캡처(디테일↑, 발열·용량↑)이며 파일 크기가 약 4배입니다. 깊이(LiDAR 256×192)는 그대로이고 표준 960×720이 기본입니다.")
                }

                Section {
                    Toggle("AE/AWB 락 (노출·화이트밸런스 고정)", isOn: lockExposureBinding)
                        .disabled(isRecording)
                } footer: {
                    Text("녹화 시작 1초 후 노출을 고정합니다. 끄면 자동 노출로 캡처 — floater A/B 실험용. 평소엔 켜두세요.")
                }

                accountSection

                serverSection

                debugSection
            }
            .navigationTitle("설정")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("닫기") {
                        dismiss()
                    }
                }
            }
            .sheet(isPresented: $showsLogin) {
                LoginView()
            }
        }
    }

    @ViewBuilder
    private var accountSection: some View {
        Section("계정") {
            if account.isAuthenticated {
                VStack(alignment: .leading, spacing: 3) {
                    Text(account.displayName ?? account.email)
                        .font(.body)
                    if !account.email.isEmpty {
                        Text(account.email)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if !account.isLandlord {
                        Text("이 계정은 관리인(LANDLORD)이 아닙니다 — 업로드 접수가 거부될 수 있습니다.")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                }
                Button("로그아웃", role: .destructive) {
                    account.logout()
                }
            } else {
                Button("로그인") {
                    showsLogin = true
                }
            }
        }
    }

    @ViewBuilder
    private var debugSection: some View {
        Section("실험(디버그)") {
            if #available(iOS 17.0, *) {
                NavigationLink("공유세션 프로브", destination: SharedSessionProbeView())
            } else {
                Text("공유세션 프로브는 iOS 17 이상에서만 사용할 수 있습니다.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var serverSection: some View {
        Section {
            TextField("서버 주소", text: $account.baseURLString)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
            Button("기본값으로") {
                account.baseURLString = AccountStore.defaultBaseURL
            }
            .disabled(account.baseURLString == AccountStore.defaultBaseURL)
        } header: {
            Text("서버")
        } footer: {
            Text("기본 \(AccountStore.defaultBaseURL). 로컬 테스트는 http://<mac-ip>:4000 처럼 입력하세요.")
        }
    }

    private var fpsBinding: Binding<Int> {
        Binding(
            get: { engine.settings.fps },
            set: { engine.settings.fps = $0 }
        )
    }

    private var lockExposureBinding: Binding<Bool> {
        Binding(
            get: { engine.settings.lockExposure },
            set: { engine.settings.lockExposure = $0 }
        )
    }

    private var resolutionBinding: Binding<CaptureResolution> {
        Binding(
            get: { engine.settings.resolution },
            set: { engine.settings.resolution = $0 }
        )
    }

    private var isRecording: Bool {
        if case .recording = engine.state {
            return true
        }
        return false
    }
}
