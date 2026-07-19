import SwiftUI

@main
struct RoomLogCaptureApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var engine = CaptureEngine()
    @StateObject private var account = AccountStore()

    var body: some Scene {
        WindowGroup {
            ContentView(engine: engine)
                .environmentObject(account)
        }
    }
}

/// 백그라운드 URLSession 완료 이벤트를 identifier로 구분해 해당 매니저로 전달한다.
/// (앱이 백그라운드/종료 상태에서 업로드가 끝나면 시스템이 이 콜백으로 앱을 깨운다.)
/// UploadManager(캡처 zip/splat intake)와 ObjectCaptureUploader(정밀 스캔 USDZ)가 서로 다른
/// 세션 identifier를 쓰므로 여기서 분기한다.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        handleEventsForBackgroundURLSession identifier: String,
        completionHandler: @escaping () -> Void
    ) {
        if identifier == ObjectCaptureUploader.sessionIdentifier {
            ObjectCaptureUploader.shared.backgroundCompletionHandler = completionHandler
        } else {
            UploadManager.shared.backgroundCompletionHandler = completionHandler
        }
    }
}
