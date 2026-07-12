# Manager Listing Detail Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 매물 카드를 클릭해 상세 팝업을 열고, 사진·3D 데이터를 보존하면서 기본 정보를 수정하거나 확인 후 매물을 내릴 수 있게 한다.

**Architecture:** 서버 페이지는 본인 매물을 조회·변환해 새 클라이언트 `ManagerListingBoard`에 전달한다. 클라이언트 보드는 네이티브 `<dialog>`의 조회·수정·삭제 확인 상태와 목록을 관리하고, 별도 API 모듈이 기존 Next BFF의 PATCH·DELETE 호출을 담당한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS Modules, Node test runner, `@roomlog/ui`

## Global Constraints

- 작업 브랜치는 `kms-property-management`이다.
- `.local-agents/local-infra-guard.prompt.md`를 따르고 인프라 파일은 수정하지 않는다.
- 관리자 화면은 `ManagerAppShell`을 유지한다.
- 스타일 값은 공유 CSS 변수만 사용하고 raw hex를 쓰지 않는다.
- 수정 요청에는 `images`와 `floorPlan`을 포함하지 않는다.
- 매물 내리기는 명시적 확인 후에만 DELETE한다.
- 새 API나 서버 계약을 만들지 않고 기존 `/api/trade/listings/:listingId` PATCH·DELETE를 사용한다.
- 기능 테스트, 전체 web 테스트, 빌드, `scripts/verify.sh`, Docker 브라우저 검증이 통과한 뒤 기능 변경만 커밋·푸시한다.

---

## File Structure

- `apps/web/src/app/manager/listing/manager-listing-model.ts`: 상세 조회·수정에 필요한 기본 필드를 포함하는 화면 모델과 단일 응답 변환 함수를 제공한다.
- `apps/web/src/app/manager/listing/manager-listing-model.spec.ts`: 소유자 필터와 상세 필드 변환을 검증한다.
- `apps/web/src/app/manager/listing/manager-listing-api.ts`: 기본 정보 PATCH, 매물 DELETE, 오류 정규화를 담당한다.
- `apps/web/src/app/manager/listing/manager-listing-api.spec.ts`: PATCH payload가 사진·3D를 제외하는지와 HTTP 오류를 검증한다.
- `apps/web/src/app/manager/listing/ManagerListingBoard.tsx`: 카드, dialog 조회·수정·삭제 확인 상태, 성공 후 로컬 목록 갱신을 담당한다.
- `apps/web/src/app/manager/listing/ManagerListingBoard.module.css`: 카드 버튼과 dialog 레이아웃을 공유 토큰으로 정의한다.
- `apps/web/src/app/manager/listing/manager-listing-board.spec.ts`: dialog 접근성, 수정·삭제 연결, 토큰 스타일을 소스 수준에서 검증한다.
- `apps/web/src/app/manager/listing/page.tsx`: 서버 조회 후 보드에 초기 목록을 전달하고 조회 실패 상태만 담당한다.
- `apps/web/src/app/manager/listing/manager-listing-page.spec.ts`: 새 보드 연결과 기존 등록·오류 흐름을 검증한다.

### Task 1: 상세 팝업, 기본 정보 수정, 매물 내리기

**Files:**
- Modify: `apps/web/src/app/manager/listing/manager-listing-model.ts`
- Modify: `apps/web/src/app/manager/listing/manager-listing-model.spec.ts`
- Create: `apps/web/src/app/manager/listing/manager-listing-api.ts`
- Create: `apps/web/src/app/manager/listing/manager-listing-api.spec.ts`
- Create: `apps/web/src/app/manager/listing/ManagerListingBoard.tsx`
- Create: `apps/web/src/app/manager/listing/ManagerListingBoard.module.css`
- Create: `apps/web/src/app/manager/listing/manager-listing-board.spec.ts`
- Modify: `apps/web/src/app/manager/listing/page.tsx`
- Modify: `apps/web/src/app/manager/listing/manager-listing-page.spec.ts`

**Interfaces:**
- Consumes: `TradeListing`, `toManagerListingRows`, `isDialogBackdropPoint`, `/api/trade/listings/:listingId` PATCH·DELETE.
- Produces: `toManagerListingRow(listing): ManagerListingRow`, `updateManagerListing(id, input): Promise<TradeListing>`, `removeManagerListing(id): Promise<void>`, `<ManagerListingBoard initialListings={rows} />`.

- [ ] **Step 1: 화면 모델 실패 테스트 확장**

기존 `manager-listing-model.spec.ts`의 본인 매물 기대값에 다음 필드를 추가하고 단일 변환 함수도 검증한다.

```ts
roomType: "원룸",
tradeType: "월세",
depositManwon: 1000,
monthlyRentManwon: 65,
location: "서울 성동구 성수동",
detailAddress: "101호",
description: "채광 좋은 원룸입니다.",
```

테스트 입력에도 `roomType`과 `description`을 추가한다. `toManagerListingRow(listings[0])`가 같은 상세 필드를 반환하는 assertion을 추가한다.

- [ ] **Step 2: API 실패 테스트 작성**

`manager-listing-api.spec.ts`를 만든다.

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildManagerListingUpdatePayload,
  removeManagerListing,
  updateManagerListing,
} from "./manager-listing-api";

const input = {
  title: "수정 매물",
  roomType: "투룸",
  tradeType: "월세" as const,
  depositManwon: 2000,
  monthlyRentManwon: 80,
  location: "서울 성동구",
  detailAddress: "202호",
  description: "수정 설명",
};

test("builds a basic-info-only update payload", () => {
  const payload = buildManagerListingUpdatePayload(input);
  assert.deepEqual(payload, input);
  assert.equal("images" in payload, false);
  assert.equal("floorPlan" in payload, false);
});

test("patches basic info and deletes only after the delete function is called", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return new Response(
      init?.method === "DELETE" ? JSON.stringify({ ok: true }) : JSON.stringify({ id: "listing-1", ...input }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  await updateManagerListing("listing-1", input, fetchImpl as typeof fetch);
  assert.equal(requests[0]?.init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), input);

  assert.equal(requests.length, 1);
  await removeManagerListing("listing-1", fetchImpl as typeof fetch);
  assert.equal(requests[1]?.init?.method, "DELETE");
});

test("surfaces the server error message", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ message: "내 매물만 수정할 수 있습니다." }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
  await assert.rejects(
    updateManagerListing("listing-1", input, fetchImpl as typeof fetch),
    /내 매물만 수정할 수 있습니다/,
  );
});
```

- [ ] **Step 3: 보드 구조 실패 테스트 작성**

`manager-listing-board.spec.ts`를 만든다.

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const component = readFileSync(join(__dirname, "ManagerListingBoard.tsx"), "utf8");
const css = readFileSync(join(__dirname, "ManagerListingBoard.module.css"), "utf8");

test("listing cards open an accessible native detail dialog", () => {
  assert.match(component, /aria-label=\{`\$\{listing\.title\} 상세정보 보기`\}/);
  assert.match(component, /dialogRef\.current\?\.showModal\(\)/);
  assert.match(component, /<dialog/);
  assert.match(component, /aria-labelledby="manager-listing-dialog-title"/);
  assert.match(component, /isDialogBackdropPoint/);
  assert.match(component, /aria-label="매물 상세정보 닫기"/);
});

test("detail dialog exposes edit and confirmed removal flows", () => {
  for (const text of ["수정", "매물 내리기", "수정 취소", "변경사항 저장", "정말 매물 내리기"]) {
    assert.match(component, new RegExp(text));
  }
  assert.match(component, /updateManagerListing/);
  assert.match(component, /removeManagerListing/);
  assert.match(component, /toManagerListingRow/);
  assert.match(component, /setListings\(\(current\) => current\.map/);
  assert.match(component, /setListings\(\(current\) => current\.filter/);
});

test("dialog styles use shared tokens without raw colors", () => {
  assert.match(css, /var\(--error\)/);
  assert.match(css, /var\(--surface-container-lowest\)/);
  assert.doesNotMatch(css, /#[\da-f]{3,8}/i);
});
```

기존 `manager-listing-page.spec.ts`에는 `ManagerListingBoard` import와 `<ManagerListingBoard initialListings={rows} />` 기대를 추가한다.

- [ ] **Step 4: RED 확인**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register \
  src/app/manager/listing/manager-listing-model.spec.ts \
  src/app/manager/listing/manager-listing-api.spec.ts \
  src/app/manager/listing/manager-listing-board.spec.ts \
  src/app/manager/listing/manager-listing-page.spec.ts
```

Expected: FAIL — 상세 모델 필드와 단일 변환 함수, API 모듈, 보드 컴포넌트가 아직 없다.

- [ ] **Step 5: 화면 모델 최소 구현**

`TradeListing`에 `roomType`, `description`을 추가하고 `ManagerListingRow`에 수정 가능한 원본 필드를 추가한다.

```ts
export interface ManagerListingRow {
  id: string;
  title: string;
  address: string;
  priceLabel: string;
  statusLabel: "노출중" | "계약완료";
  coverImage?: string;
  photoCount: number;
  has3D: boolean;
  createdAt: string;
  roomType: string;
  tradeType: "월세" | "전세" | "매매";
  depositManwon: number;
  monthlyRentManwon: number;
  location: string;
  detailAddress: string;
  description: string;
}

export function toManagerListingRow(listing: TradeListing): ManagerListingRow {
  return {
    id: listing.id,
    title: listing.title,
    address: [listing.location, listing.detailAddress].filter(Boolean).join(" "),
    priceLabel: priceLabel(listing),
    statusLabel: listing.status === "계약완료" ? "계약완료" : "노출중",
    coverImage: listing.images?.[0],
    photoCount: listing.images?.length ?? 0,
    has3D: Boolean(listing.floorPlan),
    createdAt: listing.createdAt,
    roomType: listing.roomType,
    tradeType: listing.tradeType,
    depositManwon: listing.depositManwon,
    monthlyRentManwon: listing.monthlyRentManwon,
    location: listing.location,
    detailAddress: listing.detailAddress ?? "",
    description: listing.description,
  };
}
```

`toManagerListingRows`는 owner 필터 후 `.map(toManagerListingRow)`와 최신순 정렬만 담당한다.

- [ ] **Step 6: API 최소 구현**

`manager-listing-api.ts`에 다음 인터페이스와 함수를 구현한다.

```ts
import type { TradeListing } from "./manager-listing-model";

export interface ManagerListingUpdateInput {
  title: string;
  roomType: string;
  tradeType: "월세" | "전세" | "매매";
  depositManwon: number;
  monthlyRentManwon: number;
  location: string;
  detailAddress: string;
  description: string;
}

export function buildManagerListingUpdatePayload(input: ManagerListingUpdateInput): ManagerListingUpdateInput {
  return {
    title: input.title.trim(),
    roomType: input.roomType.trim(),
    tradeType: input.tradeType,
    depositManwon: Number(input.depositManwon) || 0,
    monthlyRentManwon: Number(input.monthlyRentManwon) || 0,
    location: input.location.trim(),
    detailAddress: input.detailAddress.trim(),
    description: input.description.trim(),
  };
}

async function request<T>(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url, {
    ...init,
    headers: { Accept: "application/json", "Content-Type": "application/json", ...init.headers },
  });
  const data = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    throw new Error(message || "매물 요청을 처리하지 못했습니다.");
  }
  return data as T;
}

export function updateManagerListing(
  listingId: string,
  input: ManagerListingUpdateInput,
  fetchImpl: typeof fetch = fetch,
): Promise<TradeListing> {
  return request(`/api/trade/listings/${encodeURIComponent(listingId)}`, {
    method: "PATCH",
    body: JSON.stringify(buildManagerListingUpdatePayload(input)),
  }, fetchImpl);
}

export async function removeManagerListing(
  listingId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await request(`/api/trade/listings/${encodeURIComponent(listingId)}`, { method: "DELETE" }, fetchImpl);
}
```

- [ ] **Step 7: 클라이언트 보드 최소 구현**

`ManagerListingBoard.tsx`는 `"use client"`로 시작한다. 다음 상태와 이벤트를 구현한다.

```ts
type DialogMode = "view" | "edit" | "remove";
const [listings, setListings] = useState(initialListings);
const [selectedId, setSelectedId] = useState<string | null>(null);
const [mode, setMode] = useState<DialogMode>("view");
const [pending, setPending] = useState(false);
const [error, setError] = useState<string | null>(null);
const selected = listings.find((listing) => listing.id === selectedId) ?? null;
const dialogRef = useRef<HTMLDialogElement>(null);
```

카드는 `<button type="button">`으로 렌더링하고 클릭 시 selected id를 지정한 뒤 `requestAnimationFrame(() => dialogRef.current?.showModal())`로 dialog를 연다.

수정 form submit은 `FormData`에서 다음 payload만 만든다.

```ts
const payload = {
  title: String(data.get("title") ?? ""),
  roomType: String(data.get("roomType") ?? ""),
  tradeType: String(data.get("tradeType") ?? "월세") as ManagerListingUpdateInput["tradeType"],
  depositManwon: Number(data.get("depositManwon")) || 0,
  monthlyRentManwon: Number(data.get("monthlyRentManwon")) || 0,
  location: String(data.get("location") ?? ""),
  detailAddress: String(data.get("detailAddress") ?? ""),
  description: String(data.get("description") ?? ""),
};
```

성공 시 `const updatedRow = toManagerListingRow(await updateManagerListing(...))`를 만들고 `setListings((current) => current.map((item) => item.id === updatedRow.id ? updatedRow : item))`로 갱신한다.

삭제 확인 성공 시 `await removeManagerListing(selected.id)` 후 `setListings((current) => current.filter((item) => item.id !== selected.id))`, dialog close, selected id 초기화를 수행한다.

조회 상태에는 사진, 상태 badge, 3D 여부, 제목, 주소, 방 유형, 가격, 설명과 `수정`, `매물 내리기` 버튼을 표시한다. 수정 상태는 label이 연결된 input/select/textarea와 `수정 취소`, `변경사항 저장`을 표시한다. 삭제 상태는 되돌릴 수 없음과 문의 기록 유지 문구, `취소`, `정말 매물 내리기`를 표시한다.

`ManagerListingBoard.module.css`에는 `.cardButton`, `.dialog`, `.dialogHeader`, `.media`, `.detailGrid`, `.actions`, `.dangerButton`, `.error`, `.empty`를 정의하고 모든 색상은 `var(--...)`로 지정한다.

- [ ] **Step 8: 서버 페이지에 보드 연결**

`page.tsx`의 `ListingCard`와 목록 section을 제거하고 `ManagerListingBoard`를 import한다. 조회 성공 분기는 다음처럼 보드에 위임한다.

```tsx
{listingError ? (
  <Card>
    <strong>매물 목록을 불러오지 못했습니다</strong>
    <p>잠시 후 다시 시도해 주세요.</p>
  </Card>
) : (
  <ManagerListingBoard initialListings={rows} />
)}
```

- [ ] **Step 9: 대상 테스트 GREEN 확인**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register \
  src/app/manager/listing/manager-listing-model.spec.ts \
  src/app/manager/listing/manager-listing-api.spec.ts \
  src/app/manager/listing/manager-listing-board.spec.ts \
  src/app/manager/listing/manager-listing-page.spec.ts
```

Expected: PASS — 모델·API payload·dialog 구조·페이지 연결 테스트가 모두 통과한다.

- [ ] **Step 10: 전체 자동 검증**

Run:

```bash
pnpm test:web
pnpm --filter web build
bash scripts/verify.sh
```

Expected: 모든 명령 exit 0. 기존 web 테스트와 빌드, types·ui·api·스모크 검증에 실패가 없다.

- [ ] **Step 11: Docker 브라우저 검증**

Run:

```bash
docker compose up -d --build web
```

브라우저에서 `/manager/listing`을 열고 다음을 확인한다.

- 카드 클릭으로 dialog 열림
- `수정` 전환과 기본 정보 저장 성공
- 저장 전후 사진 수·3D badge 유지
- `매물 내리기` 첫 클릭에서 DELETE되지 않고 확인 화면 표시
- 취소 시 목록 유지
- console error와 Next error overlay 없음

실제 매물 삭제는 검증용 계정의 테스트 매물에만 수행한다.

- [ ] **Step 12: 범위 검사, 커밋, 푸시**

```bash
git diff --check
git diff --name-only
git add \
  apps/web/src/app/manager/listing/manager-listing-model.ts \
  apps/web/src/app/manager/listing/manager-listing-model.spec.ts \
  apps/web/src/app/manager/listing/manager-listing-api.ts \
  apps/web/src/app/manager/listing/manager-listing-api.spec.ts \
  apps/web/src/app/manager/listing/ManagerListingBoard.tsx \
  apps/web/src/app/manager/listing/ManagerListingBoard.module.css \
  apps/web/src/app/manager/listing/manager-listing-board.spec.ts \
  apps/web/src/app/manager/listing/page.tsx \
  apps/web/src/app/manager/listing/manager-listing-page.spec.ts \
  docs/superpowers/plans/2026-07-12-manager-listing-detail-dialog.md
git commit -m "feat(listing): add manager detail dialog"
git push origin kms-property-management
```

Expected: 인프라 파일과 기존 미추적 문서는 스테이징되지 않고 기능 파일만 원격 브랜치에 푸시된다.
