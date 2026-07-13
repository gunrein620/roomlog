# Manager Messaging Building Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 메시징 허브의 채팅·공지 탭을 건물 선택창으로 교체하고 선택한 건물 티켓만 표시한다.

**Architecture:** 순수 필터 모델이 옵션 생성·URL 값 검증·티켓 필터링을 담당한다. 작은 클라이언트 컴포넌트는 native select 변경을 `building` 검색 매개변수에 반영하고, 서버 페이지는 필터된 티켓만 기존 우선순위로 정렬해 렌더링한다.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Node test runner

## Global Constraints

- 현재 브랜치는 `kms-commu`다.
- 공지 작성 화면과 사이드바 링크는 유지한다.
- 인프라 파일과 다른 관리자 화면은 수정하지 않는다.
- 공용 디자인 토큰만 사용하고 raw hex를 추가하지 않는다.
- 기존 미추적 문서는 stage하거나 수정하지 않는다.
- RED → GREEN → 전체 검증 후 커밋·푸시하고 로컬 web을 재빌드한다.

---

### Task 1: 건물 선택 기반 메시징 티켓 필터

**Files:**
- Create: `apps/web/src/lib/messaging-building-filter.ts`
- Create: `apps/web/src/lib/messaging-building-filter.spec.ts`
- Create: `apps/web/src/app/manager/messaging/00/BuildingFilter.tsx`
- Modify: `apps/web/src/lib/messaging-thread-location.spec.ts`
- Modify: `apps/web/src/app/manager/messaging/00/page.tsx`
- Create: `docs/superpowers/plans/2026-07-11-manager-messaging-building-filter.md`

**Interfaces:**
- Produces: `UNASSIGNED_BUILDING_FILTER`, `getBuildingOptions(threads)`, `hasUnassignedBuilding(threads)`, `resolveBuildingFilter(requested, options, hasUnassigned)`, `filterThreadsByBuilding(threads, activeFilter)`, `BuildingFilter`

- [x] **Step 1: 순수 필터 모델 실패 테스트 작성**

다음을 검증한다.

```ts
assert.deepEqual(getBuildingOptions(threads), ["테스트 건물1", "테스트 건물2"]);
assert.equal(hasUnassignedBuilding(threads), true);
assert.equal(resolveBuildingFilter("없는 건물", options, true), "");
assert.deepEqual(filterThreadsByBuilding(threads, "테스트 건물1").map(({ id }) => id), ["a"]);
assert.deepEqual(filterThreadsByBuilding(threads, UNASSIGNED_BUILDING_FILTER).map(({ id }) => id), ["c"]);
```

- [x] **Step 2: 페이지 계약 실패 테스트 작성**

기존 메시징 소스 테스트에 다음 계약을 추가한다.

```ts
assert.doesNotMatch(listPage, /function TabLink/);
assert.doesNotMatch(listPage, /listAnnouncementDrafts|listAnnouncementResults/);
assert.match(listPage, /<BuildingFilter/);
assert.match(listPage, /건물별 · 답장 필요 상단/);
assert.match(listPage, /선택한 건물의 티켓이 없습니다\./);
```

- [x] **Step 3: 집중 테스트 RED 확인**

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/lib/messaging-building-filter.spec.ts src/lib/messaging-thread-location.spec.ts
```

Expected: 필터 모듈이 없고 기존 탭이 남아 있어 실패한다.

- [x] **Step 4: 순수 필터 모델 최소 구현**

건물명은 trim 후 중복 제거·한국어 정렬한다. 빈 검색 값은 전체, 등록된 건물만 유효, 미지정 값은 미지정 티켓이 있을 때만 유효하게 처리한다.

- [x] **Step 5: URL 선택 컴포넌트 최소 구현**

`BuildingFilter`는 `전체 건물`, 건물 옵션, 필요 시 `건물 미지정`을 native select로 렌더링한다. 변경 시 `URLSearchParams`의 `building`을 갱신하고 `router.replace(nextUrl, { scroll: false })`를 호출한다.

- [x] **Step 6: 페이지 탭·공지 분기 제거 및 필터 적용**

- `listAnnouncementDrafts`, `listAnnouncementResults` 호출 제거
- `TabLink`, `ResultCard`, activeTab 분기 제거
- `BuildingFilter` 렌더링
- 필터된 티켓을 기존 답장 필요·최신순으로 정렬
- 결과가 없으면 빈 상태 렌더링
- 섹션 제목을 `건물별 · 답장 필요 상단`으로 변경

- [x] **Step 7: 집중 테스트 GREEN 확인**

Run the Step 3 command.

Expected: 필터 모델과 페이지 계약 테스트가 모두 통과한다.

- [x] **Step 8: 전체 검증**

```bash
pnpm --filter web test:unit
bash scripts/verify.sh
git diff --check
```

Expected: web 단위 테스트와 types·ui·web·api 빌드 및 API 스모크가 모두 통과한다.

- [ ] **Step 9: 커밋·푸시 및 로컬 반영**

```bash
git add \
  apps/web/src/lib/messaging-building-filter.ts \
  apps/web/src/lib/messaging-building-filter.spec.ts \
  apps/web/src/app/manager/messaging/00/BuildingFilter.tsx \
  apps/web/src/lib/messaging-thread-location.spec.ts \
  apps/web/src/app/manager/messaging/00/page.tsx \
  docs/superpowers/plans/2026-07-11-manager-messaging-building-filter.md
git commit -m "feat(messaging): filter tickets by building"
git push origin kms-commu
docker compose up -d --build web
open http://localhost:3000/manager/messaging/00
```

Expected: 원격 브랜치와 로컬 web이 건물 선택 필터를 사용한다.
