# Manager Vendor Detail Back Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit, reliable route from manager vendor detail back to the canonical vendor list.

**Architecture:** Reuse the existing `VendorScreenHeader`, `LinkButton`, and semantic vendor route constants. Render the list link in both success and error header actions without client-side history state or new CSS.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Node test runner.

## Global Constraints

- Work on `yong/vendor-credit-core`; do not push or create a PR unless requested.
- Keep the existing `ManagerShell` and vendor-management tab navigation unchanged.
- Use `MANAGER_VENDOR_MGMT_PATHS.vendors`; do not hard-code or use browser history.
- Add no raw colors or unrelated UI refactoring.
- Use TDD and commit only the detail page, focused test, and these documents.

---

### Task 1: Vendor Detail List Navigation

**Files:**
- Modify: `apps/web/src/app/manager/vendor-mgmt/vendors/[vendorId]/page.tsx`
- Test: `apps/web/src/app/manager/vendor-mgmt/vendor-mgmt-workflow.spec.ts`

**Interfaces:**
- Consumes: `MANAGER_VENDOR_MGMT_PATHS.vendors`, `LinkButton`, `VendorScreenHeader.actions`.
- Produces: A `← 내 업체` secondary link in success and error detail headers.

- [ ] **Step 1: Write the failing source-contract test**

```ts
it("returns from vendor detail to the canonical vendor list", () => {
  const detailPage = source("src/app/manager/vendor-mgmt/vendors/[vendorId]/page.tsx");
  assert.equal((detailPage.match(/MANAGER_VENDOR_MGMT_PATHS\.vendors/g) ?? []).length, 2);
  assert.equal((detailPage.match(/← 내 업체/g) ?? []).length, 2);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/vendor-mgmt/vendor-mgmt-workflow.spec.ts
```

Expected: FAIL because the detail page contains no canonical list link.

- [ ] **Step 3: Add the minimal success and error header links**

```tsx
<LinkButton href={MANAGER_VENDOR_MGMT_PATHS.vendors} secondary>
  ← 내 업체
</LinkButton>
```

The success header renders this before `수치 성과 보기`; the error header renders it as its only action.

- [ ] **Step 4: Verify the focused test and web build**

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/vendor-mgmt/vendor-mgmt-workflow.spec.ts
pnpm build
```

Expected: focused test and Next production build PASS.

- [ ] **Step 5: Commit the focused change**

```bash
git add docs/superpowers apps/web/src/app/manager/vendor-mgmt/vendors/[vendorId]/page.tsx apps/web/src/app/manager/vendor-mgmt/vendor-mgmt-workflow.spec.ts
git commit -m "fix(vendor): add detail return navigation"
```
