# Manager Ticket Local Demo Rows Implementation Plan

> **For Codex:** Execute this plan task-by-task with test gates. The user requested work on `kms-complaint1`, so keep the existing checkout and do not create a worktree.

**Goal:** Append exactly 10 local-only complaint/defect demo rows after real manager ticket rows without committing the demo dataset.

**Architecture:** A server-only loader checks the request `Host`, reads an ignored JSON file only for loopback hosts, validates a minimal dashboard-row shape, and returns at most 10 rows. The manager ticket page concatenates the loaded rows after API rows. Missing or invalid local data degrades to real rows only.

**Tech Stack:** Next.js 16 App Router, TypeScript, Node test runner, Docker Compose

---

### Task 1: Lock the local-only loader contract with tests

**Files:**
- Create: `apps/web/src/app/manager/ticket/dash/00/local-ticket-demo.spec.ts`
- Modify: `apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`

1. Add tests for loopback hosts with and without ports and rejection of deployment/lookalike/empty hosts.
2. Add tests proving real rows stay first, exactly 10 local rows are appended, and the input array is not mutated.
3. Add tests proving deployment hosts do not call the reader and missing/invalid local JSON returns real rows only.
4. Add page source assertions for `headers()` and the local loader call.
5. Run the targeted tests and confirm they fail because the loader and page wiring do not exist.

Command:
`TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/ticket/dash/00/local-ticket-demo.spec.ts src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`

### Task 2: Implement the server-only loader and page wiring

**Files:**
- Create: `apps/web/src/app/manager/ticket/dash/00/local-ticket-demo.ts`
- Modify: `apps/web/src/app/manager/ticket/dash/00/page.tsx`

1. Implement a strict loopback-host predicate for `localhost`, `127.0.0.1`, and `[::1]`.
2. Resolve the ignored JSON path from either repository root or `apps/web` working directory.
3. Read and parse the file only for a loopback request; validate a minimal row shape and cap the result at 10.
4. Return an empty local-row list on missing/invalid data without breaking the page.
5. Read the request host via Next `headers()` and append local rows after `listManagerTicketRows()` results.
6. Run the targeted tests and confirm they pass.

### Task 3: Create the untracked local dataset

**Files:**
- Modify locally only: `.git/info/exclude`
- Create locally only: `apps/web/.local-data/manager-ticket-demo.json`

1. Add the exact JSON path to `.git/info/exclude`.
2. Create 10 complaint/defect dashboard rows with unique local IDs and valid ticket/repair values.
3. Confirm `git check-ignore -v` reports `.git/info/exclude` and `git ls-files` reports no tracked file.
4. Confirm the JSON contains exactly 10 rows.

### Task 4: Full verification and local Docker rebuild

**Files:** No tracked changes expected.

1. Run `pnpm test:web`.
2. Stop the compose stack before the repository verification script if required to avoid port conflicts.
3. Run `bash scripts/verify.sh`.
4. Run `pnpm docker:up` to rebuild and reopen the local stack.
5. Verify web `:3000`, API `:4000`, and confirm the ignored JSON exists in the local web container with 10 rows.

### Task 5: Commit and push tracked changes only

**Files:** Stage only the loader, tests, page, plan, and updated design document.

1. Review `git diff` and `git status`; preserve unrelated untracked user documents.
2. Reconfirm the local JSON is ignored and untracked.
3. Commit tracked implementation with message `feat(manager): load local-only ticket demo rows`.
4. Push `kms-complaint1` to `origin`.
5. Recheck the compose stack is healthy and report the local URLs and verification results.
