# Owner Floor Plan View Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a persistent bottom `2D · 3D · 가구 배치` switch that auto-saves owner furniture and resumes the same request-scoped floor-plan editor.

**Architecture:** Extend the existing request-scoped owner furniture draft with a resumable MitUNet editor snapshot. The owner furniture page requests the shared scene's confirmed furniture layout, persists it, and redirects to the MitUNet route with an explicit target view; the viewer restores the snapshot before selecting 2D or 3D.

**Tech Stack:** Next.js 16, React 19, TypeScript, browser localStorage, MitUNet ES modules, Node test runner.

## Global Constraints

- Scope state by `requestId`; never mix drafts between listings.
- Auto-save confirmed furniture only; an unconfirmed move returns to its last confirmed position.
- Do not rely on browser history or bfcache for editor restoration.
- Use existing CSS tokens only; add no raw color values.
- Preserve standalone MitUNet and tenant/listing viewer behavior.

---

### Task 1: Request-scoped resumable handoff

**Files:**
- Modify: `services/mitunet/viewer/roomlog-integration.mjs`
- Test: `services/mitunet/viewer/roomlog-integration.test.mjs`

**Interfaces:**
- Produces: `readRoomLogFurnitureDraft(storage, requestId)` and `buildRoomLogEditorResumeUrl(context, view)`.
- Extends: `beginRoomLogFurnitureSimulation(..., editorSnapshot)` stores `editorSnapshot` in `roomlogOwnerFurnitureDraft:<requestId>`.

- [ ] **Step 1: Write failing tests** for storing a cloned editor snapshot and for URLs containing `integration=roomlog`, `requestId`, `returnOrigin`, and `resumeView=original|3d`.
- [ ] **Step 2: Run tests and verify RED** with `node --test services/mitunet/viewer/roomlog-integration.test.mjs`.
- [ ] **Step 3: Implement the storage reader, snapshot persistence, and resume URL builder** with strict request ID checks and cloned JSON data.
- [ ] **Step 4: Run the focused test and verify GREEN** with the same command.

### Task 2: Auto-save destination contract and owner toggle

**Files:**
- Modify: `apps/web/src/app/_components/ListingTourRoom3D.tsx`
- Modify: `apps/web/src/app/floor-plan-3d/owner-furniture/OwnerFurnitureSimulation.tsx`
- Modify: `apps/web/src/app/floor-plan-3d/owner-furniture/owner-furniture.css`
- Test: `apps/web/src/app/_components/listing-tour-room3d-owner.spec.ts`
- Test: `apps/web/src/app/floor-plan-3d/owner-furniture/owner-furniture-page.spec.ts`

**Interfaces:**
- Produces: `OwnerFurnitureSaveDestination = "listing" | "original" | "3d"`.
- Changes callback to `onOwnerFurnitureSave(furnitures, destination)` and request ref to `(destination?: OwnerFurnitureSaveDestination) => void`.

- [ ] **Step 1: Write failing source-contract tests** asserting the three accessible bottom tabs, active furniture state, destination-aware save callback, and save-before-navigation behavior.
- [ ] **Step 2: Run tests and verify RED** with `cd apps/web && node scripts/run-ts-unit-tests.mjs src/app/_components/listing-tour-room3d-owner.spec.ts src/app/floor-plan-3d/owner-furniture/owner-furniture-page.spec.ts`.
- [ ] **Step 3: Implement the minimal destination-aware save contract** so confirmed furniture is serialized before the parent navigates.
- [ ] **Step 4: Add the fixed bottom-centred token-only pill** with `tablist`, `tab`, and `aria-selected`; include `env(safe-area-inset-bottom)` in its offset.
- [ ] **Step 5: Run focused tests and verify GREEN** with the same command.

### Task 3: MitUNet snapshot capture and resume

**Files:**
- Modify: `services/mitunet/viewer/index.html`
- Test: `apps/web/src/app/floor-plan-3d/mitunet-internal-page.spec.ts`
- Test: `apps/web/src/app/floor-plan-3d/mitunet-session-bridge.spec.ts`
- Test: `services/mitunet/tests/test_viewer_shell.py`

**Interfaces:**
- Consumes: `readRoomLogFurnitureDraft` and `resumeView` from Task 1.
- Produces: `buildRoomLogEditorSnapshot()` and `restoreRoomLogEditorSnapshot()` inside the viewer.

- [ ] **Step 1: Write failing tests** proving the viewer captures the current review mask/openings/calibration and composed plan before entering furniture, then restores them during RoomLog initialization.
- [ ] **Step 2: Run tests and verify RED** with `cd apps/web && node scripts/run-ts-unit-tests.mjs src/app/floor-plan-3d/mitunet-internal-page.spec.ts src/app/floor-plan-3d/mitunet-session-bridge.spec.ts` and `python3 -m unittest services.mitunet.tests.test_viewer_shell`.
- [ ] **Step 3: Implement snapshot capture** by converting `reviewEditor.toWallMaskBlob()` to base64 and combining it with input image, openings, calibration, composed plan, and source name.
- [ ] **Step 4: Implement initialization restore** after live editor and RoomLog context initialization, load the review document and 3D plan, mark it rendered, restore source name, then select `original` or `3d`.
- [ ] **Step 5: Run focused tests and verify GREEN** with the same commands.

### Task 4: Normalize incoming PR styles and verify

**Files:**
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Replaces PR #155 raw colors with existing `--surface-container-lowest`, `--outline-variant`, and `--shadow-soft` tokens.

- [ ] **Step 1: Replace only the raw color declarations introduced by PR #155** without changing its layout intent.
- [ ] **Step 2: Run `git diff --check` and scan changed style blocks for raw hex/rgba values.**
- [ ] **Step 3: Run `pnpm test:web` and verify zero failures.**
- [ ] **Step 4: Run `bash scripts/verify.sh` and verify types, UI, web, API build, and smoke checks pass.**
- [ ] **Step 5: Commit the implementation and push `main` to `origin`.**
