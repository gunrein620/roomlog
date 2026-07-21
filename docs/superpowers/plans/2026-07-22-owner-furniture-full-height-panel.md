# Owner Furniture Full-height Panel Implementation Plan

> **For agentic workers:** Implement this single task directly and verify it before publishing.

**Goal:** 등록자 가구 배치 패널에 기존 전체화면 스타일을 적용해 세로 공간을 충분히 쓰고 타이포 규격을 맞춘다.

**Architecture:** 등록자 페이지 루트에 기존 `is-3d-simulation-open` 상태 클래스만 연결한다. 공용 패널의 너비·전체 높이·내부 스크롤 규칙을 재사용하고, 같은 범위에서 텍스트 크기와 굵기만 보정한다.

**Tech Stack:** React, TypeScript, CSS, Node.js `node:test`

### Task 1: 등록자 전체화면 패널 연결

**Files:**
- Modify: `apps/web/src/app/floor-plan-3d/owner-furniture/OwnerFurnitureSimulation.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/app/floor-plan-3d/owner-furniture/owner-furniture-page.spec.ts`
- Test: `apps/web/src/app/_components/listing-tour-room3d-owner.spec.ts`

- [x] 전체화면 상태 클래스와 타이포 계약의 실패 테스트를 작성하고 RED를 확인한다.
- [x] 등록자 루트에 상태 클래스를 추가하고 패널 내부 타이포를 최소 범위로 정리한다.
- [x] 관련 테스트와 web 빌드를 실행한다.
- [x] 변경을 검토하고 `main`에 커밋·푸시한다.
