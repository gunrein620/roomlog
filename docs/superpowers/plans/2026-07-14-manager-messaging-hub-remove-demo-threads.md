# Manager Messaging Hub Remove Demo Threads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리인 소통 허브가 테스트 건물 더미 대화를 표시하지 않고 실제 API 대화 또는 빈 상태만 표시하게 한다.

**Architecture:** `messaging-manager-api.ts`에서 대화 전용 demo 상수와 파생 ID를 삭제하고, `listManagerThreads`의 오류 fallback을 빈 배열로 고정한다. 기존 페이지의 빈 상태 렌더링은 유지하며 `property-shell.spec.mjs`가 production 소스에 더미 대화 계약이 다시 들어오지 못하게 막는다.

**Tech Stack:** Next.js 16 App Router, TypeScript, Node test runner

## Global Constraints

- 공지 작성·번역·발송 결과의 데모 데이터는 변경하지 않는다.
- API 또는 데이터베이스에 저장된 실제 대화는 삭제하지 않는다.
- Docker, 배포 환경 변수, 네트워크 설정은 변경하지 않는다.
- 실패 테스트 확인 후 구현하고, `pnpm test:web`과 `bash scripts/verify.sh` 통과 후 `kms-complain`에 커밋·푸시한다.

---

## File Structure

- `apps/web/src/lib/messaging-manager-api.ts`: 관리인 대화 목록의 실제 API 조회와 빈 fallback을 소유한다.
- `apps/web/property-shell.spec.mjs`: 소통 허브 production 소스에 더미 대화가 없는 계약을 검증한다.

---

### Task 1: 소통 허브 더미 대화 제거

**Files:**
- Modify: `apps/web/src/lib/messaging-manager-api.ts`
- Test: `apps/web/property-shell.spec.mjs`

**Interfaces:**
- Consumes: `listManagerThreads(context?: ThreadContext): Promise<Thread[]>`
- Produces: API 성공 시 실제 `Thread[]`, API 실패 시 `[]`

- [ ] **Step 1: Write the failing source contract test**

Extend `opens manager message compose only from real API thread ids` in `apps/web/property-shell.spec.mjs`:

```js
assert.doesNotMatch(managerMessagingApiSource, /DEMO_MANAGER_THREADS/);
assert.doesNotMatch(managerMessagingApiSource, /DEMO_MANAGER_THREAD_ID/);
assert.doesNotMatch(managerMessagingApiSource, /테스트 건물[123]/);
assert.doesNotMatch(managerMessagingApiSource, /th_mgr_(302|405|201)/);
assert.match(
  managerMessagingApiSource,
  /listManagerThreads[\s\S]*?tryFetch\([\s\S]*?managerMessagingPaths\.threads\(context\),[\s\S]*?\[\]/,
);
```

- [ ] **Step 2: Run the source contract and verify RED**

Run:

```bash
cd apps/web && node --test --test-name-pattern="opens manager message compose only from real API thread ids" property-shell.spec.mjs
```

Expected: FAIL because `DEMO_MANAGER_THREADS`, `DEMO_MANAGER_THREAD_ID`, test building strings, and demo thread IDs still exist.

- [ ] **Step 3: Remove the demo thread declarations**

Delete the complete `DEMO_MANAGER_THREADS: Thread[]` declaration and delete:

```ts
export const DEMO_MANAGER_THREAD_ID = DEMO_MANAGER_THREADS[0].id;
```

Keep `DEMO_MANAGER_DRAFTS`, `DEMO_MANAGER_RECIPIENTS`, `DEMO_MANAGER_RESULTS`, `DEMO_MANAGER_DRAFT_ID`, and `DEMO_MANAGER_RESULT_ID` unchanged because they belong to announcement screens outside this task.

- [ ] **Step 4: Replace the conversation fallback with an empty list**

Replace `listManagerThreads` with:

```ts
export function listManagerThreads(context?: ThreadContext): Promise<Thread[]> {
  return tryFetch(
    managerMessagingPaths.threads(context),
    [],
    "관리인 메시지 목록 조회",
  );
}
```

Change the generic warning copy so it does not claim every fallback is demo data:

```ts
console.warn(`[messaging/manager-api] ${label} 실패 → 폴백 사용`, error);
```

- [ ] **Step 5: Run targeted and full web tests**

Run:

```bash
cd apps/web && node --test --test-name-pattern="opens manager message compose only from real API thread ids" property-shell.spec.mjs
cd ../.. && pnpm test:web
```

Expected: targeted contract and complete web test suite PASS with zero failures.

- [ ] **Step 6: Run repository verification**

Run:

```bash
bash scripts/verify.sh
```

Expected: types, ui, web, api build and API smoke checks PASS. Infrastructure files must not be edited if an environmental failure occurs.

- [ ] **Step 7: Commit and push**

```bash
git add apps/web/src/lib/messaging-manager-api.ts apps/web/property-shell.spec.mjs
git commit -m "fix(messaging): 소통 허브 더미 대화 제거"
git push origin kms-complain
```

- [ ] **Step 8: Rebuild the running web container and verify HTTP**

Run:

```bash
docker compose up -d --build web
docker compose ps web api postgres
curl -fsS -o /dev/null -w 'web %{http_code}\n' http://localhost:3000/manager/messaging/00
curl -fsS -o /dev/null -w 'api %{http_code}\n' http://localhost:4000/api/health
```

Expected: web and API return HTTP 200 and all three containers remain running.
