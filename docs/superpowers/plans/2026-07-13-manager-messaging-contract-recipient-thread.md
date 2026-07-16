# Manager Messaging Contract Recipient Thread Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 소통 허브에서 계약 연결된 건물·호실·세입자를 선택해 일반 대화를 시작하고, 기존 일반 대화가 있으면 중복 생성 없이 해당 대화로 이동하게 한다.

**Architecture:** 메시징 도메인이 `TenantRoom + Room.landlordId`를 기준으로 대화 가능 수신자를 제공하고 일반 대화 시작을 멱등 처리한다. 웹은 이 수신자 목록을 기존 스레드 목록과 함께 받아 건물 필터 합집합과 새 대화 폼을 구성한다.

**Tech Stack:** TypeScript, NestJS, Next.js 16 App Router, React 19, Node test runner, pnpm monorepo, Docker Compose

## Global Constraints

- 공유 계약은 `packages/types`를 단일 소스로 사용한다.
- 스타일 값은 `packages/ui/src/tokens.css`의 CSS 변수만 사용하고 raw hex를 추가하지 않는다.
- 관리자 화면은 기존 `ManagerShell` 내부 메시징 화면 구조를 유지한다.
- 기존 범용 `POST /manager/messaging/threads` 동작은 변경하지 않는다.
- 인프라·Docker·배포 설정 파일은 수정하지 않는다.
- API 오류를 빈 계약 대상 목록으로 폴백하지 않는다.

---

### Task 1: 공유 계약과 건물 선택 합집합

**Files:**
- Modify: `packages/types/src/messaging.ts`
- Modify: `apps/web/src/lib/messaging-building-filter.ts`
- Modify: `apps/web/src/lib/messaging-building-filter.spec.ts`

**Interfaces:**
- Produces: `ManagerMessagingRecipient`, `StartManagerConversationInput`
- Produces: `getBuildingOptions(threads, recipients?)`

- [ ] **Step 1: 계약 건물이 스레드 없이도 선택지에 포함되는 실패 테스트 작성**

```ts
test("includes contract recipient buildings without existing threads", () => {
  const recipients: ManagerMessagingRecipient[] = [{
    roomId: "room-a-101",
    buildingName: "계약 빌딩",
    unitId: "101",
    tenantId: "tenant-a",
    tenantName: "김세입",
  }];

  assert.deepEqual(getBuildingOptions([], recipients), ["계약 빌딩"]);
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm --filter web test:unit -- messaging-building-filter.spec.ts`

Expected: `getBuildingOptions`가 두 번째 인자를 받지 않아 `계약 빌딩`이 누락되어 FAIL.

- [ ] **Step 3: 공유 타입과 최소 합집합 구현**

```ts
export interface ManagerMessagingRecipient {
  roomId: string;
  buildingName: string;
  unitId: string;
  tenantId: string;
  tenantName: string;
  existingGeneralThreadId?: string;
}

export interface StartManagerConversationInput {
  roomId: string;
  tenantId: string;
  body: string;
}
```

```ts
export function getBuildingOptions(
  threads: Thread[],
  recipients: ManagerMessagingRecipient[] = [],
): string[] {
  return Array.from(new Set([
    ...threads.map(normalizedBuildingName),
    ...recipients.map((recipient) => recipient.buildingName.trim()),
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko"));
}
```

- [ ] **Step 4: GREEN 확인**

Run: `pnpm --filter web test:unit -- messaging-building-filter.spec.ts`

Expected: 관련 테스트 모두 PASS.

- [ ] **Step 5: Task 1 커밋**

```bash
git add packages/types/src/messaging.ts apps/web/src/lib/messaging-building-filter.ts apps/web/src/lib/messaging-building-filter.spec.ts
git commit -m "feat(messaging): include contract buildings in filters"
```

---

### Task 2: 관리자 메시징 수신자 조회와 멱등 대화 시작 API

**Files:**
- Modify: `apps/api/src/roomlog/roomlog.types.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-messaging.domain.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Modify: `apps/api/src/roomlog/roomlog.controller.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.spec.ts`

**Interfaces:**
- Consumes: `ManagerMessagingRecipient`, `StartManagerConversationInput`
- Produces: `listManagerMessagingRecipients(managerId)`
- Produces: `startManagerConversation(managerId, input)`
- Produces: `GET /manager/messaging/recipients`, `POST /manager/messaging/conversations`

- [ ] **Step 1: 권한 범위와 기존 스레드 재사용 실패 테스트 작성**

```ts
it("lists linked tenants and reuses an existing general conversation", () => {
  const service = new RoomlogService();
  const recipients = service.listManagerMessagingRecipients("landlord-demo");
  const own = recipients.find((item) => item.tenantId === "tenant-demo");
  assert.equal(own?.buildingName, "정글빌라");
  assert.equal(own?.roomId, "room-301");

  const before = service.getDemoState().messagingThreads.length;
  const first = service.startManagerConversation("landlord-demo", {
    roomId: "room-301",
    tenantId: "tenant-demo",
    body: "안녕하세요. 계약 관련 안내드립니다.",
  });
  const second = service.startManagerConversation("landlord-demo", {
    roomId: "room-301",
    tenantId: "tenant-demo",
    body: "중복 생성되면 안 됩니다.",
  });
  assert.equal(second.id, first.id);
  assert.equal(service.getDemoState().messagingThreads.length, before + 1);
});
```

별도 테스트에서 다른 관리자의 수신자가 목록에 없고 잘못된 `roomId + tenantId` 조합이 예외를 던지는지 확인한다.

- [ ] **Step 2: RED 확인**

Run: `pnpm --filter api test -- --test-name-pattern="lists linked tenants"`

Expected: 서비스 메서드가 존재하지 않아 FAIL.

- [ ] **Step 3: 도메인 최소 구현**

```ts
listManagerMessagingRecipients(managerId: string): ManagerMessagingRecipient[] {
  return Object.entries(this.store.tenantRooms)
    .flatMap(([tenantId, roomId]) => {
      if (!this.canManagerAccessRoom(managerId, roomId)) return [];
      const room = this.findRoom(roomId);
      const tenant = this.store.users.find((user) => user.id === tenantId);
      if (!tenant) return [];
      const existingGeneralThreadId = this.store.messagingThreads.find((thread) =>
        thread.roomId === roomId
        && thread.tenantId === tenantId
        && thread.context === "general"
        && !thread.contextRef
      )?.id;
      return [{
        roomId,
        buildingName: room.buildingName,
        unitId: this.displayUnitId(room),
        tenantId,
        tenantName: tenant.name,
        existingGeneralThreadId,
      }];
    })
    .sort((a, b) => `${a.buildingName}\u0000${a.unitId}\u0000${a.tenantName}`
      .localeCompare(`${b.buildingName}\u0000${b.unitId}\u0000${b.tenantName}`, "ko"));
}

startManagerConversation(managerId: string, input: StartManagerConversationInput): MessagingThread {
  this.assertManagerCanAccessRoom(managerId, input.roomId);
  if (this.store.tenantRooms[input.tenantId] !== input.roomId) {
    throw new ForbiddenException("해당 세대 임차인과만 대화를 시작할 수 있습니다.");
  }
  const existing = this.store.messagingThreads.find((thread) =>
    thread.roomId === input.roomId
    && thread.tenantId === input.tenantId
    && thread.context === "general"
    && !thread.contextRef
  );
  if (existing) return this.presentThread(existing);
  return this.createMessagingThread(managerId, {
    roomId: input.roomId,
    tenantId: input.tenantId,
    context: "general",
    contextLabel: "일반 문의",
    initialMessage: { sender: "manager", body: input.body },
  });
}
```

컨트롤러는 LANDLORD 역할을 요구하고 시작 성공 시 기존 메시징과 동일하게 realtime activity를 broadcast한다.

- [ ] **Step 4: GREEN 및 API 전체 테스트 확인**

Run: `pnpm --filter api test`

Expected: 0 failures.

- [ ] **Step 5: Task 2 커밋**

```bash
git add apps/api/src/roomlog/roomlog.types.ts apps/api/src/roomlog/services/roomlog-messaging.domain.ts apps/api/src/roomlog/roomlog.service.ts apps/api/src/roomlog/roomlog.controller.ts apps/api/src/roomlog/roomlog.service.spec.ts
git commit -m "feat(messaging): expose contract tenant conversations"
```

---

### Task 3: 웹 API 계약과 새 대화 상태 모델

**Files:**
- Modify: `apps/web/src/lib/messaging-manager-api.ts`
- Modify: `apps/web/src/lib/messaging-api.spec.ts`
- Create: `apps/web/src/lib/manager-conversation-state.ts`
- Create: `apps/web/src/lib/manager-conversation-state.spec.ts`

**Interfaces:**
- Produces: `managerMessagingPaths.recipients()`, `managerMessagingPaths.conversations()`
- Produces: `listManagerMessagingRecipients()`, `startManagerConversation(input)`
- Produces: `recipientsForBuilding`, `selectedConversationRecipient`

- [ ] **Step 1: 실제 API 경로와 선택 상태 실패 테스트 작성**

```ts
assert.equal(managerMessagingPaths.recipients(), "/manager/messaging/recipients");
assert.equal(managerMessagingPaths.conversations(), "/manager/messaging/conversations");
```

```ts
test("filters conversation recipients by building", () => {
  assert.deepEqual(
    recipientsForBuilding(recipients, "계약 빌딩").map((item) => item.tenantId),
    ["tenant-a"],
  );
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm --filter web test:unit -- messaging-api.spec.ts manager-conversation-state.spec.ts`

Expected: 신규 경로와 상태 함수가 없어 FAIL.

- [ ] **Step 3: API 클라이언트와 순수 상태 함수 구현**

```ts
export function listManagerMessagingRecipients(): Promise<ManagerMessagingRecipient[]> {
  return serverFetch(managerMessagingPaths.recipients());
}

export function startManagerConversation(
  input: StartManagerConversationInput,
): Promise<Thread> {
  return serverFetch(managerMessagingPaths.conversations(), {
    method: "POST",
    body: JSON.stringify(input),
  });
}
```

대상 조회에는 `tryFetch` 데모 폴백을 사용하지 않는다.

- [ ] **Step 4: GREEN 확인**

Run: `pnpm --filter web test:unit -- messaging-api.spec.ts manager-conversation-state.spec.ts`

Expected: 관련 테스트 모두 PASS.

- [ ] **Step 5: Task 3 커밋**

```bash
git add apps/web/src/lib/messaging-manager-api.ts apps/web/src/lib/messaging-api.spec.ts apps/web/src/lib/manager-conversation-state.ts apps/web/src/lib/manager-conversation-state.spec.ts
git commit -m "feat(messaging): add manager conversation client"
```

---

### Task 4: 소통 허브 새 대화 UI와 계약 건물 필터

**Files:**
- Create: `apps/web/src/app/manager/messaging/00/NewConversationForm.tsx`
- Create: `apps/web/src/app/manager/messaging/00/actions.ts`
- Modify: `apps/web/src/app/manager/messaging/00/page.tsx`
- Modify: `apps/web/src/lib/messaging-thread-location.spec.ts`

**Interfaces:**
- Consumes: `ManagerMessagingRecipient[]`, `startManagerConversation(input)`
- Produces: 건물 → 호실·세입자 → 기존 대화 열기 또는 신규 첫 메시지 폼

- [ ] **Step 1: 페이지 연결 실패 테스트 작성**

정적 구조 테스트에 다음 요구를 추가한다.

```ts
assert.match(pageSource, /listManagerMessagingRecipients/);
assert.match(pageSource, /getBuildingOptions\(threads, recipients\)/);
assert.match(pageSource, /<NewConversationForm/);
```

- [ ] **Step 2: RED 확인**

Run: `pnpm --filter web test:unit -- messaging-thread-location.spec.ts`

Expected: 신규 수신자 조회와 폼 연결이 없어 FAIL.

- [ ] **Step 3: 서버 액션과 클라이언트 폼 최소 구현**

서버 액션은 `startManagerConversation` 결과의 `thread.id`로 상세 화면을 redirect한다. 폼은 수신자 건물을 먼저 고르고 해당 건물의 `호실 · 세입자`를 선택한다. `existingGeneralThreadId`가 있으면 메시지 입력 대신 `기존 대화 열기` 링크를 표시한다.

UI 스타일은 `var(--surface-*)`, `var(--border)`, `var(--primary)`, `var(--space-*)`, `var(--radius-*)` 토큰만 사용한다.

- [ ] **Step 4: 페이지 데이터 흐름 연결**

```ts
const [{ building }, threads, recipients] = await Promise.all([
  searchParams,
  listManagerThreads(),
  listManagerMessagingRecipients(),
]);
const buildingOptions = getBuildingOptions(threads, recipients);
```

빈 목록 문구는 `이 건물에는 아직 시작된 대화가 없습니다.`로 교체한다.

- [ ] **Step 5: Web 전체 테스트와 빌드 확인**

Run: `pnpm test:web`

Expected: 0 failures.

Run: `pnpm --filter web build`

Expected: exit 0.

- [ ] **Step 6: Task 4 커밋**

```bash
git add apps/web/src/app/manager/messaging/00 apps/web/src/lib/messaging-thread-location.spec.ts
git commit -m "feat(messaging): start contract tenant conversations"
```

---

### Task 5: 전체 검증, Docker 재빌드, 브라우저 확인, 푸시

**Files:**
- Verify only; 인프라 파일 수정 없음

**Interfaces:**
- Consumes: Tasks 1-4의 완성 동작
- Produces: 테스트·빌드·실행 화면 증거

- [ ] **Step 1: 전체 검증 실행**

Run: `bash scripts/verify.sh`

Expected: types, ui, web, api, API smoke 모두 통과.

- [ ] **Step 2: Docker 이미지 재빌드**

Run: `docker compose up -d --build api web`

Expected: `roomlog-api`, `roomlog-web`, `roomlog-postgres` 모두 healthy/up.

- [ ] **Step 3: 브라우저 검증**

관리자 소통 허브에서 다음을 확인한다.

1. 기존 스레드가 없는 계약 건물이 건물 선택지에 표시된다.
2. 계약 세입자 선택 시 신규 대상은 첫 메시지 입력과 `대화 시작`이 표시된다.
3. 생성 후 상세 화면으로 이동하고 목록에 스레드가 표시된다.
4. 같은 세입자를 다시 선택하면 `기존 대화 열기`가 표시되고 중복 스레드가 생성되지 않는다.

- [ ] **Step 4: 최종 작업 트리와 커밋 범위 확인**

Run: `git status --short --branch && git log --oneline -6`

Expected: 기존 사용자 소유 untracked 문서 외 기능 변경이 모두 커밋됨.

- [ ] **Step 5: 현재 브랜치 푸시**

Run: `git push origin kms-complaint1`

Expected: push 성공. `app` 브랜치 직접 변경 없음.
