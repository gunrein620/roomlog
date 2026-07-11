# Manager Announcement Compose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace M-MSG-01 with the approved Stitch-inspired composer and make real room targeting, same-draft saving, per-language OpenAI translation, human review, and urgent-send gates work end to end.

**Architecture:** Keep `ManagerShell` and the current messaging domain. Add shared input/translation contracts first, implement draft mutation and translation as NestJS server capabilities, then expose them to a client composer through Next server actions. Keep source/target derivation in pure helpers so web behavior is testable without a browser harness.

**Tech Stack:** TypeScript 5.9, NestJS 11, Next.js 16 App Router/Server Actions, React 19, Node test runner, OpenAI Responses API, CSS modules, pnpm, Docker Compose.

## Global Constraints

- Work only on `kms-commu`; never modify, commit, merge, or push `app`.
- Re-read `.local-agents/local-infra-guard.prompt.md` before every slice.
- Do not modify `docker-compose*.yml`, Dockerfiles, workflows, AWS, nginx, or deployment files.
- Do not print, move, replace, or commit `OPENAI_API_KEY`; reuse the existing ignored environment values.
- Use `packages/types` as the shared contract source before API and web edits.
- Use only variables from `packages/ui/src/tokens.css`; no raw hex, Tailwind CDN, external fonts, or Azure Horizon assets.
- Preserve `ManagerAppShell`/`ManagerShell`; replace only M-MSG-01 internal content.
- Emergency notices require English, Chinese, and Vietnamese translations that match the current source and are reviewed.
- Each task follows RED → GREEN → targeted tests → broader tests → commit → push.
- Stage only files named by the current task; preserve all unrelated untracked documents.
- Do not modify `apps/web/src/app/manager/page.tsx` or the pre-existing `/sell` assertion in `property-shell.spec.mjs`; scope all new source assertions to M-MSG-01.
- The known baseline `pnpm test:web` result is 138 pass / 1 unrelated fail. Use messaging-targeted web tests for commit gates and report the unchanged baseline failure separately.

## File Map

- `packages/types/src/messaging.ts`: public announcement languages, draft input, target room IDs, translation request/response, source hash.
- `apps/api/src/roomlog/roomlog.types.ts`: internal store/input mirrors consumed by the messaging domain.
- `apps/api/src/roomlog/services/roomlog-messaging.domain.ts`: draft create/update ownership, target resolution, review/send gates.
- `apps/api/src/roomlog/services/roomlog-announcement-support.ts`: supported-language constants and deterministic source hashing.
- `apps/api/src/roomlog/services/roomlog-announcement-translation.service.ts`: isolated OpenAI Responses call and strict response parsing.
- `apps/api/src/roomlog/roomlog.service.ts`: facade methods and translation-service construction.
- `apps/api/src/roomlog/roomlog.controller.ts`: PATCH draft and POST translation endpoints.
- `apps/api/src/roomlog/roomlog.service.spec.ts`: backend behavior, permissions, OpenAI payload, and urgent gate regressions.
- `apps/web/src/lib/messaging-manager-api.ts`: paths and typed server-only API calls.
- `apps/web/src/lib/messaging-api.spec.ts`: path contract regressions.
- `apps/web/src/lib/announcement-compose-state.ts`: pure room grouping, target derivation, stale-review, and validation helpers.
- `apps/web/src/lib/announcement-compose-state.spec.ts`: pure composer state tests.
- `apps/web/src/app/manager/messaging/01/actions.ts`: server actions forwarding authenticated requests.
- `apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx`: client form state and interactions.
- `apps/web/src/app/manager/messaging/01/announcement-composer.module.css`: responsive Stitch-inspired internal layout using tokens.
- `apps/web/src/app/manager/messaging/01/page.tsx`: authenticated server wrapper, blank/new vs existing draft initial data.
- `apps/web/property-shell.spec.mjs`: source-level shell, semantics, and no-raw-hex regressions.

---

### Task 1: Real Targeting and Same-Draft Save

**Files:**
- Modify: `packages/types/src/messaging.ts:53-101`
- Modify: `apps/api/src/roomlog/roomlog.types.ts:184-217`
- Modify: `apps/api/src/roomlog/services/roomlog-messaging.domain.ts:216-264,521-549`
- Modify: `apps/api/src/roomlog/roomlog.service.ts:6405-6423`
- Modify: `apps/api/src/roomlog/roomlog.controller.ts:1172-1200`
- Modify: `apps/api/src/roomlog/roomlog.service.spec.ts:3710-3772`
- Modify: `apps/web/src/lib/messaging-manager-api.ts:1-8,204-222,272-289`
- Modify: `apps/web/src/lib/messaging-api.spec.ts:29-59`
- Modify: `apps/web/src/lib/session.ts:15-26`

**Interfaces:**
- Produces: `AnnouncementDraftInput`, `UpdateAnnouncementDraftInput`, `AnnouncementDraft.targetRoomIds`, `updateManagerAnnouncementDraft(managerId, draftId, input)`, `updateAnnouncementDraft(id, input)`.
- Consumes: existing `Room`, `Store`, `serverFetch`, `requireRole`, and manager `managedRooms` from `/auth/me`.

- [ ] **Step 1: Add failing shared/API path assertions**

Update `apps/web/src/lib/messaging-api.spec.ts` so the manager path test also contains:

```ts
assert.equal(
  managerMessagingPaths.announcementDraft("draft_1"),
  "/manager/messaging/announcement-drafts/draft_1"
);
assert.equal(
  managerMessagingPaths.announcementTranslations(),
  "/manager/messaging/announcement-translations"
);
```

Add the shared contracts to the test compile surface by importing them in `messaging-manager-api.ts`; the initial compile must fail because the names do not exist yet.

- [ ] **Step 2: Run the web unit suite and confirm RED**

Run:

```bash
pnpm --filter web test:unit
```

Expected: FAIL with a missing `announcementTranslations` path and missing shared announcement input types.

- [ ] **Step 3: Add failing backend draft mutation tests**

Extend `apps/api/src/roomlog/roomlog.service.spec.ts` with one test named `updates manager announcement drafts without duplicating them and enforces target ownership`:

```ts
it("updates manager announcement drafts without duplicating them and enforces target ownership", () => {
  const service = new RoomlogService();
  const created = service.createManagerAnnouncementDraft("landlord-demo", {
    category: "life",
    scope: "unit",
    targetLabel: "301호",
    targetRoomIds: ["room-301"],
    title: "점검 안내",
    body: "내일 점검합니다.",
    translations: []
  });
  const beforeCount = service.listManagerAnnouncementDrafts("landlord-demo").length;

  const updated = service.updateManagerAnnouncementDraft("landlord-demo", created.id, {
    category: "life",
    scope: "building",
    targetLabel: "정글빌라 2세대",
    targetRoomIds: ["room-301", "room-302"],
    title: "점검 시간 변경",
    body: "내일 14시에 점검합니다.",
    translations: []
  });

  assert.equal(updated.id, created.id);
  assert.equal(updated.title, "점검 시간 변경");
  assert.deepEqual(updated.targetRoomIds, ["room-301", "room-302"]);
  assert.equal(service.listManagerAnnouncementDrafts("landlord-demo").length, beforeCount);
  assert.throws(
    () => service.updateManagerAnnouncementDraft("manager-outside", created.id, {
      category: "life",
      scope: "unit",
      targetLabel: "301호",
      targetRoomIds: ["room-301"],
      title: "권한 없는 수정",
      body: "수정하면 안 됩니다.",
      translations: []
    }),
    /초안|권한|찾을 수/
  );
});
```

Add a second test named `rejects sent-draft updates and derives confirmation from category` that creates an urgent draft, asserts `confirmRequired === true`, sends a reviewable draft fixture, then asserts PATCH-style service mutation throws `/발송|수정/`.

- [ ] **Step 4: Run the API test and confirm RED**

Run:

```bash
pnpm --filter api exec node --test --require ts-node/register --test-name-pattern="updates manager announcement drafts|rejects sent-draft updates" src/roomlog/roomlog.service.spec.ts
```

Expected: FAIL because `updateManagerAnnouncementDraft` does not exist and `AnnouncementDraft` lacks `targetRoomIds` in the shared surface.

- [ ] **Step 5: Implement shared contracts first**

Add to `packages/types/src/messaging.ts`:

```ts
export type AnnouncementLanguage = "en" | "zh" | "vi";

export interface AnnouncementDraftInput {
  category: AnnouncementCategory;
  scope: AnnouncementScope;
  targetLabel: string;
  targetRoomIds: string[];
  title: string;
  body: string;
  translations: AnnouncementTranslation[];
}

export type UpdateAnnouncementDraftInput = AnnouncementDraftInput;
```

Change `AnnouncementTranslation.lang` to `AnnouncementLanguage`, add `sourceHash: string`, and add `targetRoomIds: string[]` to `AnnouncementDraft`. Mirror the same fields and `UpdateAnnouncementDraftInput` in `apps/api/src/roomlog/roomlog.types.ts`. Extend `SessionUser.managedRooms` in `apps/web/src/lib/session.ts` only with fields the API already returns; do not invent a building ID.

- [ ] **Step 6: Implement target resolution and same-draft mutation**

In `RoomlogMessagingDomain`, add:

```ts
updateManagerAnnouncementDraft(
  managerId: string,
  draftId: string,
  input: UpdateAnnouncementDraftInput
): MessagingAnnouncementDraft {
  const draft = this.findManagerDraft(managerId, draftId);
  if (draft.status === "sent") {
    throw new BadRequestException("발송된 공지는 수정할 수 없습니다.");
  }

  this.assertAnnouncementContent(input.title, input.body, input.targetLabel);
  const targetRooms = this.targetRoomsFor(managerId, input);
  draft.category = input.category;
  draft.scope = input.scope;
  draft.targetLabel = input.targetLabel.trim();
  draft.targetRoomIds = targetRooms.map((room) => room.id);
  draft.title = input.title.trim();
  draft.body = input.body.trim();
  draft.translations = input.translations.map((translation) => ({ ...translation }));
  draft.confirmRequired = input.category === "urgent";
  draft.updatedAt = now();
  this.persistStore();
  return this.presentDraft(draft);
}
```

For creation, set `confirmRequired: input.category === "urgent"` and persist resolved `targetRoomIds`. Keep backward compatibility for internal report-created building drafts with omitted IDs, but require IDs for `unit`. If `scope === "all"` and IDs are present, verify they equal all managed room IDs; for `building`, require a non-empty subset when IDs are supplied.

- [ ] **Step 7: Add facade, controller, and web API methods**

Add to `RoomlogService`:

```ts
updateManagerAnnouncementDraft(
  managerId: string,
  draftId: string,
  input: UpdateAnnouncementDraftInput
) {
  return this.messaging.updateManagerAnnouncementDraft(managerId, draftId, input);
}
```

Add to `RoomlogController`:

```ts
@Patch("manager/messaging/announcement-drafts/:draftId")
updateManagerAnnouncementDraft(
  @Headers("authorization") authorization: string | undefined,
  @Param("draftId") draftId: string,
  @Body() body: UpdateAnnouncementDraftInput
) {
  const user = this.requireRole(authorization, ["LANDLORD"]);
  return this.roomlogService.updateManagerAnnouncementDraft(user.id, draftId, body);
}
```

Add `announcementTranslations()` to `managerMessagingPaths`, type `createAnnouncementDraft` with `AnnouncementDraftInput`, and add:

```ts
export function updateAnnouncementDraft(
  id: string,
  input: UpdateAnnouncementDraftInput
): Promise<AnnouncementDraft> {
  return serverFetch<AnnouncementDraft>(managerMessagingPaths.announcementDraft(id), {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}
```

- [ ] **Step 8: Update fixtures and run GREEN verification**

Add `targetRoomIds` and temporary deterministic `sourceHash` values to every manager draft translation fixture and seed that now consumes the stricter shared type.

Run:

```bash
pnpm --filter @roomlog/types typecheck
pnpm --filter api test
pnpm --filter web test:unit
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 9: Commit and push Task 1 only**

```bash
git add packages/types/src/messaging.ts \
  apps/api/src/roomlog/roomlog.types.ts \
  apps/api/src/roomlog/services/roomlog-messaging.domain.ts \
  apps/api/src/roomlog/roomlog.service.ts \
  apps/api/src/roomlog/roomlog.controller.ts \
  apps/api/src/roomlog/roomlog.service.spec.ts \
  apps/web/src/lib/messaging-manager-api.ts \
  apps/web/src/lib/messaging-api.spec.ts \
  apps/web/src/lib/session.ts \
  docs/superpowers/plans/2026-07-11-manager-announcement-compose.md
git commit -m "feat(messaging): persist editable announcement targets"
git push origin kms-commu
```

---

### Task 2: Per-Language OpenAI Translation and Urgent Review Gate

**Files:**
- Create: `apps/api/src/roomlog/services/roomlog-announcement-support.ts`
- Create: `apps/api/src/roomlog/services/roomlog-announcement-translation.service.ts`
- Modify: `packages/types/src/messaging.ts`
- Modify: `apps/api/src/roomlog/roomlog.types.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-messaging.domain.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Modify: `apps/api/src/roomlog/roomlog.controller.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.spec.ts`
- Modify: `apps/web/src/lib/messaging-manager-api.ts`
- Modify: `apps/web/src/lib/messaging-api.spec.ts`

**Interfaces:**
- Consumes: Task 1 draft input/update contracts and `managerMessagingPaths.announcementTranslations()`.
- Produces: `AnnouncementTranslationRequest`, `AnnouncementTranslationResponse`, `announcementSourceHash(title, body)`, `translateManagerAnnouncement(managerId, input)`, `translateAnnouncement(input)`.

- [ ] **Step 1: Add failing translation/gate tests**

Add `AnnouncementTranslationRequest` and `AnnouncementTranslationResponse` imports in web/API surfaces before defining them. Extend `roomlog.service.spec.ts` with an async test named `translates one announcement language with strict structured output`:

```ts
it("translates one announcement language with strict structured output", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  process.env.OPENAI_API_KEY = "sk-test-roomlog";
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        title: "[Urgent] Water outage",
        body: "Water will be unavailable from 14:00 to 16:00."
      })
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const service = new RoomlogService();
    const translated = await service.translateManagerAnnouncement("landlord-demo", {
      title: "[긴급] 단수 안내",
      body: "14시부터 16시까지 단수됩니다.",
      targetLang: "en"
    });
    assert.equal(translated.lang, "en");
    assert.equal(translated.reviewed, false);
    assert.match(translated.sourceHash, /^[a-f0-9]{64}$/);
    assert.equal((requestBody?.text as any).format.type, "json_schema");
    assert.equal((requestBody?.text as any).format.strict, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey) process.env.OPENAI_API_KEY = originalKey;
    else delete process.env.OPENAI_API_KEY;
  }
});
```

Replace the old one-language urgent success fixture with three reviewed translations containing the current `sourceHash`. Add assertions that empty, partial, unreviewed, duplicated, and stale-language sets throw `/영어|중국어|베트남어|검수|원문/` before send.

- [ ] **Step 2: Run API tests and confirm RED**

Run:

```bash
pnpm --filter api exec node --test --require ts-node/register --test-name-pattern="translates one announcement language|requires reviewed urgent" src/roomlog/roomlog.service.spec.ts
```

Expected: FAIL because translation types/service and strict three-language gate are missing.

- [ ] **Step 3: Define translation contracts and pure support functions**

Add to `packages/types/src/messaging.ts` and mirror internally:

```ts
export interface AnnouncementTranslationRequest {
  title: string;
  body: string;
  targetLang: AnnouncementLanguage;
}

export type AnnouncementTranslationResponse = AnnouncementTranslation;
```

Create `roomlog-announcement-support.ts`:

```ts
import { createHash } from "node:crypto";
import type { AnnouncementLanguage } from "../roomlog.types";

export const ANNOUNCEMENT_LANGUAGES: ReadonlyArray<{
  lang: AnnouncementLanguage;
  label: string;
  promptName: string;
}> = [
  { lang: "en", label: "English", promptName: "English" },
  { lang: "zh", label: "中文", promptName: "Simplified Chinese" },
  { lang: "vi", label: "Tiếng Việt", promptName: "Vietnamese" }
];

export function announcementSourceHash(title: string, body: string): string {
  return createHash("sha256").update(`${title.trim()}\n${body.trim()}`).digest("hex");
}
```

- [ ] **Step 4: Implement the focused OpenAI translator**

Create `roomlog-announcement-translation.service.ts` with a class `RoomlogAnnouncementTranslationService`. Its `translate(managerId, input)` must:

```ts
const model = process.env.OPENAI_TRANSLATION_MODEL
  || process.env.OPENAI_CHAT_MODEL
  || "gpt-5.4-mini";
const language = ANNOUNCEMENT_LANGUAGES.find((item) => item.lang === input.targetLang);
if (!language) throw new BadRequestException("지원하지 않는 번역 언어입니다.");
if (!input.title?.trim() || !input.body?.trim()) {
  throw new BadRequestException("번역할 공지 제목과 내용을 입력해주세요.");
}
if (!process.env.OPENAI_API_KEY) {
  throw new ServiceUnavailableException("자동 번역을 사용할 수 없습니다.");
}

const response = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    "OpenAI-Safety-Identifier": createSafetyIdentifier(managerId, input.targetLang)
  },
  body: JSON.stringify({
    model,
    instructions: [
      `Translate the Korean property-management notice into ${language.promptName}.`,
      "Preserve numbers, dates, times, names, urgency, and factual meaning exactly.",
      "Do not add responsibility, promises, causes, or safety claims not present in the source."
    ].join(" "),
    input: [{
      role: "user",
      content: [{ type: "input_text", text: JSON.stringify({ title: input.title, body: input.body }) }]
    }],
    text: {
      format: {
        type: "json_schema",
        name: "roomlog_announcement_translation",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { title: { type: "string" }, body: { type: "string" } },
          required: ["title", "body"]
        }
      }
    }
  })
});
```

On non-2xx throw `BadGatewayException("공지 자동 번역에 실패했습니다.")`. Parse `output_text` or the standard Responses output text blocks, JSON-parse it, trim both values, reject blanks with `BadGatewayException`, and return:

```ts
return {
  lang: language.lang,
  langLabel: language.label,
  title: parsed.title.trim(),
  body: parsed.body.trim(),
  reviewed: false,
  sourceHash: announcementSourceHash(input.title, input.body)
};
```

- [ ] **Step 5: Wire the translator and HTTP endpoint**

Construct one `RoomlogAnnouncementTranslationService` inside `RoomlogService`, add:

```ts
translateManagerAnnouncement(managerId: string, input: AnnouncementTranslationRequest) {
  return this.announcementTranslation.translate(managerId, input);
}
```

Add the controller endpoint:

```ts
@Post("manager/messaging/announcement-translations")
translateManagerAnnouncement(
  @Headers("authorization") authorization: string | undefined,
  @Body() body: AnnouncementTranslationRequest
) {
  const user = this.requireRole(authorization, ["LANDLORD"]);
  return this.roomlogService.translateManagerAnnouncement(user.id, body);
}
```

Add `translateAnnouncement(input)` to the web API client with a POST to `announcementTranslations()`.

- [ ] **Step 6: Strengthen translation normalization and urgent gates**

In `RoomlogMessagingDomain`, normalize translation language uniqueness and use `announcementSourceHash(draft.title, draft.body)`. `assertUrgentTranslationsReviewed` must require exactly `en`, `zh`, and `vi`, reject missing/duplicate entries, require non-empty translated text, require each `sourceHash === currentHash`, then require every `reviewed === true`.

When an update changes Korean title or body, preserve translation text but force `reviewed: false`. Never silently retranslate in the save endpoint.

- [ ] **Step 7: Run GREEN and broader verification**

Run:

```bash
pnpm --filter @roomlog/types typecheck
pnpm --filter api test
pnpm --filter web test:unit
git diff --check
```

Expected: all commands exit 0; tests must not perform a live network call or print a key.

- [ ] **Step 8: Commit and push Task 2 only**

```bash
git add packages/types/src/messaging.ts \
  apps/api/src/roomlog/roomlog.types.ts \
  apps/api/src/roomlog/services/roomlog-announcement-support.ts \
  apps/api/src/roomlog/services/roomlog-announcement-translation.service.ts \
  apps/api/src/roomlog/services/roomlog-messaging.domain.ts \
  apps/api/src/roomlog/roomlog.service.ts \
  apps/api/src/roomlog/roomlog.controller.ts \
  apps/api/src/roomlog/roomlog.service.spec.ts \
  apps/web/src/lib/messaging-manager-api.ts \
  apps/web/src/lib/messaging-api.spec.ts
git commit -m "feat(messaging): add reviewed announcement translations"
git push origin kms-commu
```

---

### Task 3: Stitch-Inspired Interactive Composer

**Files:**
- Create: `apps/web/src/lib/announcement-compose-state.ts`
- Create: `apps/web/src/lib/announcement-compose-state.spec.ts`
- Create: `apps/web/src/app/manager/messaging/01/actions.ts`
- Create: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx`
- Create: `apps/web/src/app/manager/messaging/01/announcement-composer.module.css`
- Modify: `apps/web/src/app/manager/messaging/01/page.tsx`
- Modify: `apps/web/property-shell.spec.mjs`

**Interfaces:**
- Consumes: Task 1 create/update draft API, Task 2 per-language translation API, `SessionUser.managedRooms`, existing M-MSG-02 route.
- Produces: `deriveAnnouncementTarget`, `invalidateTranslationReviews`, `validateAnnouncementCompose`, server actions `saveAnnouncementDraftAction` and `translateAnnouncementAction`, and the final `AnnouncementComposer`.

- [ ] **Step 1: Write failing pure state tests**

Create `announcement-compose-state.spec.ts` with these cases:

```ts
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  deriveAnnouncementTarget,
  invalidateTranslationReviews,
  validateAnnouncementCompose
} from "./announcement-compose-state";

const rooms = [
  { id: "room-a-101", buildingName: "A동", roomNo: "101호", address: "서울" },
  { id: "room-a-102", buildingName: "A동", roomNo: "102호", address: "서울" },
  { id: "room-b-201", buildingName: "B동", roomNo: "201호", address: "서울" }
];

describe("announcement composer state", () => {
  it("derives real room ids for all, building, and unit targets", () => {
    assert.deepEqual(deriveAnnouncementTarget("all", [], rooms).targetRoomIds,
      ["room-a-101", "room-a-102", "room-b-201"]);
    assert.deepEqual(deriveAnnouncementTarget("building", ["A동"], rooms).targetRoomIds,
      ["room-a-101", "room-a-102"]);
    assert.deepEqual(deriveAnnouncementTarget("unit", ["room-b-201"], rooms), {
      targetLabel: "B동 201호",
      targetRoomIds: ["room-b-201"]
    });
  });

  it("preserves translated text and clears reviews when the Korean source changes", () => {
    const next = invalidateTranslationReviews([{
      lang: "en", langLabel: "English", title: "Notice", body: "Body",
      reviewed: true, sourceHash: "old"
    }]);
    assert.equal(next[0].title, "Notice");
    assert.equal(next[0].reviewed, false);
  });

  it("blocks urgent review until all current translations are reviewed", () => {
    assert.match(validateAnnouncementCompose({
      category: "urgent", title: "긴급", body: "본문", targetRoomIds: ["room-a-101"], translations: []
    }) ?? "", /영어|중국어|베트남어/);
  });
});
```

- [ ] **Step 2: Add failing page source assertions and run RED**

Update `property-shell.spec.mjs` to read the new component and CSS module. Assert the source contains `English`, `中文`, `Tiếng Việt`, `translateAnnouncementAction`, `saveAnnouncementDraftAction`, `name="category"`, real target room IDs, `role="status"`, `role="alert"`, and no raw hex regex in the CSS module.

Run only the new M-MSG-01 source test plus web unit tests:

```bash
pnpm --filter web exec node --test --test-name-pattern="manager announcement compose" property-shell.spec.mjs
pnpm --filter web test:unit
```

Expected: FAIL because the helper, component, actions, and CSS module do not exist.

- [ ] **Step 3: Implement pure target and validation helpers**

Create `announcement-compose-state.ts` exporting:

```ts
export type ManagedAnnouncementRoom = {
  id: string;
  buildingName: string;
  roomNo: string;
  address: string;
};

export function deriveAnnouncementTarget(
  scope: AnnouncementScope,
  selection: string[],
  rooms: ManagedAnnouncementRoom[]
): { targetLabel: string; targetRoomIds: string[] };

export function invalidateTranslationReviews(
  translations: AnnouncementTranslation[]
): AnnouncementTranslation[] {
  return translations.map((item) => ({ ...item, reviewed: false }));
}

export function validateAnnouncementCompose(input: {
  category: AnnouncementCategory;
  title: string;
  body: string;
  targetRoomIds: string[];
  translations: AnnouncementTranslation[];
}): string | null;
```

`deriveAnnouncementTarget` sorts room IDs for stable payloads. `all` uses all rooms; `building` treats selection as building names; `unit` treats it as room IDs. `validateAnnouncementCompose` returns Korean inline-error copy for missing target/title/body and, for urgent, missing `en`/`zh`/`vi`, stale hashes, or unchecked reviews.

- [ ] **Step 4: Implement authenticated server actions**

Create `actions.ts` with `"use server"` and discriminated results:

```ts
export type AnnouncementActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

export async function saveAnnouncementDraftAction(input: {
  draftId?: string;
  draft: AnnouncementDraftInput;
}): Promise<AnnouncementActionResult<AnnouncementDraft>> {
  try {
    const data = input.draftId
      ? await updateAnnouncementDraft(input.draftId, input.draft)
      : await createAnnouncementDraft(input.draft);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) redirect("/manager/login");
    return { ok: false, message: error instanceof Error ? error.message : "공지 저장에 실패했습니다." };
  }
}

export async function translateAnnouncementAction(
  input: AnnouncementTranslationRequest
): Promise<AnnouncementActionResult<AnnouncementTranslationResponse>> {
  try {
    return { ok: true, data: await translateAnnouncement(input) };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) redirect("/manager/login");
    return { ok: false, message: error instanceof Error ? error.message : "자동 번역에 실패했습니다." };
  }
}
```

- [ ] **Step 5: Replace the page wrapper**

Make `page.tsx` a server wrapper that calls `requireUser("LANDLORD")`, maps `user.managedRooms` to complete display strings, fetches a draft only when `searchParams.id` exists, and renders:

```tsx
<AnnouncementComposer
  initialDraft={draft}
  managedRooms={managedRooms}
  reviewHref={MANAGER_MESSAGING_ROUTES["M-MSG-02"]}
  hubHref={MANAGER_MESSAGING_ROUTES["M-MSG-00"]}
/>
```

With no `id`, pass `undefined`; do not load `DEMO_MANAGER_DRAFT_ID` into a new form.

- [ ] **Step 6: Implement the client composer behavior**

Create `AnnouncementComposer.tsx` with `"use client"`. Keep category, scope, selection, title, body, translations, per-language loading/errors, save state, and `draftId` in React state.

Required handlers:

```ts
function changeSource(next: { title?: string; body?: string }) {
  setTitle(next.title ?? title);
  setBody(next.body ?? body);
  setTranslations((current) => invalidateTranslationReviews(current));
}

async function translateLanguage(lang: AnnouncementLanguage) {
  const existing = translations.find((item) => item.lang === lang);
  if (existing && !window.confirm("기존 번역을 새 번역으로 덮어쓸까요?")) return;
  setTranslationLoading((current) => ({ ...current, [lang]: true }));
  const result = await translateAnnouncementAction({ title, body, targetLang: lang });
  if (result.ok) {
    setTranslations((current) => [...current.filter((item) => item.lang !== lang), result.data]);
  } else {
    setTranslationErrors((current) => ({ ...current, [lang]: result.message }));
  }
  setTranslationLoading((current) => ({ ...current, [lang]: false }));
}

async function save(intent: "stay" | "review") {
  const target = deriveAnnouncementTarget(scope, selection, managedRooms);
  const validation = validateAnnouncementCompose({ category, title, body, targetRoomIds: target.targetRoomIds, translations });
  if (validation) { setFormError(validation); return; }
  const result = await saveAnnouncementDraftAction({
    draftId,
    draft: { category, scope, ...target, title, body, translations }
  });
  if (!result.ok) { setFormError(result.message); return; }
  setDraftId(result.data.id);
  if (intent === "review") router.push(`${reviewHref}?id=${encodeURIComponent(result.data.id)}`);
  else router.replace(`?id=${encodeURIComponent(result.data.id)}`);
}
```

The JSX must use real radio inputs for category/scope, select/card controls for building and unit targets, controlled title/body inputs, three language buttons, editable translation title/body fields, per-language `검수 완료` checkboxes, `role=status` save feedback, `role=alert` errors, and distinct `type="button"` handlers for save vs review.

- [ ] **Step 7: Implement token-only responsive styling**

Create `announcement-composer.module.css` with named classes for breadcrumb, header, two-column grid, cards, pills, target controls, inputs, action row, gate card, language buttons, translation cards, status, and errors. Use only `var(--...)` color/spacing/radius/shadow values. The main desktop rule is:

```css
.layout {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr);
  gap: var(--space-xl);
  align-items: start;
}

@media (max-width: 980px) {
  .layout { grid-template-columns: 1fr; }
}
```

Do not add global CSS or alter `ManagerShell`.

- [ ] **Step 8: Run GREEN web verification**

Run:

```bash
pnpm --filter web exec node --test --test-name-pattern="manager announcement compose" property-shell.spec.mjs
pnpm --filter web test:unit
pnpm --filter web build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 9: Rebuild Docker and verify the actual page**

Run:

```bash
docker compose up -d --build api web
docker compose logs --tail=120 api web
```

Open `/manager/messaging/01` in the browser and verify:

1. New route starts blank inside the existing Roomlog manager shell.
2. All/building/unit selection produces the intended visible label and actual room set.
3. Each language button translates only its language and preserves the others.
4. Editing Korean clears all review checks without erasing translations.
5. Temporary save stays on the page and updates `?id=`.
6. Review saves, then navigates to M-MSG-02.
7. At a narrow viewport the right rail stacks below the form.
8. Browser console has no uncaught errors.

- [ ] **Step 10: Run repository verification**

Run:

```bash
bash scripts/verify.sh
pnpm test:api
pnpm --filter web exec node --test --test-name-pattern="manager announcement compose" property-shell.spec.mjs
pnpm --filter web test:unit
```

Expected: all scoped commands exit 0. Re-run `pnpm test:web` once as an informational baseline check and report the known unrelated `/sell` expectation failure separately; do not modify that route or test. If Docker/API availability causes a documented test skip, record the exact skip; do not report it as executed coverage.

- [ ] **Step 11: Commit and push Task 3 only**

```bash
git add apps/web/src/lib/announcement-compose-state.ts \
  apps/web/src/lib/announcement-compose-state.spec.ts \
  apps/web/src/app/manager/messaging/01/actions.ts \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx \
  apps/web/src/app/manager/messaging/01/announcement-composer.module.css \
  apps/web/src/app/manager/messaging/01/page.tsx \
  apps/web/property-shell.spec.mjs
git commit -m "feat(messaging): rebuild announcement compose workflow"
git push origin kms-commu
```

---

## Final Handoff Checklist

- [ ] Confirm `git status --short --branch` shows only the user's pre-existing untracked files.
- [ ] Confirm `git log -4 --oneline --decorate` contains the design plus three feature commits on `origin/kms-commu`.
- [ ] Report exact test/build/browser commands and outcomes; distinguish mocked OpenAI tests from any live translation check.
- [ ] Report that no protected infrastructure file changed.
- [ ] If production key presence is still unverified, include the previously identified deployment-owner confirmation without editing workflow or compose files.
