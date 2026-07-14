# Manager Living-Style AI Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 전 화면의 플로팅 AI 챗봇에서 Living과 같은 Text Chat/Voice Call 선택 및 전환 경험을 제공하면서 기존 관리자 코파일럿의 실제 텍스트·Realtime 업무 기능과 발송 확인 게이트를 유지한다.

**Architecture:** `ManagerAppShell`에 단일 `ManagerAiAssistant`를 장착하고, UI 상태를 순수 reducer와 세션 훅으로 분리한다. 텍스트 모드는 기존 `/api/manager/copilot/chat`, 음성 모드는 기존 Realtime client-secret/command API를 사용하며 두 모드의 메시지를 하나의 transcript 모델로 정규화한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, NestJS, OpenAI Chat Completions/Realtime WebRTC, Node test runner, pnpm monorepo

## Global Constraints

- 작업 브랜치는 `kms-manager-agent`이며 `app` 브랜치를 직접 수정·커밋·푸시하지 않는다.
- 작업 시작과 인프라 변경 판단 전에 `.local-agents/local-infra-guard.prompt.md`를 따른다.
- Docker, workflow, AWS, 배포 환경 파일은 수정하지 않는다. 필요성이 생기면 먼저 사용자에게 보고한다.
- 신규 스타일은 `packages/ui/src/tokens.css`의 `var(--...)`만 사용하며 raw hex와 rgba 값을 추가하지 않는다.
- 관리자 발송 명령은 텍스트와 음성 모두 `ManagerAssistantActionCard` 확인 전 실행하지 않는다.
- 각 태스크는 실패 테스트 작성, 통과 확인, 관련 회귀 테스트, 해당 태스크만 커밋·푸시 순서로 완료한다.
- 기존 미추적 `docs/superpowers/**` 파일은 삭제하거나 커밋에 포함하지 않는다.

---

## File Structure

- `packages/types/src/manager-assistant.ts`: 공용 모드, 연결 상태, transcript 판별 유니온을 정의한다.
- `apps/web/src/app/manager/_components/manager-assistant-session.ts`: 모드와 transcript의 순수 reducer 및 API 전송용 변환을 담당한다.
- `apps/web/src/app/manager/_components/manager-assistant-session.spec.ts`: reducer, 전환, transcript 변환을 검증한다.
- `apps/web/src/app/manager/_components/useManagerAssistantSession.ts`: 텍스트 요청, 보류 액션, 승인·취소·수정 흐름을 조정한다.
- `apps/web/src/app/manager/_components/useManagerRealtimeSession.ts`: WebRTC 연결, 마이크와 peer 정리, Realtime 이벤트를 조정한다.
- `apps/web/src/app/manager/_components/manager-realtime-events.ts`: Realtime JSON 이벤트를 UI/도구 이벤트로 해석하는 순수 함수다.
- `apps/web/src/app/manager/_components/manager-realtime-events.spec.ts`: transcript와 function call 이벤트 해석을 검증한다.
- `apps/web/src/app/manager/_components/ManagerAssistant.tsx`: 플로팅 런처, 모드 선택, 통합 대화 패널을 렌더한다.
- `apps/web/src/app/manager/_components/ManagerAssistantActionCard.tsx`: 기존 발송 확인 UI를 그대로 재사용한다.
- `apps/web/src/app/manager/_components/ManagerAppShell.tsx`: 모든 관리자 데스크톱 화면에 통합 패널을 한 번만 장착한다.
- `apps/web/src/app/manager/agent/realtime/ManagerRealtimeConsole.tsx`: 기존 전체 화면 호환 UI를 공용 훅 소비자로 축소한다.
- `apps/web/src/app/manager/globals.css`: 토큰 기반 통합 패널, 모드 카드, transcript, 음성 상태 스타일을 추가한다.
- `apps/web/src/app/manager/manager-workspace-shell.spec.ts`: 전역 장착과 접근성 소스 계약을 검증한다.
- `apps/web/src/app/manager/agent/realtime-entry.spec.ts`: 전체 화면 Realtime 경로가 공용 로직을 계속 사용하는지 검증한다.

---

### Task 1: Shared Assistant State and Living-Style Mode Shell

**Files:**
- Modify: `packages/types/src/manager-assistant.ts`
- Create: `apps/web/src/app/manager/_components/manager-assistant-session.ts`
- Create: `apps/web/src/app/manager/_components/manager-assistant-session.spec.ts`
- Modify: `apps/web/src/app/manager/_components/ManagerAssistant.tsx`
- Modify: `apps/web/src/app/manager/globals.css`
- Modify: `apps/web/src/app/manager/manager-workspace-shell.spec.ts`

**Interfaces:**
- Produces: `ManagerAssistantMode = "text" | "voice"`
- Produces: `ManagerAssistantConnectionState = "idle" | "connecting" | "connected" | "not_configured" | "error"`
- Produces: `ManagerAssistantTranscriptEntry` discriminated union
- Produces: `reduceManagerAssistantSession(state, event): ManagerAssistantSessionState`
- Produces: `toManagerCopilotMessages(entries): ManagerCopilotChatMessage[]`
- Consumes: existing `ManagerCopilotPendingAction` and `ManagerCopilotChatMessage`

- [ ] **Step 1: Write the failing reducer tests**

```ts
test("selects and switches modes without losing transcript or pending action", () => {
  const withMessage = reduceManagerAssistantSession(initialManagerAssistantSessionState, {
    type: "append",
    entry: { id: "assistant-1", kind: "message", role: "assistant", content: "수납 현황입니다." },
  });
  const withPending = reduceManagerAssistantSession(withMessage, {
    type: "set_pending_action",
    pendingAction: { id: "pending-1", kind: "billing.send_dunning", summary: "411호 독촉" },
  });
  const voice = reduceManagerAssistantSession(withPending, { type: "select_mode", mode: "voice" });
  assert.equal(voice.stage, "conversation");
  assert.equal(voice.mode, "voice");
  assert.equal(voice.entries.length, 1);
  assert.equal(voice.pendingAction?.id, "pending-1");
});

test("sends only user and assistant message entries to the text API", () => {
  const messages = toManagerCopilotMessages([
    { id: "u1", kind: "message", role: "user", content: "이번 달 수납" },
    { id: "s1", kind: "message", role: "system", content: "연결됨" },
    { id: "r1", kind: "receipt", receiptKind: "billing", summary: "조회 완료" },
    { id: "a1", kind: "message", role: "assistant", content: "수납률은 92%입니다." },
  ]);
  assert.deepEqual(messages, [
    { role: "user", content: "이번 달 수납" },
    { role: "assistant", content: "수납률은 92%입니다." },
  ]);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm --filter web test:unit -- manager-assistant-session.spec.ts`

Expected: FAIL because `manager-assistant-session.ts` and its exports do not exist.

- [ ] **Step 3: Add shared types and the minimal reducer**

```ts
export type ManagerAssistantMode = "text" | "voice";
export type ManagerAssistantConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "not_configured"
  | "error";

export type ManagerAssistantTranscriptEntry =
  | { id: string; kind: "message"; role: "user" | "assistant" | "system"; content: string; localOnly?: boolean }
  | { id: string; kind: "receipt"; receiptKind: string; summary: string };
```

```ts
export const initialManagerAssistantSessionState: ManagerAssistantSessionState = {
  stage: "choose",
  mode: "text",
  entries: [],
  pendingAction: null,
};

export function reduceManagerAssistantSession(
  state: ManagerAssistantSessionState,
  event: ManagerAssistantSessionEvent,
): ManagerAssistantSessionState {
  if (event.type === "select_mode") return { ...state, stage: "conversation", mode: event.mode };
  if (event.type === "append") return { ...state, entries: state.entries.concat(event.entry) };
  if (event.type === "set_pending_action") return { ...state, pendingAction: event.pendingAction };
  return state;
}
```

- [ ] **Step 4: Replace the launcher body with the Living-style mode shell**

Implement one dialog with:

```tsx
{session.stage === "choose" ? (
  <div className="manager-ai-mode-picker" aria-label="AI 상담 모드 선택">
    <button type="button" onClick={() => session.selectMode("text")}>
      <MessageSquare aria-hidden="true" />
      <strong>Text Chat</strong>
      <small>TEXT</small>
    </button>
    <button type="button" onClick={() => session.selectMode("voice")}>
      <Headphones aria-hidden="true" />
      <strong>Voice Call</strong>
      <small>CALL</small>
    </button>
  </div>
) : (
  <ManagerAssistantConversation session={session} />
)}
```

The dialog must use `aria-labelledby`, close on Escape/backdrop, retain reducer state while mounted, and use token-only classes in `globals.css`.

- [ ] **Step 5: Update the workspace source-contract test**

Assert that `ManagerAssistant.tsx` contains `AI 상담 모드 선택`, `Text Chat`, `Voice Call`, `role="log"`, `aria-live="polite"`, and no new raw color literals. Assert that `ManagerAppShell.tsx` continues to render one global launcher outside full Realtime mode.

- [ ] **Step 6: Build shared types and run Task 1 tests**

Run:

```bash
pnpm --filter @roomlog/types build
pnpm --filter web test:unit -- manager-assistant-session.spec.ts manager-workspace-shell.spec.ts
```

Expected: all focused tests PASS.

- [ ] **Step 7: Commit and push Task 1**

```bash
git add packages/types/src/manager-assistant.ts \
  apps/web/src/app/manager/_components/manager-assistant-session.ts \
  apps/web/src/app/manager/_components/manager-assistant-session.spec.ts \
  apps/web/src/app/manager/_components/ManagerAssistant.tsx \
  apps/web/src/app/manager/globals.css \
  apps/web/src/app/manager/manager-workspace-shell.spec.ts
git commit -m "feat(manager): add Living-style assistant mode shell"
git push origin kms-manager-agent
```

---

### Task 2: Text Copilot in the Unified Panel

**Files:**
- Create: `apps/web/src/app/manager/_components/useManagerAssistantSession.ts`
- Create: `apps/web/src/app/manager/_components/useManagerAssistantSession.spec.ts`
- Modify: `apps/web/src/app/manager/_components/ManagerAssistant.tsx`
- Reuse: `apps/web/src/app/manager/_components/ManagerAssistantActionCard.tsx`
- Reuse: `apps/web/src/lib/manager-copilot-api.ts`
- Modify: `apps/web/src/app/manager/manager-workspace-shell.spec.ts`

**Interfaces:**
- Consumes: `reduceManagerAssistantSession`, `toManagerCopilotMessages`, `requestManagerCopilotChat`
- Produces: `useManagerAssistantSession(): ManagerAssistantSessionController`
- Produces controller methods: `selectMode`, `submitText`, `confirmPendingAction`, `cancelPendingAction`, `revisePendingDunning`, `appendVoiceEntry`

- [ ] **Step 1: Write failing text-controller tests around extracted pure helpers**

```ts
test("maps a successful copilot response to assistant, pending action, and receipts", () => {
  const events = copilotResponseEvents({
    mode: "openai",
    reply: "발송 전 확인이 필요합니다.",
    pendingAction: { id: "p1", kind: "billing.send_dunning", summary: "411호 독촉" },
    receipts: [{ kind: "billing.send_dunning", summary: "발송 완료" }],
  }, () => "fixed-id");
  assert.equal(events[0].type, "append");
  assert.equal(events[1].type, "set_pending_action");
  assert.equal(events[2].type, "append");
});

test("turns not-configured mode into a blocking notice", () => {
  assert.deepEqual(copilotResponseStatus({ mode: "not_configured", reply: "API 키 필요" }), {
    inputDisabled: true,
    notice: "API 키 필요",
  });
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm --filter web test:unit -- useManagerAssistantSession.spec.ts`

Expected: FAIL because response helpers and hook do not exist.

- [ ] **Step 3: Implement the controller and response mapping**

The controller must call:

```ts
await requestManagerCopilotChat({ messages: toManagerCopilotMessages(nextEntries) });
await requestManagerCopilotChat({ messages, confirmActionId: pendingAction.id });
await requestManagerCopilotChat({ messages, cancelActionId: pendingAction.id });
await requestManagerCopilotChat({
  messages,
  intent: {
    type: "billing.send_dunning",
    source: "assistant",
    billId: preview.billId,
    prompt: `${preview.unitId}호 ${preview.billingMonth} 독촉 문구 수정`,
    channel,
    messageText,
  },
});
```

It must prevent empty submissions, ignore duplicate submissions while busy, and disable new submissions while a pending action exists.

- [ ] **Step 4: Render text transcript, composer, receipts, and action card**

The conversation branch must render:

```tsx
<div role="log" aria-live="polite" className="manager-ai-transcript">
  {session.entries.map((entry) => <ManagerAssistantEntry key={entry.id} entry={entry} />)}
  {session.pendingAction ? (
    <ManagerAssistantActionCard
      action={session.pendingAction}
      busy={session.busy}
      onConfirm={session.confirmPendingAction}
      onCancel={session.cancelPendingAction}
      onReviseDunning={session.revisePendingDunning}
    />
  ) : null}
</div>
```

The textarea must send on Enter, insert a newline on Shift+Enter, preserve IME composition, and display network errors as system transcript entries.

- [ ] **Step 5: Run focused and existing copilot regression tests**

Run:

```bash
pnpm --filter web test:unit -- useManagerAssistantSession.spec.ts manager-assistant-session.spec.ts manager-workspace-shell.spec.ts
pnpm --filter api test -- roomlog-copilot.domain.spec.ts
```

Expected: all focused web tests and existing copilot domain tests PASS.

- [ ] **Step 6: Commit and push Task 2**

```bash
git add apps/web/src/app/manager/_components/useManagerAssistantSession.ts \
  apps/web/src/app/manager/_components/useManagerAssistantSession.spec.ts \
  apps/web/src/app/manager/_components/ManagerAssistant.tsx \
  apps/web/src/app/manager/manager-workspace-shell.spec.ts
git commit -m "feat(manager): connect text copilot to assistant panel"
git push origin kms-manager-agent
```

---

### Task 3: Voice Call Mode and Shared Realtime Transcript

**Files:**
- Create: `apps/web/src/app/manager/_components/manager-realtime-events.ts`
- Create: `apps/web/src/app/manager/_components/manager-realtime-events.spec.ts`
- Create: `apps/web/src/app/manager/_components/useManagerRealtimeSession.ts`
- Create: `apps/web/src/app/manager/_components/useManagerRealtimeSession.spec.ts`
- Modify: `apps/web/src/app/manager/_components/ManagerAssistant.tsx`
- Modify: `apps/web/src/app/manager/agent/realtime/ManagerRealtimeConsole.tsx`
- Modify: `apps/web/src/app/manager/agent/realtime-entry.spec.ts`

**Interfaces:**
- Consumes: `appendVoiceEntry`, `setPendingAction`, `requestManagerCopilotChat`
- Produces: `parseManagerRealtimeEvent(raw): ManagerRealtimeEvent`
- Produces: `useManagerRealtimeSession(options): ManagerRealtimeSessionController`
- Controller exposes: `status`, `connect`, `disconnect`, `sessionMeta`

- [ ] **Step 1: Write failing Realtime event parser tests**

```ts
test("parses manager and assistant transcript events", () => {
  assert.deepEqual(parseManagerRealtimeEvent(JSON.stringify({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "이번 달 수납 현황 알려줘",
  })), { kind: "transcript", role: "user", content: "이번 달 수납 현황 알려줘" });
  assert.deepEqual(parseManagerRealtimeEvent(JSON.stringify({
    type: "response.output_audio_transcript.done",
    transcript: "수납률은 92%입니다.",
  })), { kind: "transcript", role: "assistant", content: "수납률은 92%입니다." });
});

test("parses function call arguments without executing them", () => {
  assert.deepEqual(parseManagerRealtimeEvent(JSON.stringify({
    type: "response.function_call_arguments.done",
    call_id: "call-1",
    arguments: JSON.stringify({ command: "billing.send_dunning", text: "411호 독촉" }),
  })), {
    kind: "command",
    callId: "call-1",
    input: { command: "billing.send_dunning", text: "411호 독촉" },
  });
});
```

- [ ] **Step 2: Run focused parser tests and confirm failure**

Run: `pnpm --filter web test:unit -- manager-realtime-events.spec.ts`

Expected: FAIL because the parser does not exist.

- [ ] **Step 3: Implement the pure parser**

Return `ignored` for malformed JSON and unsupported events, `error` for Realtime errors, `transcript` for both current and legacy assistant transcript event names, and `command` for function call completion. Do not execute fetches inside the parser.

- [ ] **Step 4: Write failing resource-cleanup tests**

```ts
test("closes channel and peer and stops every media track", () => {
  let channelClosed = false;
  let peerClosed = false;
  let stopped = 0;
  closeManagerRealtimeResources({
    channel: { close: () => { channelClosed = true; } },
    peer: { close: () => { peerClosed = true; } },
    stream: { getTracks: () => [{ stop: () => { stopped += 1; } }, { stop: () => { stopped += 1; } }] },
  });
  assert.equal(channelClosed, true);
  assert.equal(peerClosed, true);
  assert.equal(stopped, 2);
});
```

- [ ] **Step 5: Implement `useManagerRealtimeSession`**

Move the existing `requestMicrophone`, client-secret request, peer creation, SDP exchange, data-channel handling and cleanup into the hook. `connect()` must request the microphone only after an explicit button click. `disconnect()` and the hook cleanup must stop all tracks. A text-mode switch and dialog close must call `disconnect()`.

For `billing.send_dunning`, call the existing copilot intent endpoint and expose its pending action. For other commands, call `/api/manager/agent/realtime/command`, send the result back through `conversation.item.create`, then send `response.create`.

- [ ] **Step 6: Render voice controls inside the unified panel**

```tsx
{session.mode === "voice" ? (
  <ManagerVoiceControls
    status={realtime.status}
    onConnect={realtime.connect}
    onDisconnect={realtime.disconnect}
  />
) : (
  <ManagerTextComposer session={session} />
)}
```

The UI must show `연결 준비`, `연결 중`, `듣는 중`, `API 키 필요`, or `연결 오류` as text and must never start the microphone automatically.

- [ ] **Step 7: Make the full Realtime page consume the shared hook**

Keep `/manager/agent/realtime` working as a compatibility surface. Remove duplicated WebRTC resource ownership from `ManagerRealtimeConsole` and consume the same hook/controller used by the floating panel.

- [ ] **Step 8: Run voice and API gate tests**

Run:

```bash
pnpm --filter web test:unit -- manager-realtime-events.spec.ts useManagerRealtimeSession.spec.ts realtime-entry.spec.ts
pnpm --filter api test -- roomlog-copilot.domain.spec.ts
```

Expected: parser, resource cleanup, compatibility entry and server confirmation-gate tests PASS.

- [ ] **Step 9: Commit and push Task 3**

```bash
git add apps/web/src/app/manager/_components/manager-realtime-events.ts \
  apps/web/src/app/manager/_components/manager-realtime-events.spec.ts \
  apps/web/src/app/manager/_components/useManagerRealtimeSession.ts \
  apps/web/src/app/manager/_components/useManagerRealtimeSession.spec.ts \
  apps/web/src/app/manager/_components/ManagerAssistant.tsx \
  apps/web/src/app/manager/agent/realtime/ManagerRealtimeConsole.tsx \
  apps/web/src/app/manager/agent/realtime-entry.spec.ts
git commit -m "feat(manager): add voice mode to assistant panel"
git push origin kms-manager-agent
```

---

### Task 4: Global Integration, Duplicate Removal, and Full Verification

**Files:**
- Modify: `apps/web/src/app/manager/_components/ManagerAppShell.tsx`
- Modify: `apps/web/src/app/manager/_components/ManagerAssistant.tsx`
- Modify: `apps/web/src/app/manager/globals.css`
- Modify: `apps/web/src/app/manager/manager-workspace-shell.spec.ts`
- Modify or delete if unused: `apps/web/src/app/manager/home/00/CopilotPanel.tsx`
- Modify: `apps/web/src/app/manager/home/00/manager-home-agent-entry.spec.ts`

**Interfaces:**
- Consumes: completed `ManagerAiAssistant` and shared session/realtime hooks
- Produces: exactly one assistant launcher per desktop `ManagerAppShell`
- Preserves: `/manager/agent/realtime` route compatibility

- [ ] **Step 1: Write failing global-integration source tests**

Add assertions that:

```ts
assert.match(appShellSource, /<ManagerAiAssistant/);
assert.doesNotMatch(appShellSource, /ManagerAssistantPanel/);
assert.match(assistantSource, /AI 상담 모드 선택/);
assert.match(assistantSource, /onDialogClose/);
assert.doesNotMatch(managerCss, /#[0-9a-fA-F]{3,8}|rgba?\(/);
```

Limit the raw-color assertion to the newly added `.manager-ai-*` rules so existing unrelated legacy colors do not fail this task.

- [ ] **Step 2: Run integration tests and confirm failure**

Run: `pnpm --filter web test:unit -- manager-workspace-shell.spec.ts manager-home-agent-entry.spec.ts`

Expected: FAIL until the shell uses the final unified component and duplicate rail/panel paths are removed.

- [ ] **Step 3: Mount one assistant in `ManagerAppShell`**

Replace the old panel/launcher imports with `ManagerAiAssistant`. Preserve `showAssistantRail` behavior only where a static right rail is intentionally requested; otherwise render one floating assistant. Do not render the floating assistant on the full Realtime compatibility route.

- [ ] **Step 4: Remove obsolete duplicate UI paths**

Delete `CopilotPanel.tsx` only if `rg -n "CopilotPanel" apps/web/src` finds no runtime import. Keep reusable briefing helpers if tests or other pages still import them. Remove obsolete `hideAssistantLauncher` handling only after `rg` confirms no caller requires it.

- [ ] **Step 5: Run all web and API tests**

Run:

```bash
pnpm --filter @roomlog/types build
pnpm test:web
pnpm test:api
```

Expected: all web and API tests PASS. A DB integration test may report an intentional skip only when the documented PostgreSQL container is absent.

- [ ] **Step 6: Run repository verification**

Run: `bash scripts/verify.sh`

Expected: types, UI, web and API builds plus API smoke verification PASS.

- [ ] **Step 7: Docker/browser verification when the local stack is available**

Run:

```bash
docker compose up -d --build web api
docker compose ps
```

Verify in the browser on at least `/manager/home/00` and one non-home manager route:

- floating assistant opens exactly one dialog;
- Text Chat and Voice Call cards appear;
- text message receives a response or explicit not-configured notice;
- voice mode does not request a microphone before `통화 시작`;
- switching to text or closing the dialog ends an active voice connection;
- a dunning request renders a confirmation card and does not send before approval.

Do not edit compose files if startup fails. Report any infra-owned failure using the local infra guard format.

- [ ] **Step 8: Commit and push Task 4**

```bash
git add apps/web/src/app/manager/_components/ManagerAppShell.tsx \
  apps/web/src/app/manager/_components/ManagerAssistant.tsx \
  apps/web/src/app/manager/globals.css \
  apps/web/src/app/manager/manager-workspace-shell.spec.ts \
  apps/web/src/app/manager/home/00/manager-home-agent-entry.spec.ts
git add -u apps/web/src/app/manager/home/00/CopilotPanel.tsx
git commit -m "feat(manager): ship unified text and voice assistant"
git push origin kms-manager-agent
```

---

## Final Completion Check

- `git status --short` contains only the user's pre-existing untracked documents.
- `git rev-list --left-right --count origin/kms-manager-agent...kms-manager-agent` prints `0 0`.
- Every feature commit is visible on `origin/kms-manager-agent`.
- No infra-owned file appears in `git diff origin/kms-manager-agent~4..origin/kms-manager-agent --name-only`.
- Final report lists each commit, its focused tests, full verification result, and any intentionally skipped DB/Docker check.
