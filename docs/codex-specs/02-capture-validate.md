# Codex 작업지시 ② — 캡처 사전검증

**브랜치**: `splat/capture-guard` (worktree). **성격**: 순수 휴리스틱, 격리됨.

## 목표
재구성(외부 API/GPU)에 넣기 **전에** 업로드 영상의 프레임 품질을 수 초 내 판정해
실패할 캡처를 조기 반려한다. 문서 `docs/remote-3d-tour.md` §6-② / §8.

## 계약 (이미 동결됨 — 그대로 import, 수정 금지)
`apps/web/src/app/splat-tour/tour-types.ts`
- `CaptureCheck { id, ok, metric, threshold, reason }`
- `CaptureValidationResult { ok, frameCount, checks }`
- `CaptureCheckId = "blur" | "exposure" | "parallax"`

## 만들 파일 (이것만)
- `apps/web/src/app/splat-tour/capture-validate.ts`
- `apps/web/src/app/splat-tour/capture-validate.spec.ts`

## 함수 시그니처
```ts
// 프레임은 그레이스케일/RGB 픽셀 버퍼 추상화. 브라우저 ImageData 또는
// { width, height, data: Uint8ClampedArray } 호환 형태를 받는다.
export interface FrameLike { width: number; height: number; data: Uint8ClampedArray }
export function validateCapture(frames: FrameLike[]): CaptureValidationResult;
```

## 3개 체크 (전부 순수 함수, 외부 라이브러리 없이 직접 구현)
1. **blur** — 각 프레임 라플라시안 분산 → 시퀀스 평균/중앙값이 임계 미만이면 반려("초점이 흐립니다. 천천히 이동하며 다시 촬영해 주세요").
2. **exposure** — 밝기 히스토그램. 하위/상위 빈에 과도 편중(저조도·과노출)이면 반려("조명을 켜고 다시 촬영해 주세요").
3. **parallax** — 인접 프레임 간 이동량(간이 옵티컬플로우: 블록 평균 밝기 시프트 또는 프레임차 에너지)이 거의 0이면 "제자리 회전 → 시차 부족"으로 반려("걸으며 촬영해야 3D가 만들어집니다").

각 체크는 `metric`/`threshold`를 결과에 담아 **왜 반려됐는지 수치로** 보이게 한다.
임계값은 상수로 상단에 모아 두고 주석으로 근거 표기(추후 실측 튜닝 대상).

## 테스트 케이스 (spec에 반드시 포함)
- 합성 프레임 생성기로: (a) 선명+정상노출+이동 → ok=true, (b) 균일 블러 프레임 → blur.ok=false,
  (c) 전부 어두움 → exposure.ok=false, (d) 동일 프레임 반복(이동 0) → parallax.ok=false.
- 빈 배열/1프레임 → 안전 처리(ok=false, 명시 reason).
- 최상위 `ok`는 모든 필수 체크 AND.

## 금지
`splat-scene.tsx`, `tour-types.ts`, `splat-validate.ts`(완성파일 검증, 별개) 편집 금지.
드롭존 UI 연결은 이 작업 범위 밖(통합 담당이 나중에 연결) — 순수 함수 + 테스트만.

## 검증 블로커
실제 튜닝은 **좋은/나쁜 워크스루 영상 1쌍**이 있어야 가능. 그전까지는 합성 프레임 유닛테스트로
로직 정확성만 보장. 임계 상수는 잠정값으로 두고 TODO 주석.
