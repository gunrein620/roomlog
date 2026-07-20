# RoomLog Capture — 계약 동결 (v1, 2026-07-09)

> 3병렬(codex#1 엔진 / codex#2 UI / codex#3 파이프라인)의 공유 계약. **이 문서가 소스 오브 트루스** —
> 여기 없는 인터페이스를 서로 가정하지 말 것. 소비자는 `scripts/reconstruct/record3d_pointinit.py` 하나뿐이다
> (ns-process-data는 P3=0이라 우회 확정 — 그래서 EXR·Record3D 완전 호환이 **불필요**해졌고 npy로 간다).

## 1. 캡처 출력 포맷 — "RoomLog Capture Format v1" (Record3D 구조 호환 + npy 깊이)

```
Documents/Captures/<yyyyMMdd-HHmmss>/
  metadata.json          # 아래 스키마
  rgb/<i>.jpg            # W×H landscape, sRGB, JPEG quality 0.85 (해상도 프리셋, 아래 §1a)
  depth/<i>.npy          # float32 (192, 256) 미터, invalid=0
  conf/<i>.npy           # uint8 (192, 256), ARConfidenceLevel raw(0/1/2)
```

### 1a. RGB 해상도 프리셋 (2026-07-16 추가 — w/h 계약 확장)

RGB 해상도는 **설정에서 선택하는 프리셋**이며 metadata.json의 `w`/`h`에 실제 값이 기록된다(하드코딩 아님).

| 프리셋 | w×h | 비고 |
|--------|-----|------|
| `standard`(기본) | **960×720** | 현행 동작 불변(0.69MP) |
| `high` | **1920×1440** | 고해상 실험용(2.76MP, 파일 ~4배·발열↑) |

- **4:3 고정**, sRGB·JPEG 0.85 불변. 프리셋은 **녹화 시작 시점에 고정**(fps와 동일 — 녹화 중 변경 무효).
- **depth/conf는 프리셋과 무관하게 256×192 고정**(LiDAR sceneDepth 원본). `dw`/`dh`는 항상 256/192.
- **K는 선택 해상도에 맞춰 스케일**(§2) — w/h와 K가 반드시 같은 해상도를 가리켜야 재구성이 맞는다.
  리더(record3d_pointinit)는 metadata의 `w`/`h`로 intrinsics를 다루므로 w/h ↔ K ↔ rgb 픽셀 3자가 일치해야 한다.

- **인덱스 연속성**: 저장된 프레임만 0..N-1 연속 번호. 드롭 프레임은 인덱스를 소비하지 않는다.
  `poses[i]` ↔ `rgb/i.jpg` ↔ `depth/i.npy` ↔ `conf/i.npy` ↔ `frameTimestamps[i]` 전부 1:1.
- **metadata.json** (Record3D 키 호환 + 확장):

```jsonc
{
  "poses": [[qx,qy,qz,qw, tx,ty,tz], ...],   // ARKit camera-to-world (아래 §2)
  "K": [fx,0,0, 0,fy,0, cx,cy,1],            // 3×3 column-major (Record3D 관례), w×h 픽셀 기준(§1a)
  "w": 960, "h": 720,                         // RGB 해상도(프리셋: 960×720 기본 또는 1920×1440)
  "dw": 256, "dh": 192,                       // depth 해상도
  "fps": 10,                                  // 명목 목표 (실효는 frameTimestamps로)
  "frameTimestamps": [t0, t1, ...],           // ARFrame.timestamp (초)
  // ---- 확장(리더가 몰라도 무해) ----
  "device": "iPhone16,1", "appVersion": "0.1.0",
  "aeLocked": true,                           // AE/AWB 락 성공 여부
  "droppedFrames": 12,                        // 백프레셔로 버린 수
  "startedAt": "2026-07-10T09:00:00+09:00"
}
```

## 2. 좌표·카메라 규약 (record3d_pointinit.py가 이미 소비하는 그대로)

- **포즈** = ARKit `frame.camera.transform`(camera-to-world, 오른손, x우 y상 **카메라 전방 = -Z**).
  회전은 쿼터니언 **(qx,qy,qz,qw) 허수부 먼저** + 평행이동 (tx,ty,tz) 미터.
  `simd_quatf(rotationMatrix)`의 `imag/real`을 그대로 기록. **월드 정렬·중력 보정 금지**(리더가 처리).
- **intrinsics**: `frame.camera.intrinsics`는 `capturedImage` 원본 해상도(예: 1920×1440) 기준 →
  **선택한 RGB 해상도(w×h, §1a)로 스케일해서 기록**: `fx*=w/W_cap, fy*=h/H_cap, cx*=w/W_cap, cy*=h/H_cap`.
  (기본 프리셋 standard면 w=960·h=720.) K는 column-major 9원소(위 스키마 — 리더가 `.reshape(3,3).T` 한다).
- **회전 미적용**: rgb/depth는 센서 landscape 방향 그대로 저장(세로로 들어도 회전 넣지 말 것).
  SOP가 가로 촬영을 강제하고, 뷰어가 방향을 보정한다.
- **depth**: `frame.sceneDepth.depthMap`(256×192 Float32, 미터) 그대로. `.smoothedSceneDepth` 금지
  (시간 평활이 깊이 경계를 뭉갬). NaN/Inf → 0으로 기록.

## 3. npy 규약 (양쪽이 동일 구현)

- NumPy format v1.0: magic `\x93NUMPY` + ver(1,0) + header_len(uint16 LE) + 헤더 dict + raw data.
- 헤더 예: `{'descr': '<f4', 'fortran_order': False, 'shape': (192, 256), }` — **총 헤더부(매직 포함)가
  64의 배수**가 되게 공백 패딩 + 끝 `\n`. C-order row-major, little-endian.
- depth `<f4`, conf `|u1`.

## 4. CaptureEngine 공개 API (codex#1이 구현, codex#2는 이것만 소비)

```swift
// CaptureFormat.swift — 공유 타입 (codex#1 소유)
enum CaptureState: Equatable { case idle, recording, saving, error(String) }

struct CaptureSummary: Identifiable {
    let id: String          // 폴더명 (yyyyMMdd-HHmmss)
    let url: URL
    let frameCount: Int
    let sizeBytes: Int64
    let date: Date
}

// CaptureEngine.swift (codex#1 소유)
final class CaptureEngine: NSObject, ObservableObject, ARSessionDelegate {
    let session: ARSession                          // UI 프리뷰가 공유
    @Published private(set) var state: CaptureState
    @Published private(set) var frameCount: Int      // 저장된 프레임 수
    @Published private(set) var droppedFrames: Int
    @Published private(set) var elapsedSeconds: Double
    @Published private(set) var bytesWritten: Int64
    @Published private(set) var thermalState: ProcessInfo.ThermalState
    @Published private(set) var aeLocked: Bool

    static var isDeviceSupported: Bool              // LiDAR(sceneDepth) 지원 여부
    func startSession()                              // configure+run (뷰 onAppear)
    func pauseSession()                              // 뷰 onDisappear
    func startRecording()                            // 폴더 생성, AE/AWB 락 시도
    func stopRecording()                             // 비동기 플러시 → .saving → .idle
    static func capturesDirectory() -> URL           // Documents/Captures
    static func listCaptures() -> [CaptureSummary]   // 날짜 역순
    static func deleteCapture(_ s: CaptureSummary)
}
```

동작 규약:
- **10fps 스로틀**: `frame.timestamp - lastKept >= 0.099`일 때만 저장.
- **백프레셔**: 직렬 백그라운드 큐에 쓰기 제출, 대기 큐 깊이 > 20이면 그 프레임 드롭(`droppedFrames`+1).
  메인 스레드에서 픽셀버퍼 처리 금지(delegate 스레드에서 복사 후 큐로).
- **JPEG**: `capturedImage`(YCbCr CVPixelBuffer) → CIImage → 960×720 다운스케일 → JPEG 0.85.
  CIContext는 1회 생성 재사용.
- **AE/AWB 락**: iOS 16+ `ARWorldTrackingConfiguration.configurableCaptureDeviceForPrimaryCamera`로
  녹화 시작 1초 후 `exposureMode = .locked`, `whiteBalanceMode = .locked`. 실패해도 녹화는 계속
  (`aeLocked=false`로 기록).
- **세션**: `ARWorldTrackingConfiguration`, `frameSemantics = [.sceneDepth]`, 오디오·평면감지 불필요.
- metadata.json은 **stopRecording에서 원자적으로 1회** 기록(임시파일→rename).

## 5. UI 경계 (codex#2)

- 파일: `RoomLogCaptureApp.swift`(@main), `ContentView.swift`, `ARPreviewView.swift`, `CaptureListView.swift`.
- 프리뷰: `ARSCNView`를 UIViewRepresentable로 감싸고 `view.session = engine.session` 주입만(콘텐츠 없음).
- 메인 화면: 프리뷰 풀스크린 + 하단 녹화 토글 버튼(원형) + 상단 HUD(⏺ 프레임수 · mm:ss · MB ·
  드롭수 · 발열은 `.serious` 이상일 때만 ⚠️ 표시) + `aeLocked` 뱃지.
- SOP 오버레이(토글): "가로로 · 천천히 옆걸음 · 다중 높이 3패스(눈높이/아래/위) · 물체는 여러 각도,
  벽은 정면 커버리지 · 반사면 정면 오래 금지".
- 캡처 목록(시트): `CaptureSummary` 리스트(이름·프레임·크기) + 삭제 + 안내 문구
  "공유: Files 앱 → 이 폴더 길게 눌러 압축 → AirDrop" (**인앱 zip 만들지 말 것** — MVP 범위 밖).
- `CaptureEngine.isDeviceSupported == false`면 전면 안내(LiDAR 필요).
- 미지원 API 창작 금지 — §4의 API만 사용.

## 6. 파이프라인 소비자 (codex#3)

- `record3d_pointinit.py` 수정(기존 동작·기본값 불변 — ablation A0 대조군 보존):
  - 프레임 i의 깊이 파일: `depth/{i}.exr` 우선, 없으면 `depth/{i}.npy`(np.load). 프레임 존재 판정도 동일 규칙.
  - `--conf-min {0,1,2}` (기본 0=끔): `conf/{i}.npy` 있으면 `conf < conf-min` 픽셀의 깊이를 무효(0) 처리
    — **init 점군에만** 적용(학습 프레임 목록엔 영향 없음).
- 신규 `scripts/reconstruct/tests/make_synth_capture.py`:
  - 해석적 box-room(내부 4.0×2.5×3.0m) 합성 캡처를 **v1 포맷 그대로** 생성 — 원 궤도 카메라 N=24,
    레이-평면 교차로 depth 계산, 벽별 단색 rgb(jpg), conf는 한 벽면만 0으로(마스킹 검증용), K/포즈 §2 규약.
  - `--verify` 모드: record3d_pointinit.py를 subprocess로 돌려 assert — ① bbox가 방 치수 ±0.3m
    ② 카메라-in-bbox True ③ train∩eval=∅ ④ `--conf-min 1`이면 conf=0 벽의 점이 사라짐(점수 감소).
  - 이 테스트가 **Swift 구현의 적합성 시험**을 겸한다(앱이 만든 폴더를 같은 검증에 통과시키면 계약 준수).

## 7. 빌드 대상 (참고 — 통합 단계 소유)

- iOS 17.0+, iPhone Pro(LiDAR) 전용, Swift 5.9, SwiftUI. 서드파티 의존성 **0**.
- 프로젝트는 xcodegen(`project.yml`)으로 생성. 서명은 사용자가 Xcode에서 Personal Team 선택.

## 8. v1.1 확장 — "Record3D 수준" (2차 물결, 사용자 지시 2026-07-09)

MVP가 아니라 필요 기능을 Record3D 수준으로. **§1~6은 불변**(포맷·규약 동결 유지), 아래는 전부 추가분.

### 8a. 엔진 확장 (CaptureEngine에 추가)
```swift
struct CaptureSettings: Codable, Equatable {
    var fps: Int = 10            // 5/10/15/30/60 — UserDefaults 영속, 녹화 시작 시 스로틀에 반영
}
extension CaptureEngine {
    @Published var settings: CaptureSettings     // 변경 즉시 저장
    @Published private(set) var freeDiskBytes: Int64   // 1초 주기 갱신(녹화 중)
    static func thumbnail(for s: CaptureSummary) -> UIImage?   // rgb/0.jpg 로드(다운스케일 ~200px)
    static func detail(for s: CaptureSummary) -> CaptureDetail? // metadata.json 파싱
}
struct CaptureDetail { let frameCount: Int; let duration: Double; let fps: Int
                       let aeLocked: Bool; let droppedFrames: Int }
```
- 스로틀 간격 = `1.0/Double(fps) - 0.001`. 60fps는 쓰기 대역폭상 드롭 다발 가능 — 막지 말고
  드롭 카운트로 정직하게 노출(백프레셔가 안전장치). metadata.json "fps"에 설정값 기록.

### 8b. ZipExporter.swift (신규 파일 — 소유자는 zip 담당 에이전트, 다른 파일 수정 금지)
```swift
enum ZipExporter {
    /// 캡처 폴더 → tmp에 <이름>.zip 생성. STORE 전용(무압축 — jpg가 지배적이라 deflate 이득 미미),
    /// ZIP64 지원(4GB+ 캡처), 진행률 콜백은 메인 스레드. 취소는 Task cancellation.
    static func export(capture: CaptureSummary,
                       progress: @MainActor @escaping (Double) -> Void) async throws -> URL
}
```
- 표준 zip 컨테이너 수기 구현: local file header + central directory (+ zip64 EOCD when needed),
  CRC32는 zlib(`import zlib` 불가 — Swift에선 직접 테이블 구현 또는 `Compression` 없이 수기 CRC32 ~20줄).
  entry 경로는 `<캡처이름>/rgb/0.jpg` 형태 상대경로. Foundation+CryptoKit 외 의존 금지.

### 8c. UI 확장
- `SettingsView.swift` (신규): fps 피커(5/10/15/30/60) + 설명("높을수록 발열·드롭 증가, 파이프라인은
  600~1000프레임만 사용 — 10fps 권장"), 저장은 engine.settings 바인딩.
- `CaptureListView.swift` 개편: 썸네일 + 이름·프레임수·길이·크기 행, 스와이프 삭제,
  행 탭 → 상세(CaptureDetail + 큰 썸네일 + **공유 버튼**: ZipExporter 진행률 표시 → share sheet(AirDrop)).
- `ContentView.swift` HUD에 남은 디스크(GB) 추가, 설정 진입 기어 버튼.
- Files 앱 수동 압축 안내 문구는 유지(폴백 경로).
