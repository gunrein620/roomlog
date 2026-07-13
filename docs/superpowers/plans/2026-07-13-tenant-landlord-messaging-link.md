# Tenant Landlord Messaging Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세입자 마이페이지의 `임대인에게 문의하기`가 관리자 소통과 같은 일반 문의 스레드를 조회·생성·답변하도록 연결한다.

**Architecture:** 메시징 도메인이 인증된 세입자의 `TenantRoom + Room.landlordId` 관계에서 임대인 대화 상태를 계산하고, 일반 문의 생성 시 기존 스레드를 서버에서 재사용한다. 웹은 작은 API/URL 변환 모듈을 통해 기존 스레드는 상세로 이동하고, 없는 경우에만 첫 메시지 작성 패널을 연다.

**Tech Stack:** TypeScript, NestJS, Next.js 16 App Router, React 19, Node test runner, pnpm monorepo, Docker Compose

## Global Constraints

- 공유 계약은 `packages/types`를 단일 소스로 사용한다.
- 스타일 값은 `packages/ui/src/tokens.css`의 CSS 변수만 사용하고 raw hex를 추가하지 않는다.
- 서버는 클라이언트의 임대인·호실 식별자를 신뢰하지 않고 인증된 세입자 관계에서 대상을 결정한다.
- 빈 스레드를 만들지 않고 첫 메시지 전송 시에만 신규 스레드를 생성한다.
- 동일 세입자·호실의 `general + contextRef 없음` 스레드는 하나만 재사용한다.
- `TradeChatCenter`의 거래 전 채팅 데이터는 수정하거나 마이그레이션하지 않는다.
- Docker, 배포, AWS, 웹소켓 프로토콜 설정은 수정하지 않는다.
- 각 기능 단위의 관련 테스트가 통과한 뒤 커밋하고 현재 브랜치에 푸시한다.

---

### Task 1: 세입자 임대인 대화 조회와 일반 스레드 재사용 API

**Files:**
- Modify: `packages/types/src/messaging.ts`
- Modify: `apps/api/src/roomlog/roomlog.types.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-messaging.domain.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Modify: `apps/api/src/roomlog/roomlog.controller.ts`
- Test: `apps/api/src/roomlog/roomlog.service.spec.ts`

**Interfaces:**
- Produces: `TenantLandlordConversation`
- Produces: `getTenantLandlordConversation(tenantId): TenantLandlordConversation`
- Changes: `createTenantMessagingThread(tenantId, input)` reuses the newest matching general thread
- Produces: `GET /tenant/messaging/landlord-conversation`

- [ ] **Step 1: 기존 스레드 탐색과 중복 방지 실패 테스트 작성**

```ts
it("links tenant landlord inquiry to the manager messaging thread", () => {
  const service = new RoomlogService();
  const before = service.listTenantMessagingThreads("tenant-demo");
  const existing = before.find((thread) =>
    thread.context === "general" && !thread.contextRef
  );

  const conversation = service.getTenantLandlordConversation("tenant-demo");
  assert.equal(conversation.buildingName, "정글빌라");
  assert.equal(conversation.unitId, "301");
  assert.equal(conversation.landlordName, "박관리");
  assert.equal(conversation.threadId, existing?.id);

  const threadCount = service.getDemoState().messagingThreads.length;
  const result = service.createTenantMessagingThread("tenant-demo", {
    context: "general",
    contextLabel: "일반 문의",
    body: "임대인에게 문의드립니다."
  });

  if (existing) assert.equal(result.id, existing.id);
  assert.equal(service.getDemoState().messagingThreads.length, existing ? threadCount : threadCount + 1);
  assert.equal(result.messages?.at(-1)?.body, "임대인에게 문의드립니다.");
  assert.equal(
    service.listManagerMessagingThreads("landlord-demo").some((thread) => thread.id === result.id),
    true
  );
});
```

연결된 관리자가 없는 세입자와 다른 세입자의 스레드를 재사용하지 않는 테스트도 같은 describe 블록에 추가한다.

- [ ] **Step 2: RED 확인**

Run: `pnpm --filter api test -- --test-name-pattern="links tenant landlord inquiry"`

Expected: `getTenantLandlordConversation`이 없어 컴파일 또는 런타임 FAIL.

- [ ] **Step 3: 공유 응답 타입 추가**

```ts
export interface TenantLandlordConversation {
  threadId?: string;
  buildingName: string;
  unitId: string;
  landlordName: string;
}
```

`apps/api/src/roomlog/roomlog.types.ts`에서 이 타입을 `@roomlog/types`로부터 re-export한다.

- [ ] **Step 4: 가장 최근의 일반 문의를 찾는 도메인 헬퍼와 조회 구현**

```ts
private findTenantGeneralThread(tenantId: string, roomId: string) {
  return this.store.messagingThreads
    .filter((thread) =>
      thread.tenantId === tenantId &&
      thread.roomId === roomId &&
      thread.context === "general" &&
      !thread.contextRef
    )
    .sort((left, right) => this.timeOf(right.updatedAt) - this.timeOf(left.updatedAt))[0];
}

getTenantLandlordConversation(tenantId: string): TenantLandlordConversation {
  const room = this.requireTenantRoom(tenantId);
  if (!room.landlordId) {
    throw new BadRequestException("연결된 관리인이 없어 대화를 시작할 수 없습니다.");
  }
  const landlord = this.store.users.find((user) => user.id === room.landlordId);
  if (!landlord) {
    throw new NotFoundException("연결된 관리인을 찾을 수 없습니다.");
  }
  return {
    threadId: this.findTenantGeneralThread(tenantId, room.id)?.id,
    buildingName: room.buildingName,
    unitId: this.displayUnitId(room),
    landlordName: landlord.name
  };
}
```

- [ ] **Step 5: 세입자 일반 문의 생성에 서버 재사용 로직 추가**

`createTenantMessagingThread`에서 body 검증 후 신규 생성 전에 다음 분기를 넣는다.

```ts
const isGeneralConversation = (input.context ?? "general") === "general" && !input.contextRef?.trim();
const existing = isGeneralConversation
  ? this.findTenantGeneralThread(tenantId, room.id)
  : undefined;

if (existing) {
  this.addThreadMessageInternal(existing, tenantId, {
    sender: "tenant",
    body,
    kind: input.kind ?? "text",
    attachmentUrls: input.attachmentUrls
  });
  this.persistStore();
  return this.presentThread(existing, true);
}
```

- [ ] **Step 6: 서비스 위임과 컨트롤러 조회 엔드포인트 추가**

```ts
getTenantLandlordConversation(tenantId: string) {
  return this.messaging.getTenantLandlordConversation(tenantId);
}
```

```ts
@Get("tenant/messaging/landlord-conversation")
getTenantLandlordConversation(@Headers("authorization") authorization?: string) {
  const user = this.requireRole(authorization, ["TENANT"]);
  return this.roomlogService.getTenantLandlordConversation(user.id);
}
```

정적 경로가 `threads/:threadId`보다 먼저 선언되도록 기존 tenant messaging 라우트 묶음의 앞쪽에 둔다.

- [ ] **Step 7: 타입 빌드와 API 테스트 GREEN 확인**

Run: `pnpm --filter @roomlog/types build && pnpm --filter api test -- --test-name-pattern="tenant landlord inquiry|real linked tenant start"`

Expected: 관련 테스트 0 failures.

- [ ] **Step 8: Task 1 커밋과 푸시**

```bash
git add packages/types/src/messaging.ts apps/api/src/roomlog/roomlog.types.ts apps/api/src/roomlog/services/roomlog-messaging.domain.ts apps/api/src/roomlog/roomlog.service.ts apps/api/src/roomlog/roomlog.controller.ts apps/api/src/roomlog/roomlog.service.spec.ts
git commit -m "feat(messaging): link tenant landlord conversation"
git push origin kms-complaint1
```

---

### Task 2: 세입자 웹 대화 API 계약과 URL 변환

**Files:**
- Create: `apps/web/src/lib/tenant-landlord-conversation.ts`
- Create: `apps/web/src/lib/tenant-landlord-conversation.spec.ts`

**Interfaces:**
- Consumes: `CreateTenantMessagingThreadInput`, `TenantLandlordConversation`, `Thread`
- Produces: `tenantLandlordConversationPaths`
- Produces: `tenantLandlordThreadInput(body)`
- Produces: `tenantLandlordThreadHref(threadId)`

- [ ] **Step 1: 경로·요청·상세 URL 실패 테스트 작성**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  tenantLandlordConversationPaths,
  tenantLandlordThreadHref,
  tenantLandlordThreadInput
} from "./tenant-landlord-conversation";

test("builds the tenant landlord messaging contract", () => {
  assert.equal(
    tenantLandlordConversationPaths.current(),
    "/api/tenant/messaging/landlord-conversation"
  );
  assert.equal(tenantLandlordConversationPaths.threads(), "/api/tenant/messaging/threads");
  assert.deepEqual(tenantLandlordThreadInput("  수도 문의입니다.  "), {
    context: "general",
    contextLabel: "일반 문의",
    body: "수도 문의입니다."
  });
  assert.equal(tenantLandlordThreadHref("mth 1"), "/tenant/messaging/01?id=mth%201");
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm --filter web test:unit -- tenant-landlord-conversation.spec.ts`

Expected: 모듈이 없어 FAIL.

- [ ] **Step 3: 최소 변환 모듈 구현**

```ts
import type { CreateTenantMessagingThreadInput } from "@roomlog/types";

export const tenantLandlordConversationPaths = {
  current: () => "/api/tenant/messaging/landlord-conversation",
  threads: () => "/api/tenant/messaging/threads"
} as const;

export function tenantLandlordThreadInput(body: string): CreateTenantMessagingThreadInput {
  return {
    context: "general",
    contextLabel: "일반 문의",
    body: body.trim()
  };
}

export function tenantLandlordThreadHref(threadId: string): string {
  return `/tenant/messaging/01?id=${encodeURIComponent(threadId)}`;
}
```

- [ ] **Step 4: Web 관련 테스트 GREEN 확인**

Run: `pnpm --filter web test:unit -- tenant-landlord-conversation.spec.ts`

Expected: 관련 테스트 0 failures.

- [ ] **Step 5: Task 2 커밋과 푸시**

```bash
git add apps/web/src/lib/tenant-landlord-conversation.ts apps/web/src/lib/tenant-landlord-conversation.spec.ts
git commit -m "test(messaging): define tenant landlord web contract"
git push origin kms-complaint1
```

---

### Task 3: 마이페이지 문의 버튼을 룸로그 메시징에 연결

**Files:**
- Modify: `apps/web/src/app/my/flows/TenantMyPage.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/lib/tenant-landlord-conversation.spec.ts`

**Interfaces:**
- Consumes: `TenantLandlordConversation`, `Thread`
- Consumes: `tenantLandlordConversationPaths`, `tenantLandlordThreadInput`, `tenantLandlordThreadHref`
- Removes: `TradeChatCenter` usage from `TenantMyPage`

- [ ] **Step 1: 빈 메시지 방지 계약 테스트 추가**

```ts
test("trims an empty first message for client validation", () => {
  assert.equal(tenantLandlordThreadInput("   ").body, "");
});
```

- [ ] **Step 2: RED가 아닌 회귀 안전망 확인**

Run: `pnpm --filter web test:unit -- tenant-landlord-conversation.spec.ts`

Expected: 기존 helper 구현으로 PASS. UI는 이 반환값을 기준으로 전송을 비활성화한다.

- [ ] **Step 3: 버튼 클릭 시 기존 스레드 조회와 이동 구현**

`TenantMyPage`에 `useRouter`, 공유 타입, Task 2 helper를 가져오고 다음 상태와 핸들러를 추가한다.

```ts
const router = useRouter();
const [landlordConversation, setLandlordConversation] = useState<TenantLandlordConversation | null>(null);
const [landlordMessageDraft, setLandlordMessageDraft] = useState("");
const [landlordConversationError, setLandlordConversationError] = useState("");
const [isLandlordConversationLoading, setIsLandlordConversationLoading] = useState(false);
const [isLandlordMessageSubmitting, setIsLandlordMessageSubmitting] = useState(false);

const openLandlordConversation = async () => {
  if (!tenancy || tenancy === "loading") {
    showToast("입주 연결이 완료되면 임대인 문의를 열 수 있습니다.");
    return;
  }
  setIsLandlordConversationLoading(true);
  setLandlordConversationError("");
  try {
    const response = await fetch(tenantLandlordConversationPaths.current(), { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.message || "대화 정보를 불러오지 못했습니다.");
    const conversation = payload as TenantLandlordConversation;
    if (conversation.threadId) {
      router.push(tenantLandlordThreadHref(conversation.threadId));
      return;
    }
    setLandlordConversation(conversation);
    setIsLandlordChatOpen(true);
  } catch (error) {
    setLandlordConversationError(error instanceof Error ? error.message : "대화 정보를 불러오지 못했습니다.");
    setIsLandlordChatOpen(true);
  } finally {
    setIsLandlordConversationLoading(false);
  }
};
```

버튼은 `onClick={() => void openLandlordConversation()}`를 사용하고 로딩 중 비활성화한다. 거래 계약 `threadId`를 조건으로 사용하던 `contractThreadId`를 제거한다.

- [ ] **Step 4: 첫 메시지 전송과 상세 이동 구현**

```ts
const submitLandlordMessage = async (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  const input = tenantLandlordThreadInput(landlordMessageDraft);
  if (!input.body || isLandlordMessageSubmitting) return;
  setIsLandlordMessageSubmitting(true);
  setLandlordConversationError("");
  try {
    const response = await fetch(tenantLandlordConversationPaths.threads(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.message || "메시지를 보내지 못했습니다.");
    router.push(tenantLandlordThreadHref((payload as Thread).id));
  } catch (error) {
    setLandlordConversationError(error instanceof Error ? error.message : "메시지를 보내지 못했습니다.");
  } finally {
    setIsLandlordMessageSubmitting(false);
  }
};
```

- [ ] **Step 5: 거래 채팅 패널을 첫 메시지 작성 패널로 교체**

`TradeChatCenter` import와 렌더를 제거한다. 기존 `.tenant-chat-panel` 셸 내부에 건물·호실 안내, 오류 role alert, textarea, 전송 버튼을 렌더한다.

```tsx
<form className="tenant-landlord-message-form" onSubmit={submitLandlordMessage}>
  <label htmlFor="tenant-landlord-message">첫 메시지</label>
  <textarea
    id="tenant-landlord-message"
    value={landlordMessageDraft}
    onChange={(event) => setLandlordMessageDraft(event.target.value)}
    placeholder="임대인에게 문의할 내용을 입력하세요."
  />
  {landlordConversationError ? <p role="alert">{landlordConversationError}</p> : null}
  <button type="submit" disabled={!landlordMessageDraft.trim() || isLandlordMessageSubmitting}>
    {isLandlordMessageSubmitting ? "보내는 중..." : "문의 보내기"}
  </button>
</form>
```

`.tenant-landlord-message-form` 하위 스타일은 `var(--paper)`, `var(--line)`, `var(--ink)`, `var(--muted)`, `var(--blue)` 등 기존 토큰만 사용한다.

- [ ] **Step 6: Web 전체 테스트와 빌드 확인**

Run: `pnpm test:web && pnpm --filter web build`

Expected: 0 failures, Next production build 성공.

- [ ] **Step 7: Task 3 커밋과 푸시**

```bash
git add apps/web/src/app/my/flows/TenantMyPage.tsx apps/web/src/app/globals.css apps/web/src/lib/tenant-landlord-conversation.spec.ts
git commit -m "feat(my): open landlord inquiries in messaging"
git push origin kms-complaint1
```

---

### Task 4: 전체 검증과 Docker 브라우저 확인

**Files:**
- No source changes expected
- Verify: `apps/web`, `apps/api`, `packages/types`, `packages/ui`

**Interfaces:**
- Verifies: tenant first inquiry → manager list/detail → manager reply → tenant detail

- [ ] **Step 1: API와 Web 전체 테스트**

Run: `pnpm test:api && pnpm test:web`

Expected: 0 failures.

- [ ] **Step 2: 기본 검증 스크립트**

Run: `bash scripts/verify.sh`

Expected: types, ui, web, api 빌드 및 API smoke 모두 성공.

- [ ] **Step 3: Docker 이미지 재빌드와 서비스 상태 확인**

Run: `docker compose up -d --build web api && docker compose ps`

Expected: web, api, postgres가 running/healthy이며 web `:3000`, api `:4000`이 응답.

- [ ] **Step 4: 브라우저 E2E 확인**

세입자로 로그인해 다음을 확인한다.

1. `/my`에서 `임대인에게 문의하기` 클릭.
2. 기존 일반 문의가 없으면 첫 메시지 작성 패널 노출.
3. 첫 메시지 전송 후 `/tenant/messaging/01?id=<threadId>` 이동.
4. 관리자로 로그인해 `/manager/messaging/00`에서 동일 내용과 스레드 확인.
5. 관리자 상세에서 답변 후 세입자 상세에서 답변 반영 확인.
6. 다시 `/my` 버튼을 누르면 작성 패널 없이 기존 상세로 이동 확인.

- [ ] **Step 5: 최종 상태와 원격 동기화 확인**

Run: `git status --short --branch && git log -4 --oneline && git ls-remote --heads origin kms-complaint1`

Expected: 기능 파일은 clean, 사용자 소유의 기존 untracked 문서만 남고, 원격 `kms-complaint1`이 마지막 기능 커밋을 가리킨다.
