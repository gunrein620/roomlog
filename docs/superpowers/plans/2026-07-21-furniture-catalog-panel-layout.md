# Furniture Catalog Panel Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가구 패널에서 `내 가구`와 `등록 가구`를 가로 탭으로 분리하고, 더 큰 이미지와 잘리지 않는 전체 정보를 제공한다.

**Architecture:** `ListingTourRoom3D`에 소스 탭 상태 하나를 추가하고 기존 두 목록을 조건부 렌더링한다. 전체화면 hero 패널에만 폭과 카드 크기 CSS를 확장해 다른 가구 배치 화면의 조작과 데이터 계약은 유지한다.

**Tech Stack:** React, TypeScript, CSS, Node.js `node:test`

## Global Constraints

- 기존 가구 선택·배치·저장 동작은 변경하지 않는다.
- 새 스타일 값은 기존 CSS 토큰을 사용한다.
- 이름, 크기, 브랜드 텍스트에 말줄임표를 사용하지 않는다.
- 별도 컴포넌트나 상태관리 계층을 만들지 않는다.

---

### Task 1: 가구 소스 탭과 확대 카드

**Files:**
- Modify: `apps/web/src/app/_components/ListingTourRoom3D.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/app/_components/listing-tour-room3d-owner.spec.ts`

**Interfaces:**
- Consumes: 기존 `tenantFurnitures`, `visibleFurnitureCatalog`, 가구 선택 핸들러
- Produces: `furnitureSourceTab: "mine" | "catalog"` 상태와 접근 가능한 가로 탭 UI

- [x] **Step 1: 실패 테스트 작성**

소스에 `내 가구`, `등록 가구` 탭 계약과 전체화면 패널 확대·텍스트 줄바꿈 CSS가 존재하는지 검증한다.

- [x] **Step 2: RED 확인**

Run: `cd apps/web && node --test -r ts-node/register src/app/_components/listing-tour-room3d-owner.spec.ts`

Expected: 소스 탭과 확대 카드 스타일이 없어 실패한다.

- [x] **Step 3: 최소 구현**

`ListingTourRoom3D`에 소스 탭 두 개를 추가하고 선택된 목록만 렌더링한다. 전체화면 패널 폭을 460px로 조정하고 이미지 크기를 82px로 확대하며 카드 텍스트의 말줄임표를 제거한다.

- [x] **Step 4: 검증**

Run: `cd apps/web && node --test -r ts-node/register src/app/_components/listing-tour-room3d-owner.spec.ts`

Expected: 관련 테스트가 모두 통과한다.

Run: `pnpm --filter web build`

Expected: exit code 0.

- [x] **Step 5: 메인 반영**

```bash
git add apps/web/src/app/_components/ListingTourRoom3D.tsx apps/web/src/app/_components/listing-tour-room3d-owner.spec.ts apps/web/src/app/globals.css docs/superpowers/specs/2026-07-21-owner-furniture-first-person-flow-design.md docs/superpowers/plans/2026-07-21-furniture-catalog-panel-layout.md
git commit -m "feat: improve furniture catalog panel"
git push origin main
```
