# Manager Listing Media Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 매물 상세 팝업의 수정 모드에서 기존 사진을 개별 관리하고 새 사진을 추가하며, 3D 도면을 에디터 스냅샷·JSON 업로드·연결 해제로 변경할 수 있게 한다.

**Architecture:** `manager-listing-media.ts`가 사진 병합과 3D JSON 정규화를 담당하고, `manager-listing-api.ts`가 사진 업로드 후 최종 PATCH를 담당한다. `ManagerListingBoard`는 서버에 저장된 미디어와 저장 전 후보를 분리해 관리하며, 모든 업로드와 PATCH가 성공한 뒤에만 목록 행을 교체한다.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, native `FormData`, Node test runner, CSS Modules, Docker Compose

## Global Constraints

- 기존 사진을 유지한 상태에서 개별 삭제와 새 사진 추가를 지원한다.
- 전체 사진은 최대 10장이며 첫 번째 사진이 대표 사진이다.
- 3D 도면은 `/floor-plan-3d` 에디터 스냅샷, JSON 업로드, 연결 해제를 지원한다.
- 사진 업로드 또는 PATCH 실패 시 기존 서버 데이터와 로컬 목록 상태를 변경하지 않는다.
- `packages/ui/src/tokens.css`의 토큰만 사용하고 raw hex 색상은 추가하지 않는다.
- 인프라 파일과 기존의 관련 없는 미추적 파일은 수정하거나 커밋하지 않는다.
- 각 기능 묶음은 대상 테스트 통과 후 `kms-property-management` 브랜치에 커밋·푸시한다.

---

### Task 1: 편집 가능한 사진·3D 모델과 정규화 유틸리티

**Files:**
- Create: `apps/web/src/app/manager/listing/manager-listing-media.ts`
- Create: `apps/web/src/app/manager/listing/manager-listing-media.spec.ts`
- Modify: `apps/web/src/app/manager/listing/manager-listing-model.ts`
- Modify: `apps/web/src/app/manager/listing/manager-listing-model.spec.ts`

**Interfaces:**
- Consumes: `TradeListing.images`, `TradeListing.floorPlan`
- Produces: `ManagerListingRow.images: string[]`, `ManagerListingRow.floorPlan: ListingFloorPlan | null`, `mergeManagerListingPhotos`, `parseManagerListingFloorPlan`, `readManagerListingFloorPlanSnapshot`

- [ ] **Step 1: 사진 병합과 3D JSON 정규화의 실패 테스트 작성**

```ts
const validWall = {
  id: "wall-1",
  wall_id: 1,
  dimensions: { width: 3, height: 2.4, depth: 0.15 },
  position: [0, 1.2, 0],
  rotation: [0, 0, 0],
};
const imageFile = (name: string) => new File(["image"], name, { type: "image/jpeg" });

test("keeps existing photos and appends selected files up to ten", () => {
  const merged = mergeManagerListingPhotos(["/old-1.jpg"], [imageFile("new-1.jpg")]);
  assert.deepEqual(merged.existingUrls, ["/old-1.jpg"]);
  assert.equal(merged.newFiles.length, 1);
});

test("normalizes a compatible floor plan JSON and rejects empty walls", () => {
  assert.equal(parseManagerListingFloorPlan(JSON.stringify({ walls3D: [validWall] }))?.walls3D.length, 1);
  assert.equal(parseManagerListingFloorPlan(JSON.stringify({ walls3D: [] })), null);
});
```

- [ ] **Step 2: 대상 테스트를 실행해 새 유틸리티가 없어 실패하는지 확인**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/manager/listing/manager-listing-media.spec.ts src/app/manager/listing/manager-listing-model.spec.ts
```

Expected: `manager-listing-media` 모듈 또는 새 행 필드가 없어 FAIL.

- [ ] **Step 3: 미디어 타입과 순수 정규화 함수 구현**

```ts
export const MAX_MANAGER_LISTING_PHOTOS = 10;
export const MANAGER_LISTING_FLOOR_PLAN_STORAGE_KEY = "roomlogListingFloorPlan3D";

export interface ListingFloorPlan {
  walls3D: Array<Record<string, unknown>>;
  furnitures: Array<Record<string, unknown>>;
  name?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseManagerListingFloorPlan(raw: string): ListingFloorPlan | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const root = isRecord(parsed) ? parsed : null;
    const room3d = root && isRecord(root.room3d) ? root.room3d : null;
    const wallsValue = root?.walls3D ?? root?.walls ?? room3d?.walls3D ?? room3d?.walls;
    const walls3D = Array.isArray(wallsValue) ? wallsValue.filter(isRecord) : [];
    if (walls3D.length === 0) return null;
    const furnituresValue = root?.furnitures ?? room3d?.furnitures;
    return {
      walls3D,
      furnitures: Array.isArray(furnituresValue) ? furnituresValue.filter(isRecord) : [],
      ...(typeof root?.name === "string" ? { name: root.name } : {}),
    };
  } catch {
    return null;
  }
}
```

`mergeManagerListingPhotos`는 기존 URL과 새 `File`을 중복 없이 합치고 총 10장을 넘기거나 이미지가 아닌 파일이 포함되면 한국어 오류를 던진다. `toManagerListingRow`는 원본 `images`와 유효한 `floorPlan`을 보존한다.

- [ ] **Step 4: 대상 테스트 통과 확인**

Run: Step 2와 동일.

Expected: 모든 대상 테스트 PASS.

- [ ] **Step 5: 모델·유틸리티 커밋 및 푸시**

```bash
git add apps/web/src/app/manager/listing/manager-listing-media.ts apps/web/src/app/manager/listing/manager-listing-media.spec.ts apps/web/src/app/manager/listing/manager-listing-model.ts apps/web/src/app/manager/listing/manager-listing-model.spec.ts docs/superpowers/plans/2026-07-12-manager-listing-media-edit.md
git commit -m "feat(listing): model editable listing media"
git push origin kms-property-management
```

---

### Task 2: 사진 업로드와 미디어 포함 PATCH 계약

**Files:**
- Modify: `apps/web/src/app/manager/listing/manager-listing-api.ts`
- Modify: `apps/web/src/app/manager/listing/manager-listing-api.spec.ts`

**Interfaces:**
- Consumes: `ManagerListingUpdateInput.images`, `ManagerListingUpdateInput.floorPlan`, 새 이미지 `File[]`
- Produces: `uploadManagerListingPhotos(files, fetchImpl): Promise<string[]>`, 미디어를 포함하는 `updateManagerListing`

- [ ] **Step 1: 업로드와 PATCH 원자성 실패 테스트 작성**

```ts
const imageFile = (name: string) => new File(["image"], name, { type: "image/jpeg" });
const floorPlan = { walls3D: [{ id: "wall-1" }], furnitures: [] };
const basicInput = {
  title: "테스트 매물",
  roomType: "원룸",
  tradeType: "월세" as const,
  depositManwon: 5000,
  monthlyRentManwon: 50,
  location: "서울시 강남구",
  detailAddress: "101호",
  description: "설명",
};
const requests: Array<{ url: string; body?: string }> = [];
const fetchImpl = (async (url: string, init?: RequestInit) => {
  requests.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
  if (url === "/api/trade/uploads") {
    return new Response(JSON.stringify({ images: ["/uploads/new.jpg"] }), { status: 200 });
  }
  return new Response(JSON.stringify({ id: "listing-1", ...basicInput, images: [], floorPlan }), { status: 200 });
}) as typeof fetch;

test("uploads new photos and includes final media in the patch", async () => {
  const uploaded = await uploadManagerListingPhotos([imageFile("new.jpg")], fetchImpl);
  assert.deepEqual(uploaded, ["/uploads/new.jpg"]);

  await updateManagerListing("listing-1", {
    ...basicInput,
    images: ["/old.jpg", ...uploaded],
    floorPlan,
  }, fetchImpl);
  const patchRequest = requests.find((request) => request.url.includes("listing-1"));
  assert.deepEqual(JSON.parse(patchRequest?.body ?? "{}"), {
    ...basicInput,
    images: ["/old.jpg", "/uploads/new.jpg"],
    floorPlan,
  });
});
```

- [ ] **Step 2: 대상 테스트를 실행해 업로드 함수와 미디어 입력이 없어 실패하는지 확인**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/manager/listing/manager-listing-api.spec.ts
```

Expected: `uploadManagerListingPhotos` 또는 `images`/`floorPlan` 입력이 없어 FAIL.

- [ ] **Step 3: 멀티파트 업로드와 미디어 payload 구현**

```ts
export async function uploadManagerListingPhotos(files: readonly File[], fetchImpl = fetch) {
  if (files.length === 0) return [];
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  const response = await fetchImpl("/api/trade/uploads", { method: "POST", body: form });
  const data = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(data?.message || "사진 업로드에 실패했습니다.");
  return Array.isArray(data?.images) ? data.images : [];
}
```

`request`는 멀티파트 요청에 JSON Content-Type을 강제로 붙이지 않는다. `buildManagerListingUpdatePayload`는 최종 `images` 배열과 `floorPlan` 객체 또는 `null`을 보존한다.

- [ ] **Step 4: API 대상 테스트 통과 확인**

Run: Step 2와 동일.

Expected: 모든 API 대상 테스트 PASS.

- [ ] **Step 5: API 계약 커밋 및 푸시**

```bash
git add apps/web/src/app/manager/listing/manager-listing-api.ts apps/web/src/app/manager/listing/manager-listing-api.spec.ts
git commit -m "feat(listing): update listing photos and floor plan"
git push origin kms-property-management
```

---

### Task 3: 수정 팝업 사진·3D 관리 UI

**Files:**
- Modify: `apps/web/src/app/manager/listing/ManagerListingBoard.tsx`
- Modify: `apps/web/src/app/manager/listing/ManagerListingBoard.module.css`
- Modify: `apps/web/src/app/manager/listing/manager-listing-board.spec.ts`

**Interfaces:**
- Consumes: Task 1의 미디어 유틸리티와 Task 2의 업로드/PATCH API
- Produces: 기존 사진 삭제, 새 사진 추가, 3D 에디터 연결, JSON 교체, 연결 해제를 지원하는 수정 폼

- [ ] **Step 1: 수정 UI와 저장 순서 실패 테스트 작성**

```ts
test("edit mode exposes photo and floor plan controls", () => {
  assert.match(source, /사진 추가/);
  assert.match(source, /사진 1 삭제/);
  assert.match(source, /3D 도면 다시 열기/);
  assert.match(source, /도면 JSON 업로드/);
  assert.match(source, /3D 연결 해제/);
});

test("uploads new photos before patching the listing", () => {
  assert.ok(source.indexOf("uploadManagerListingPhotos") < source.indexOf("updateManagerListing"));
});
```

- [ ] **Step 2: 대상 테스트를 실행해 미디어 컨트롤이 없어 실패하는지 확인**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/manager/listing/manager-listing-board.spec.ts
```

Expected: 사진 및 3D 수정 컨트롤이 없어 FAIL.

- [ ] **Step 3: 수정 후보 상태와 사진 UI 구현**

수정 모드 진입 시 다음 상태를 선택 행으로 초기화한다.

```ts
setExistingImages([...selected.images]);
setNewPhotoFiles([]);
setFloorPlanDraft(selected.floorPlan);
```

기존 사진과 새 사진 미리보기를 하나의 그리드로 표시하고 각 항목에 `사진 N 삭제` 버튼을 둔다. 파일 입력은 `accept="image/*" multiple`이며 선택 시 `mergeManagerListingPhotos`로 검증한다.

- [ ] **Step 4: 3D 변경 UI와 저장 흐름 구현**

`/floor-plan-3d` 링크는 새 탭으로 열고, `focus`와 `visibilitychange`에서 로컬 스냅샷을 읽는다. JSON 입력은 `accept=".json,application/json"`으로 제한하고 유효한 후보만 반영한다. 연결 해제는 `setFloorPlanDraft(null)`을 호출한다.

저장 시 새 사진 업로드 → 기존 URL과 업로드 URL 결합 → 기본정보·사진·3D PATCH 순으로 실행하고, 성공 후에만 `toManagerListingRow` 결과로 목록을 교체한다.

- [ ] **Step 5: 접근성 및 토큰 기반 스타일 추가**

사진 그리드, 미디어 섹션, 상태 문구, 삭제 버튼 스타일을 CSS Module에 추가한다. 모든 색상과 간격은 `var(--...)` 토큰을 사용한다.

- [ ] **Step 6: 수정 UI 대상 테스트 통과 확인**

Run: Step 2와 동일.

Expected: 모든 UI 대상 테스트 PASS.

- [ ] **Step 7: 전체 웹 테스트와 기본 검증 실행**

```bash
pnpm test:web
bash scripts/verify.sh
```

Expected: 웹 테스트 0 failures, verify 전체 통과.

- [ ] **Step 8: Docker 웹 재빌드 및 실제 화면 검증**

```bash
docker compose up -d --build web
docker compose ps
curl -fsS http://localhost:4000/api/health
```

브라우저에서 `/manager/listing`을 열어 수정 모드에 사진·3D 컨트롤이 노출되고 콘솔 오류가 없는지 확인한다. 실제 사용자 매물의 저장 또는 삭제는 수행하지 않는다.

- [ ] **Step 9: UI 커밋 및 푸시**

```bash
git add apps/web/src/app/manager/listing/ManagerListingBoard.tsx apps/web/src/app/manager/listing/ManagerListingBoard.module.css apps/web/src/app/manager/listing/manager-listing-board.spec.ts
git commit -m "feat(listing): edit listing photos and 3d plan"
git push origin kms-property-management
```
