# Manager Batch Dunning and Target Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리인 AI가 여러 미납 청구를 한 번의 승인으로 안전하게 독촉하고, 비슷한 건물명의 동일 호실 공지 대상을 계약·수신자와 후속 발화로 정확히 선택하게 한다.

**Architecture:** 순수 대상 해석기와 독촉 집합 해석기를 먼저 확장하고, 위험 작업은 기존 `AgentToolAction` 확인 게이트에 청구 ID 배열로 저장한다. 공지 후보는 수신 가능한 계약 세대를 우선하며, 정말 모호한 경우에는 짧게 만료되는 관리인별 후보 선택 저장소를 사용한다. 음성과 텍스트는 같은 코파일럿 준비/확정 경로를 사용하고 Realtime UI는 서버 답변을 한 번만 렌더링한다.

**Tech Stack:** TypeScript, NestJS, Next.js 16, Prisma/PostgreSQL, Node test runner, pnpm monorepo

## Global Constraints

- 독촉은 기존 계약 관계의 일반 소통 채팅으로만 발송한다.
- 공실 또는 공지 수신자가 없는 호실은 수신 가능한 후보가 있을 때 모호성 계산에서 제외한다.
- 다건 독촉은 한 번 승인하지만 각 청구의 미납·입금·가드 상태는 실행 직전에 개별 재검증한다.
- 한 청구 실패가 다른 정상 청구 발송을 롤백하지 않으며, 확인 작업은 재실행돼도 중복 발송하지 않는다.
- 유사도 기준을 낮춰 애매한 대상을 임의 선택하지 않는다.
- UI 버튼을 추가하지 않고 `승인` 또는 `진행해` 텍스트·음성으로 확정한다.
- 스타일 변경이 필요하면 `packages/ui/src/tokens.css`의 CSS 변수만 사용하고 raw hex를 추가하지 않는다.
- 기본 검증은 `bash scripts/verify.sh`다.

---

## File Structure

- `packages/types/src/manager-assistant.ts`: 다건 독촉 미리보기와 코파일럿 응답 계약.
- `apps/api/src/roomlog/services/manager-target-resolver.ts`: 호실·건물명·후속 순번을 판별하는 순수 함수.
- `apps/api/src/roomlog/services/manager-target-resolver.spec.ts`: 유사 건물명과 순번 선택 단위 테스트.
- `apps/api/src/roomlog/services/manager-dunning-target-resolver.ts`: 단건/집합 독촉 대상 선택 순수 함수.
- `apps/api/src/roomlog/services/manager-dunning-target-resolver.spec.ts`: 집합 표현과 후보 축소 테스트.
- `prisma/schema.prisma`: 만료 가능한 관리인 공지 후보 선택 모델.
- `prisma/migrations/20260721010000_manager_agent_target_selections/migration.sql`: 후보 선택 저장 테이블.
- `apps/api/src/agent-tools/manager-target-selection.repository.ts`: 후보 선택 저장소 계약과 레코드 타입.
- `apps/api/src/agent-tools/prisma-manager-target-selection.repository.ts`: PostgreSQL 구현.
- `apps/api/src/agent-tools/manager-copilot-action.gateway.ts`: 공지 후보 저장·후속 선택과 다건 독촉 확인 게이트 연결.
- `apps/api/src/agent-tools/manager-agent-tool.adapter.ts`: 다건 독촉 준비 카드와 건별 재검증·부분 성공 실행.
- `apps/api/src/agent-tools/agent-tools.module.ts`: 후보 저장소 DI 및 종료 수명주기.
- `apps/api/src/roomlog/services/roomlog-messaging.domain.ts`: 수신 가능한 계약 세대 우선 공지 해석.
- `apps/api/src/roomlog/roomlog.service.ts`: 다건 독촉 해석·실행 결과와 사실 기반 청구 요약.
- `apps/api/src/roomlog/roomlog.service.spec.ts`: 다건 독촉·공지 통합 회귀 테스트.
- `apps/api/src/roomlog/services/roomlog-copilot.domain.ts`: 활성 후보 선택을 후속 발화보다 먼저 해석.
- `apps/api/src/roomlog/services/roomlog-copilot.domain.spec.ts`: “뒤에 거”와 한 번 승인 통합 테스트.
- `apps/web/src/app/manager/_components/useManagerRealtimeSession.ts`: 음성 도구 결과 중복 렌더링 제거.
- `apps/web/src/app/manager/_components/useManagerAssistantSession.ts`: 답변 억제 옵션과 실행 영수증 중복 제거.
- `apps/web/src/app/manager/_components/useManagerRealtimeSession.spec.ts`: 음성 중복 방지 테스트.
- `apps/web/src/app/manager/_components/useManagerAssistantSession.spec.ts`: 코파일럿 이벤트 렌더링 테스트.

---

### Task 1: 수신 가능 세대 우선 대상 해석과 후속 순번 선택

**Files:**
- Modify: `apps/api/src/roomlog/services/manager-target-resolver.ts`
- Modify: `apps/api/src/roomlog/services/manager-target-resolver.spec.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-messaging.domain.ts`
- Test: `apps/api/src/roomlog/roomlog.service.spec.ts`

**Interfaces:**
- Consumes: 기존 `ManagerTargetCandidate { id, buildingName, unitId }`.
- Produces:

```ts
export type ManagerTargetSelectionHint =
  | { kind: "ordinal"; index: number }
  | { kind: "text"; value: string };

export function targetSelectionHint(text: string): ManagerTargetSelectionHint | undefined;

export function resolveManagerTarget(
  rawTarget: string,
  candidates: readonly ManagerTargetCandidate[],
  followupText?: string,
): ManagerTargetResolution;
```

- [ ] **Step 1: 후속 순번과 수신 가능 후보 우선 테스트를 작성한다**

```ts
it("selects the second candidate from a Korean follow-up", () => {
  const result = resolveManagerTarget("103호", candidates, "뒤에 거");
  assert.equal(result.status, "resolved");
  if (result.status === "resolved") {
    assert.equal(result.candidate.buildingName, "관리자-세입자 플로우테스트3");
  }
});

it("prefers the only room with an announcement recipient", async () => {
  // 동일 103호 두 개 중 하나만 tenantRooms/활성 계약 수신자를 갖게 구성한다.
  const result = await service.runManagerAgentCommand("landlord-demo", {
    command: "messaging.send_announcement",
    target: "103호",
    title: "에어컨 교체 안내",
    body: "오늘 에어컨 교체 작업을 진행합니다.",
  });
  assert.equal(result.status, "executed");
  assert.match(result.summary, /플로우테스트3 103호/);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run:

```bash
cd apps/api
TS_NODE_TRANSPILE_ONLY=1 node --test --test-name-pattern='Korean follow-up|announcement recipient' -r ts-node/register src/roomlog/services/manager-target-resolver.spec.ts src/roomlog/roomlog.service.spec.ts
```

Expected: `뒤에 거`가 `ambiguous`를 반환하고 공지 통합 테스트가 후보 여러 개 오류로 실패한다.

- [ ] **Step 3: 순번 힌트를 최소 구현한다**

```ts
export function targetSelectionHint(text: string): ManagerTargetSelectionHint | undefined {
  const normalized = text.normalize("NFKC").replace(/\s+/gu, "");
  if (/(첫번째|첫째|앞에거|앞쪽)/u.test(normalized)) {
    return { kind: "ordinal", index: 0 };
  }
  if (/(두번째|둘째|뒤에거|뒤쪽|마지막)/u.test(normalized)) {
    return { kind: "ordinal", index: 1 };
  }
  return normalized ? { kind: "text", value: text } : undefined;
}

export function resolveManagerTarget(
  rawTarget: string,
  candidates: readonly ManagerTargetCandidate[],
  followupText = "",
): ManagerTargetResolution {
  const hint = targetSelectionHint(followupText);
  // 기존 unitMatches 계산 직후 순번이 범위 안이면 해당 후보를 반환한다.
  if (hint?.kind === "ordinal" && unitMatches[hint.index]) {
    return { status: "resolved", candidate: unitMatches[hint.index] };
  }
  // text 힌트는 `${rawTarget} ${hint.value}`로 기존 유사도 계산에 포함한다.
}
```

- [ ] **Step 4: 공지 후보를 수신 가능한 세대로 먼저 축소한다**

`RoomlogMessagingDomain.resolveManagerAnnouncementAudience`에 후속 발화를 추가한다.

```ts
resolveManagerAnnouncementAudience(
  managerId: string,
  target?: string,
  followupText?: string,
): {
  scope: MessagingAnnouncementScope;
  targetLabel: string;
  targetRoomIds: string[];
  recipientCount: number;
  candidates?: ManagerTargetCandidate[];
}
```

호실 번호가 있는 경우:

```ts
const unitRooms = managedRooms.filter(
  (room) => this.displayUnitId(room) === roomNoMatch[1],
);
const recipientRoomIds = new Set(
  this.recipientsForDraft({
    targetRoomIds: unitRooms.map((room) => room.id),
  } as MessagingAnnouncementDraft).map(({ room }) => room.id),
);
const eligibleRooms = unitRooms.filter((room) => recipientRoomIds.has(room.id));
const candidateRooms = eligibleRooms.length ? eligibleRooms : unitRooms;
const resolution = resolveManagerTarget(normalized, toCandidates(candidateRooms), followupText);
```

- [ ] **Step 5: 관련 테스트를 통과시킨다**

Run:

```bash
cd apps/api
TS_NODE_TRANSPILE_ONLY=1 node --test --test-name-pattern='target resolver' -r ts-node/register src/roomlog/services/manager-target-resolver.spec.ts
TS_NODE_TRANSPILE_ONLY=1 node --test --test-name-pattern='announcement recipient|voice-mangled building name' -r ts-node/register src/roomlog/roomlog.service.spec.ts
```

Expected: 모든 관련 테스트 PASS.

- [ ] **Step 6: 커밋한다**

```bash
git add apps/api/src/roomlog/services/manager-target-resolver.ts apps/api/src/roomlog/services/manager-target-resolver.spec.ts apps/api/src/roomlog/services/roomlog-messaging.domain.ts apps/api/src/roomlog/roomlog.service.spec.ts
git commit -m "fix(api): prioritize reachable announcement targets"
```

---

### Task 2: 모호한 공지 후보 선택을 서버에 보존

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260721010000_manager_agent_target_selections/migration.sql`
- Create: `apps/api/src/agent-tools/manager-target-selection.repository.ts`
- Create: `apps/api/src/agent-tools/prisma-manager-target-selection.repository.ts`
- Modify: `apps/api/src/agent-tools/agent-tools.module.ts`
- Modify: `apps/api/src/agent-tools/manager-copilot-action.gateway.ts`
- Test: `apps/api/src/agent-tools/manager-target-selection.repository.spec.ts`

**Interfaces:**
- Consumes: Task 1의 `ManagerTargetCandidate`, 기존 `AgentResourceRefCodec`.
- Produces:

```ts
export type ManagerTargetSelectionRecord = {
  id: string;
  managerId: string;
  commandPayload: ManagerAgentCommandInput;
  candidates: Array<{
    roomId: string;
    buildingName: string;
    unitId: string;
    tenantName?: string;
    address?: string;
  }>;
  expiresAt: Date;
};

export interface ManagerTargetSelectionRepository {
  replace(record: ManagerTargetSelectionRecord): Promise<ManagerTargetSelectionRecord>;
  current(managerId: string): Promise<ManagerTargetSelectionRecord | null>;
  consume(managerId: string, selectionId: string): Promise<ManagerTargetSelectionRecord>;
  clear(managerId: string): Promise<void>;
}
```

- [ ] **Step 1: 저장소 계약 테스트를 작성한다**

```ts
it("replaces the manager's active target selection and expires old rows", async () => {
  await repository.replace(first);
  await repository.replace(second);
  assert.equal((await repository.current("manager-a"))?.id, second.id);
  assert.equal(await repository.current("manager-b"), null);
});

it("does not let another manager consume a selection", async () => {
  await repository.replace(first);
  await assert.rejects(
    () => repository.consume("manager-b", first.id),
    /선택할 수 있는 공지 후보가 없습니다/,
  );
});
```

- [ ] **Step 2: 실패를 확인한다**

Run:

```bash
cd apps/api
TS_NODE_TRANSPILE_ONLY=1 node --test -r ts-node/register src/agent-tools/manager-target-selection.repository.spec.ts
```

Expected: 저장소 파일과 클래스가 없어 FAIL.

- [ ] **Step 3: Prisma 모델과 마이그레이션을 추가한다**

`prisma/schema.prisma`:

```prisma
model ManagerAgentTargetSelection {
  id             String   @id
  activeKey      String   @unique
  managerId      String
  commandPayload Json
  candidates     Json
  expiresAt      DateTime
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([managerId, expiresAt])
}
```

`migration.sql`:

```sql
CREATE TABLE "ManagerAgentTargetSelection" (
  "id" TEXT NOT NULL,
  "activeKey" TEXT NOT NULL,
  "managerId" TEXT NOT NULL,
  "commandPayload" JSONB NOT NULL,
  "candidates" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManagerAgentTargetSelection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ManagerAgentTargetSelection_activeKey_key"
  ON "ManagerAgentTargetSelection"("activeKey");
CREATE INDEX "ManagerAgentTargetSelection_managerId_expiresAt_idx"
  ON "ManagerAgentTargetSelection"("managerId", "expiresAt");
```

- [ ] **Step 4: Prisma 저장소를 구현한다**

`replace`는 직렬화 트랜잭션에서 만료 행을 삭제하고 `activeKey = LANDLORD:${managerId}:announcement-target`을 upsert한다. `current`는 만료 시 null을 반환하고 행을 삭제한다. `consume`은 managerId와 id를 함께 조건으로 삭제하며 삭제된 레코드를 반환한다.

```ts
async current(managerId: string) {
  await this.prisma.managerAgentTargetSelection.deleteMany({
    where: { managerId, expiresAt: { lte: new Date() } },
  });
  const row = await this.prisma.managerAgentTargetSelection.findUnique({
    where: { activeKey: activeKey(managerId) },
  });
  return row ? record(row) : null;
}
```

- [ ] **Step 5: 게이트웨이에 후보 준비와 후속 선택을 연결한다**

```ts
async prepare(managerId: string, kind: PendingKind, commandInput: ManagerAgentCommandInput) {
  if (kind === "messaging.send_announcement") {
    const current = await this.targetSelections.current(managerId);
    const followup = commandInput.text?.trim() ?? "";
    if (current && followup) {
      const selected = resolveStoredTargetChoice(current.candidates, followup);
      if (selected) {
        await this.targetSelections.consume(managerId, current.id);
        commandInput = {
          ...current.commandPayload,
          target: `${selected.buildingName} ${selected.unitId}호`,
          text: followup,
        };
      }
    }
  }
  const resolution = this.roomlog.resolveManagerAgentPendingCommand(
    managerId,
    kind,
    commandInput,
  );
  if (resolution.status !== "ready") {
    return {
      content: {
        status: "blocked",
        domain: resolution.domain ?? this.domain(kind),
        summary: resolution.summary,
        requiresConfirmation: resolution.requiresConfirmation ?? true,
      },
    };
  }
  // 이 지점부터 gate.invoke와 pendingAction 변환을 수행한다.
}
```

`resolveManagerAgentPendingCommand`가 공지 후보 여러 개를 반환하면 `replace`로 저장하고 다음 형태의 요약을 반환한다.

```ts
{
  status: "blocked",
  domain: "messaging",
  summary:
    "103호 후보가 두 곳입니다. 1. 플로우테스트 103호 · 세입자A · 주소요약, " +
    "2. 플로우테스트3 103호 · 세입자B · 주소요약. 건물명이나 '뒤에 거'라고 말씀해 주세요.",
  requiresConfirmation: false,
}
```

- [ ] **Step 6: 저장소와 게이트웨이 테스트를 통과시킨다**

Run:

```bash
pnpm run db:generate
cd apps/api
TS_NODE_TRANSPILE_ONLY=1 node --test -r ts-node/register src/agent-tools/manager-target-selection.repository.spec.ts
```

Expected: PASS.

- [ ] **Step 7: 커밋한다**

```bash
git add prisma/schema.prisma prisma/migrations/20260721010000_manager_agent_target_selections apps/api/src/agent-tools/manager-target-selection.repository.ts apps/api/src/agent-tools/prisma-manager-target-selection.repository.ts apps/api/src/agent-tools/agent-tools.module.ts apps/api/src/agent-tools/manager-copilot-action.gateway.ts apps/api/src/agent-tools/manager-target-selection.repository.spec.ts
git commit -m "feat(api): persist manager announcement target choices"
```

---

### Task 3: 단건 및 다건 독촉 대상 집합 해석

**Files:**
- Modify: `packages/types/src/manager-assistant.ts`
- Create: `apps/api/src/roomlog/services/manager-dunning-target-resolver.ts`
- Create: `apps/api/src/roomlog/services/manager-dunning-target-resolver.spec.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Test: `apps/api/src/roomlog/roomlog.service.spec.ts`

**Interfaces:**
- Consumes: 관리인 권한으로 필터링된 발송 가능 `Bill[]`.
- Produces:

```ts
export type ManagerDunningTargetResolution =
  | { status: "resolved"; billIds: string[]; batch: boolean }
  | { status: "ambiguous"; billIds: string[] }
  | { status: "not_found" };

export function isBatchDunningText(text: string): boolean;
export function resolveManagerDunningTargets(input: {
  text: string;
  explicitBillIds?: string[];
  candidates: Array<{
    billId: string;
    buildingName: string;
    unitId: string;
    tenantName: string;
    billingMonth: string;
    daysOverdue: number;
  }>;
}): ManagerDunningTargetResolution;
```

공유 타입 추가:

```ts
export interface ManagerDunningBatchActionPreview {
  items: ManagerDunningActionPreview[];
  totalUnpaidAmount: number;
}

export interface ManagerAgentCommandInput {
  command: string;
  text?: string;
  billId?: string;
  billIds?: string[];
  channel?: string;
  threadId?: string;
  body?: string;
  title?: string;
  target?: string;
}

export interface ManagerCopilotPendingAction {
  id: string;
  kind:
    | "billing.send_dunning"
    | "messaging.send_reply"
    | "messaging.send_announcement";
  summary: string;
  dunningPreview?: ManagerDunningActionPreview;
  dunningBatchPreview?: ManagerDunningBatchActionPreview;
}
```

- [ ] **Step 1: 집합 표현 테스트를 작성한다**

```ts
it("selects every eligible bill for an explicit all request", () => {
  const result = resolveManagerDunningTargets({
    text: "두 개 전부 다 독촉 문자 보내줘",
    candidates: [bill102, bill103],
  });
  assert.deepEqual(result, {
    status: "resolved",
    billIds: ["bill-102", "bill-103"],
    batch: true,
  });
});

it("keeps multiple candidates ambiguous without an all expression", () => {
  const result = resolveManagerDunningTargets({
    text: "독촉 문자 보내줘",
    candidates: [bill102, bill103],
  });
  assert.equal(result.status, "ambiguous");
});
```

- [ ] **Step 2: 실패를 확인한다**

Run:

```bash
cd apps/api
TS_NODE_TRANSPILE_ONLY=1 node --test -r ts-node/register src/roomlog/services/manager-dunning-target-resolver.spec.ts
```

Expected: 모듈이 없어 FAIL.

- [ ] **Step 3: 집합 표현과 기존 조건 축소를 구현한다**

```ts
export function isBatchDunningText(text: string) {
  const compact = text.normalize("NFKC").replace(/\s+/gu, "");
  return /(전체|전부|모두|다보내|전부다|두개다|둘다)/u.test(compact);
}
```

해석 순서는 명시 billIds → 호실 → 청구월 → 세입자명 → 건물명 유사도 → 집합 표현이다. 집합 표현은 조건 필터를 적용한 뒤 남은 후보 전체를 반환한다.

- [ ] **Step 4: RoomlogService를 배열 반환으로 전환한다**

```ts
private findManagerAgentDunningBills(
  managerId: string,
  input: ManagerAgentCommandInput,
): Bill[] {
  const candidates = this.managerBills(managerId)
    .filter((bill) => this.canSendManagerDunning(bill));
  const resolution = resolveManagerDunningTargets({
    text: `${input.text ?? ""} ${input.body ?? ""}`.trim(),
    explicitBillIds: input.billIds ?? (input.billId ? [input.billId] : undefined),
    candidates: candidates.map((bill) => this.managerDunningCandidate(managerId, bill)),
  });
  if (resolution.status !== "resolved") {
    throw this.dunningTargetError(resolution, candidates);
  }
  return resolution.billIds.map((id) => this.findManagerBill(managerId, id));
}
```

단건 호출부는 `const [bill] = findManagerAgentDunningBills(...)`로 호환하고, pending 해석은 전체 배열을 미리보기로 변환한다.

- [ ] **Step 5: 단건 회귀와 다건 선택 테스트를 통과시킨다**

Run:

```bash
pnpm --filter @roomlog/types typecheck
cd apps/api
TS_NODE_TRANSPILE_ONLY=1 node --test -r ts-node/register src/roomlog/services/manager-dunning-target-resolver.spec.ts
TS_NODE_TRANSPILE_ONLY=1 node --test --test-name-pattern='dunning sends|duplicate dunning units|all overdue bills' -r ts-node/register src/roomlog/roomlog.service.spec.ts
```

Expected: 단건 기존 테스트와 신규 다건 테스트 모두 PASS.

- [ ] **Step 6: 커밋한다**

```bash
git add packages/types/src/manager-assistant.ts apps/api/src/roomlog/services/manager-dunning-target-resolver.ts apps/api/src/roomlog/services/manager-dunning-target-resolver.spec.ts apps/api/src/roomlog/roomlog.service.ts apps/api/src/roomlog/roomlog.service.spec.ts
git commit -m "feat(api): resolve manager batch dunning targets"
```

---

### Task 4: 한 번 승인하는 다건 독촉 실행과 부분 성공

**Files:**
- Modify: `apps/api/src/agent-tools/manager-agent-tool.adapter.ts`
- Modify: `apps/api/src/agent-tools/manager-copilot-action.gateway.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-copilot.domain.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-copilot.domain.spec.ts`
- Test: `apps/api/src/roomlog/roomlog.service.spec.ts`

**Interfaces:**
- Consumes: Task 3의 `findManagerAgentDunningBills` 결과와 `ManagerDunningBatchActionPreview`.
- Produces:

```ts
type ManagerDunningExecutionItem = {
  billId: string;
  unitId: string;
  status: "sent" | "blocked";
  summary: string;
  threadId?: string;
};

type ManagerDunningBatchExecutionResult = {
  summary: string;
  sentCount: number;
  blockedCount: number;
  items: ManagerDunningExecutionItem[];
};
```

- [ ] **Step 1: 부분 성공과 멱등 테스트를 작성한다**

```ts
it("confirms two dunning bills once and reports one newly blocked bill", async () => {
  const pending = await service.chatManagerCopilot("landlord-demo", {
    messages: [{ role: "user", content: "두 개 전부 다 독촉 문자 보내줘" }],
  });
  assert.equal(pending.pendingAction?.dunningBatchPreview?.items.length, 2);

  markBillAsPaymentConfirming(service, "bill-103");
  const confirmed = await service.chatManagerCopilot("landlord-demo", {
    messages: [],
    confirmActionId: pending.pendingAction?.id,
  });

  assert.match(confirmed.reply, /1건 발송/);
  assert.match(confirmed.reply, /1건 제외/);
  assert.equal(generalMessages(service, "tenant-102").length, 1);
  assert.equal(generalMessages(service, "tenant-103").length, 0);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run:

```bash
cd apps/api
TS_NODE_TRANSPILE_ONLY=1 node --test --test-name-pattern='confirms two dunning bills' -r ts-node/register src/roomlog/services/roomlog-copilot.domain.spec.ts
```

Expected: pending preview가 한 건이거나 필드가 없어 FAIL.

- [ ] **Step 3: 준비 카드에 배열 payload를 저장한다**

`prepareMutation`에서 독촉 대상 배열을 서버에서 해석하고 raw ID 대신 서버가 만든 `billRefs` 배열을 arguments에 저장한다.

```ts
return {
  executorName: "billing.send_dunning",
  commandPayload: {
    kind: "billing.send_dunning",
    billIds: previews.map((item) => item.billId),
    messageTexts: Object.fromEntries(
      previews.map((item) => [item.billId, item.messageText]),
    ),
  },
  card: {
    title: previews.length > 1 ? `연체 독촉 ${previews.length}건 발송 확인` : "연체 독촉 발송 확인",
    target: previews.map((item) => `${item.unitId}호 ${item.unpaidAmount.toLocaleString("ko-KR")}원`).join(", "),
    amount: previews.reduce((sum, item) => sum + item.unpaidAmount, 0),
    action: "저장된 청구 상태를 건별로 다시 확인한 뒤 발송합니다.",
  },
};
```

- [ ] **Step 4: 실행 시 건별로 재검증하고 오류를 수집한다**

```ts
const items: ManagerDunningExecutionItem[] = [];
const previewByBillId = new Map(previews.map((item) => [item.billId, item]));
for (const billId of storedBillIds) {
  const preview = previewByBillId.get(billId);
  if (!preview) {
    items.push({
      billId,
      unitId: "알 수 없음",
      status: "blocked",
      summary: "저장된 독촉 미리보기를 찾을 수 없습니다.",
    });
    continue;
  }
  try {
    const resolved = this.roomlog.resolveManagerAgentPendingCommand(
      principal.userId,
      "billing.send_dunning",
      { command: "billing.send_dunning", billId, body: messageTexts[billId] },
    );
    if (resolved.status !== "ready") throw new BadRequestException(resolved.summary);
    const result = await this.roomlog.runManagerAgentCommand(
      principal.userId,
      resolved.commandInput,
    );
    if (result.status !== "executed") throw new BadRequestException(result.summary);
    items.push({ billId, unitId: preview.unitId, status: "sent", summary: result.summary });
  } catch (error) {
    items.push({
      billId,
      unitId: preview.unitId,
      status: "blocked",
      summary: safeManagerDunningFailure(error),
    });
  }
}
return summarizeDunningBatch(items);
```

루프는 첫 성공 이후 예외를 밖으로 던지지 않는다. `AgentToolAction` 전체가 `EXECUTED`로 완료돼 같은 확인 ID 재호출이 기존 결과만 반환하게 한다.

- [ ] **Step 5: 코파일럿 응답에 다건 미리보기와 결과를 연결한다**

```ts
const pendingAction: ManagerCopilotPendingAction = {
  id: response.pendingAction.confirmationId,
  kind,
  summary: resolution.summary,
  ...(previews.length === 1
    ? { dunningPreview: previews[0] }
    : {
        dunningBatchPreview: {
          items: previews,
          totalUnpaidAmount: previews.reduce((sum, item) => sum + item.unpaidAmount, 0),
        },
      }),
};
```

- [ ] **Step 6: 다건·단건·멱등 테스트를 통과시킨다**

Run:

```bash
cd apps/api
TS_NODE_TRANSPILE_ONLY=1 node --test --test-name-pattern='dunning|pending send action' -r ts-node/register src/roomlog/services/roomlog-copilot.domain.spec.ts src/roomlog/roomlog.service.spec.ts
```

Expected: 관련 테스트 PASS, 확인 재호출 시 메시지 수 변화 없음.

- [ ] **Step 7: 커밋한다**

```bash
git add apps/api/src/agent-tools/manager-agent-tool.adapter.ts apps/api/src/agent-tools/manager-copilot-action.gateway.ts apps/api/src/roomlog/services/roomlog-copilot.domain.ts apps/api/src/roomlog/services/roomlog-copilot.domain.spec.ts apps/api/src/roomlog/roomlog.service.spec.ts
git commit -m "feat(api): confirm manager batch dunning once"
```

---

### Task 5: 음성 중복 제거와 사실 기반 미납·연체 표현

**Files:**
- Modify: `apps/web/src/app/manager/_components/useManagerAssistantSession.ts`
- Modify: `apps/web/src/app/manager/_components/useManagerAssistantSession.spec.ts`
- Modify: `apps/web/src/app/manager/_components/useManagerRealtimeSession.ts`
- Modify: `apps/web/src/app/manager/_components/useManagerRealtimeSession.spec.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.spec.ts`

**Interfaces:**
- Consumes: 기존 `ManagerCopilotChatResponse`.
- Produces:

```ts
export type ApplyCopilotResponseOptions = {
  appendReply?: boolean;
};

export function copilotResponseEvents(
  response: ManagerCopilotChatResponse,
  makeId?: () => string,
  options?: ApplyCopilotResponseOptions,
): ManagerAssistantSessionEvent[];
```

- [ ] **Step 1: 중복 억제와 연체 0일 테스트를 작성한다**

```ts
it("keeps receipts but suppresses the duplicate assistant reply for voice", () => {
  const events = copilotResponseEvents(responseWithReceipt, makeId, {
    appendReply: false,
  });
  assert.equal(events.some((event) => event.type === "append" && event.entry.kind === "message"), false);
  assert.equal(events.some((event) => event.type === "append" && event.entry.kind === "receipt"), true);
});

it("does not label a zero-day unpaid bill as overdue", async () => {
  const result = await service.runManagerAgentCommandForRealtime("landlord-demo", {
    command: "billing.summary",
    text: "미납과 연체 현황 보여줘",
  });
  assert.match(result.summary, /103호.*미납/u);
  assert.doesNotMatch(result.summary, /103호.*연체/u);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/_components/useManagerAssistantSession.spec.ts src/app/manager/_components/useManagerRealtimeSession.spec.ts
cd ../api
TS_NODE_TRANSPILE_ONLY=1 node --test --test-name-pattern='zero-day unpaid' -r ts-node/register src/roomlog/roomlog.service.spec.ts
```

Expected: 음성 응답 이벤트에 메시지가 남고 0일 청구가 연체로 표현돼 FAIL.

- [ ] **Step 3: 음성 모드에서 서버 reply 말풍선만 억제한다**

```ts
function applyCopilotResponse(
  response: ManagerCopilotChatResponse,
  options: ApplyCopilotResponseOptions = {},
) {
  for (const event of copilotResponseEvents(response, createEntryId, options)) {
    dispatchManagerAssistantEvent(event);
  }
}
```

Realtime의 `prepare_dunning`, `prepare_announcement`, `confirm_pending`은:

```ts
options.applyCopilotResponse(response, { appendReply: false });
```

직접 명령 경로의 다음 줄은 삭제한다.

```ts
appendMessage("assistant", result.summary);
```

Realtime 모델이 function output을 받아 한 번만 말하게 한다. 영수증은 실행 ID 기준으로 reducer에서 중복을 제거한다.

- [ ] **Step 4: 청구 응답 데이터와 후처리를 사실 기반으로 강화한다**

`managerAgentReplyData`의 청구 항목에 다음 값을 추가한다.

```ts
const daysOverdue = Math.max(
  0,
  Math.floor((this.timeOf(this.todayInSeoul()) - this.timeOf(bill.dueDate)) / 86_400_000),
);
return {
  billId: bill.billId,
  unitId: bill.unitId,
  tenantName: bill.tenantName,
  billingMonth: bill.billingMonth,
  status: bill.status,
  totalAmount: bill.totalAmount,
  paidAmount: bill.paidAmount,
  unpaidAmount: Math.max(0, bill.totalAmount - bill.paidAmount),
  dueDate: bill.dueDate,
  daysOverdue,
  collectionState: daysOverdue > 0 ? "OVERDUE" : "UNPAID",
};
```

응답 지침에 다음 문장을 추가한다.

```ts
"daysOverdue가 0이면 '미납'이고 '연체'라고 부르지 않습니다. daysOverdue가 1 이상일 때만 '연체'라고 표현하세요.",
"URL이나 경로를 본문에 쓰지 말고 navigation.label만 자연어로 안내하세요.",
```

후처리에서 내부 경로를 제거한다.

```ts
.replace(/https?:\\/\\/\\S+/giu, "")
.replace(/\\/?manager\\/[a-z0-9_/?=&.-]+/giu, "")
```

- [ ] **Step 5: 웹과 API 관련 테스트를 통과시킨다**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/_components/useManagerAssistantSession.spec.ts src/app/manager/_components/useManagerRealtimeSession.spec.ts
cd ../api
TS_NODE_TRANSPILE_ONLY=1 node --test --test-name-pattern='billing summary|zero-day unpaid' -r ts-node/register src/roomlog/roomlog.service.spec.ts
```

Expected: 관련 테스트 PASS.

- [ ] **Step 6: 커밋한다**

```bash
git add apps/web/src/app/manager/_components/useManagerAssistantSession.ts apps/web/src/app/manager/_components/useManagerAssistantSession.spec.ts apps/web/src/app/manager/_components/useManagerRealtimeSession.ts apps/web/src/app/manager/_components/useManagerRealtimeSession.spec.ts apps/api/src/roomlog/roomlog.service.ts apps/api/src/roomlog/roomlog.service.spec.ts
git commit -m "fix(roomlog): deduplicate manager voice results"
```

---

### Task 6: 통합 회귀 검증과 main 배포 준비

**Files:**
- Verify: files changed in Tasks 1–5
- Test: `apps/api/src/roomlog/services/roomlog-copilot.domain.spec.ts`
- Test: `apps/api/src/roomlog/roomlog.service.spec.ts`
- Test: `apps/web/src/app/manager/_components/useManagerAssistantSession.spec.ts`
- Test: `apps/web/src/app/manager/_components/useManagerRealtimeSession.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–5의 최종 타입과 동작.
- Produces: 빌드·스모크·관련 테스트가 통과한 배포 가능한 main 커밋.

- [ ] **Step 1: 재현 시나리오 통합 테스트를 추가한다**

```ts
it("handles the reported voice flow with one batch approval and one announcement target", async () => {
  const dunning = await prepareVoiceCommand("두 개 전부 다 독촉 문자 보내줘");
  assert.equal(dunning.pendingAction?.dunningBatchPreview?.items.length, 2);
  const sent = await confirmVoiceCommand(dunning.pendingAction!.id, "진행해");
  assert.match(sent.reply, /2건 발송/);

  const announcement = await prepareVoiceCommand(
    "103호에 에어컨 바꾸러 간다고 공지 보내",
  );
  assert.equal(announcement.pendingAction?.kind, "messaging.send_announcement");
  assert.match(announcement.pendingAction?.summary ?? "", /플로우테스트3 103호/);
});
```

- [ ] **Step 2: 관련 API 테스트를 실행한다**

Run:

```bash
cd apps/api
TS_NODE_TRANSPILE_ONLY=1 node --test -r ts-node/register \
  src/roomlog/services/manager-target-resolver.spec.ts \
  src/roomlog/services/manager-dunning-target-resolver.spec.ts \
  src/roomlog/services/roomlog-copilot.domain.spec.ts
TS_NODE_TRANSPILE_ONLY=1 node --test --test-name-pattern='announcement|dunning|billing summary' -r ts-node/register src/roomlog/roomlog.service.spec.ts
```

Expected: 모든 관련 테스트 PASS.

- [ ] **Step 3: 관련 웹 테스트를 실행한다**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register \
  src/app/manager/_components/useManagerAssistantSession.spec.ts \
  src/app/manager/_components/useManagerRealtimeSession.spec.ts \
  src/lib/manager-copilot-api.spec.ts
```

Expected: 모든 관련 테스트 PASS.

- [ ] **Step 4: 전체 기본 검증을 실행한다**

Run:

```bash
export PATH=/Users/kunwoopark/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/kunwoopark/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH
bash scripts/verify.sh
```

Expected:

```text
✅ types typecheck
✅ ui typecheck
✅ web build
✅ api build
✅ health 200
✅ listings 200
✅ unified login roles(TENANT+LANDLORD)
✅ 전체 통과
```

- [ ] **Step 5: 작업 트리와 마이그레이션을 확인한다**

Run:

```bash
git diff --check
git status --short
pnpm run db:generate
```

Expected: whitespace 오류 없음, 의도한 파일만 변경, Prisma 생성 성공.

- [ ] **Step 6: 최종 커밋을 만든다**

```bash
git add packages/types/src/manager-assistant.ts prisma/schema.prisma prisma/migrations/20260721010000_manager_agent_target_selections apps/api/src apps/web/src/app/manager/_components
git commit -m "feat(roomlog): complete resilient manager batch actions"
```

- [ ] **Step 7: 사용자 요청에 따라 main을 푸시한다**

```bash
git push origin main
```

Expected: `main -> main`, 로컬 `main`과 `origin/main`이 동일한 HEAD.
