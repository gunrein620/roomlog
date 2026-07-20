# Tenant AI Responsive Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세입자 AI 비서를 데스크톱 우측 고정 오버레이와 모바일 전체 화면으로 표시하고, 모바일 텍스트·음성 전환을 항상 조작 가능하게 만든다.

**Architecture:** 패널을 페이지 grid에서 분리해 viewport 기준 fixed surface로 배치한다. 대화 컴포넌트의 데이터·음성 로직은 유지하고 CSS에서 패널, 대화 스크롤, composer, mode toggle의 높이 책임만 명확히 나눈다.

**Tech Stack:** Next.js 16, React, CSS custom properties, Node test runner

## Global Constraints

- `TenantAiAssistantPanel`의 대화·음성·민원 초안 로직은 변경하지 않는다.
- 데스크톱 본문은 패널 때문에 밀리거나 아래로 내려가지 않는다.
- 모바일 패널은 `100dvh`, `--z-overlay`, `safe-area-inset-bottom`을 사용한다.
- 새 애니메이션, raw hex 색상, 임의 z-index를 추가하지 않는다.
- 아이콘 버튼의 기존 접근성 속성과 최소 터치 영역을 유지한다.

---

### Task 1: 반응형 오버레이 계약과 CSS

**Files:**
- Modify: `apps/web/src/app/my/flows/tenant-ai-split-panel.spec.ts`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: `.tenant-ai-workspace--open`, `.tenant-ai-assistant-panel`, `.manager-ai-conversation`, `.manager-ai-mode-toggle`
- Produces: 데스크톱 fixed-right overlay와 모바일 full-screen/safe-area layout

- [ ] **Step 1: 실패하는 레이아웃 회귀 테스트를 작성한다**

```ts
it("overlays the desktop page instead of adding a grid column", () => {
  assert.doesNotMatch(
    cssSource,
    /\.tenant-ai-workspace--open\s*\{[^}]*grid-template-columns/s,
  );
  assert.match(
    cssSource,
    /\.tenant-ai-assistant-panel\s*\{[\s\S]*position:\s*fixed[\s\S]*right:\s*0/,
  );
});

it("keeps the mobile mode switch above navigation and safe area", () => {
  assert.match(
    cssSource,
    /@media \(max-width:\s*1024px\)[\s\S]*\.tenant-ai-assistant-panel[\s\S]*z-index:\s*var\(--z-overlay\)/,
  );
  assert.match(
    cssSource,
    /\.tenant-ai-assistant-panel \.manager-ai-mode-toggle[\s\S]*padding-bottom:\s*max\([^)]*safe-area-inset-bottom/,
  );
});
```

- [ ] **Step 2: 회귀 테스트가 기존 CSS에서 실패하는지 확인한다**

Run:

```bash
cd apps/web
node --test src/app/my/flows/tenant-ai-split-panel.spec.ts
```

Expected: desktop fixed-right overlay와 mobile safe-area mode toggle assertion이 FAIL.

- [ ] **Step 3: 페이지 grid 확장을 제거하고 패널을 우측 fixed overlay로 만든다**

```css
.tenant-ai-workspace--open {
  grid-template-columns: minmax(0, 1fr);
}

.service-frame.with-bottom-tabs:has(.tenant-ai-workspace--open) {
  width: 100%;
  max-width: var(--content-readable-max);
}

.tenant-ai-assistant-panel {
  position: fixed;
  inset-block: 0;
  right: 0;
  width: min(100%, var(--tenant-ai-panel-width));
  height: 100dvh;
  z-index: var(--z-overlay);
  box-shadow: var(--shadow-lg);
}
```

- [ ] **Step 4: 모바일 패널 내부를 고정 행과 스크롤 행으로 분리한다**

```css
.tenant-ai-assistant-panel .manager-ai-conversation {
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto auto;
}

@media (max-width: 1024px) {
  .tenant-ai-assistant-panel {
    inset: 0;
    width: 100%;
    height: 100dvh;
    z-index: var(--z-overlay);
    padding-bottom: 0;
  }

  .tenant-ai-assistant-panel .manager-ai-mode-toggle {
    margin: 0 var(--space-md);
    padding-bottom: max(var(--space-xs), env(safe-area-inset-bottom));
    background: var(--surface-container);
  }
}
```

- [ ] **Step 5: 관련 테스트와 web 빌드를 통과시킨다**

Run:

```bash
cd apps/web
node --test src/app/my/flows/tenant-ai-split-panel.spec.ts
pnpm build
```

Expected: 관련 테스트 PASS, Next.js production build PASS.

- [ ] **Step 6: 커밋한다**

```bash
git add apps/web/src/app/my/flows/tenant-ai-split-panel.spec.ts apps/web/src/app/globals.css
git commit -m "fix(web): overlay tenant AI panel responsively"
```

---

### Task 2: 통합 검증

**Files:**
- Verify only: repository-wide build and smoke paths

**Interfaces:**
- Consumes: Task 1의 CSS 변경
- Produces: 병합 가능한 검증 결과

- [ ] **Step 1: 표준 검증을 실행한다**

Run:

```bash
bash scripts/verify.sh
```

Expected: types, UI, web, API build와 API smoke가 모두 PASS.

- [ ] **Step 2: 작업 트리와 변경 범위를 확인한다**

Run:

```bash
git status --short --branch
git diff --check
```

Expected: 의도하지 않은 미커밋 파일이 없고 whitespace 오류가 없음.
