import Link from "next/link";
import { Card } from "@roomlog/ui";
import { ManagerAppShell } from "@/app/manager/_components/ManagerAppShell";
import { requireUser } from "@/lib/session";
import { serverFetch } from "@/lib/server-api";
import { ManagerListingBoard } from "./ManagerListingBoard";
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

type SearchParams = Promise<{ status?: string }>;

export default async function ManagerListingPage({ searchParams }: { searchParams: SearchParams }) {
  const { status } = await searchParams;
  const activeStatus = status === "available" ? "available" : "contracted";
  const user = await requireUser("LANDLORD");
  let rows: ManagerListingRow[] = [];
  let listingError = false;

  try {
    const listings = await serverFetch<TradeListing[]>("/trade/listings?mine=1");
    rows = toManagerListingRows(listings, user.userId);
  } catch {
    listingError = true;
  }

  return (
    <ManagerAppShell title="매물 관리" context="관리 중인 집 · 매물">
      <div style={{ display: "grid", gap: "var(--space-lg)" }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "var(--space-lg)",
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "var(--fs-title)" }}>등록한 매물</h1>
            <p style={{ color: "var(--on-surface-variant)" }}>
              현재 노출 상태와 등록 정보를 한곳에서 확인합니다.
            </p>
          </div>
          <Link href="/sell" style={linkStyle}>새 매물 등록</Link>
        </header>

        {listingError ? (
          <Card>
            <strong>매물 목록을 불러오지 못했습니다</strong>
            <p>잠시 후 다시 시도해 주세요.</p>
          </Card>
        ) : (
          <ManagerListingBoard initialListings={rows} activeStatus={activeStatus} />
        )}
      </div>
    </ManagerAppShell>
  );
}
