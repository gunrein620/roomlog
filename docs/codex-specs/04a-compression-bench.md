# Codex 작업지시 ④(a) — .spz/.sog 압축 벤치마크

**브랜치**: `splat/compress` (worktree). **성격**: 독립 측정 하네스.

## 목표
문서 `docs/remote-3d-tour.md` §6-④. 같은 방 스플랫을 포맷별로 비교해
**모바일 로딩시간·파일크기·FPS**를 before/after 표로 산출. 재구성 GPU 불필요.

## 입력 자산
- `apps/web/public/samples/room.spz` (기준, 존재함)
- 비교용 `.sog`는 **직접 생성해야 함**(spz→sog 변환) — 아래 블로커 참고.

## 만들 파일 (이것만)
- `apps/web/src/app/splat-tour/compression-bench.ts` (측정 로직)
- `apps/web/src/app/splat-tour/compression-bench.spec.ts` (파싱/집계 유닛테스트)
- (선택) `scripts/splat-compress-report.mjs` 실행 스크립트 + 결과 표를 spec 문서로 커밋

## 측정 항목
- 파일 크기(bytes) 포맷별.
- 로딩 시간: `SplatMesh({url}).initialized` 완료까지 wall-clock(브라우저 계측 훅 or 스크립트).
- FPS: 고정 카메라 회전 N프레임 평균(선택, 어려우면 로딩+크기만).
- 결과를 마크다운 표로 출력.

## 금지
`splat-scene.tsx`, `tour-types.ts` 편집 금지. 새 렌더 경로를 씬에 통합하지 말 것 —
독립 하네스로만. (프로그레시브 로딩 통합=④b는 통합 담당 몫.)

## 블로커
`.sog` 생성 도구 필요(예: PlayCanvas SplatTransform/`sogs`, 또는 gsplat 툴). 변환 커맨드를
README에 기록하고, 변환이 막히면 **.spz 단독 크기/로딩 리포트만이라도** 산출 후 보고.
