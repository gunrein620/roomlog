# Manager Announcement Translation Card Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep untranslated language cards compact and expand only the card whose translation button was clicked or which already contains saved translation content.

**Architecture:** Add a pure expansion predicate to the existing compose-state module and cover it with unit tests. `AnnouncementComposer` tracks languages explicitly opened by the user, combines that state with translation progress and content, and conditionally renders an accessible language panel.

**Tech Stack:** React 19, Next.js 16 App Router, TypeScript, CSS Modules, Node test runner, Docker Compose

## Global Constraints

- Limit production changes to `/manager/messaging/01` and the existing announcement compose-state module.
- Do not change translation API contracts, saved draft data, other manager routes, or infrastructure files.
- An untranslated idle card renders only its language label and translation button.
- Clicking a translation button expands that language card immediately.
- Saved translation content expands its card on initial render.
- A failed translation request leaves the clicked card expanded and retryable.
- Use existing design tokens and no raw color values.

---

### Task 1: Define the Translation Card Expansion Predicate

**Files:**
- Modify: `apps/web/src/lib/announcement-compose-state.ts`
- Test: `apps/web/src/lib/announcement-compose-state.spec.ts`

**Interfaces:**
- Consumes: `AnnouncementTranslation`, `wasOpened: boolean`, `isTranslating: boolean`
- Produces: `shouldExpandAnnouncementTranslation(translation, wasOpened, isTranslating): boolean`

- [ ] **Step 1: Write the failing unit test**

```ts
it("expands translation cards only after opening, during translation, or with saved content", () => {
  const empty = { ...translations[0], title: "", body: "", reviewed: false };

  assert.equal(shouldExpandAnnouncementTranslation(empty, false, false), false);
  assert.equal(shouldExpandAnnouncementTranslation(empty, true, false), true);
  assert.equal(shouldExpandAnnouncementTranslation(empty, false, true), true);
  assert.equal(shouldExpandAnnouncementTranslation(translations[0], false, false), true);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from `apps/web`:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' \
  node --test -r ts-node/register src/lib/announcement-compose-state.spec.ts
```

Expected: FAIL because `shouldExpandAnnouncementTranslation` is not exported.

- [ ] **Step 3: Implement the minimal predicate**

```ts
export function shouldExpandAnnouncementTranslation(
  translation: AnnouncementTranslation,
  wasOpened: boolean,
  isTranslating: boolean,
): boolean {
  return wasOpened || isTranslating || Boolean(translation.title.trim() || translation.body.trim());
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run from `apps/web`:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' \
  node --test -r ts-node/register src/lib/announcement-compose-state.spec.ts
```

Expected: all compose-state tests pass.

### Task 2: Conditionally Render Accessible Translation Panels

**Files:**
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx`
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.module.css`
- Modify: `apps/web/property-shell.spec.mjs`

**Interfaces:**
- Consumes: `shouldExpandAnnouncementTranslation`, existing `translating` language state, existing translation content
- Produces: language buttons with `aria-expanded` and `aria-controls`, conditional panels with ids `translation-panel-en`, `translation-panel-zh`, and `translation-panel-vi`

- [ ] **Step 1: Add failing source contract assertions**

Require the compose source to contain:

```js
assert.match(managerMessagingComposeFeatureSource, /aria-expanded=\{isExpanded\}/);
assert.match(managerMessagingComposeFeatureSource, /aria-controls=\{panelId\}/);
assert.match(managerMessagingComposeFeatureSource, /id=\{panelId\}/);
assert.match(managerMessagingComposeFeatureSource, /isExpanded \? \(/);
assert.match(managerMessagingComposeFeatureSource, /setExpandedLanguages/);
```

- [ ] **Step 2: Run the focused contract test and verify RED**

Run from `apps/web`:

```bash
node --test --test-name-pattern='manager announcement compose' property-shell.spec.mjs
```

Expected: FAIL because the card is always expanded and has no expansion attributes.

- [ ] **Step 3: Track clicked languages before validation and calculate card state**

Add state:

```ts
const [expandedLanguages, setExpandedLanguages] = useState<AnnouncementLanguage[]>([]);
```

At the start of `handleTranslate`, before source validation:

```ts
setExpandedLanguages((current) => current.includes(lang) ? current : [...current, lang]);
```

Inside the language map:

```ts
const panelId = `translation-panel-${lang}`;
const isExpanded = shouldExpandAnnouncementTranslation(
  translation,
  expandedLanguages.includes(lang),
  translating === lang,
);
```

- [ ] **Step 4: Add accessible conditional rendering**

Add to the existing translation button:

```tsx
aria-expanded={isExpanded}
aria-controls={panelId}
```

Render the current title input, body textarea, and review label only inside:

```tsx
{isExpanded ? (
  <div id={panelId} className={styles.translationFields}>
    <input
      className={styles.translationInput}
      aria-label={`${label} 공지 제목`}
      value={translation.title}
      onChange={(event) => updateTranslation(lang, label, {
        title: event.target.value,
        reviewed: false,
      })}
      placeholder={`${label} 제목`}
    />
    <textarea
      className={styles.translationTextarea}
      aria-label={`${label} 공지 본문`}
      value={translation.body}
      onChange={(event) => updateTranslation(lang, label, {
        body: event.target.value,
        reviewed: false,
      })}
      placeholder={`${label} 본문`}
    />
    <label className={styles.reviewRow}>
      <input
        type="checkbox"
        checked={translation.reviewed}
        disabled={!translation.title.trim() || !translation.body.trim()}
        onChange={(event) => updateTranslation(lang, label, {
          reviewed: event.target.checked,
        })}
      />
      검수 완료
    </label>
  </div>
) : null}
```

- [ ] **Step 5: Preserve existing spacing inside the expanded panel**

```css
.translationFields {
  display: grid;
  gap: var(--space-md);
}
```

- [ ] **Step 6: Run the focused contract test and all web unit tests**

Run from `apps/web`:

```bash
node --test --test-name-pattern='manager announcement compose' property-shell.spec.mjs
pnpm test:unit
```

Expected: focused test and all web unit tests pass.

### Task 3: Verify Runtime Behavior and Deliver

**Files:**
- Verify: `apps/web/src/app/manager/messaging/01/**`

**Interfaces:**
- Consumes: Docker-rendered `/manager/messaging/01` and the existing translation action
- Produces: verified compact-to-expanded language-card interaction

- [ ] **Step 1: Run the production build**

Run: `pnpm --filter web build`

Expected: exit code 0.

- [ ] **Step 2: Build and recreate the local web container without tracked infrastructure edits**

```bash
tail -n +2 apps/web/Dockerfile | docker build --progress=plain --pull=false -f - -t roomlog-web \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000 \
  --build-arg NEXT_PUBLIC_SOCKET_URL=http://localhost:4000 .
docker compose up -d --no-build --force-recreate web
docker compose ps web
```

Expected: `roomlog-web` is running on port 3000.

- [ ] **Step 3: Verify compact and expanded states in the browser**

Open `http://localhost:3000/manager/messaging/01` and verify:

- three translation buttons initially report `aria-expanded=false`;
- no translation title, body, or review controls are initially rendered;
- clicking `English 번역` immediately changes only English to `aria-expanded=true`;
- English title, body, and review controls appear;
- after translation succeeds, English contains results and its review checkbox is enabled;
- Chinese and Vietnamese remain collapsed;
- the browser console has no errors.

- [ ] **Step 4: Run final verification and commit**

```bash
git diff --check
git add apps/web/property-shell.spec.mjs \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.module.css \
  apps/web/src/lib/announcement-compose-state.ts \
  apps/web/src/lib/announcement-compose-state.spec.ts
git commit -m "feat(messaging): expand translation cards on demand"
git push origin kms-commu
```

Expected: only the five listed feature files are committed; unrelated untracked files remain untouched.
