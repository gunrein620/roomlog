# Manager Announcement Single-Language Attachment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a manager translate one language, attach it as the final title and body, and send it through the unchanged three-language API contract.

**Architecture:** Add route-local pure helpers under `/manager/messaging/01` that project one selected translation into the existing `en`, `zh`, and `vi` slots and detect that projection when a saved draft is reopened. The compose screen uses those helpers for attachment state; the review screen renders one final attachment instead of three review cards.

**Tech Stack:** React 19, Next.js 16 App Router, TypeScript, CSS Modules, Node test runner, Docker Compose

## Global Constraints

- Production changes are limited to `apps/web/src/app/manager/messaging/01/**` and `apps/web/src/app/manager/messaging/02/page.tsx`.
- `/manager/messaging/00`, API, shared types, tenant screens, and infrastructure files remain unchanged.
- Each feature slice must pass its tests before being committed and pushed to `kms-commu`.
- A single translated title and body are copied into all three required language slots with the selected `langLabel` and `reviewed: true`.
- No raw color values may be added.

---

### Task 1: Route-Local Attachment Projection

**Files:**
- Create: `apps/web/src/app/manager/messaging/01/attachment-state.ts`
- Create: `apps/web/src/app/manager/messaging/01/attachment-state.spec.ts`

**Interfaces:**
- Produces: `buildAttachedTranslations(translation: AnnouncementTranslation): AnnouncementTranslation[]`
- Produces: `findAttachedTranslation(draft: Pick<AnnouncementDraft, "title" | "body" | "translations">): AnnouncementTranslation | undefined`

- [ ] **Step 1: Write failing tests**

Test that `buildAttachedTranslations` returns exactly `en`, `zh`, and `vi`, copies the selected title/body/label into every entry, and sets every `reviewed` value to `true`. Test that `findAttachedTranslation` returns the projected entry only when all three entries are reviewed, identical, and equal to the draft title/body.

- [ ] **Step 2: Verify RED**

Run from `apps/web`:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' \
  node --test -r ts-node/register src/app/manager/messaging/01/attachment-state.spec.ts
```

Expected: FAIL because `attachment-state.ts` does not exist.

- [ ] **Step 3: Implement the helpers**

```ts
import type { AnnouncementDraft, AnnouncementTranslation } from "@roomlog/types";
import { ANNOUNCEMENT_TRANSLATION_LANGUAGES } from "../../../../lib/announcement-compose-state";

export function buildAttachedTranslations(
  translation: AnnouncementTranslation,
): AnnouncementTranslation[] {
  return ANNOUNCEMENT_TRANSLATION_LANGUAGES.map(({ lang }) => ({
    ...translation,
    lang,
    langLabel: translation.langLabel,
    reviewed: true,
  }));
}

export function findAttachedTranslation(
  draft: Pick<AnnouncementDraft, "title" | "body" | "translations">,
): AnnouncementTranslation | undefined {
  const translations = draft.translations ?? [];
  if (translations.length !== ANNOUNCEMENT_TRANSLATION_LANGUAGES.length) return undefined;
  const first = translations[0];
  const matchesFinalContent = first.title === draft.title && first.body === draft.body;
  const allProjected = translations.every((translation) =>
    translation.reviewed
    && translation.title === first.title
    && translation.body === first.body
    && translation.langLabel === first.langLabel,
  );
  return matchesFinalContent && allProjected ? first : undefined;
}
```

- [ ] **Step 4: Verify GREEN and commit/push slice 1**

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' \
  node --test -r ts-node/register src/app/manager/messaging/01/attachment-state.spec.ts
git add apps/web/src/app/manager/messaging/01/attachment-state.ts \
  apps/web/src/app/manager/messaging/01/attachment-state.spec.ts
git commit -m "feat(messaging): project one attached translation"
git push origin kms-commu
```

Expected: attachment helper tests pass before the commit and push succeed.

### Task 2: Attach One Translation on the Compose Screen

**Files:**
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx`
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.module.css`
- Modify: `apps/web/property-shell.spec.mjs`

**Interfaces:**
- Consumes: `buildAttachedTranslations`, `findAttachedTranslation`
- Produces: `첨부하기`/`첨부됨` UI and compatible projected translations

- [ ] **Step 1: Add failing compose contract assertions**

Require `buildAttachedTranslations`, `findAttachedTranslation`, `첨부하기`, `첨부됨`, and `번역 후 첨부할 언어를 선택해 주세요.`. Require the compose source not to contain `검수 완료` or a translation review checkbox.

- [ ] **Step 2: Verify RED**

Run from `apps/web`:

```bash
node --test --test-name-pattern='manager announcement compose' property-shell.spec.mjs
```

Expected: FAIL because the compose screen still renders the review checkbox.

- [ ] **Step 3: Implement attachment state and action**

Initialize the selected attachment from `findAttachedTranslation(initialDraft)`. Add `handleAttach` that replaces `title` and `body`, calls `buildAttachedTranslations`, records the selected `langLabel`, and displays an attachment confirmation. Clear attachment state whenever `updateSource` or `updateTranslation` changes content.

- [ ] **Step 4: Replace the review checkbox**

For a translation with non-empty title and body, render a button whose label is `첨부됨` when its label is selected and `첨부하기` otherwise. Remove the review checkbox and `검수 완료` copy. Change the translation completion feedback to instruct the manager to attach the result.

- [ ] **Step 5: Gate urgent review navigation**

Before existing validation, if `intent === "review"`, the category is urgent, and `findAttachedTranslation({ title, body, translations })` returns nothing, set the error `번역 후 첨부할 언어를 선택해 주세요.` and stop. Keep the existing validation afterward so the projected three slots satisfy the unchanged server contract.

- [ ] **Step 6: Verify slice 2 and commit/push**

Run from `apps/web`:

```bash
node --test --test-name-pattern='manager announcement compose' property-shell.spec.mjs
pnpm test:unit
pnpm build
```

Then from the repository root:

```bash
git add apps/web/property-shell.spec.mjs \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.module.css
git commit -m "feat(messaging): attach one translated notice"
git push origin kms-commu
```

Expected: contract test, all web unit tests, and production build pass before commit and push.

### Task 3: Show One Final Attachment on the Review Screen

**Files:**
- Modify: `apps/web/src/app/manager/messaging/02/page.tsx`
- Modify: `apps/web/property-shell.spec.mjs`

**Interfaces:**
- Consumes: `findAttachedTranslation(draft)`
- Produces: one `최종 첨부 번역` card and `최종 언어` metadata

- [ ] **Step 1: Add failing review-screen contract assertions**

Require `/02` to import and call `findAttachedTranslation`, render `최종 첨부 번역` and `최종 언어`, and remove `D21 주요 언어 번역 미리보기`, `주요 언어 검수 완료`, and `번역 검수`.

- [ ] **Step 2: Verify RED**

Run from `apps/web`:

```bash
node --test --test-name-pattern='manager announcement' property-shell.spec.mjs
```

Expected: FAIL because `/02` still renders three review cards and review copy.

- [ ] **Step 3: Render the final attachment**

Compute `const attachedTranslation = findAttachedTranslation(draft)`. For urgent drafts, render one card containing its `langLabel`, `title`, and `body`. Replace the review metadata with `MetaRow label="최종 언어"` and the attached language label. Keep the existing send server action unchanged.

- [ ] **Step 4: Verify slice 3 in tests and Docker browser**

```bash
pnpm --filter web test
pnpm --filter web build
tail -n +2 apps/web/Dockerfile | docker build --progress=plain --pull=false -f - -t roomlog-web \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000 \
  --build-arg NEXT_PUBLIC_SOCKET_URL=http://localhost:4000 .
docker compose up -d --no-build --force-recreate web
```

Verify in the browser that one language can be translated and attached on `/01`, the left title/body are replaced, no review checkbox appears, navigation reaches `/02`, and `/02` shows one final language/content card without console errors.

- [ ] **Step 5: Commit and push slice 3**

```bash
git diff --check
git add apps/web/property-shell.spec.mjs apps/web/src/app/manager/messaging/02/page.tsx
git commit -m "feat(messaging): review final attached translation"
git push origin kms-commu
```

Expected: final tests and runtime verification pass before commit and push; unrelated untracked files remain untouched.
