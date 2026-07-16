# Manager Assistant Push-to-Talk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 AI 음성 연결을 기본 음소거로 시작하고 `Push to Talk` 버튼을 누르는 동안에만 마이크 audio track을 활성화한다.

**Architecture:** `useManagerRealtimeSession`이 MediaStream과 송출 상태를 소유하며, 순수 helper로 audio track의 `enabled` 값을 제어한다. `ManagerAssistant`는 pointer/keyboard hold 이벤트를 controller의 `startTalking`·`stopTalking`에 연결하고, 모든 취소 경로에서 안전하게 음소거한다.

**Tech Stack:** Next.js 16, React 19, TypeScript, WebRTC MediaStream API, Node test runner, CSS design tokens

## Global Constraints

- 관리자 AI 팝업의 음성 모드만 변경한다.
- 기존 WebRTC 연결, transcript, 도구 호출, 통화 종료 흐름은 유지한다.
- 서버 API, Docker, 배포 설정은 변경하지 않는다.
- 마이크는 연결 직후 기본 음소거하며 hold 입력 중에만 활성화한다.
- 마우스, 터치, 펜, 키보드 Space/Enter를 지원한다.
- blur, visibility change, disconnect, connection failure에서 반드시 음소거한다.
- 스타일 값은 `packages/ui/src/tokens.css`의 CSS 변수만 사용하고 raw hex는 추가하지 않는다.

---

### Task 1: Realtime microphone transmission controller

**Files:**
- Modify: `apps/web/src/app/manager/_components/useManagerRealtimeSession.ts`
- Test: `apps/web/src/app/manager/_components/useManagerRealtimeSession.spec.ts`

**Interfaces:**
- Consumes: 기존 `streamRef`, `status`, `closeResources()`
- Produces: `setManagerAudioTracksEnabled(stream: ManagerAudioStream | null, enabled: boolean): boolean`, controller의 `isTalking: boolean`, `startTalking(): void`, `stopTalking(): void`

- [ ] **Step 1: Write failing audio-track policy tests**

```ts
import { managerPushToTalkEnabled, setManagerAudioTracksEnabled } from "./useManagerRealtimeSession";

it("keeps microphone tracks muted until push-to-talk starts", () => {
  const tracks = [{ enabled: true }, { enabled: true }];
  assert.equal(setManagerAudioTracksEnabled({ getAudioTracks: () => tracks }, false), false);
  assert.deepEqual(tracks.map((track) => track.enabled), [false, false]);
  assert.equal(setManagerAudioTracksEnabled({ getAudioTracks: () => tracks }, true), true);
  assert.deepEqual(tracks.map((track) => track.enabled), [true, true]);
});

it("allows transmission only for a connected session", () => {
  assert.equal(managerPushToTalkEnabled("connected"), true);
  assert.equal(managerPushToTalkEnabled("connecting"), false);
  assert.equal(managerPushToTalkEnabled("idle"), false);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter web exec tsx --test src/app/manager/_components/useManagerRealtimeSession.spec.ts
```

Expected: FAIL because `managerPushToTalkEnabled` and `setManagerAudioTracksEnabled` are not exported.

- [ ] **Step 3: Implement minimal track control**

```ts
export function managerPushToTalkEnabled(status: ManagerAssistantConnectionState) {
  return status === "connected";
}

type ManagerAudioStream = {
  getAudioTracks(): Array<{ enabled: boolean }>;
};

export function setManagerAudioTracksEnabled(
  stream: ManagerAudioStream | null,
  enabled: boolean,
) {
  for (const track of stream?.getAudioTracks() ?? []) track.enabled = enabled;
  return enabled;
}
```

In the hook:

```ts
const [isTalking, setIsTalking] = useState(false);

function startTalking() {
  if (!managerPushToTalkEnabled(status)) return;
  setManagerAudioTracksEnabled(streamRef.current, true);
  setIsTalking(true);
}

function stopTalking() {
  setManagerAudioTracksEnabled(streamRef.current, false);
  setIsTalking(false);
}
```

Immediately after `requestMicrophone()` call `setManagerAudioTracksEnabled(stream, false)`. Call the same helper before resource cleanup and expose `isTalking`, `startTalking`, and `stopTalking` from the hook.

- [ ] **Step 4: Run focused regression tests and verify GREEN**

Run:

```bash
pnpm --filter web exec tsx --test \
  src/app/manager/_components/useManagerRealtimeSession.spec.ts \
  src/app/manager/_components/manager-realtime-events.spec.ts
```

Expected: all tests PASS with zero failures.

- [ ] **Step 5: Commit and push the passing controller slice**

```bash
git add apps/web/src/app/manager/_components/useManagerRealtimeSession.ts \
  apps/web/src/app/manager/_components/useManagerRealtimeSession.spec.ts
git commit -m "feat(manager): control push-to-talk microphone input"
git push origin kms-manager-agent
```

---

### Task 2: Hold-to-talk controls and safe release paths

**Files:**
- Modify: `apps/web/src/app/manager/_components/ManagerAssistant.tsx`
- Modify: `apps/web/src/app/manager/globals.css`
- Test: `apps/web/src/app/manager/manager-workspace-shell.spec.ts`

**Interfaces:**
- Consumes: Task 1 controller fields `isTalking`, `startTalking()`, `stopTalking()`
- Produces: accessible `Push to Talk` UI with pointer, keyboard, blur, and visibility release behavior

- [ ] **Step 1: Write failing UI contract tests**

Add assertions requiring:

```ts
assert.match(assistant, /Push to Talk/);
assert.match(assistant, /aria-pressed=\{realtime\.isTalking\}/);
assert.match(assistant, /onPointerDown=\{startPushToTalk\}/);
assert.match(assistant, /onPointerUp=\{stopPushToTalk\}/);
assert.match(assistant, /onPointerCancel=\{stopPushToTalk\}/);
assert.match(assistant, /onLostPointerCapture=\{stopPushToTalk\}/);
assert.match(assistant, /onKeyDown=\{startPushToTalkFromKeyboard\}/);
assert.match(assistant, /onKeyUp=\{stopPushToTalkFromKeyboard\}/);
assert.match(assistant, /visibilitychange/);
assert.match(managerCss, /\.manager-ai-push-to-talk/);
```

- [ ] **Step 2: Run the shell test and verify RED**

Run:

```bash
pnpm --filter web exec tsx --test src/app/manager/manager-workspace-shell.spec.ts
```

Expected: FAIL because the Push-to-Talk UI and event handlers do not exist.

- [ ] **Step 3: Implement pointer, keyboard, and global release handling**

Add handlers in `ManagerAssistantLauncher`:

```ts
function startPushToTalk(event: React.PointerEvent<HTMLButtonElement>) {
  event.currentTarget.setPointerCapture(event.pointerId);
  realtime.startTalking();
}

function stopPushToTalk() {
  realtime.stopTalking();
}

function startPushToTalkFromKeyboard(event: React.KeyboardEvent<HTMLButtonElement>) {
  if (event.repeat || (event.key !== " " && event.key !== "Enter")) return;
  event.preventDefault();
  realtime.startTalking();
}

function stopPushToTalkFromKeyboard(event: React.KeyboardEvent<HTMLButtonElement>) {
  if (event.key !== " " && event.key !== "Enter") return;
  event.preventDefault();
  realtime.stopTalking();
}
```

Use an effect that registers `window.blur` and `document.visibilitychange`, calls `realtime.stopTalking()`, and removes both listeners on cleanup.

Render a connected-only button:

```tsx
<button
  type="button"
  className="manager-ai-push-to-talk"
  aria-pressed={realtime.isTalking}
  onPointerDown={startPushToTalk}
  onPointerUp={stopPushToTalk}
  onPointerCancel={stopPushToTalk}
  onLostPointerCapture={stopPushToTalk}
  onKeyDown={startPushToTalkFromKeyboard}
  onKeyUp={stopPushToTalkFromKeyboard}
>
  <Mic aria-hidden="true" />
  {realtime.isTalking ? "말하는 중…" : "Push to Talk"}
</button>
```

Keep `통화 종료` as a separate error-colored action. Update helper copy to `버튼을 누르고 있는 동안만 음성이 전달됩니다.`

- [ ] **Step 4: Add token-only pressed styles**

```css
.manager-ai-push-to-talk {
  width: min(100%, var(--content-narrow-max));
  min-height: calc(var(--touch-target) + var(--space-lg));
  touch-action: none;
  user-select: none;
}

.manager-ai-push-to-talk[aria-pressed="true"] {
  color: var(--on-primary-container);
  background: var(--primary-container);
  box-shadow: var(--shadow-soft);
}
```

- [ ] **Step 5: Run focused tests and web build**

Run:

```bash
pnpm --filter web exec tsx --test \
  src/app/manager/_components/useManagerRealtimeSession.spec.ts \
  src/app/manager/_components/manager-realtime-events.spec.ts \
  src/app/manager/manager-workspace-shell.spec.ts
pnpm build:web
```

Expected: all focused tests PASS and build exits 0.

- [ ] **Step 6: Run full web verification**

Run:

```bash
pnpm test:web
git diff --check
```

Expected: all web tests PASS with zero failures and `git diff --check` exits 0.

- [ ] **Step 7: Commit and push the passing UI slice**

```bash
git add apps/web/src/app/manager/_components/ManagerAssistant.tsx \
  apps/web/src/app/manager/globals.css \
  apps/web/src/app/manager/manager-workspace-shell.spec.ts
git commit -m "feat(manager): add hold-to-talk voice control"
git push origin kms-manager-agent
```

---

### Task 3: Docker and browser verification

**Files:**
- No source changes expected

**Interfaces:**
- Consumes: completed Task 1 and Task 2 implementation
- Produces: running local Docker stack and browser evidence

- [ ] **Step 1: Rebuild the web service**

Run:

```bash
docker compose up -d --build web
docker compose ps
```

Expected: web, api, and postgres are running; postgres is healthy.

- [ ] **Step 2: Verify HTTP health**

Run:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:4000/api/health
```

Expected: both return `200`.

- [ ] **Step 3: Verify the complete browser interaction**

Open `/manager/home/00`, launch the AI assistant, select Voice Call, and verify:

- `Push to Talk` is visible in voice mode.
- It is unavailable until the Realtime session is connected.
- Connected state begins with `aria-pressed="false"`.
- Pointer down changes it to `aria-pressed="true"` and `말하는 중…`.
- Pointer release returns it to `aria-pressed="false"` and `Push to Talk`.
- No Next.js error overlay or browser console error appears.

Keep the verified manager tab open for the user.
