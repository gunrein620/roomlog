# Manager Announcement Manual Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make new manager announcements start with empty translations and populate each language only after its translation button is clicked, while preserving saved draft translations.

**Architecture:** Add a small pure normalization function to the announcement compose state module. The page applies it before passing the initial draft to the existing client composer; the existing button handler and translation API remain unchanged.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Node test runner, Docker Compose

## Global Constraints

- Limit production changes to `/manager/messaging/01` and its existing compose-state support module.
- Do not change translation API contracts or infrastructure files.
- New compose requests without a persisted draft id must receive `translations: []`.
- Persisted drafts opened with `?id=<draftId>` must retain saved translations and review state.
- Keep the existing per-language translation button and urgent review gate behavior.

---

### Task 1: Normalize New Compose Draft Translations

**Files:**
- Modify: `apps/web/src/lib/announcement-compose-state.ts`
- Test: `apps/web/src/lib/announcement-compose-state.spec.ts`

**Interfaces:**
- Consumes: `AnnouncementDraft` from `@roomlog/types`
- Produces: `prepareAnnouncementDraftForCompose(draft: AnnouncementDraft, hasPersistedId: boolean): AnnouncementDraft`

- [ ] **Step 1: Write the failing unit tests**

Add tests that pass a draft containing translated and reviewed English content to `prepareAnnouncementDraftForCompose`.

```ts
it("clears demo translations for a new announcement", () => {
  const prepared = prepareAnnouncementDraftForCompose(draftWithTranslations, false);
  assert.deepEqual(prepared.translations, []);
  assert.notEqual(prepared, draftWithTranslations);
});

it("preserves translations for a persisted announcement", () => {
  const prepared = prepareAnnouncementDraftForCompose(draftWithTranslations, true);
  assert.deepEqual(prepared.translations, draftWithTranslations.translations);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from `apps/web`:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' \
  node --test -r ts-node/register src/lib/announcement-compose-state.spec.ts
```

Expected: FAIL because `prepareAnnouncementDraftForCompose` is not exported.

- [ ] **Step 3: Implement the pure normalization function**

```ts
export function prepareAnnouncementDraftForCompose(
  draft: AnnouncementDraft,
  hasPersistedId: boolean,
): AnnouncementDraft {
  return hasPersistedId ? draft : { ...draft, translations: [] };
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run from `apps/web`:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' \
  node --test -r ts-node/register src/lib/announcement-compose-state.spec.ts
```

Expected: both new tests pass and the existing compose-state tests remain green.

### Task 2: Apply Normalization on the Compose Page

**Files:**
- Modify: `apps/web/src/app/manager/messaging/01/page.tsx`
- Modify: `apps/web/property-shell.spec.mjs`

**Interfaces:**
- Consumes: `prepareAnnouncementDraftForCompose(draft, Boolean(id))`
- Produces: `AnnouncementComposer` receives empty translations only for new compose requests.

- [ ] **Step 1: Add the failing page contract assertion**

Extend the manager announcement compose test to require the page to call:

```ts
prepareAnnouncementDraftForCompose(draft, Boolean(id))
```

and pass the prepared value to:

```tsx
<AnnouncementComposer initialDraft={initialDraft} />
```

- [ ] **Step 2: Run the focused contract test and verify RED**

Run from `apps/web`: `node --test --test-name-pattern='manager announcement compose' property-shell.spec.mjs`

Expected: FAIL because the page does not yet normalize the initial draft.

- [ ] **Step 3: Wire the normalization function into the page**

```ts
const draft = id ? await getAnnouncementDraft(id) : DEMO_MANAGER_DRAFTS[0];
const initialDraft = prepareAnnouncementDraftForCompose(draft, Boolean(id));
```

Pass `initialDraft` to `AnnouncementComposer`. Do not change `AnnouncementComposer` translation button logic.

- [ ] **Step 4: Run the focused contract and unit tests**

Run from `apps/web`:

```bash
node --test --test-name-pattern='manager announcement compose' property-shell.spec.mjs
pnpm test:unit
```

Expected: focused test passes; all web unit tests pass.

### Task 3: Runtime Verification and Delivery

**Files:**
- Verify only: `apps/web/src/app/manager/messaging/01/**`

**Interfaces:**
- Consumes: Docker-rendered `/manager/messaging/01` and existing translation action.
- Produces: verified initial empty translation state and button-triggered single-language result.

- [ ] **Step 1: Build the web application**

Run: `pnpm --filter web build`

Expected: exit code 0.

- [ ] **Step 2: Rebuild and recreate only the local web container without tracked infra edits**

Run from the repository root without editing tracked infrastructure files:

```bash
tail -n +2 apps/web/Dockerfile | docker build --progress=plain --pull=false -f - -t roomlog-web \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000 \
  --build-arg NEXT_PUBLIC_SOCKET_URL=http://localhost:4000 .
docker compose up -d --no-build --force-recreate web
docker compose ps web
```

Expected: `roomlog-web` is running on port 3000.

- [ ] **Step 3: Verify the new compose state in the browser**

Open `http://localhost:3000/manager/messaging/01` and verify:

- all six translation title/body fields are initially empty;
- all three review checkboxes are disabled;
- no translation request occurs on page load;
- clicking `English 번역` fills only the English title and body;
- Chinese and Vietnamese fields remain empty;
- the English review checkbox becomes enabled;
- the browser console has no errors.

- [ ] **Step 4: Check the final diff and commit**

```bash
git diff --check
git add apps/web/src/lib/announcement-compose-state.ts \
  apps/web/src/lib/announcement-compose-state.spec.ts \
  apps/web/src/app/manager/messaging/01/page.tsx \
  apps/web/property-shell.spec.mjs
git commit -m "fix(messaging): translate announcements on demand"
git push origin kms-commu
```

Expected: only the listed feature files are committed; unrelated untracked files remain untouched.
