# Language-specific Translation Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/manager/messaging/01`에서 번역 버튼을 누른 언어 카드에만 해당 번역 결과를 표시한다.

**Architecture:** 첨부 시 API 호환을 위한 세 언어 슬롯 투영은 그대로 유지한다. 화면 표시 단계에서 슬롯의 `lang`과 번역 결과의 `langLabel`이 현재 카드와 모두 일치할 때만 결과를 노출하는 순수 함수를 추가하고 컴포저가 그 함수를 사용한다.

**Tech Stack:** Next.js 16, React, TypeScript, Node test runner

## Global Constraints

- 수정 범위는 `/manager/messaging/01`과 해당 테스트로 제한한다.
- `.local-agents/local-infra-guard.prompt.md`를 준수하고 tracked 인프라 파일은 수정하지 않는다.
- 기능 테스트와 전체 web 검증을 통과한 뒤 현재 `kms-commu` 브랜치에 커밋하고 푸시한다.

---

### Task 1: 선택 언어 카드만 번역 표시

**Files:**
- Modify: `apps/web/src/app/manager/messaging/01/attachment-state.ts`
- Modify: `apps/web/src/app/manager/messaging/01/attachment-state.spec.ts`
- Modify: `apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx`
- Modify: `apps/web/property-shell.spec.mjs`

**Interfaces:**
- Consumes: `AnnouncementTranslation[]`, `AnnouncementLanguage`, 카드 표시 라벨
- Produces: `findVisibleTranslation(translations, lang, label): AnnouncementTranslation | undefined`

- [x] **Step 1: 표시 조건 회귀 테스트 작성**

```ts
const projected = buildAttachedTranslations(englishTranslation);
assert.equal(findVisibleTranslation(projected, "en", "English")?.title, englishTranslation.title);
assert.equal(findVisibleTranslation(projected, "zh", "中文"), undefined);
assert.equal(findVisibleTranslation(projected, "vi", "Tiếng Việt"), undefined);
```

- [x] **Step 2: 테스트가 실패하는지 확인**

Run: `TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/messaging/01/attachment-state.spec.ts`

Expected: `findVisibleTranslation` export가 없어 FAIL

- [x] **Step 3: 최소 표시 조회 함수 구현**

```ts
export function findVisibleTranslation(
  translations: AnnouncementTranslation[],
  lang: AnnouncementLanguage,
  label: string,
): AnnouncementTranslation | undefined {
  return translations.find(
    (translation) => translation.lang === lang && translation.langLabel === label,
  );
}
```

- [x] **Step 4: 컴포저의 카드 조회를 새 함수로 교체**

```ts
function translationFor(lang: AnnouncementLanguage, label: string) {
  return findVisibleTranslation(translations, lang, label) ?? emptyTranslation(lang, label);
}
```

`property-shell.spec.mjs`의 소스 계약 테스트에도 `findVisibleTranslation` 사용을 고정한다.

- [x] **Step 5: 단위·전체·빌드·브라우저 검증**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/messaging/01/attachment-state.spec.ts
pnpm test:web
pnpm --filter @roomlog/web build
```

Expected: 모두 PASS. Docker web에서 영어 번역·첨부 후 영어 카드만 펼쳐지고 중국어·베트남어 카드는 닫힌 상태이며 콘솔 오류가 없다.

- [x] **Step 6: 커밋 및 푸시**

```bash
git add docs/superpowers/plans/2026-07-11-manager-announcement-visible-translation-language.md \
  apps/web/src/app/manager/messaging/01/attachment-state.ts \
  apps/web/src/app/manager/messaging/01/attachment-state.spec.ts \
  apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx \
  apps/web/property-shell.spec.mjs
git commit -m "fix(messaging): show only translated language card"
git push origin kms-commu
```
