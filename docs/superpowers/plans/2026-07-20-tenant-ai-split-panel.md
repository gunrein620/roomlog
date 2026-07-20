# Tenant AI Split Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tenant AI assistant open directly as a persistent text-first right split panel, use a full-screen panel on responsive layouts, and transition AI-generated complaint drafts into the request form without losing the conversation.

**Architecture:** Follow the manager assistant pattern: a module-scope `useSyncExternalStore` store mirrors safe state to `sessionStorage`, while the tenant intake hook owns API/WebRTC orchestration and writes results into that store. Extract the assistant surface from `TenantMyPage` into a focused panel component and compose it beside the tenant page on desktop, switching it to a fixed full-screen surface below the responsive breakpoint.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS token variables, Node test runner, NestJS-backed tenant intake API.

## Global Constraints

- Default assistant mode is text; there is no initial text/voice chooser.
- Desktop uses a true content-and-panel split; tablet and mobile show only the AI panel while it is open.
- Messages, mode, panel state, input draft, intake session id, and AI-draft transition state survive remount and reload through `sessionStorage`.
- `busy`, WebRTC objects, media streams, and active voice connection state are never persisted.
- Closing the panel stops microphone transmission but does not clear conversation state.
- An AI-generated request draft opens the existing request form without closing or clearing the assistant.
- All new styles use existing CSS variables; no raw hex values.

---

## File Map

- Create `apps/web/src/app/my/flows/tenant-ai-assistant-store.ts`: tenant assistant state, external-store subscription, sessionStorage restore/persist, and imperative mutations for async flows.
- Create `apps/web/src/app/my/flows/tenant-ai-assistant-store.spec.ts`: persistence parser and reducer behavior.
- Create `apps/web/src/app/my/flows/TenantAiAssistantPanel.tsx`: text/voice transcript, composer, mode toggle, and responsive panel header.
- Create `apps/web/src/app/my/flows/tenant-ai-split-panel.spec.ts`: source/layout contract for chooser removal, split composition, responsive full-screen behavior, and draft transition copy.
- Modify `apps/web/src/app/my/flows/useTenantAiAssistant.ts`: replace local persistent state with the store and preserve the backend intake session id across remounts.
- Modify `apps/web/src/app/my/flows/TenantMyPage.tsx`: compose the split layout, use store-backed panel state, remove `<dialog>` and chooser stage, and keep the panel open when the request form appears.
- Modify `apps/web/src/app/globals.css`: tenant split-panel desktop layout, responsive full-screen panel, and request-sheet/panel coexistence.

---

### Task 1: Persistent Tenant Assistant Session Store

**Files:**
- Create: `apps/web/src/app/my/flows/tenant-ai-assistant-store.ts`
- Create: `apps/web/src/app/my/flows/tenant-ai-assistant-store.spec.ts`
- Modify: `apps/web/src/app/my/flows/useTenantAiAssistant.ts`

**Interfaces:**
- Produces:
  - `TenantAiAssistantStoreState`
  - `useTenantAiAssistantStore(): TenantAiAssistantStoreState`
  - `getTenantAiAssistantState(): TenantAiAssistantStoreState`
  - `openTenantAiAssistant()`, `closeTenantAiAssistant()`
  - `setTenantAiMode(mode)`, `setTenantAiDraft(draft)`
  - `appendTenantAiMessage(sender, text)`
  - `setTenantAiBusy(busy)`, `setTenantAiSessionId(sessionId)`
  - `setTenantAiRequestDraft(draft)`, `consumeTenantAiRequestDraft()`
  - `markTenantAiDraftFormOpen(open)`
- Consumes tenant intake types from `@/lib/tenant-intake-api`.

- [ ] **Step 1: Write failing state and persistence tests**

```ts
it("restores conversation state but resets transient busy state", () => {
  const restored = parseTenantAiAssistantState(JSON.stringify({
    open: true,
    mode: "call",
    draft: "에어컨이 안 돼요",
    messages: [{ id: "m1", sender: "tenant", text: "에어컨이 안 돼요" }],
    sessionId: "intake-1",
    busy: true,
  }));

  assert.equal(restored.open, true);
  assert.equal(restored.mode, "call");
  assert.equal(restored.draft, "에어컨이 안 돼요");
  assert.equal(restored.messages.length, 1);
  assert.equal(restored.sessionId, "intake-1");
  assert.equal(restored.busy, false);
});

it("falls back safely when stored state is malformed", () => {
  assert.deepEqual(parseTenantAiAssistantState("{broken"), initialTenantAiAssistantState);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/my/flows/tenant-ai-assistant-store.spec.ts
```

Expected: FAIL because the store parser and state do not exist.

- [ ] **Step 3: Implement the external store**

Use the manager store pattern with a tenant-specific key:

```ts
const STORAGE_KEY = "tenant-ai-assistant-session-v1";

export const initialTenantAiAssistantState = Object.freeze({
  open: false,
  mode: "text" as const,
  messages: [TENANT_AI_GREETING_MESSAGE],
  draft: "",
  sessionId: null,
  requestDraft: null,
  draftFormOpen: false,
  busy: false,
});

export function parseTenantAiAssistantState(raw: string | null) {
  if (!raw) return initialTenantAiAssistantState;
  try {
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved.messages)) return initialTenantAiAssistantState;
    return { ...initialTenantAiAssistantState, ...saved, busy: false };
  } catch {
    return initialTenantAiAssistantState;
  }
}
```

Persist every stable mutation but omit `busy`. Expose module-level getters and setters so async intake responses still land after `TenantMyPage` unmounts.

- [ ] **Step 4: Refactor the intake hook onto the store**

Replace local `messages`, `busy`, `draftForRequest`, and `filedComplaint` state with store values/mutations. Refactor `ensureSession()` to return an id and reuse the restored id:

```ts
async function ensureSessionId(): Promise<string> {
  const existing = getTenantAiAssistantState().sessionId;
  if (existing) return existing;
  if (sessionPromiseRef.current) return sessionPromiseRef.current;

  sessionPromiseRef.current = createTenantIntakeSession(roomIdRef.current).then((session) => {
    setTenantAiSessionId(session.id);
    appendInitialAssistantMessages(session);
    return session.id;
  });
  return sessionPromiseRef.current;
}
```

Use the id for text turns, realtime secret creation, and voice persistence. Clear only `sessionId` after a complaint is filed; retain transcript messages and the receipt.

- [ ] **Step 5: Run tests and build**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/my/flows/tenant-ai-assistant-store.spec.ts src/app/my/flows/tenant-ai-approval.spec.ts
cd ../../
pnpm --filter web build
```

Expected: focused tests PASS and web build exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/my/flows/tenant-ai-assistant-store.ts apps/web/src/app/my/flows/tenant-ai-assistant-store.spec.ts apps/web/src/app/my/flows/useTenantAiAssistant.ts
git commit -m "feat(web): persist tenant AI assistant session"
```

---

### Task 2: Text-First Tenant Split Panel

**Files:**
- Create: `apps/web/src/app/my/flows/TenantAiAssistantPanel.tsx`
- Create: `apps/web/src/app/my/flows/tenant-ai-split-panel.spec.ts`
- Modify: `apps/web/src/app/my/flows/TenantMyPage.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes the Task 1 store and `TenantAiAssistantController`.
- Produces `TenantAiAssistantPanel`, rendered as the second child of `.tenant-ai-workspace`.

- [ ] **Step 1: Write failing source/layout tests**

```ts
it("opens directly into conversation without a mode chooser dialog", () => {
  assert.doesNotMatch(tenantPageSource, /manager-ai-mode-picker/);
  assert.doesNotMatch(tenantPageSource, /showModal\(\)/);
  assert.match(tenantPageSource, /TenantAiAssistantPanel/);
});

it("uses a desktop split and a responsive full-screen assistant", () => {
  assert.match(cssSource, /\.tenant-ai-workspace--open/);
  assert.match(cssSource, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(cssSource, /@media \(max-width: 1024px\)/);
  assert.match(cssSource, /\.tenant-ai-assistant-panel[\s\S]*position:\s*fixed/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/my/flows/tenant-ai-split-panel.spec.ts
```

Expected: FAIL because the chooser dialog still exists and split styles do not.

- [ ] **Step 3: Extract the panel component**

Move the transcript, text composer, voice controls, and bottom mode toggle from `TenantMyPage` into `TenantAiAssistantPanel`. The panel root is:

```tsx
<aside
  id="tenant-ai-assistant-panel"
  className="tenant-ai-assistant-panel"
  aria-labelledby="tenant-ai-assistant-panel-title"
>
  <header className="tenant-ai-assistant-panel__header">
    <span>
      <Bot aria-hidden="true" />
      <strong id="tenant-ai-assistant-panel-title">Woo-zu AI 비서</strong>
    </span>
    <button type="button" aria-label="AI 생활 도우미 닫기" onClick={onClose}>
      <X aria-hidden="true" />
    </button>
  </header>
  <section className="manager-ai-conversation">...</section>
</aside>
```

Keep the existing Push-to-Talk safety handlers and text/voice mode toggle. Do not add a chooser stage.

- [ ] **Step 4: Compose the split workspace**

Replace the dialog/ref/stage path with store-backed open state:

```tsx
<div className={`tenant-ai-workspace${assistant.open ? " tenant-ai-workspace--open" : ""}`}>
  <section className="screen tenant-screen tenant-portal-screen" id="my-page">
    {/* existing tenant content */}
  </section>
  {assistant.open ? <TenantAiAssistantPanel ... /> : null}
</div>
```

The floating button calls `openTenantAiAssistant()` and uses `aria-expanded` plus `aria-controls`. Closing disconnects voice first, then sets `open: false`.

- [ ] **Step 5: Add token-only responsive styles**

```css
.tenant-ai-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
}

.tenant-ai-workspace--open {
  grid-template-columns: minmax(0, 1fr) var(--manager-assistant-panel-width);
}

.tenant-ai-assistant-panel {
  position: sticky;
  top: 0;
  height: 100dvh;
  overflow: hidden;
  border-left: 1px solid var(--border);
  background: var(--surface-container-lowest);
}

@media (max-width: 1024px) {
  .tenant-ai-workspace--open > .tenant-portal-screen {
    visibility: hidden;
  }

  .tenant-ai-assistant-panel {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100dvh;
  }
}
```

Use the existing z-index token and `manager-ai-*` conversation classes. Do not introduce animation.

- [ ] **Step 6: Run tests and build**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/my/flows/tenant-ai-split-panel.spec.ts
cd ../../
pnpm --filter web build
```

Expected: focused tests PASS and web build exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/my/flows/TenantAiAssistantPanel.tsx apps/web/src/app/my/flows/TenantMyPage.tsx apps/web/src/app/my/flows/tenant-ai-split-panel.spec.ts apps/web/src/app/globals.css
git commit -m "feat(web): open tenant AI as split panel"
```

---

### Task 3: Natural AI Draft-to-Request Transition

**Files:**
- Modify: `apps/web/src/app/my/flows/tenant-ai-assistant-store.ts`
- Modify: `apps/web/src/app/my/flows/useTenantAiAssistant.ts`
- Modify: `apps/web/src/app/my/flows/TenantMyPage.tsx`
- Modify: `apps/web/src/app/my/flows/tenant-ai-split-panel.spec.ts`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes `requestDraft` and `draftFormOpen` from the Task 1 store.
- Produces a request form annotated as AI-generated and a stable return path to the still-open assistant.

- [ ] **Step 1: Add failing transition tests**

```ts
it("keeps the assistant open while applying an AI request draft", () => {
  assert.doesNotMatch(tenantPageSource, /aiDialogRef\.current\?\.close/);
  assert.match(tenantPageSource, /AI가 작성한 초안/);
  assert.match(tenantPageSource, /AI 대화로 돌아가기/);
});

it("leaves room for the assistant beside the request sheet on desktop", () => {
  assert.match(cssSource, /\.tenant-ai-workspace--open[\s\S]*\.notification-sheet-backdrop/);
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/my/flows/tenant-ai-split-panel.spec.ts
```

Expected: FAIL on the missing transition copy and the old dialog-close behavior.

- [ ] **Step 3: Keep the panel and annotate the generated form**

When `ai.requestDraft` changes:

```ts
setRequestDraft(toTenantRequestFormDraft(ai.requestDraft));
markTenantAiDraftFormOpen(true);
setIsRequestSheetOpen(true);
ai.consumeDraftForRequest();
```

Do not close the assistant. Add a form banner:

```tsx
{assistant.draftFormOpen ? (
  <div className="tenant-request-ai-origin" role="status">
    <Bot aria-hidden="true" />
    <span>AI가 작성한 초안입니다. 내용을 확인하고 사진을 추가할 수 있어요.</span>
    <button type="button" onClick={returnToAiConversation}>AI 대화로 돌아가기</button>
  </div>
) : null}
```

On desktop, returning closes the request sheet but leaves the panel visible. On responsive layouts, it closes the request sheet to reveal the full-screen AI panel. Do not clear form fields or images when switching between these surfaces.

- [ ] **Step 4: Keep the desktop panel visible beside the request sheet**

Scope the existing request sheet backdrop to the content column:

```css
@media (min-width: 1025px) {
  .tenant-ai-workspace--open .notification-sheet-backdrop {
    right: var(--manager-assistant-panel-width);
  }
}
```

The mobile request sheet remains full-screen and sits above the full-screen AI panel.

- [ ] **Step 5: Run transition and existing approval tests**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register \
  src/app/my/flows/tenant-ai-split-panel.spec.ts \
  src/app/my/flows/tenant-ai-approval.spec.ts \
  src/app/my/flows/tenant-ai-assistant-store.spec.ts
```

Expected: all focused tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/my/flows/tenant-ai-assistant-store.ts apps/web/src/app/my/flows/useTenantAiAssistant.ts apps/web/src/app/my/flows/TenantMyPage.tsx apps/web/src/app/my/flows/tenant-ai-split-panel.spec.ts apps/web/src/app/globals.css
git commit -m "feat(web): preserve tenant AI draft transition"
```

---

### Task 4: Integrated Verification and Docker Runtime

**Files:**
- Verify all files changed in Tasks 1–3.

- [ ] **Step 1: Run focused tenant AI tests**

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register \
  src/app/my/flows/tenant-ai-assistant-store.spec.ts \
  src/app/my/flows/tenant-ai-split-panel.spec.ts \
  src/app/my/flows/tenant-ai-approval.spec.ts \
  src/app/my/flows/tenant-ai-voice.spec.ts
```

Expected: all focused tests PASS with zero failures.

- [ ] **Step 2: Run builds**

```bash
cd ../../
pnpm --filter @roomlog/types build
pnpm --filter web build
```

Expected: both builds exit 0.

- [ ] **Step 3: Run the full web test suite**

```bash
pnpm test:web
```

Expected: record the exact result. Existing unrelated failures must be reported separately and must not be rewritten as tenant-AI failures.

- [ ] **Step 4: Rebuild the standard Docker service**

```bash
docker compose up -d --build web
docker compose ps
curl --fail --silent --show-error --output /dev/null --write-out '%{http_code}\n' http://localhost:3000/
```

Expected: `roomlog-web` is Up and the root page returns `200`.

- [ ] **Step 5: Inspect the final diff**

```bash
git diff --check
git status -sb
git diff --stat
```

Expected: no whitespace errors; only the planned tenant AI files and plan document are changed.
