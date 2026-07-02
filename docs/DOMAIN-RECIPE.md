# 도메인 슬라이스 추가 레시피

룸로그는 **도메인 단위 수직 슬라이스**로 자란다. 하나의 도메인 = 백엔드 모듈 + 프론트 표면(역할×디바이스) + 공유 타입. 하자(티켓) 슬라이스가 레퍼런스 구현이다.

## 레퍼런스 (이걸 그대로 따라해)
- 프론트: `apps/web/app/tenant/defect/**` — `@roomlog/ui` 컴포넌트 + 토큰(var(--...))만, raw hex 금지. 데이터 화면은 async 서버 컴포넌트가 `lib/api.ts`를 await.
- 백엔드: `apps/api/src/ticket/**` — `repository`(추상 인터페이스 + `InMemory*` 구현) / `service`(404 처리) / `controller`. `app.module.ts` imports에 모듈 한 줄 등록.
- 계약: `packages/types/src/ticket.ts` — 도메인 모델. `index.ts`에서 re-export.
- 데이터: `apps/web/lib/api.ts`(fetch + 데모 폴백), `lib/demo-ticket.ts`(시드). api 인메모리 시드와 프론트 데모는 **같은 값**.

## 새 도메인 추가 절차
1. `packages/types/src/<domain>.ts` 작성 + `index.ts`에 re-export → **`pnpm --filter @roomlog/types build`** (dist 재생성 — 안 하면 api/web이 옛 선언을 봄).
2. `apps/api/src/<domain>/` 모듈(repository/service/controller) + `app.module.ts` imports에 한 줄.
3. `apps/web/app/<role>/<domain>/**` 화면 컴포넌트 + `lib/api.ts`에 fetch 함수 추가.
4. 스펙 = `roomlog-handoff/spec/screens/roomlog_screens_<domain>.md` (화면 카드·전이·원칙 그대로).
5. 검증: `bash scripts/verify.sh` (web+api 빌드 + api 스모크).

## 병렬 규칙 (worktree)
- 도메인마다 `git worktree add ../roomlog-<domain> -b domain/<domain>`, 각 worktree에서 `pnpm install`.
- **자기 도메인 폴더만** 수정. 공유(`@roomlog/ui`·`nav.ts`·`layout`·타 도메인)는 읽기만.
- 새 공유 UI 컴포넌트가 필요하면 **만들기 전에 오너(메인)에게 확인** — 두 세션이 같은 걸 발명하면 충돌.
- 머지 시 충돌 예상 지점 = `packages/types/src/index.ts`(re-export 줄), `apps/api/src/app.module.ts`(imports 줄), `apps/web/lib/api.ts`(함수 추가). 대개 **양쪽 다 살리면 되는** append 충돌.

## 함정
- **types는 빌드 패키지**(dist 선언 소비). 편집 후 build 필수.
- api `tsconfig`는 `incremental: false` (tsbuildinfo가 dist 삭제 후에도 emit을 건너뛰는 footgun 회피).
- 기능(결제·분석·정산·인증)·DB는 현재 **스텁/인메모리**. 실물 결선은 슬라이스가 모인 뒤.

## 원칙 (횡단 — 화면마다 확인)
티켓 상태 ≠ 수리 상태 · AI 책임 확정 금지(가능성만) · 공백 ≠ 책임 추정(D27) · 결제=완료 후 · 존엄/false agency 금지. 도메인별 D항목은 스펙 카드 상단 참고.
