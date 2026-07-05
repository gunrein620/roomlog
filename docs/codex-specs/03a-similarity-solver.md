# Codex 작업지시 ③(a) — 2점 유사변환 solver

**브랜치**: `splat/register` (worktree). **성격**: 순수 수학, 격리됨.

## 목표
스플랫 뷰에서 클릭한 방 모서리 2곳과, 도면에서 클릭한 같은 모서리 2곳(대응쌍 2개)으로부터
바닥평면 유사변환(scale + yaw + translation)을 **닫힌해**로 계산해 `SplatTransform`을 반환한다.

## 계약 (이미 동결됨 — 그대로 import, 수정 금지)
`apps/web/src/app/splat-tour/tour-types.ts`
- `Point2 { x, y }`
- `RegistrationPointPair { splat: Point2; plan: Point2 }`
- `SplatTransform { rotationXDegrees, rotationYDegrees, scaleMultiplier, offsetX, offsetY, offsetZ }`

## 만들 파일 (이것만)
- `apps/web/src/app/splat-tour/similarity-solve.ts`
- `apps/web/src/app/splat-tour/similarity-solve.spec.ts`

## 함수 시그니처
```ts
export interface SolveOptions {
  rotationXDegrees?: number; // 통과값, 기본 180 (SPZ Y-down→Y-up 중력정렬)
  offsetY?: number;          // 통과값, 기본 0
}
export function solveSimilarity(
  pairs: [RegistrationPointPair, RegistrationPointPair],
  options?: SolveOptions
): SplatTransform;
```

## 수학 (닫힌해, 반복 최적화 금지)
스플랫점 a1,a2 (splat.x, splat.y) → 도면점 b1,b2 (plan.x, plan.y).
- `scaleMultiplier = |b2 - b1| / |a2 - a1|`
- `θ = atan2(b2-b1) - atan2(a2-a1)`, `rotationYDegrees = θ(도)` — **회전 부호/축 방향은 splat-scene의 rotationYDegrees 적용 규약과 일치시킬 것**(scene은 Y축 쿼터니언 회전; spec에서 왕복 검증).
- 이동: `b1 = scale·R(θ)·a1 + t` → `t = b1 - scale·R(θ)·a1`. `offsetX = t.x`, `offsetZ = t.y`(도면 y축이 world z).
- `rotationXDegrees`, `offsetY`는 options 통과값 그대로.

## 테스트 케이스 (spec에 반드시 포함)
1. **왕복(round-trip)**: 임의 scale·θ·t로 a→b를 합성 → solveSimilarity가 그 값을 복원(오차 < 1e-9).
2. **항등**: a==b 두 쌍이면 scale=1, rotY=0, offset=0.
3. **순수 스케일 2배**: scale=2, rotY≈0.
4. **90° 회전**: rotationYDegrees≈90(부호 규약 명시).
5. **degenerate**: 두 점이 같음(거리 0) → 안전 처리(throw 또는 명시적 실패값 — 택1하고 문서화).
6. **options 통과**: rotationXDegrees=180, offsetY=1.2가 출력에 그대로.

## 금지 (건드리면 병합 충돌)
`splat-scene.tsx`, `tour-types.ts`, `tour-tuning-panel.tsx`, `tour-viewer*.tsx` 편집 금지.
UI/DOM/three 렌더 코드 작성 금지 — 순수 수 계산 + 테스트만.

## 실행/검증
`pnpm --filter web test:unit` (혹은 레포 유닛 러너)로 spec 통과. 타입: `pnpm --filter web typecheck`.
