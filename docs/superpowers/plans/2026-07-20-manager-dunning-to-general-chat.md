# Manager Dunning to General Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve AI dunning targets from server-owned billing data and deliver confirmed payment reminders into the tenant's contract general chat.

**Architecture:** The copilot domain deterministically prepares a confirmation action for explicit natural-language dunning sends, without accepting model-generated bill IDs. The billing command keeps its current unpaid and deposit guards, then reuses or creates the general messaging thread through existing messaging-domain methods and returns that thread as the navigation target.

**Tech Stack:** NestJS, TypeScript, Node test runner, existing Roomlog billing and messaging domains

## Global Constraints

- Keep `billing.send_dunning` as the only command that can send a payment reminder.
- Preserve confirmation, unpaid-balance, published-bill, payment-report, and unmatched-deposit guards.
- Reuse the contract general chat for the same room and tenant; create it only when absent.
- Do not create a `payment` context thread for a confirmed dunning send.
- Do not add SMS or external messaging integration.

---

### Task 1: Deterministic dunning preparation

**Files:**
- Modify: `apps/api/src/roomlog/services/roomlog-copilot.domain.spec.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-copilot.domain.ts`
- Modify: `apps/api/src/roomlog/services/manager-agent-persona.ts`

**Interfaces:**
- Produces: `isExplicitDunningSendRequest(message?: string): boolean`
- Consumes: existing `createPendingAction(managerId, "billing.send_dunning", commandInput)`

- [ ] **Step 1: Write failing tests**

Add a test that calls `chatManagerCopilot` with `103호 월세 독촉문자 보내` and asserts that it creates a `billing.send_dunning` pending action without invoking `fetch`. Update the tool-schema assertion to require that `billId` is absent.

```ts
it("prepares an explicit room dunning send before asking the model", async () => {
  const service = new RoomlogService();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("model should not be called");
  }) as typeof fetch;

  try {
    const result = await service.chatManagerCopilot("landlord-demo", {
      messages: [{ role: "user", content: "411호 월세 독촉문자 보내" }]
    });
    assert.equal(result.pendingAction?.kind, "billing.send_dunning");
    assert.equal(result.pendingAction?.dunningPreview?.unitId, "411");
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Run the copilot test and confirm RED**

Run:

```bash
node --test -r ts-node/register src/roomlog/services/roomlog-copilot.domain.spec.ts
```

Expected: FAIL because chat currently calls OpenAI and the schema still exposes `billId`.

- [ ] **Step 3: Implement deterministic intent preparation**

Add and use:

```ts
export function isExplicitDunningSendRequest(message?: string): boolean {
  const normalized = (message ?? "").trim();
  if (!normalized) return false;
  if (/(취소|보류|말고|문구만|초안|작성|현황|조회|알려)/u.test(normalized)) return false;
  return /(독촉|미납|연체|월세|납부)/u.test(normalized) &&
    /(보내|발송|전송|문자)/u.test(normalized);
}
```

Before the API-key/model branch, read the last user message. If it matches, call `createPendingAction` with `{ command: "billing.send_dunning", text: lastUserMessage }` and return its pending action. Remove `billId` from the model tool schema and from parsed model arguments. Keep `intent.billId` for server-generated billing-page intents.

- [ ] **Step 4: Run the copilot test and confirm GREEN**

Run the command from Step 2.

Expected: PASS.

### Task 2: Deliver confirmed dunning to contract general chat

**Files:**
- Modify: `apps/api/src/roomlog/roomlog.service.spec.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-copilot.domain.spec.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`

**Interfaces:**
- Changes: `sendManagerDunning(...): { ok: true; threadId: string }`
- Uses: `RoomlogMessagingDomain.listManagerMessagingThreads`, `addManagerMessagingThreadMessage`, and `startManagerConversation`

- [ ] **Step 1: Write failing delivery tests**

Replace payment-thread expectations with general-chat expectations. Cover both creation and reuse:

```ts
const result = await service.runManagerAgentCommand("landlord-demo", {
  command: "billing.send_dunning",
  text: "411호 연체 독촉 메시지 보내줘"
});
const generalThreads = service
  .listTenantMessagingThreads("tenant-billing-411")
  .filter((thread) => thread.context === "general" && !thread.contextRef);

assert.equal(result.status, "executed");
assert.equal(generalThreads.length, 1);
assert.match(generalThreads[0].lastMessage, /미납|청구|납부/);
assert.equal(
  service.listTenantMessagingThreads("tenant-billing-411")
    .some((thread) => thread.context === "payment"),
  false
);
```

For reuse, create a general thread first, send the dunning, and assert that the same thread ID receives the new manager message.

- [ ] **Step 2: Run the focused service test and confirm RED**

Run:

```bash
node --test -r ts-node/register --test-name-pattern="dunning|독촉" src/roomlog/roomlog.service.spec.ts
```

Expected: FAIL because the current code creates a payment thread.

- [ ] **Step 3: Replace direct payment-thread persistence**

In `recordManagerDunningMessage`, resolve the exact managed room from `bill.roomId` first and fall back to the normalized unit only for legacy records. Require a linked tenant instead of silently succeeding.

Find the latest matching general thread:

```ts
const existing = this.messaging
  .listManagerMessagingThreads(managerId, "general")
  .find((thread) =>
    thread.roomId === room.id &&
    thread.tenantId === tenantId &&
    !thread.contextRef
  );
```

If it exists, call `addManagerMessagingThreadMessage`. Otherwise call `startManagerConversation`. Return the resulting thread ID. Make `sendManagerDunning` return that ID and change the command result to navigate to `/manager/messaging/04?id=<threadId>`.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the copilot-domain test and the focused service test.

Expected: PASS.

- [ ] **Step 5: Verify API build and full API tests**

Run:

```bash
pnpm --filter api build
pnpm test:api
```

Expected: build exits 0. If unrelated pre-existing tests fail, report them separately while keeping the focused tests green.

- [ ] **Step 6: Rebuild the Docker services and smoke test**

Run:

```bash
docker compose up -d --build api web
docker compose ps
curl -fsS -o /dev/null http://localhost:3000/
curl -fsS -o /dev/null http://localhost:4000/api/health
```

Expected: containers are running and both HTTP requests succeed.

- [ ] **Step 7: Review the final diff**

Run:

```bash
git diff --check
git status -sb
```

Expected: no whitespace errors and only the approved copilot, billing delivery, tests, and plan changes.
