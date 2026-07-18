# RoomLog 로컬 3D 의존성 이전 설계

## 목표

RoomLog의 2D 도면 편집, MitUNet GPU 추론 프록시, 3D 렌더링, 가구 배치 기능이 `C:\Users\smoun\Jungle\woo-zu\roomlog` 폴더 하나를 기준으로 실행되도록 로컬 파일 의존성을 이전한다. GPU 추론은 기존 GCP 서버 `8.230.7.1:8012`를 계속 사용한다.

## 선택한 방식

외부 저장소 전체를 중첩하거나 대용량 파일을 Git에 커밋하지 않고, 유지보수와 실행에 필요한 파일을 역할별로 분리한다.

- `services/mitunet/`: MitUNet 서버 소스, 웹 뷰어, 배포 스크립트, 테스트, 문서 및 모델 체크포인트
- `runtime-assets/furniture-glb-dataset/`: 가구 `manifest.json`과 GLB 1,680개

현재 GPU 서버에서 사용하는 `best.pth`와 `yolo-segv1.pt`는 반드시 보존한다. 과거 사용자 모델인 `D_cldice.pth`와 롤백용 `best-before-finetune-v1.pth`도 삭제하지 않고 함께 이전하되 실행 기본값은 `best.pth`로 유지한다.

## 이전 범위

### MitUNet에 포함할 항목

- `server/`
- `src/`
- `viewer/`
- `deploy/`
- `tests/`, `tests_js/`
- `configs/`, `scripts/`, `docs/`
- `weights/`의 네 체크포인트
- `pyproject.toml`, `.python-version`, `.gitignore`, `dev.sh`, `README.md`, `LICENSE`

### 제외할 항목

- 별도 Git 메타데이터 `.git/`
- 재생성 가능한 `.venv/`, `__pycache__/`, `.pytest_cache/`, `.runtime/`
- 작업 보조 폴더 `.claude/`, `.superpowers/`, `.vscode/`
- `output/`, 서버 로그, 확인용 PNG

### 가구 데이터에 포함할 항목

- `manifest.json`
- 매니페스트가 참조하는 GLB 1,680개
- `_source-metadata/`를 포함한 데이터셋 내부 메타데이터

## 경로와 실행 흐름

로컬 Docker Compose는 RoomLog 내부 상대경로만 바인드한다.

```text
./services/mitunet                      -> /mitunet   (read-only)
./runtime-assets/furniture-glb-dataset -> /furniture (read-only)
```

웹 컨테이너는 `/mitunet/viewer`에서 편집기를 제공하고 `/furniture`에서 매니페스트와 GLB를 제공한다. 추론 요청은 `MITUNET_INTERNAL_SERVICE_URL=http://8.230.7.1:8012`로 전달한다. 운영 Compose에도 같은 마운트와 환경 변수를 명시한다.

호스트에서 Next.js를 직접 실행할 때도 상대경로를 RoomLog 저장소 루트 기준으로 해석한다. 기존 `C:/Users/smoun/Jungle/floorplan-to-3d-mitunet` 하드코딩과 형제 폴더 탐색은 제거한다.

## Git 및 대용량 파일 정책

MitUNet 소스·테스트·문서는 RoomLog 저장소에서 관리할 수 있다. 다음 대용량 파일은 일반 Git 추적에서 제외한다.

- `services/mitunet/weights/*.pth`
- `services/mitunet/weights/*.pt`
- `runtime-assets/furniture-glb-dataset/`

이 파일들은 RoomLog 작업 폴더에는 존재하지만 일반 Git 커밋에는 포함하지 않는다.

## 안전한 이전 순서

1. 대상 경로가 RoomLog 내부인지 절대경로로 검증한다.
2. 원본을 삭제하지 않고 대상에 먼저 복사한다.
3. MitUNet 소스와 네 모델 파일의 SHA-256을 비교한다.
4. 가구 매니페스트 1,680개 참조가 모두 존재하고 바이트 합계가 일치하는지 확인한다.
5. 테스트를 실행하고 Docker web 컨테이너를 새 경로로 재생성한다.
6. `3000` 편집기, CUDA 헬스체크, 매니페스트, 표본 GLB를 실제 HTTP로 확인한다.
7. 검증이 모두 성공한 뒤에만 기존 활성 외부 폴더 두 개를 삭제한다.

`floorplan-to-3d-mitunet - 복사본`은 현재 실행에 사용되지 않지만 이번 이전 대상에도 포함하지 않는다. 해당 복사본 삭제는 활성 경로 이전과 별개의 정리 작업으로 취급한다.

## 오류 처리와 복구

- 복사 또는 해시 검증이 실패하면 기존 폴더와 현재 Docker 마운트를 유지한다.
- 새 경로의 HTTP 검증이 실패하면 기존 폴더를 삭제하지 않는다.
- GPU 서버는 이전 작업 중 수정하거나 재시작하지 않는다.
- 기존 벽 생성, 문·창 처리 및 애니메이션 코드는 변경하지 않는다.

## 검증 기준

- 새 경로의 MitUNet 소스 23개 핵심 Python/설정 파일이 현재 GPU 배포본과 동일하다.
- GPU 체크포인트 `best.pth`, `yolo-segv1.pt`가 현재 서버 파일과 동일한 SHA-256을 가진다.
- 가구 매니페스트의 `itemCount`는 1,680이고 누락 GLB는 0개다.
- RoomLog 단위 테스트에서 MitUNet·가구 경로 회귀 테스트가 통과한다.
- `http://localhost:3000/floor-plan-3d/mitunet`이 200을 반환한다.
- 프록시 `/healthz`가 `device: cuda`를 반환한다.
- 가구 매니페스트와 표본 GLB가 200을 반환한다.
