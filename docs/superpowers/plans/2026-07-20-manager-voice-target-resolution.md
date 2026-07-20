# Manager Voice Target Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리 비서가 경미하게 틀린 음성 건물명과 호실 표현을 실제 관리 후보 안에서 해석하고, 독촉·공지 확인을 PostgreSQL에 저장해 한 번의 승인으로 안전하게 발송한다.

**Architecture:** 대상 선택은 모델이 아니라 순수 서버 후보 해석기가 담당하며, 유일 후보만 자동 선택한다. 독촉·공지는 기존 `AgentToolGateService`의 PREPARE/CONFIRM 흐름으로 통합하고, Realtime과 텍스트 코파일럿은 동일한 확인 ID를 사용한다.

**Tech Stack:** TypeScript, NestJS, Next.js 16, React 19, Prisma/PostgreSQL, Node test runner, OpenAI Realtime WebRTC

## Global Constraints

- 관리 범위 밖 호실은 후보에 포함하지 않는다.
- 유일 후보만 자동 선택하고 여러 후보 또는 낮은 유사도는 되묻는다.
- 승인 없는 즉시 발송은 추가하지 않는다.
- 독촉 발송 직전 기존 미납·입금 가드를 다시 실행한다.
- 공지·독촉 확인 상태는 API 재시작과 브라우저 재접속 뒤에도 복구한다.
- 확인 ID를 멱등 키로 사용해 중복 발송을 막는다.
- UI 확인 버튼은 복원하지 않고 `승인`, `진행해`, `보내` 텍스트·음성만 사용한다.
- 스타일 변경은 없으며 raw hex를 추가하지 않는다.

---

### Task 1: 관리 대상 후보 해석기

**Files:**
- Create: `apps/api/src/roomlog/services/manager-target-resolver.ts`
- Create: `apps/api/src/roomlog/services/manager-target-resolver.spec.ts`

**Interfaces:**
- Consumes: 관리인이 접근 가능한 `{ id, buildingName, unitId }` 후보와 사용자 대상 문자열
- Produces:

```ts
export type ManagerTargetCandidate = {
  id: string;
  buildingName: string;
  unitId: string;
};

export type ManagerTargetResolution =
  | { status: "resolved"; candidate: ManagerTargetCandidate }
  | { status: "ambiguous"; candidates: ManagerTargetCandidate[] }
  | { status: "not_found"; candidates: ManagerTargetCandidate[] };

export function resolveManagerTarget(
  rawTarget: string,
  candidates: readonly ManagerTargetCandidate[],
): ManagerTargetResolution;
```

- [ ] **Step 1: Write failing normalization and unique-candidate tests**

```ts
it("resolves a lightly mistranscribed building name inside the manager scope", () => {
  const result = resolveManagerTarget(
    "관리자 세입자 플로어 테스트 2 102호",
    [
      { id: "room-1", buildingName: "관리자-세입자 플로우테스트1", unitId: "102" },
      { id: "room-2", buildingName: "관리자-세입자 플로우테스트2", unitId: "102" },
    ],
  );
  assert.deepEqual(result, {
    status: "resolved",
    candidate: {
      id: "room-2",
      buildingName: "관리자-세입자 플로우테스트2",
      unitId: "102",
    },
  });
});

it("does not guess when the same unit has no building clue", () => {
  const result = resolveManagerTarget("102호", [
    { id: "room-1", buildingName: "A빌라", unitId: "102" },
    { id: "room-2", buildingName: "B빌라", unitId: "102" },
  ]);
  assert.equal(result.status, "ambiguous");
});

it("uses the only in-scope candidate when speech loses the unit number", () => {
  const result = resolveManagerTarget("권리서신 업로드 테스트 대기호", [
    { id: "room-1", buildingName: "권리서신 업로드 테스트", unitId: "102" },
  ]);
  assert.equal(result.status, "resolved");
});
```

- [ ] **Step 2: Run the resolver test and confirm RED**

Run:

```bash
pnpm --filter api exec node --test -r ts-node/register \
  src/roomlog/services/manager-target-resolver.spec.ts
```

Expected: FAIL because `manager-target-resolver.ts` does not exist.

- [ ] **Step 3: Implement deterministic normalization and scoring**

```ts
function compact(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\-_.,!?()[\]{}'"]/gu, "");
}

function editSimilarity(left: string, right: string) {
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length, 1);
}

export function resolveManagerTarget(
  rawTarget: string,
  candidates: readonly ManagerTargetCandidate[],
): ManagerTargetResolution {
  const unit = rawTarget.match(/([0-9]{1,4})\s*호/u)?.[1];
  const unitPool = unit
    ? candidates.filter((candidate) => candidate.unitId.replace(/호$/u, "") === unit)
    : [...candidates];
  if (unitPool.length === 1) return { status: "resolved", candidate: unitPool[0] };

  const targetBuilding = compact(rawTarget.replace(/[0-9]{1,4}\s*호?/gu, ""));
  const ranked = unitPool
    .map((candidate) => ({
      candidate,
      score: editSimilarity(targetBuilding, compact(candidate.buildingName)),
    }))
    .sort((a, b) => b.score - a.score);
  const [first, second] = ranked;
  if (first && first.score >= 0.72 && (!second || first.score - second.score >= 0.08)) {
    return { status: "resolved", candidate: first.candidate };
  }
  return unitPool.length
    ? { status: "ambiguous", candidates: unitPool.slice(0, 3) }
    : { status: "not_found", candidates: candidates.slice(0, 3) };
}
```

The implementation must include a local iterative `levenshtein(left, right)` helper and must not add a dependency.

- [ ] **Step 4: Run resolver tests and confirm GREEN**

Run the Step 2 command.

Expected: all resolver tests PASS.

- [ ] **Step 5: Commit the resolver**

```bash
git add apps/api/src/roomlog/services/manager-target-resolver.ts \
  apps/api/src/roomlog/services/manager-target-resolver.spec.ts
git commit -m "feat(api): resolve manager voice targets"
```

---

### Task 2: 공지와 독촉에 후보 해석 적용

**Files:**
- Modify: `apps/api/src/roomlog/services/roomlog-messaging.domain.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.spec.ts`

**Interfaces:**
- Consumes: Task 1의 `resolveManagerTarget`
- Produces:

```ts
resolveManagerAgentAnnouncement(
  managerId: string,
  input: ManagerAgentCommandInput,
): {
  status: "ready";
  commandInput: ManagerAgentCommandInput;
  summary: string;
  targetLabel: string;
} | {
  status: "blocked";
  summary: string;
};
```

- [ ] **Step 1: Add failing service tests for fuzzy announcements and unique overdue bills**

```ts
it("resolves a lightly mistranscribed managed building for an announcement", async () => {
  const result = await service.runManagerAgentCommand("landlord-demo", {
    command: "messaging.send_announcement",
    target: "관리자 세입자 플로어 테스트 2 102호",
    title: "에어컨 안내",
    body: "에어컨 수리 관련 안내입니다.",
  });
  assert.notEqual(result.summary, "102호가 여러 건물에 있습니다. 건물명을 함께 알려주세요.");
});

it("prepares the only overdue bill even when speech loses the room number", () => {
  const result = service.resolveManagerAgentPendingCommand(
    "landlord-demo",
    "billing.send_dunning",
    { command: "billing.send_dunning", text: "미납된 거 독촉 보내줘" },
  );
  assert.equal(result.status, "ready");
});
```

Use fixture setup that creates two managed `102` rooms for the first test and exactly one sendable overdue bill for the second.

- [ ] **Step 2: Run focused service tests and confirm RED**

Run:

```bash
pnpm --filter api exec node --test -r ts-node/register \
  --test-name-pattern="mistranscribed|only overdue" \
  src/roomlog/roomlog.service.spec.ts
```

Expected: announcement remains ambiguous or not found.

- [ ] **Step 3: Replace exact building substring matching**

In `resolveManagerAnnouncementAudience`, build candidates only from `managedRooms`, call `resolveManagerTarget`, and:

```ts
if (resolution.status === "resolved") {
  rooms = managedRooms.filter((room) => room.id === resolution.candidate.id);
  scope = "unit";
  targetLabel = `${rooms[0].buildingName} ${this.displayUnitId(rooms[0])}호`;
} else if (resolution.status === "ambiguous") {
  const choices = resolution.candidates
    .map((candidate) => `${candidate.buildingName} ${candidate.unitId}호`)
    .join(", ");
  throw new BadRequestException(`대상이 여러 곳입니다: ${choices}. 하나를 지정해 주세요.`);
}
```

Retain the exact `전체` behavior and recipient filtering.

- [ ] **Step 4: Keep dunning selection inside sendable bill candidates**

In `findManagerAgentDunningBill`, create target candidates from `managerBills(managerId).filter(canSendManagerDunning)` and their actual rooms. If the sendable list contains exactly one bill, return it before fuzzy matching. If multiple bills remain, use room/tenant/month clues and return actual choices.

Do not allow fuzzy target resolution to include paid, confirming, orphan-guarded, or inaccessible bills.

- [ ] **Step 5: Run focused and existing dunning/announcement tests**

Run:

```bash
pnpm --filter api exec node --test -r ts-node/register \
  --test-name-pattern="announcement|dunning|독촉|공지" \
  src/roomlog/roomlog.service.spec.ts
```

Expected: new and existing tests PASS.

- [ ] **Step 6: Commit service integration**

```bash
git add apps/api/src/roomlog/services/roomlog-messaging.domain.ts \
  apps/api/src/roomlog/roomlog.service.ts \
  apps/api/src/roomlog/roomlog.service.spec.ts
git commit -m "feat(api): resolve managed announcement and dunning targets"
```

---

### Task 3: 독촉·공지 확인을 PostgreSQL AgentToolAction으로 통합

**Files:**
- Modify: `packages/types/src/agent-tools.ts`
- Modify: `packages/types/src/manager-assistant.ts`
- Modify: `apps/api/src/agent-tools/manager-agent-tool.adapter.ts`
- Modify: `apps/api/src/agent-tools/manager-agent-tool.adapter.spec.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-copilot.domain.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-copilot.domain.spec.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Modify: `apps/api/src/agent-tools/agent-tools.module.ts`

**Interfaces:**
- Extend `ManagerAgentToolName` with `"messaging.send_announcement"`.
- Extend `ManagerCopilotPendingAction["kind"]` with `"messaging.send_announcement"`.
- Add:

```ts
export interface ManagerCopilotActionGateway {
  prepare(
    managerId: string,
    commandInput: ManagerAgentCommandInput,
  ): Promise<ManagerCopilotChatResponse>;
  confirm(managerId: string, confirmationId: string): Promise<ManagerCopilotChatResponse>;
  cancel(managerId: string, confirmationId: string): Promise<ManagerCopilotChatResponse>;
}
```

- [ ] **Step 1: Add failing adapter persistence tests**

Test that `billing.send_dunning` and `messaging.send_announcement` both produce `pending_confirmation`, persist through a new Prisma repository instance, and execute once after confirm.

```ts
const prepared = await gate.invoke(manager, {
  tool: "messaging.send_announcement",
  toolCallId: "voice-announcement-1",
  arguments: {
    target: "관리자-세입자 플로우테스트2 102호",
    title: "에어컨 안내",
    body: "오늘 에어컨 설치 작업이 있습니다.",
  },
});
assert.equal(prepared.status, "pending_confirmation");
```

- [ ] **Step 2: Run agent-tool tests and confirm RED**

Run:

```bash
pnpm --filter api exec node --test -r ts-node/register \
  src/agent-tools/manager-agent-tool.adapter.spec.ts \
  src/agent-tools/prisma-agent-tool-action.repository.spec.ts
```

Expected: announcement tool is not part of the manager allowlist.

- [ ] **Step 3: Add announcement PREPARE/EXECUTE support**

Update `POLICY`:

```ts
"messaging.send_announcement": "PREPARE",
```

In `prepareMutation`, allow `target`, `title`, `body`, resolve the audience without sending, and store the resolved target room IDs through `commandPayload`. Build a confirmation card containing actual target, title, and body.

In `executePending`, re-resolve access and recipients, then call `runManagerAgentCommand`. Use `context.confirmationId` as the execution idempotency key.

- [ ] **Step 4: Replace copilot Map operations with gateway calls**

Keep lookup tool execution in `RoomlogCopilotDomain`, but route all send commands through `ManagerCopilotActionGateway`. Remove `pendingCopilotActions`, `cleanupExpiredActions`, and `deleteManagerPendingActions`.

The gateway adapter must map:

```ts
{ status: "pending_confirmation", pendingAction }
```

to:

```ts
{
  mode: "openai",
  reply: `${pendingAction.card.target} 내용을 확인했습니다. 발송하려면 '승인', '진행해', 또는 '보내'라고 말씀해 주세요.`,
  pendingAction: {
    id: pendingAction.confirmationId,
    kind: pendingAction.tool,
    summary: `${pendingAction.card.target}에 ${pendingAction.card.title}`,
  },
}
```

and map executed data to one receipt.

- [ ] **Step 5: Configure the gateway after AgentTools DI construction**

Add `RoomlogService.configureManagerCopilotActionGateway(gateway)` and an `AgentToolsModule` initializer provider that supplies an adapter backed by `AgentToolGateService`. The adapter principal is always `{ userId: managerId, role: "LANDLORD" }`.

The `RoomlogService` fallback before configuration must block send preparation with a service-unavailable message; it must not fall back to process memory.

- [ ] **Step 6: Run copilot and agent tool tests**

Run:

```bash
pnpm --filter @roomlog/types build
pnpm --filter api exec node --test -r ts-node/register \
  src/agent-tools/manager-agent-tool.adapter.spec.ts \
  src/roomlog/services/roomlog-copilot.domain.spec.ts
```

Expected: all tests PASS and no module-scope pending `Map` remains.

- [ ] **Step 7: Commit durable confirmations**

```bash
git add packages/types/src/agent-tools.ts \
  packages/types/src/manager-assistant.ts \
  apps/api/src/agent-tools/manager-agent-tool.adapter.ts \
  apps/api/src/agent-tools/manager-agent-tool.adapter.spec.ts \
  apps/api/src/roomlog/services/roomlog-copilot.domain.ts \
  apps/api/src/roomlog/services/roomlog-copilot.domain.spec.ts \
  apps/api/src/roomlog/roomlog.service.ts \
  apps/api/src/agent-tools/agent-tools.module.ts
git commit -m "fix(api): persist manager assistant confirmations"
```

---

### Task 4: 음성·텍스트 클라이언트의 현재 확인 건 복구

**Files:**
- Create: `apps/web/src/lib/manager-agent-confirmation-api.ts`
- Create: `apps/web/src/lib/manager-agent-confirmation-api.spec.ts`
- Modify: `apps/web/src/app/manager/_components/manager-assistant-session.ts`
- Modify: `apps/web/src/app/manager/_components/manager-assistant-session.spec.ts`
- Modify: `apps/web/src/app/manager/_components/useManagerAssistantSession.ts`
- Modify: `apps/web/src/app/manager/_components/useManagerRealtimeSession.ts`
- Modify: `apps/web/src/app/manager/_components/useManagerRealtimeSession.spec.ts`
- Modify: `apps/web/src/app/manager/agent/realtime/ManagerRealtimeConsole.tsx`
- Modify: `apps/web/src/app/manager/_components/manager-realtime-events.ts`
- Modify: `apps/web/src/app/manager/_components/manager-realtime-events.spec.ts`

**Interfaces:**

```ts
export function getCurrentManagerConfirmation(): Promise<ManagerCopilotPendingAction | null>;
export function confirmManagerAction(id: string): Promise<ManagerCopilotChatResponse>;
export function cancelManagerAction(id: string): Promise<ManagerCopilotChatResponse>;
export function normalizeManagerVoiceCommand(
  input: ManagerAgentCommandInput,
): ManagerAgentCommandInput;
```

- [ ] **Step 1: Add failing approval normalization and command correction tests**

```ts
assert.equal(managerAssistantPendingTextCommand("진행해."), "confirm");
assert.equal(managerAssistantPendingTextCommand("승인!"), "confirm");
assert.equal(managerAssistantPendingTextCommand("보내"), "confirm");

assert.deepEqual(
  normalizeManagerVoiceCommand({
    command: "messaging.send_reply",
    text: "102호 미납 독촉 문자 보내줘",
  }),
  {
    command: "billing.send_dunning",
    text: "102호 미납 독촉 문자 보내줘",
  },
);
```

- [ ] **Step 2: Run focused web tests and confirm RED**

Run:

```bash
pnpm --filter web exec node scripts/run-ts-unit-tests.mjs
```

Expected: punctuation approvals and misrouted dunning fail.

- [ ] **Step 3: Implement confirmation API and BFF calls**

Use existing `/api/manager/[...path]` forwarding routes:

```ts
GET  /api/manager/agent-confirmations/current
POST /api/manager/agent-confirmations/:id/confirm
POST /api/manager/agent-confirmations/:id/cancel
```

Map `AgentPendingActionView` to the existing panel `ManagerCopilotPendingAction`.

- [ ] **Step 4: Restore server state on panel/voice open**

When the assistant panel mounts and before a voice session accepts commands:

1. Fetch current server confirmation.
2. Replace the session-stored pending action with the server result.
3. If the server returns null, clear the stale browser action.
4. If a confirm request returns unavailable, fetch current once and either confirm that current action or clear it. Never loop.

- [ ] **Step 5: Normalize approval tokens and voice commands**

```ts
export function managerAssistantPendingTextCommand(value: string): "confirm" | null {
  const normalized = value.normalize("NFKC").replace(/[\s.!?,。！？]+/gu, "");
  return /^(승인|진행해|보내)$/u.test(normalized) ? "confirm" : null;
}
```

`normalizeManagerVoiceCommand` changes only `messaging.send_reply` to `billing.send_dunning` when text/body contains both a payment term `(독촉|미납|연체|월세|납부|청구)` and a send term `(보내|발송|전송|문자)`.

- [ ] **Step 6: Route all pending confirms through the DB confirmation API**

Remove client assumptions that the copilot in-memory action still exists. Both side panel and full Realtime console use the confirmation API for confirm/cancel, while non-send lookups continue using the existing realtime command endpoint.

- [ ] **Step 7: Run web tests and build**

Run:

```bash
pnpm --filter web test:unit
pnpm --filter web build
```

Expected: relevant tests PASS and Next production build succeeds.

- [ ] **Step 8: Commit client reconciliation**

```bash
git add apps/web/src/lib/manager-agent-confirmation-api.ts \
  apps/web/src/lib/manager-agent-confirmation-api.spec.ts \
  apps/web/src/app/manager/_components/manager-assistant-session.ts \
  apps/web/src/app/manager/_components/manager-assistant-session.spec.ts \
  apps/web/src/app/manager/_components/useManagerAssistantSession.ts \
  apps/web/src/app/manager/_components/useManagerRealtimeSession.ts \
  apps/web/src/app/manager/_components/useManagerRealtimeSession.spec.ts \
  apps/web/src/app/manager/agent/realtime/ManagerRealtimeConsole.tsx \
  apps/web/src/app/manager/_components/manager-realtime-events.ts \
  apps/web/src/app/manager/_components/manager-realtime-events.spec.ts
git commit -m "fix(web): reconcile manager assistant confirmations"
```

---

### Task 5: 통합 검증과 운영 배포

**Files:**
- Modify only files required by failures directly caused by Tasks 1–4.

**Interfaces:**
- Consumes: Tasks 1–4
- Produces: verified main commit and production deployment

- [ ] **Step 1: Run focused regression tests**

```bash
pnpm --filter @roomlog/types build
pnpm --filter api exec node --test -r ts-node/register \
  src/roomlog/services/manager-target-resolver.spec.ts \
  src/agent-tools/manager-agent-tool.adapter.spec.ts \
  src/roomlog/services/roomlog-copilot.domain.spec.ts
pnpm --filter web test:unit
```

Expected: target, durable confirmation, approval normalization, and voice command tests PASS.

- [ ] **Step 2: Run repository verification**

```bash
bash scripts/verify.sh
```

Expected: types, UI, web build, API build, and API smoke all PASS.

- [ ] **Step 3: Run Docker verification when Docker Desktop is available**

```bash
docker compose up -d --build api web
docker compose ps
curl -fsS http://localhost:4000/api/health
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:3000/
```

Expected: api/web running, API health 200, web 200.

- [ ] **Step 4: Check diff and commit any verification-only fix**

```bash
git diff --check
git status --short
```

Do not modify or stage unrelated user changes.

- [ ] **Step 5: Push main and monitor production**

```bash
git push origin main
```

Monitor the `Deploy` GitHub Actions run, then verify on EC2:

```bash
ssh rlog 'cd /home/ubuntu/roomlog && git rev-parse HEAD && docker compose -f docker-compose.prod.yml ps'
ssh rlog 'curl -fsS http://127.0.0.1:4000/api/health'
curl -fsS -o /dev/null -w '%{http_code}\n' https://woo-zu.com/
```

Expected: EC2 HEAD equals `origin/main`, both containers are running, API/DB health is 200, production HTTPS is 200.

