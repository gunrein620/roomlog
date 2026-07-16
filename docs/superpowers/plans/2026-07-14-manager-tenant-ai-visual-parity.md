# Manager Tenant AI Visual Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 AI 비서 선택 화면을 세입자 `Woo-zu AI Assistant`와 동일한 대형 파란 헤더 패널과 영문 모드 카드 UI로 변경한다.

**Architecture:** 기존 `ManagerAssistantLauncher`의 상태와 API 훅은 유지하고 JSX의 헤더·선택 화면 구조와 관리자 전용 CSS만 변경한다. 세입자 CSS 클래스는 직접 공유하지 않으며, 관리자 토큰만 사용해 동일한 비율을 재현한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, CSS custom properties, Node test runner, Docker Compose

## Global Constraints

- 작업 브랜치는 `kms-manager-agent`다.
- `.local-agents/local-infra-guard.prompt.md`를 준수하고 Docker·배포 설정 파일은 수정하지 않는다.
- 신규 관리자 스타일 값은 `packages/ui/src/tokens.css`의 `var(--...)`만 사용하고 raw hex와 rgba를 추가하지 않는다.
- 기존 텍스트 Copilot, Realtime 음성, transcript, 보류 액션 및 발송 확인 게이트 동작을 변경하지 않는다.
- 사용자 소유의 기존 미추적 `docs/superpowers/**` 파일은 커밋하지 않는다.
- 실패 테스트 작성, 실패 확인, 최소 구현, 집중·전체 검증, 커밋·푸시 순서로 진행한다.

---

## File Structure

- `apps/web/src/app/manager/_components/ManagerAssistant.tsx`: 세입자 AI와 같은 영문 브랜드 헤더와 모드 선택 DOM을 렌더한다.
- `apps/web/src/app/manager/globals.css`: 관리자 대형 패널, 파란 헤더, 중앙 안내, 대형 카드 및 모바일 규칙을 토큰으로 정의한다.
- `apps/web/src/app/manager/manager-workspace-shell.spec.ts`: 영문 문구, 아이콘 래퍼 및 토큰 기반 레이아웃 계약을 검증한다.

### Task 1: Tenant-Style Manager Assistant Panel

**Files:**
- Modify: `apps/web/src/app/manager/_components/ManagerAssistant.tsx`
- Modify: `apps/web/src/app/manager/globals.css`
- Test: `apps/web/src/app/manager/manager-workspace-shell.spec.ts`

**Interfaces:**
- Consumes: `useManagerAssistantSession()`, `useManagerRealtimeSession()`, `ManagerAssistantActionCard`
- Produces: 기존 `ManagerAssistantLauncher` public props와 동작을 유지한 세입자 AI 동일 선택 화면

- [ ] **Step 1: Write the failing source-contract test**

`manager app shell exposes accessible sidebar and assistant dialogs` 테스트에 다음 계약을 추가한다.

```ts
assert.match(assistant, /Woo-zu AI Assistant/);
assert.match(assistant, /Choose your consultation mode/);
assert.match(assistant, /How would you like to talk with Woo-zu AI\?/);
assert.match(assistant, /manager-ai-mode-icon/);
assert.doesNotMatch(assistant, /상담 방식을 선택해 주세요/);
assert.match(
  managerCss,
  /\.manager-assistant-dialog\s*\{[^}]*width:\s*min\(calc\(100vw - var\(--space-xxl\)\), calc\(var\(--content-aside-max\) \+ var\(--content-aside-max\)\)\);/,
);
assert.match(
  managerCss,
  /\.manager-assistant-dialog__header\s*\{[^}]*color:\s*var\(--on-primary\);[^}]*background:\s*var\(--primary\);/,
);
assert.match(managerCss, /\.manager-ai-mode-icon\s*\{/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/manager-workspace-shell.spec.ts
```

Expected: FAIL because the manager panel still renders the Korean compact selection screen and lacks `manager-ai-mode-icon`.

- [ ] **Step 3: Implement the tenant-style header and mode picker**

Change the dialog header to:

```tsx
<header className="manager-assistant-dialog__header">
  <span className="manager-assistant-dialog__brand">
    <Bot aria-hidden="true" />
    <strong id="manager-assistant-dialog-title">Woo-zu AI Assistant</strong>
  </span>
  <button type="button" aria-label="AI 관리 비서 닫기" onClick={closeAssistant}>
    <X aria-hidden="true" />
  </button>
</header>
```

Change the choice screen to:

```tsx
<section className="manager-ai-mode-picker" aria-label="AI 상담 모드 선택">
  <div className="manager-ai-mode-picker__copy">
    <h2>Choose your consultation mode</h2>
    <p>How would you like to talk with Woo-zu AI?</p>
  </div>
  <div className="manager-ai-mode-cards">
    <button type="button" onClick={() => selectMode("text")}>
      <span className="manager-ai-mode-icon" aria-hidden="true"><MessageSquare /></span>
      <strong>Text Chat</strong>
      <small>TEXT</small>
    </button>
    <button type="button" onClick={() => selectMode("voice")}>
      <span className="manager-ai-mode-icon" aria-hidden="true"><Headphones /></span>
      <strong>Voice Call</strong>
      <small>CALL</small>
    </button>
  </div>
</section>
```

Do not change the conversation branch or either session hook.

- [ ] **Step 4: Implement token-only desktop and responsive styles**

Use the existing tokens to produce the 720px-equivalent panel and tenant proportions:

```css
.manager-assistant-dialog {
  width: min(calc(100vw - var(--space-xxl)), calc(var(--content-aside-max) + var(--content-aside-max)));
  height: min(calc(100dvh - var(--space-xxl)), calc(var(--content-aside-max) + var(--content-aside-max)));
  max-height: calc(100dvh - var(--space-xxl));
  overflow: hidden;
}

.manager-assistant-dialog__header {
  min-height: calc(var(--touch-target) + var(--space-md));
  color: var(--on-primary);
  background: var(--primary);
}

.manager-assistant-dialog__brand,
.manager-ai-mode-icon {
  display: inline-grid;
  place-items: center;
}

.manager-ai-mode-picker {
  min-height: 0;
  align-content: start;
  justify-items: center;
  gap: calc(var(--space-xl) + var(--space-xl));
  padding: calc(var(--space-xxl) + var(--space-xxl)) var(--space-xxl) var(--space-xxl);
}

.manager-ai-mode-cards button {
  min-height: calc(var(--touch-target) * 4 + var(--space-xl));
}

.manager-ai-mode-icon {
  width: calc(var(--touch-target) + var(--space-xxl));
  height: calc(var(--touch-target) + var(--space-xxl));
  border-radius: var(--radius-full);
  color: var(--primary);
  background: var(--primary-container);
}
```

Add a narrow-screen media rule that reduces picker padding, cards to the available width, icon size and card height while preserving two columns where the viewport permits.

- [ ] **Step 5: Run focused tests and build**

Run:

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register \
  src/app/manager/manager-workspace-shell.spec.ts \
  src/app/manager/_components/manager-assistant-session.spec.ts \
  src/app/manager/_components/useManagerAssistantSession.spec.ts \
  src/app/manager/_components/useManagerRealtimeSession.spec.ts
cd ../..
pnpm build:web
```

Expected: all focused tests and the production web build PASS.

- [ ] **Step 6: Run the full web regression suite**

Run: `pnpm test:web`

Expected: 147 property tests and all TypeScript unit tests PASS.

- [ ] **Step 7: Commit and push the feature slice**

```bash
git add apps/web/src/app/manager/_components/ManagerAssistant.tsx \
  apps/web/src/app/manager/globals.css \
  apps/web/src/app/manager/manager-workspace-shell.spec.ts
git commit -m "style(manager): match tenant AI assistant panel"
git push origin kms-manager-agent
```

- [ ] **Step 8: Rebuild Docker web and verify in the browser**

Run:

```bash
docker compose up -d --build web
docker compose ps
```

Verify `http://localhost:3000/manager/home/00`:

- page content renders and no framework error overlay exists;
- one `AI 관리 비서 열기` launcher is visible;
- opening it shows `Woo-zu AI Assistant`, both exact English prompts, `Text Chat`, and `Voice Call`;
- the panel has the large blue-header tenant layout at desktop width;
- browser console contains no errors.
