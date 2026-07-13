# Manager Announcement Korean-Only Send Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow managers to review and send urgent, life, and event announcements using the entered Korean title and body without creating or attaching a translation.

**Architecture:** Represent the delivery choice as local compose state (`"korean" | "translated"`) without changing shared types or persistence schema. An empty `translations` array is the persisted Korean-only marker; the API permits that exact urgent case but keeps the complete reviewed-translation gate whenever any translation is present.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, NestJS, Node test runner, pnpm, Docker Compose.

## Global Constraints

- New announcements default to `한국어 원문으로 발송`.
- Urgent, life, and event announcements all support Korean-only delivery.
- Incomplete or unreviewed urgent translations remain blocked.
- Shared types and the database schema receive no new field.
- Use only CSS variables from `packages/ui/src/tokens.css`; no raw hex values.
- Do not modify Docker, deployment, database, or other infrastructure files.
- Preserve unrelated untracked files under `docs/superpowers`.

---

### Task 1: Permit Korean-only urgent announcements in the API

**Files:**
- Modify: `apps/api/src/roomlog/roomlog.service.spec.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-messaging.domain.ts`

**Interfaces:**
- Consumes: `MessagingAnnouncementDraft.translations: MessagingAnnouncementTranslation[]`.
- Produces: `assertUrgentTranslationsReviewed(draft)` accepts `translations.length === 0`; all non-empty urgent translation arrays still use the existing three-language review gate.

- [ ] **Step 1: Write the failing API regression test**

Add a Korean-only urgent draft before the existing incomplete-translation assertion:

```ts
const koreanOnlyDraft = service.createManagerAnnouncementDraft("landlord-demo", {
  category: "urgent",
  scope: "building",
  targetLabel: "정글빌라 전체",
  title: sourceTitle,
  body: sourceBody,
  confirmRequired: true,
  translations: []
});

const koreanOnlySent = service.sendManagerAnnouncementDraft(
  "landlord-demo",
  koreanOnlyDraft.id
);
const koreanOnlyAnnouncement = service.getTenantMessagingAnnouncement(
  "tenant-demo",
  koreanOnlySent.announcementId
);
assert.equal(koreanOnlyAnnouncement.title, sourceTitle);
assert.equal(koreanOnlyAnnouncement.body, sourceBody);
assert.equal(koreanOnlyAnnouncement.confirmRequired, true);
```

Keep the existing one-language `unsafeDraft` assertion so a partial translation still throws.

- [ ] **Step 2: Run the focused API test and verify RED**

Run:

```bash
pnpm --filter api test -- --test-name-pattern="requires reviewed urgent announcement translations"
```

Expected: FAIL because the Korean-only urgent draft is rejected with `긴급 공지는 English 번역이 정확히 하나 필요합니다.`

- [ ] **Step 3: Implement the minimal server gate change**

Add the exact empty-array escape after the non-urgent escape:

```ts
private assertUrgentTranslationsReviewed(draft: MessagingAnnouncementDraft) {
  if (draft.category !== "urgent" || draft.translations.length === 0) {
    return;
  }

  const currentSourceHash = announcementSourceHash(draft.title, draft.body);
  for (const required of ANNOUNCEMENT_LANGUAGES) {
    const matches = draft.translations.filter((translation) => translation.lang === required.lang);
    if (matches.length !== 1) {
      throw new BadRequestException(`긴급 공지는 ${required.label} 번역이 정확히 하나 필요합니다.`);
    }

    const translation = matches[0];
    if (!translation.title.trim() || !translation.body.trim()) {
      throw new BadRequestException(`긴급 공지 ${required.label} 번역 내용을 입력해주세요.`);
    }
    if (translation.sourceHash !== currentSourceHash) {
      throw new BadRequestException(`긴급 공지 ${required.label} 번역이 현재 원문과 다릅니다.`);
    }
    if (!translation.reviewed) {
      throw new BadRequestException(`긴급 공지 ${required.label} 번역 검수를 완료해주세요.`);
    }
  }
}
```

- [ ] **Step 4: Run the focused and full API tests**

Run:

```bash
pnpm --filter api test -- --test-name-pattern="requires reviewed urgent announcement translations"
pnpm test:api
```

Expected: both commands PASS; DB-dependent tests may report their documented skip if PostgreSQL is unavailable.

- [ ] **Step 5: Commit and push the API slice**

```bash
git add apps/api/src/roomlog/roomlog.service.spec.ts apps/api/src/roomlog/services/roomlog-messaging.domain.ts
git commit -m "feat(messaging): 한국어 긴급 공지 발송 허용"
git push origin kms-complaint1
```

---

### Task 2: Add an explicit Korean delivery mode to the compose and review UI

**Files:**
- Modify: `apps/web/src/app/manager/messaging/01/attachment-state.spec.ts`
- Modify: `apps/web/src/app/manager/messaging/01/attachment-state.ts`
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx`
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.module.css`
- Modify: `apps/web/src/app/manager/messaging/02/page.tsx`

**Interfaces:**
- Produces: `AnnouncementDeliveryMode = "korean" | "translated"`.
- Produces: `announcementDeliveryMode(draft): AnnouncementDeliveryMode`.
- Produces: `translationsForDelivery(mode, translations): AnnouncementTranslation[]`.
- Consumes: `findAttachedTranslation(draft)` to recognize existing attached-translation drafts.

- [ ] **Step 1: Write failing delivery-mode unit tests**

Extend `attachment-state.spec.ts` with:

```ts
assert.equal(announcementDeliveryMode({
  title: "한국어 공지",
  body: "한국어 본문",
  translations: [],
}), "korean");

const projected = buildAttachedTranslations(english);
assert.equal(announcementDeliveryMode({
  title: english.title,
  body: english.body,
  translations: projected,
}), "translated");

assert.deepEqual(translationsForDelivery("korean", projected), []);
assert.deepEqual(translationsForDelivery("translated", projected), projected);
```

- [ ] **Step 2: Run the web unit suite and verify RED**

Run:

```bash
pnpm --filter web test:unit
```

Expected: FAIL because `announcementDeliveryMode` and `translationsForDelivery` are not exported.

- [ ] **Step 3: Implement the delivery-mode helpers**

Add to `attachment-state.ts`:

```ts
export type AnnouncementDeliveryMode = "korean" | "translated";

export function announcementDeliveryMode(
  draft: Pick<AnnouncementDraft, "title" | "body" | "translations">,
): AnnouncementDeliveryMode {
  return findAttachedTranslation(draft) ? "translated" : "korean";
}

export function translationsForDelivery(
  mode: AnnouncementDeliveryMode,
  translations: AnnouncementTranslation[],
): AnnouncementTranslation[] {
  return mode === "korean" ? [] : translations;
}
```

- [ ] **Step 4: Wire the compose UI and payload**

In `AnnouncementComposer.tsx`:

```ts
const [deliveryMode, setDeliveryMode] = useState<AnnouncementDeliveryMode>(
  announcementDeliveryMode(initialDraft),
);

const deliveryTranslations = translationsForDelivery(deliveryMode, translations);
```

Render the delivery choice before the title field:

```tsx
<fieldset className={styles.deliveryModeFieldset}>
  <legend className={styles.fieldLabel}>발송 언어</legend>
  <div className={styles.deliveryModeGroup}>
    {([
      { value: "korean", label: "한국어 원문으로 발송" },
      { value: "translated", label: "번역본으로 발송" },
    ] as const).map((option) => (
      <label key={option.value}>
        <input
          className={styles.choiceInput}
          type="radio"
          name="deliveryMode"
          value={option.value}
          checked={deliveryMode === option.value}
          onChange={() => setDeliveryMode(option.value)}
        />
        <span className={styles.categoryPill}>{option.label}</span>
      </label>
    ))}
  </div>
</fieldset>
```

Set translated mode when an attachment becomes final:

```ts
function handleAttach(translation: AnnouncementTranslation, label: string) {
  const attached = { ...translation, langLabel: label };
  setTitle(attached.title);
  setBody(attached.body);
  setTranslations(buildAttachedTranslations(attached));
  setAttachedLabel(label);
  setDeliveryMode("translated");
  setErrors([]);
  setFeedback(`${label} 번역을 공지 제목과 상세 내용에 첨부했습니다.`);
}
```

Use the selected mode in the review gate and save payload:

```ts
const deliveryTranslations = translationsForDelivery(deliveryMode, translations);
if (
  intent === "review"
  && deliveryMode === "translated"
  && !findAttachedTranslation({ title, body, translations: deliveryTranslations })
) {
  setErrors(["번역 후 첨부할 언어를 선택해 주세요."]);
  return;
}

const validationErrors = validateAnnouncementCompose(
  { category, title, body, targetRoomIds: target.targetRoomIds, translations: deliveryTranslations },
  { requireUrgentReviews: intent === "review" && deliveryMode === "translated" },
);

const saved = await saveAnnouncementComposeAction({
  draftId: currentDraftId,
  draft: {
    category,
    scope,
    targetLabel: target.targetLabel,
    targetRoomIds: target.targetRoomIds,
    title,
    body,
    translations: deliveryTranslations,
  },
});
```

Use the existing hidden `.choiceInput` and token-backed pill pattern; add only token-based layout classes:

```css
.deliveryModeGroup {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.deliveryModeFieldset {
  display: grid;
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  border: 0;
}
```

- [ ] **Step 5: Show the final language on the review screen**

In `apps/web/src/app/manager/messaging/02/page.tsx`, derive:

```ts
const finalLanguage = attachedTranslation?.langLabel ?? "한국어";
```

Render the urgent final-language card for both cases:

```tsx
{isUrgent ? (
  <Card>
    <div style={sectionTitleStyle}>최종 발송 언어</div>
    <Card style={{ background: "var(--surface-container)" }}>
      <Badge emphasis>{finalLanguage}</Badge>
      <div style={{ marginTop: "var(--space-sm)", fontWeight: 800 }}>
        {draft.title}
      </div>
      <div style={{
        marginTop: "var(--space-sm)",
        fontSize: "var(--fs-caption)",
        color: "var(--on-surface-variant)",
        lineHeight: 1.5,
      }}>
        {draft.body}
      </div>
    </Card>
  </Card>
) : null}
```

Set the tone-check row to:

```tsx
<MetaRow label="최종 언어" value={finalLanguage} />
```

- [ ] **Step 6: Run web tests and build**

Run:

```bash
pnpm --filter web test:unit
pnpm test:web
pnpm --filter web build
```

Expected: all commands PASS and Next.js generates `/manager/messaging/01` and `/manager/messaging/02` without type errors.

- [ ] **Step 7: Commit and push the Web slice**

```bash
git add apps/web/src/app/manager/messaging/01/attachment-state.spec.ts \
  apps/web/src/app/manager/messaging/01/attachment-state.ts \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.module.css \
  apps/web/src/app/manager/messaging/02/page.tsx
git commit -m "feat(messaging): 공지 한국어 원문 발송 추가"
git push origin kms-complaint1
```

---

### Task 3: Verify the complete Docker flow

**Files:**
- No source files modified unless verification finds a regression.

**Interfaces:**
- Consumes: the API Korean-only gate from Task 1 and Web delivery-mode UI from Task 2.
- Produces: verified manager compose → review → send behavior in the standard local Docker environment.

- [ ] **Step 1: Run repository verification**

```bash
bash scripts/verify.sh
```

Expected: types, UI, web, API builds and API smoke checks PASS.

- [ ] **Step 2: Rebuild and start the Docker services**

```bash
docker compose up -d --build web api
docker compose ps
```

Expected: `roomlog-web` and `roomlog-api` are running; web is available on `:3000` and API on `:4000`.

- [ ] **Step 3: Verify in the browser**

Open `http://localhost:3000/manager/messaging/01` and confirm:

1. `한국어 원문으로 발송` is selected by default.
2. An urgent Korean announcement reaches `/manager/messaging/02` without translation.
3. Review shows `최종 언어: 한국어` and the entered Korean content.
4. `승인하고 발송` reaches the result screen.
5. Switching to `번역본으로 발송` without attaching a translation still shows `번역 후 첨부할 언어를 선택해 주세요.`

- [ ] **Step 4: Confirm final repository state**

```bash
git status --short --branch
git log -3 --oneline
```

Expected: only the pre-existing unrelated untracked docs remain; the branch is aligned with `origin/kms-complaint1` after both feature-slice pushes.
