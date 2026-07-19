# Ticket Intake Attachment Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 상세 화면에는 신규 접수 사진만 표시하고 후속 채팅 사진은 채팅에만 유지한다.

**Architecture:** API와 DB 계약은 유지하고 web 매핑 함수 `managerTicketAttachmentUrls`의 의미를 전체 메시지 첨부 합계에서 최초 접수 메시지 첨부로 좁힌다. 상세 갤러리와 대시보드는 같은 매핑 결과를 계속 소비한다.

**Tech Stack:** TypeScript, Next.js App Router, Node test runner

## Global Constraints

- 채팅 메시지와 채팅 사진 렌더링은 변경하지 않는다.
- 채팅 한 번당 최대 5장 제한은 변경하지 않는다.
- URL 공백 제거, 빈 값 제거, 중복 제거 동작은 유지한다.
- DB 스키마와 API 응답 계약은 변경하지 않는다.
- `apps/web/src/app/HomeApp.tsx`의 사용자 변경은 수정하거나 커밋하지 않는다.

---

### Task 1: 최초 접수 사진만 상세 첨부로 매핑

**Files:**
- Modify: `apps/web/src/lib/ticket-manager-api.ts:211-222`
- Test: `apps/web/src/lib/ticket-manager-api.spec.ts:12-54`

**Interfaces:**
- Consumes: `TeamManagerTicket.messages?: TicketThreadMessage[]`
- Produces: `managerTicketAttachmentUrls(ticket: TeamManagerTicket): string[]`

- [ ] **Step 1: 후속 채팅 사진이 제외되는 실패 테스트 작성**

```ts
const ticket = {
  messages: [
    { attachmentUrls: [" /uploads/intake.png ", "/uploads/intake.png"] },
    { attachmentUrls: ["/uploads/chat.jpg"] },
  ],
} as unknown as TeamManagerTicket;

assert.deepEqual(managerTicketAttachmentUrls(ticket), ["/uploads/intake.png"]);
```

최초 메시지에 사진이 없고 후속 메시지에만 사진이 있는 경우도 `[]`를 기대한다.

- [ ] **Step 2: 테스트가 기존 전체 합산 동작 때문에 실패하는지 확인**

Run:

```bash
cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/ticket-manager-api.spec.ts
```

Expected: 후속 `/uploads/chat.jpg`가 실제 결과에 포함되어 FAIL.

- [ ] **Step 3: 최초 메시지 첨부만 정규화하도록 최소 구현**

```ts
export function managerTicketAttachmentUrls(ticket: TeamManagerTicket): string[] {
  const [intakeMessage] = ticket.messages ?? [];
  return Array.from(
    new Set(
      (intakeMessage?.attachmentUrls ?? [])
        .map((url) => url.trim())
        .filter(Boolean),
    ),
  );
}
```

- [ ] **Step 4: 관련 매핑·갤러리·채팅 테스트 실행**

Run:

```bash
cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/ticket-manager-api.spec.ts src/lib/ticket-manager-evidence-gallery.spec.ts src/lib/ticket-chat-photo-ui.spec.ts src/app/manager/ticket/dash/00/ticket-chat-panel.spec.ts
```

Expected: 모든 테스트 PASS.

- [ ] **Step 5: web 변경만 로컬 커밋**

```bash
git add apps/web/src/lib/ticket-manager-api.ts apps/web/src/lib/ticket-manager-api.spec.ts
git commit -m "fix: keep chat photos out of intake attachments"
```

