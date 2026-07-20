import SwiftUI

/// 로그인 시트 — 매물 업로드 전 룸로그 계정 인증. LANDLORD 계정이어야 접수 가능.
struct LoginView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var account: AccountStore

    /// 로그인 성공 후 이어서 할 동작(예: 매물 선택 시트 열기). 없으면 그냥 닫힘.
    var onSuccess: (() -> Void)?

    @State private var email = ""
    @State private var password = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("이메일", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

                    SecureField("비밀번호", text: $password)
                        .textContentType(.password)
                } footer: {
                    Text("룸로그 웹과 같은 계정으로 로그인하세요. 데모 계정: 이메일 `*@roomlog.test` / 비밀번호 `password123!`")
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button(action: submit) {
                        HStack {
                            if isSubmitting {
                                ProgressView()
                                    .controlSize(.small)
                            }
                            Text(isSubmitting ? "로그인 중" : "로그인")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .disabled(isSubmitting || email.isEmpty || password.isEmpty)
                } footer: {
                    Text("서버: \(account.baseURLString)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("로그인")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("취소") { dismiss() }
                        .disabled(isSubmitting)
                }
            }
            .onAppear {
                if email.isEmpty {
                    email = account.email
                }
            }
        }
    }

    private func submit() {
        guard !isSubmitting else { return }
        isSubmitting = true
        errorMessage = nil

        Task {
            do {
                try await account.login(email: email, password: password)
                isSubmitting = false
                dismiss()
                onSuccess?()
            } catch {
                errorMessage = error.localizedDescription
                isSubmitting = false
            }
        }
    }
}
