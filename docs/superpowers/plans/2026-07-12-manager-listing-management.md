# Manager Listing Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 워크스페이스의 `매물 관리` 메뉴에서 로그인한 집주인의 등록 매물을 목록으로 보고, 기존 등록 화면으로 이동할 수 있게 한다.

**Architecture:** `/manager/listing` 서버 페이지가 LANDLORD 세션을 확인하고 기존 `/trade/listings` 응답을 조회한다. 순수 변환 함수가 로그인 사용자의 매물만 화면 모델로 바꾸며, 페이지는 기존 `ManagerAppShell`과 UI 토큰 컴포넌트로 목록·빈 상태·오류 상태를 렌더링한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Node test runner, `@roomlog/ui`

## Global Constraints

- 작업 브랜치는 `kms-property-management`이다.
- `.local-agents/local-infra-guard.prompt.md`를 따르고 인프라 파일은 수정하지 않는다.
- 스타일 값은 `packages/ui/src/tokens.css`의 CSS 변수만 사용하고 raw hex를 쓰지 않는다.
- 관리자 화면은 `ManagerAppShell`을 사용한다.
- 새 API, 데모 폴백, 매물 등록 폼 변경은 추가하지 않는다.
- 기능 테스트와 web 회귀 테스트가 통과한 뒤 기능 변경만 커밋하고 푸시한다.

---

## File Structure

- `apps/web/src/lib/manager-navigation.ts`: `매물 관리`를 관리자 내부 경로로 연결하고 활성 경로를 정의한다.
- `apps/web/src/lib/manager-navigation.spec.ts`: 내부 라우팅과 외부 링크 제거를 회귀 테스트한다.
- `apps/web/property-shell.spec.mjs`: 관리자 역할 진입 경로의 기존 실패 기대를 현재 홈 경로로 바로잡고 새 매물 관리 경로 존재를 확인한다.
- `apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`: 승인된 관리자 내비게이션 소스 변경에 맞춰 기존 무결성 해시를 갱신한다.
- `apps/web/src/app/manager/listing/manager-listing-model.ts`: API 매물을 본인 소유 화면 모델로 변환하는 순수 함수와 타입을 제공한다.
- `apps/web/src/app/manager/listing/manager-listing-model.spec.ts`: 소유자 필터, 가격, 사진, 3D 표시 변환을 검증한다.
- `apps/web/src/app/manager/listing/page.tsx`: 인증, 조회, 목록·빈 상태·오류 상태 렌더링을 담당한다.
- `apps/web/src/app/manager/listing/manager-listing-page.spec.ts`: 관리자 셸, 등록 링크, 상태 분기를 소스 수준에서 검증한다.

### Task 1: 관리자 매물 목록 기능

**Files:**
- Modify: `apps/web/src/lib/manager-navigation.ts`
- Modify: `apps/web/src/lib/manager-navigation.spec.ts`
- Modify: `apps/web/property-shell.spec.mjs`
- Modify: `apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`
- Create: `apps/web/src/app/manager/listing/manager-listing-model.ts`
- Create: `apps/web/src/app/manager/listing/manager-listing-model.spec.ts`
- Create: `apps/web/src/app/manager/listing/page.tsx`
- Create: `apps/web/src/app/manager/listing/manager-listing-page.spec.ts`

**Interfaces:**
- Consumes: `requireUser("LANDLORD")`, `serverFetch<TradeListing[]>("/trade/listings")`, `ManagerAppShell`, `Badge`, `Card`, CSS token variables.
- Produces: `MANAGER_LISTING_PATH = "/manager/listing"`, `toManagerListingRows(listings, ownerId): ManagerListingRow[]`, `/manager/listing` 관리자 페이지.

기준선에서 이미 실패한 `keeps tenant, manager, and vendor entry routes available` 테스트의 manager 기대값은 실제 역할 진입 경로인 `/manager/home/00`으로 바로잡는다. 같은 테스트에서 `/manager/listing/page.tsx` 존재도 검증해 관리자 매물 경로의 회귀를 막는다.

- [ ] **Step 1: 내비게이션 실패 테스트 작성**

`apps/web/src/lib/manager-navigation.spec.ts`에서 기존 외부 링크 기대를 내부 링크 기대와 활성 경로 기대으로 바꾼다.

```ts
it("keeps listing management inside the manager workspace", () => {
  const listing = items.find((item) => item.id === "listing");
  assert.equal(listing?.href, "/manager/listing");
  assert.equal(listing?.external, undefined);
  assert.deepEqual(getManagerNavState("/manager/listing"), {
    activeItemId: "listing",
    activeChildHref: null,
  });
});
```

기존 `marks prototype home links and the external listing link` 테스트는 대시보드 데모 링크만 검증하도록 이름과 마지막 assertion을 정리하고, `/sell` 활성 상태 기대는 `/manager/listing`으로 교체한다.

- [ ] **Step 2: 내비게이션 테스트가 올바르게 실패하는지 확인**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/lib/manager-navigation.spec.ts
```

Expected: FAIL — 실제 `listing.href`가 `/sell`이고 `external`이 `true`라서 새 기대와 불일치한다.

- [ ] **Step 3: 목록 모델 실패 테스트 작성**

`apps/web/src/app/manager/listing/manager-listing-model.spec.ts`를 만든다.

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { toManagerListingRows, type TradeListing } from "./manager-listing-model";

const listings: TradeListing[] = [
  {
    id: "mine-monthly",
    ownerId: "owner-1",
    title: "성수 햇살 원룸",
    location: "서울 성동구 성수동",
    detailAddress: "101호",
    tradeType: "월세",
    depositManwon: 1000,
    monthlyRentManwon: 65,
    status: "노출중",
    images: ["/listing-studio.jpg"],
    floorPlan: { rooms: [] },
    createdAt: "2026-07-12T00:00:00.000Z",
  },
  {
    id: "other-owner",
    ownerId: "owner-2",
    title: "다른 집주인 매물",
    location: "서울 강남구",
    tradeType: "전세",
    depositManwon: 30000,
    monthlyRentManwon: 0,
    status: "노출중",
    images: [],
    createdAt: "2026-07-11T00:00:00.000Z",
  },
];

test("maps only the signed-in landlord listings to manager rows", () => {
  assert.deepEqual(toManagerListingRows(listings, "owner-1"), [
    {
      id: "mine-monthly",
      title: "성수 햇살 원룸",
      address: "서울 성동구 성수동 101호",
      priceLabel: "월세 1,000/65",
      statusLabel: "노출중",
      coverImage: "/listing-studio.jpg",
      photoCount: 1,
      has3D: true,
      createdAt: "2026-07-12T00:00:00.000Z",
    },
  ]);
});
```

- [ ] **Step 4: 목록 모델 테스트가 모듈 부재로 실패하는지 확인**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/manager/listing/manager-listing-model.spec.ts
```

Expected: FAIL — `manager-listing-model` 모듈을 찾을 수 없다.

- [ ] **Step 5: 페이지 구조 실패 테스트 작성**

`apps/web/src/app/manager/listing/manager-listing-page.spec.ts`를 만든다.

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSource = readFileSync(join(__dirname, "page.tsx"), "utf8");

test("manager listing page keeps the manager shell and registration entry", () => {
  assert.match(pageSource, /requireUser\("LANDLORD"\)/);
  assert.match(pageSource, /<ManagerAppShell title="매물 관리"/);
  assert.match(pageSource, /href="\/sell"/);
  assert.match(pageSource, />새 매물 등록<\/Link>/);
});

test("manager listing page renders list, empty, and error states without demo data", () => {
  assert.match(pageSource, /serverFetch<TradeListing\[]>\("\/trade\/listings"\)/);
  assert.match(pageSource, /toManagerListingRows\(listings, user\.userId\)/);
  assert.match(pageSource, /등록한 매물/);
  assert.match(pageSource, /등록된 매물이 없습니다/);
  assert.match(pageSource, /매물 목록을 불러오지 못했습니다/);
  assert.doesNotMatch(pageSource, /demo/i);
});
```

- [ ] **Step 6: 페이지 테스트가 파일 부재로 실패하는지 확인**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/manager/listing/manager-listing-page.spec.ts
```

Expected: FAIL — `page.tsx`를 읽을 수 없다.

- [ ] **Step 7: 내비게이션 최소 구현**

`apps/web/src/lib/manager-navigation.ts`에 상수를 추가하고 `listing` 항목을 내부 경로로 바꾼다.

```ts
export const MANAGER_LISTING_PATH = "/manager/listing";

{
  id: "listing",
  label: "매물 관리",
  href: MANAGER_LISTING_PATH,
  icon: "listing",
  activePrefixes: [MANAGER_LISTING_PATH],
  children: [],
},
```

- [ ] **Step 8: 목록 모델 최소 구현**

`apps/web/src/app/manager/listing/manager-listing-model.ts`를 만든다.

```ts
export interface TradeListing {
  id: string;
  ownerId: string;
  title: string;
  location: string;
  detailAddress?: string;
  tradeType: "월세" | "전세" | "매매";
  depositManwon: number;
  monthlyRentManwon: number;
  status?: "노출중" | "계약완료";
  images?: string[];
  floorPlan?: unknown;
  createdAt: string;
}

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
}

function priceLabel(listing: TradeListing): string {
  const deposit = listing.depositManwon.toLocaleString("ko-KR");
  if (listing.tradeType === "월세") return `월세 ${deposit}/${listing.monthlyRentManwon.toLocaleString("ko-KR")}`;
  return `${listing.tradeType} ${deposit}만`;
}

export function toManagerListingRows(
  listings: readonly TradeListing[],
  ownerId: string,
): ManagerListingRow[] {
  return listings
    .filter((listing) => listing.ownerId === ownerId)
    .map<ManagerListingRow>((listing) => ({
      id: listing.id,
      title: listing.title,
      address: [listing.location, listing.detailAddress].filter(Boolean).join(" "),
      priceLabel: priceLabel(listing),
      statusLabel: listing.status === "계약완료" ? "계약완료" : "노출중",
      coverImage: listing.images?.[0],
      photoCount: listing.images?.length ?? 0,
      has3D: Boolean(listing.floorPlan),
      createdAt: listing.createdAt,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
```

- [ ] **Step 9: 관리자 목록 페이지 최소 구현**

`apps/web/src/app/manager/listing/page.tsx`를 만든다. `listingError`는 조회 실패 여부만 담고, 실패 시 가짜 목록을 만들지 않는다.

```tsx
import Link from "next/link";
import { Badge, Card } from "@roomlog/ui";
import { ManagerAppShell } from "@/app/manager/_components/ManagerAppShell";
import { requireUser } from "@/lib/session";
import { serverFetch } from "@/lib/server-api";
import {
  toManagerListingRows,
  type ManagerListingRow,
  type TradeListing,
} from "./manager-listing-model";

export const dynamic = "force-dynamic";

const linkStyle = {
  minHeight: "var(--touch-target)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 var(--space-lg)",
  borderRadius: "var(--radius-btn)",
  background: "var(--primary)",
  color: "var(--on-primary)",
  textDecoration: "none",
  fontWeight: 800,
} as const;

function ListingCard({ listing }: { listing: ManagerListingRow }) {
  return (
    <Card style={{ display: "grid", gridTemplateColumns: "minmax(120px, 180px) 1fr", gap: "var(--space-lg)" }}>
      <div style={{ minHeight: 120, borderRadius: "var(--radius)", overflow: "hidden", background: "var(--surface-container-high)" }}>
        {listing.coverImage ? (
          <img src={listing.coverImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : null}
      </div>
      <div style={{ display: "grid", gap: "var(--space-sm)", alignContent: "center" }}>
        <div style={{ display: "flex", gap: "var(--space-xs)", flexWrap: "wrap" }}>
          <Badge emphasis={listing.statusLabel === "노출중"}>{listing.statusLabel}</Badge>
          <Badge>사진 {listing.photoCount}장</Badge>
          <Badge>{listing.has3D ? "3D 연결" : "3D 미연결"}</Badge>
        </div>
        <strong style={{ fontSize: "var(--fs-subtitle)" }}>{listing.title}</strong>
        <span style={{ color: "var(--on-surface-variant)" }}>{listing.address}</span>
        <span style={{ fontWeight: 800 }}>{listing.priceLabel}</span>
      </div>
    </Card>
  );
}

export default async function ManagerListingPage() {
  const user = await requireUser("LANDLORD");
  let rows: ManagerListingRow[] = [];
  let listingError = false;

  try {
    const listings = await serverFetch<TradeListing[]>("/trade/listings");
    rows = toManagerListingRows(listings, user.userId);
  } catch {
    listingError = true;
  }

  return (
    <ManagerAppShell title="매물 관리" context="관리 중인 집 · 매물">
      <div style={{ display: "grid", gap: "var(--space-lg)" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-lg)", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "var(--fs-title)" }}>등록한 매물</h1>
            <p style={{ color: "var(--on-surface-variant)" }}>현재 노출 상태와 등록 정보를 한곳에서 확인합니다.</p>
          </div>
          <Link href="/sell" style={linkStyle}>새 매물 등록</Link>
        </header>

        {listingError ? (
          <Card><strong>매물 목록을 불러오지 못했습니다</strong><p>잠시 후 다시 시도해 주세요.</p></Card>
        ) : rows.length === 0 ? (
          <Card><strong>등록된 매물이 없습니다</strong><p>새 매물을 등록하면 이곳에서 관리할 수 있습니다.</p><Link href="/sell" style={linkStyle}>새 매물 등록</Link></Card>
        ) : (
          <section aria-label="등록한 매물 목록" style={{ display: "grid", gap: "var(--space-md)" }}>
            {rows.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
          </section>
        )}
      </div>
    </ManagerAppShell>
  );
}
```

- [ ] **Step 10: 대상 테스트 통과 확인**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register \
  src/lib/manager-navigation.spec.ts \
  src/app/manager/listing/manager-listing-model.spec.ts \
  src/app/manager/listing/manager-listing-page.spec.ts
pnpm --filter web exec node --test property-shell.spec.mjs
```

Expected: PASS — 내비게이션, 본인 매물 변환, 세 가지 화면 상태 검증이 모두 통과한다.

- [ ] **Step 11: web 전체 회귀 테스트와 빌드 확인**

Run:

```bash
pnpm test:web
pnpm --filter web build
```

Expected: 두 명령 모두 exit 0. 테스트 실패 0건, Next.js production build 성공.

- [ ] **Step 12: 변경 범위와 인프라 가드 확인**

Run:

```bash
git diff --check
git diff --name-only
```

Expected: whitespace 오류가 없고, 이 계획의 web 코드·테스트·계획 문서 외 인프라 파일은 변경되지 않는다.

- [ ] **Step 13: 기능 커밋 및 푸시**

```bash
git add \
  apps/web/src/lib/manager-navigation.ts \
  apps/web/src/lib/manager-navigation.spec.ts \
  apps/web/property-shell.spec.mjs \
  apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts \
  apps/web/src/app/manager/listing/manager-listing-model.ts \
  apps/web/src/app/manager/listing/manager-listing-model.spec.ts \
  apps/web/src/app/manager/listing/page.tsx \
  apps/web/src/app/manager/listing/manager-listing-page.spec.ts \
  docs/superpowers/plans/2026-07-12-manager-listing-management.md
git commit -m "feat(listing): add manager listing dashboard"
git push origin kms-property-management
```

Expected: 기능 파일만 커밋되고 `origin/kms-property-management` 푸시가 성공한다.
