# Instant Floor Plan Upload Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 도면 업로드 버튼을 즉시 활성화하고, 준비 전에 고른 파일은 편집기 준비 완료 직후 한 번만 분석한다.

**Architecture:** 기존 MitUNet 뷰어의 단일 HTML 스크립트 안에서 파일 선택 이벤트를 초기화 직후 연결한다. 서버·편집기 준비 전 선택된 `File` 하나만 임시 보관하고, `enableLiveMode()` 성공 시 기존 `extractForReview()`로 전달한다.

**Tech Stack:** Vanilla JavaScript, Node.js `node:test`

## Global Constraints

- `services/mitunet/viewer/index.html` 외의 런타임 구조는 변경하지 않는다.
- 캐시, 서버 배포, API 계약은 변경하지 않는다.
- 서버 준비 실패가 확인되면 기존 오류 안내와 비활성 상태를 유지한다.

---

### Task 1: 준비 전 파일 선택 보관과 자동 처리

**Files:**
- Modify: `services/mitunet/viewer/index.html`
- Test: `apps/web/src/app/floor-plan-3d/mitunet-internal-page.spec.ts`

**Interfaces:**
- Consumes: 기존 `enableLiveMode()`, `extractForReview(file)`, `#upload-btn`, `#file-input`
- Produces: 준비 전 선택 파일 하나를 보관하고 준비 완료 후 한 번 전달하는 초기화 흐름

- [x] **Step 1: 실패 테스트 작성**

초기 버튼에 `disabled`가 없고, 준비 전 파일을 `pendingUploadFile`에 보관하며, 성공 시 값을 비운 뒤 `extractForReview()`를 호출하는지 소스 계약으로 검증한다.

- [x] **Step 2: RED 확인**

Run: `cd apps/web && node --test -r ts-node/register src/app/floor-plan-3d/mitunet-internal-page.spec.ts`

Expected: 즉시 활성화·대기 파일 처리 코드가 없어 실패한다.

- [x] **Step 3: 최소 구현**

업로드 버튼과 파일 입력 이벤트를 초기화 시점에 연결한다. 준비 전에는 최신 파일 하나만 보관하고, `enableLiveMode()` 성공 시 보관값을 지운 뒤 분석한다. 실패 시에는 기존처럼 버튼을 비활성화한다.

- [x] **Step 4: GREEN 및 빌드 확인**

Run: `cd apps/web && node --test -r ts-node/register src/app/floor-plan-3d/mitunet-internal-page.spec.ts`

Expected: 관련 테스트가 모두 통과한다.

Run: `pnpm --filter web build`

Expected: exit code 0.

- [x] **Step 5: 커밋 및 메인 푸시**

```bash
git add services/mitunet/viewer/index.html apps/web/src/app/floor-plan-3d/mitunet-internal-page.spec.ts docs/superpowers/plans/2026-07-21-instant-floor-plan-upload-button.md
git commit -m "fix: enable floor plan upload immediately"
git push origin main
```
