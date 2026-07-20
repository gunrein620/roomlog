# RoomLog Capture (iOS)

자체 LiDAR 캡처 앱 — ARKit `sceneDepth`로 RGB+깊이+confidence+포즈를 기록해
`scripts/reconstruct/record3d_pointinit.py`가 바로 소비하는 **RoomLog Capture Format v1**(CONTRACT.md)을 출력한다.
Record3D를 대체한다(EXR 아닌 npy 깊이 — 파이프라인이 ns-process-data를 우회하므로 포맷 자유).

## 처음 한 번 — 빌드까지 (아침 절차)

> ⚠️ **0. 디스크 공간부터**: 이 Mac은 여유가 ~4GB뿐(2026-07-09 확인)인데 **Xcode는 ~40GB**가 필요하다.
> 정리 후보: `~/Downloads`의 촬영 zip 2개(~1.6GB, GPU 박스에 사본 있음)·ply들, 사진 보관함, 안 쓰는 앱.
> 최소 45GB 확보 후 진행.

1. App Store에서 **Xcode 설치**(대용량 — 먼저 걸어두고 다른 일 할 것) → 첫 실행에서 iOS 플랫폼 추가 동의.
2. `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
3. 프로젝트 파일이 이미 있으면 스킵, 없으면: `cd apps/capture-ios && xcodegen` (brew로 설치돼 있음)
4. `RoomLogCapture.xcodeproj` 열기 → 타깃 **Signing & Capabilities** → Team에 본인 Apple ID(**Personal Team**) 선택.
5. 아이폰(Pro, LiDAR)을 케이블 연결 → "이 컴퓨터를 신뢰" → 상단 기기 선택 → **Run(⌘R)**.
6. 폰에서 처음 실행 시: 설정 → 일반 → VPN 및 기기 관리 → 본인 Apple ID **신뢰**.
7. 카메라 권한 허용 → 촬영.

> **무료 Personal Team 주의**: 서명이 **7일 후 만료**되어 앱이 안 열린다 — 재서명은 케이블 꽂고 Run 한 번.
> **발표 전날 재서명**을 습관으로.

## 촬영 SOP (앱 안 오버레이와 동일)

가로로 · 천천히 옆걸음(제자리 회전 금지) · **다중 높이 3패스**(눈높이/아래보기/위보기) ·
물체는 여러 각도로 지나가며 · 벽은 정면에 가깝게 빠짐없이 · 반사면(거울·TV·통창) 정면 오래 금지.
fps 설정은 기본 10 권장(파이프라인은 600~1000프레임만 사용, 높은 fps = 발열·드롭만 증가).

## 캡처 → 파이프라인

1. 공유: 캡처 목록 → 상세 → **공유**(인앱 zip → AirDrop). 폴백: Files 앱 → RoomLogCapture → Captures →
   폴더 길게 눌러 압축 → AirDrop.
2. Mac/GPU 박스에서 기존 절차 그대로 (`scripts/reconstruct/RUNBOOK.md`):
   ```sh
   python3 record3d_pointinit.py <캡처폴더> <이름> --num-frames 600 --voxel 0.02 --max-depth 4.0
   # npy 깊이 자동 인식. LiDAR confidence 마스킹: --conf-min 1 (권장, 통창·거울 오염 컷)
   ```
3. `[verify]` 검문소(bbox=방 크기, 카메라-in-bbox True) 통과 확인 후 학습.

## 매물 연계 업로드 (A단계)

캡처를 AirDrop 대신 서버로 바로 올려 3D 제작을 접수한다. 완료된 스플랫은 웹 콘솔에서 2점 정합한다.

1. **로그인**: 설정(⚙️) → 계정 → 로그인, 또는 캡처 상세의 **매물로 업로드**를 누르면 로그인 시트가 뜬다.
   룸로그 웹과 같은 계정(관리인/LANDLORD). 데모: `*@roomlog.test` / `password123!`.
   토큰은 Keychain에 저장된다.
2. **서버 주소**: 설정 → 서버. 기본 `https://api.woo-zu.com`. 로컬 테스트는 `http://<mac-ip>:4000`
   (같은 Wi-Fi, ATS는 사설망 HTTP만 예외 허용 — 공용 도메인은 여전히 HTTPS 강제).
3. **매물 선택**: 캡처 목록 → 상세 → **매물로 업로드** → 내 매물 목록에서 선택.
4. **업로드**: zip을 백그라운드 URLSession으로 전송(앱을 나가도 지속). Wi-Fi가 아니면 셀룰러 확인을 먼저 묻는다.
   진행률 → "3D 제작 접수됨 — 완료되면 웹에서 정합하세요". 실패 시 사유 + **재시도**.
5. **웹 정합**: 접수건은 서버에서 `PROCESSING` → 재구성 완료 후 웹 콘솔에서 2점 정합.

> ⚠️ **서버 버전 주의**: 접수 엔드포인트 신버전은 zip을 받아 파이프라인에 큐잉하지만,
> **구버전 서버는 스플랫(.spz) 외 파일을 거부**해 zip 업로드가 **HTTP 400**으로 실패한다(앱이 사유를 안내).
> 이때는 서버를 신버전(kjw-gpu-pipeline 이후)으로 올린 뒤 재시도.

## 계약·테스트

- 포맷/API 계약: `CONTRACT.md` (v1 + v1.1 확장). 코드가 계약과 다르면 계약이 옳다.
- 계약 적합성 테스트(앱 없이): `python scripts/reconstruct/tests/make_synth_capture.py --verify`
  — 합성 box-room 캡처를 point-init에 통과시켜 좌표·포맷 규약을 검증한다.
  앱 첫 실캡처도 같은 검문소로 확인할 것.
