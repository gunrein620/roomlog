# plan-extraction — 도면 인식/추출

도면 **이미지**를 받아 벽/치수선/주석/문창문/고정설비 **후보**와 축척 후보를 뽑아내는 영역.
출력의 최종 형태는 편집기가 쓸 수 있는 `Wall[]`(room-model 타입)과 후보/메타 데이터다.

## 파일

| 파일 | 역할 |
|---|---|
| `floor-plan-extraction.worker.ts` | Web Worker. OpenCV 로딩 + 이미지 → `DetectedLine[]` 추출. **의도적으로 자급자족(외부 import 없음)** — worker 번들을 단순하게 유지하기 위함 |
| `wall-detector.ts` | 브라우저 진입점. `WallDetector` 클래스가 worker 호출, 실패 시 캔버스 픽셀 fallback. 이미지 스케일링, `loadImage` 유틸 포함. DOM 의존은 이 파일에만 |
| `wall-detection.mjs` | 순수 로직(테스트 대상). 라인 필터링 파이프라인: 치수선/주석 분리(`filterCommercialWallCandidates`), 마스크 → 라인(`detectWallLinesFrom*`), 병합/노이즈 제거, 축척 추정(`estimateScaleCandidateFromDimensions`), 문창문/설비 후보(`detectOpening/FixtureCandidates`), 최종 벽 생성(`createWallsFromDetectedLines`) |
| `wall-detection.d.ts` | `wall-detection.mjs`의 타입 선언. mjs에 함수를 추가/변경하면 여기도 같이 갱신할 것 |
| `types.ts` | **계약 타입**: `DetectedLine`, `FloorPlanCandidate`, `ScaleCandidate`, `ExtractionMeta`, `DetectedWallResult` 등. 컨테이너가 소비하므로 변경 전 팀 공유 |

## 파이프라인

```
이미지 → worker(OpenCV) or fallback → DetectedLine[] (raw)
      → filterCommercialWallCandidates()   # 치수선/주석/노이즈 분리, mode: "conservative"
      → estimateScaleCandidateFromDimensions()  # OCR 텍스트 기반 축척 후보
      → createWallsFromDetectedLines()     # 에디터 좌표계 Wall[]로 변환
```

마스크 → 라인 추출(strict 경로)의 내부 단계:

1. `estimateWallLuminanceThreshold` — 어두운 픽셀 히스토그램을 Otsu로 분할해 순흑 벽과
   진회색 가구 채움(싱크대 상판 등)을 분리. 분리 실패 시 기본 임계값(128)으로 자동 복귀.
2. 밴드 추출 시 run 길이 균형 검사(`bandRunBalanceRatio`) — 벽에 붙은 채움 블록이
   벽 밴드를 흡수해 실제 벽 라인을 파괴하는 것을 방지.
3. 짧은 세그먼트 복구 패스 — 기본 `minRunLength`(≈6%)에서 소실되는 문설주·짧은 벽·
   작은 사각 벽(덕트/샤프트)을 두께 조건(≥5px)을 강화한 짧은 기준으로 재추출
   (`short-wall-recovered` 마커).
4. 필터 단계에서 `furniture-fill-band`(벽 두께 중앙값보다 3배 이상 두꺼운 밴드 → 주석 후보)와
   솔리드 블록 구제(`isSolidWallBlockLine`, 긴 축 방향 한 줄만 유지)로 정밀도 보강.

## 규칙

- `room-model`의 export만 import 가능 (`room-scene`, React 금지).
- `wall-detection.mjs`는 순수 함수 유지 — DOM/Worker/fetch 금지. 브라우저 의존 코드는 `wall-detector.ts`나 worker로.
- 추출 결과 벽이 과하게 나오는 것보다 **누락이 낫다** (conservative 정책). 누락 벽은 사용자가 직접 그린다. 이 정책을 바꾸려면 팀 합의 필요.
- worker 파일명(`floor-plan-extraction.worker.ts`)은 스펙 테스트가 참조하므로 리네임 금지.

## 주요 작업 (담당자 백로그)

- 도면 인식 정확도 개선, OCR 치수 인식 (`tesseractOcrUrl`은 아직 worker에서 미사용)
- 후보 confidence 스코어링 개선
- 샘플 도면 이미지 기반 회귀 검증

## 테스트

`apps/web/property-shell.spec.mjs`의 "floor plan editor model detects/removes/merges…" 테스트들이 이 폴더의 순수 로직을 커버한다. 필터 로직을 수정하면 `npm test`로 확인하고, 새 필터에는 같은 패턴으로 테스트를 추가할 것.
