# AGENTS.md — 룸로그 prototype (AI 에이전트 작업 가이드)

> 이 폴더는 **룸로그 클릭투어 셸(prototype)** 이다. Codex·Claude Code 등 AI 에이전트가 이 코드베이스에서 작업할 때 **먼저 이 문서를 읽고** 컨벤션·다음 단계를 따른다.

## 0. 이게 뭔가
- **Next.js(web) + NestJS(api) pnpm 모노레포.** 임차인·관리인·수리업체 3역할의 화면·라우팅·전이가 **클릭으로 동작하는 껍데기**.
- **전략 = evolutionary(진짜 제품으로 키움).** 버릴 프로토타입 아님. 지금은 **기능 스텁 · 데이터 인메모리 · 인증 없음** 상태.
- 화면은 스펙(화면 그래프)에서 도출됨. 횡단 원칙(D14~D27: 존엄·false-agency 금지·티켓≠수리·독촉 단일채널·공백≠책임추정 등)이 화면 전반을 관통.

## 1. 구조 / 컨벤션 (반드시 지킬 것)
```
apps/web    Next 16 App Router (PWA 목표). 화면 = app/<role>/<domain>/<screen>/page.tsx
apps/api    NestJS. 도메인별 모듈 = src/<domain>/(repository|service|controller|module)
packages/ui   @roomlog/ui — 토큰(tokens.css) + 컴포넌트(Button·Card·Badge·Input·PhoneFrame·ManagerShell)
packages/types @roomlog/types — 공유 도메인 모델 (web·api 공용, 단일 소스)
```
- **도메인 단위로 작업.** 하나의 도메인 = 백엔드 모듈 + 프론트 표면(역할×디바이스) + 공유 타입. (예: 티켓 도메인 = 하자(임차인)+티켓(관리인)+V-JOB(업체) 3표면, 백엔드 1모듈)
- **디바이스 셸**: 임차인/업체 = `PhoneFrame`(390×844), 관리인 데스크탑 = `ManagerShell`. 스타일은 **토큰 `var(--...)` 만, raw hex 금지**(→ 나중 design.md 스왑 대비).
- **api 클라이언트**: `apps/web/lib/<domain>-api.ts` — `fetch` + 데모 폴백(`demo-<domain>.ts`). api 미기동 시 데모로 렌더.
- **라우트 상수**: `apps/web/lib/<domain>-nav.ts` + `next/link`. 전이는 스펙 전이표대로.

## 2. 실행 / 검증
```bash
pnpm install
pnpm dev:api    # NestJS  :4000  (/api)
pnpm dev        # Next     :3000
bash scripts/verify.sh   # types·ui·web·api 빌드 + api 스모크
```

## 3. 빌드 함정 (겪은 것 — 미리 피할 것)
- **`packages/types` 편집 후 반드시 `pnpm --filter @roomlog/types build`** (dist 선언을 web·api가 소비). 안 하면 옛 타입을 봄.
- api `tsconfig`는 `incremental: false` (tsbuildinfo가 dist 삭제 후 emit 스킵하는 footgun 회피).
- **신규 도메인 타입은 도메인 접두어**(예: `Vendor*`, `Moveout*`) — `ChecklistItem`류 이름 충돌 방지.
- 병렬 작업 머지 시 충돌 지점 = `apps/api/src/app.module.ts`(모듈 등록)·`packages/types/src/index.ts`(re-export)·`apps/web/app/page.tsx`(인덱스). 대개 **append 충돌 → 전부 살리면 됨**.

## 4. 현재 상태 & 미완 항목
- **완료**: 3역할 전 표면 렌더 + 라우팅 + 스텁 API(인메모리). 홈(`/`)에 도메인 인덱스.
- **미완/이월**: **`KNOWN-GAPS.md` 를 반드시 읽을 것.** 셸 단계에서 안 한 것(서버측 원칙 게이트 강제·report/vendor-mgmt API 배선·실제 mutation 등)이 실물 단계 체크리스트로 정리돼 있음.

## 5. 다음 단계 (실물 제품으로 — 이 순서 권장)
walking skeleton 철학: **화면이 다 붙은 지금 → 위험한 seam부터 실물로.**

1. **영속성(DB)** — 인메모리 리포지토리 → PostgreSQL. `repository`가 이미 인터페이스로 분리돼 있어 `InMemory*` → `Postgres*`(Drizzle/Prisma/TypeORM) 교체가 국소적. 마이그레이션·연결 추가.
2. **인증·권한** — 실제 계정·세션(JWT), **D18 초대+연락처 OTP**(외국인 하드블록 금지), 역할(임차인/관리인/업체), **권한 스코프 서버 강제**(`tenant_id + room_link_id`).
3. **서버측 원칙 게이트** (KNOWN-GAPS의 C버킷) — 결제완료 게이트·D20 1:1 독촉 금지·SLA override·M-DOC 확정 액션 등 지금 UI 문구뿐인 것들을 **서버에서 강제**.
4. **실물 통합(위험 seam)** — 하자 사진 VLM 분석(AWS Bedrock)·결제 게이트웨이·S3 업로드·영수증 OCR(비용)·**음성 트리거 정산 사가**(멱등·보상, 이 제품의 핵심 기술 난제).
5. **실제 폼·상태·실시간** — 폼 mutation·검증, 로딩/에러/빈 상태 UX, 메시징 실시간(웹소켓/폴링).
6. **PWA·i18n·인프라** — 서비스워커·푸시·설치, 다국어(선택언어+원문 토글), 배포(EC2·DB·S3·CI).

**첫 실물 슬라이스 추천**: 티켓/하자 도메인부터 (분석·정산 리스크가 가장 큼). 흐름 하나를 web↔api↔DB로 얇게 관통시키고, 정산 사가 seam을 초반에 검증.

## 6. 작업 방법론 (이 셸을 만든 방식 — 재사용 권장)
- **도메인 수직 슬라이스 + 좁은 목→fan-out**: 먼저 공유 타입 계약을 확정(좁은 목), 그다음 백엔드∥프론트를 병렬 생산.
- **build ≠ review**: 만든 모델과 다른 모델(교차)이 "결함을 찾아라(refute)"로 적대 검토. (신선한 컨텍스트 + 반박 프롬프트가 핵심.)
- 병렬 도메인은 **git worktree로 격리** 후 머지.

## 7. 진실의 출처
- 화면·전이·원칙 스펙 = 룸로그 기획 vault의 화면 그래프 문서(`roomlog_screens_*.md`) + 결정로그. (이 레포엔 스펙 원본 없음 — 팀 기획 소스 참조.)
- 이월/미완 = `KNOWN-GAPS.md`. 디자인 토큰 = `packages/ui/src/tokens.css`.
