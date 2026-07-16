# Manager Assistant Sticky Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 AI 팝업에서 사용자가 대화 하단을 보고 있을 때만 새 대화 내용으로 자동 스크롤한다.

**Architecture:** 하단 거리 판정은 브라우저 DOM과 분리된 순수 함수가 담당한다. `ManagerAssistantLauncher`는 transcript ref와 stickiness ref를 보유하고, 사용자 스크롤로 정책 상태를 갱신한 뒤 새 대화 렌더가 끝난 animation frame에서 조건부로 하단 이동한다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner, DOM scroll API

## Global Constraints

- 하단에서 96px 이내일 때만 최신 대화를 자동으로 따라간다.
- 사용자가 이전 대화를 읽는 동안에는 스크롤 위치를 강제로 변경하지 않는다.
- 팝업을 처음 열거나 대화 모드를 전환하면 최신 대화를 표시한다.
- 기존 `role="log"`, `aria-live="polite"`, 음성 연결, Push to Talk 동작을 유지한다.
- API, Docker, 배포 설정은 변경하지 않는다.
- 새 메시지 알림 버튼은 추가하지 않는다.

---

### Task 1: Sticky transcript scroll policy and UI wiring

**Files:**
- Create: `apps/web/src/app/manager/_components/manager-assistant-scroll.ts`
- Create: `apps/web/src/app/manager/_components/manager-assistant-scroll.spec.ts`
- Modify: `apps/web/src/app/manager/_components/ManagerAssistant.tsx`
- Modify: `apps/web/src/app/manager/manager-workspace-shell.spec.ts`

**Interfaces:**
- Produces: `shouldManagerAssistantStickToBottom(metrics: { scrollHeight: number; scrollTop: number; clientHeight: number }): boolean`
- Consumes: `session.entries.length`, `session.pendingAction`, `session.notice`, `session.stage`, `session.mode`

- [ ] **Step 1: Write failing scroll policy tests**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldManagerAssistantStickToBottom } from "./manager-assistant-scroll";

describe("manager assistant sticky scroll", () => {
  it("tracks new messages while the transcript is within 95px of the bottom", () => {
    assert.equal(shouldManagerAssistantStickToBottom({
      scrollHeight: 1000,
      scrollTop: 505,
      clientHeight: 400,
    }), true);
  });

  it("preserves manual reading position from 96px above the bottom", () => {
    assert.equal(shouldManagerAssistantStickToBottom({
      scrollHeight: 1000,
      scrollTop: 504,
      clientHeight: 400,
    }), false);
  });
});
```

Add source contract assertions to `manager-workspace-shell.spec.ts`:

```ts
assert.match(assistant, /ref=\{transcriptRef\}/);
assert.match(assistant, /onScroll=\{updateTranscriptStickiness\}/);
assert.match(assistant, /shouldManagerAssistantStickToBottom/);
assert.match(assistant, /requestAnimationFrame/);
assert.match(assistant, /cancelAnimationFrame/);
assert.match(assistant, /scrollTranscriptToBottom/);
```

- [ ] **Step 2: Run tests and verify RED**

Run from `apps/web`:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register \
  src/app/manager/_components/manager-assistant-scroll.spec.ts \
  src/app/manager/manager-workspace-shell.spec.ts
```

Expected: FAIL because the scroll policy module and transcript wiring do not exist.

- [ ] **Step 3: Implement the pure threshold policy**

```ts
const MANAGER_ASSISTANT_BOTTOM_THRESHOLD = 96;

export function shouldManagerAssistantStickToBottom(metrics: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}) {
  const distanceFromBottom = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
  return distanceFromBottom < MANAGER_ASSISTANT_BOTTOM_THRESHOLD;
}
```

- [ ] **Step 4: Wire transcript ref, user scroll tracking, and conditional auto-scroll**

Add refs and helpers in `ManagerAssistantLauncher`:

```ts
const transcriptRef = useRef<HTMLDivElement>(null);
const shouldStickToBottomRef = useRef(true);

function updateTranscriptStickiness() {
  const transcript = transcriptRef.current;
  if (!transcript) return;
  shouldStickToBottomRef.current = shouldManagerAssistantStickToBottom(transcript);
}

function scrollTranscriptToBottom() {
  const transcript = transcriptRef.current;
  if (!transcript) return;
  transcript.scrollTo({ top: transcript.scrollHeight, behavior: "smooth" });
}
```

Reset stickiness before mode/stage transitions are scrolled:

```ts
useEffect(() => {
  shouldStickToBottomRef.current = true;
}, [session.stage, session.mode]);
```

Scroll after relevant content renders:

```ts
useEffect(() => {
  if (session.stage !== "conversation" || !shouldStickToBottomRef.current) return;
  const frame = window.requestAnimationFrame(scrollTranscriptToBottom);
  return () => window.cancelAnimationFrame(frame);
}, [
  session.entries.length,
  session.pendingAction,
  session.notice,
  session.stage,
  session.mode,
]);
```

Add `openAssistant()` that sets stickiness to `true`, opens the dialog, and schedules `scrollTranscriptToBottom()`. Bind it to the launcher button. Add `ref={transcriptRef}` and `onScroll={updateTranscriptStickiness}` to `.manager-ai-transcript`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run from `apps/web`:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register \
  src/app/manager/_components/manager-assistant-scroll.spec.ts \
  src/app/manager/_components/manager-assistant-session.spec.ts \
  src/app/manager/_components/useManagerRealtimeSession.spec.ts \
  src/app/manager/manager-workspace-shell.spec.ts
```

Expected: all focused tests PASS with zero failures.

- [ ] **Step 6: Run build and full web verification**

```bash
pnpm build:web
pnpm test:web
git diff --check
```

Expected: build exits 0, all web tests pass, and diff check exits 0.

- [ ] **Step 7: Commit and push the passing feature slice**

```bash
git add apps/web/src/app/manager/_components/manager-assistant-scroll.ts \
  apps/web/src/app/manager/_components/manager-assistant-scroll.spec.ts \
  apps/web/src/app/manager/_components/ManagerAssistant.tsx \
  apps/web/src/app/manager/manager-workspace-shell.spec.ts
git commit -m "fix(manager): keep assistant transcript near latest message"
git push origin kms-manager-agent
```

---

### Task 2: Docker and browser verification

**Files:**
- No source changes expected

**Interfaces:**
- Consumes: Task 1 sticky transcript implementation
- Produces: running Docker stack and browser-visible verification evidence

- [ ] **Step 1: Rebuild and verify the local stack**

```bash
docker compose up -d --build web
docker compose ps
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:4000/api/health
```

Expected: web and API return `200`; postgres is healthy.

- [ ] **Step 2: Verify browser behavior**

Open `/manager/home/00`, launch the assistant, create enough transcript content to overflow, and verify:

- At the bottom, adding a new message moves `scrollTop` to the new bottom.
- After manually scrolling more than 96px upward, adding a new message preserves the previous reading position.
- Returning to the bottom re-enables following for the next message.
- No Next.js error overlay or browser console error appears.

Keep the verified manager tab open for the user.
