# OpenAI Floor Plan Vision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an experimental OpenAI Vision first-pass floor-plan analysis option that can be compared with the existing OpenCV wall extraction.

**Architecture:** Reuse the existing `/floor-plans/ai-analysis` contract and model selector. Add an OpenAI provider branch in the API service while keeping OpenCV wall detection in `plan-extraction` and keeping `room-model` unchanged.

**Tech Stack:** NestJS API, OpenAI Responses API via `fetch`, Next/React editor UI, Node test runner.

---

### Task 1: API Provider

**Files:**
- Modify: `apps/api/src/roomlog/roomlog.types.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Test: `apps/api/src/roomlog/roomlog.service.spec.ts`

- [x] Add a failing service test that expects `openai/floor-plan-vision` in the floor-plan AI model list.
- [x] Add a failing service test that selects `openai/floor-plan-vision` and verifies a POST to `/v1/responses`.
- [x] Extend the AI model type union and model list.
- [x] Implement OpenAI provider dispatch using `OPENAI_API_KEY` and `OPENAI_FLOOR_PLAN_MODEL || OPENAI_CHAT_MODEL || "gpt-5.4-mini"`.
- [x] Reuse the existing AI JSON parsing and validation helpers.

### Task 2: Web Selector

**Files:**
- Modify: `apps/web/src/app/floor-plan-3d/RoomlogFloorPlanEditor.tsx`
- Test: `apps/web/property-shell.spec.mjs`

- [x] Add a failing web shell test for the OpenAI model option.
- [x] Add the OpenAI option to the editor model selector union/list.
- [x] Keep the existing `/floor-plans/ai-analysis` call path unchanged.

### Task 3: Verification

**Files:**
- Run tests only, then commit.

- [x] Run targeted API and web tests.
- [x] Run `npm test` in `apps/web`.
- [x] Run `./node_modules/.bin/tsc --noEmit` in `apps/web`.
- [x] Run API tests or TypeScript check for touched API files.
- [ ] Commit only the OpenAI provider changes and this plan.
