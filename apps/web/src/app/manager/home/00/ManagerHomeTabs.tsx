"use client";

// 관리 중인 집 홈 — 4개 탭으로 재편: 올려놓은 매물(미계약) / 계약중인 집 / 민원·하자 / AI 관리자.
// 데이터는 서버 컴포넌트(page.tsx)가 세션 기준으로 모아 props로 내려주고, 여기는 탭 전환만 담당한다.

import Link from "next/link";
import { useState } from "react";

export interface ManagerListingRow {
  id: string;
  title: string;
  location: string;
  priceLabel: string;
  photoCount: number;
  has3D: boolean;
}

export interface ManagerContractRow {
  id: string;
  listingTitle: string;
  location: string;
  tenantName: string;
  priceLabel: string;
  acceptedAtLabel: string;
}

export interface ManagerTicketRow {
  id: string;
  title: string;
  unitId: string;
  statusLabel: string;
  urgent: boolean;
}

const TABS = ["올려놓은 매물", "계약중인 집", "민원/하자", "AI 관리자"] as const;
type TabId = (typeof TABS)[number];

export default function ManagerHomeTabs({
  listings,
  contracts,
  tickets,
  ticketHubHref,
  realtimeAgentHref
}: {
  listings: ManagerListingRow[];
  contracts: ManagerContractRow[];
  tickets: ManagerTicketRow[];
  ticketHubHref: string;
  realtimeAgentHref: string;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("올려놓은 매물");

  return (
    <div style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div role="tablist" aria-label="관리 중인 집 탭" style={tabBarStyle}>
        {TABS.map((tab) => {
          const count =
            tab === "올려놓은 매물" ? listings.length
            : tab === "계약중인 집" ? contracts.length
            : tab === "민원/하자" ? tickets.length
            : null;
          const active = tab === activeTab;
          return (
            <button
              key={tab}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setActiveTab(tab)}
              style={{
                ...tabStyle,
                background: active ? "var(--primary)" : "var(--surface-container-lowest)",
                color: active ? "var(--on-primary)" : "var(--on-surface)",
                border: active ? "1.5px solid var(--primary)" : "1px solid var(--border)"
              }}
            >
              {tab === "올려놓은 매물" ? "올려놓은 매물 (미계약)" : tab}
              {count !== null ? <span style={countBadgeStyle(active)}>{count}</span> : null}
            </button>
          );
        })}
      </div>

      {activeTab === "올려놓은 매물" ? (
        <section style={panelStyle} aria-label="올려놓은 매물">
          {listings.length === 0 ? (
            <EmptyState
              title="아직 올려놓은 매물이 없어요"
              body="마이페이지에서 매물을 등록하면 계약 전 매물이 여기에 모입니다."
              action={<Link href="/?tab=mypage" style={actionLinkStyle}>매물 등록하러 가기</Link>}
            />
          ) : (
            listings.map((listing) => (
              <div key={listing.id} style={rowStyle}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{listing.title}</div>
                  <div style={rowCaptionStyle}>{listing.location} · 사진 {listing.photoCount}장{listing.has3D ? " · 3D 연결" : ""}</div>
                </div>
                <strong style={{ whiteSpace: "nowrap" }}>{listing.priceLabel}</strong>
                <span style={statusChipStyle("#e8f7ee", "#136c34")}>노출중 · 미계약</span>
              </div>
            ))
          )}
        </section>
      ) : null}

      {activeTab === "계약중인 집" ? (
        <section style={panelStyle} aria-label="계약중인 집">
          {contracts.length === 0 ? (
            <EmptyState
              title="계약중인 집이 아직 없습니다"
              body="문의 채팅에서 '이 분과 계약하기'로 제안하고 상대가 수락하면 여기에 표시됩니다."
              action={<Link href="/?tab=inquiry" style={actionLinkStyle}>문의 채팅 열기</Link>}
            />
          ) : (
            contracts.map((contract) => (
              <div key={contract.id} style={rowStyle}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contract.listingTitle}</div>
                  <div style={rowCaptionStyle}>
                    임차인 {contract.tenantName}
                    {contract.acceptedAtLabel ? ` · ${contract.acceptedAtLabel} 체결` : ""}
                  </div>
                </div>
                <strong style={{ whiteSpace: "nowrap" }}>{contract.priceLabel}</strong>
                <span style={statusChipStyle("#eef2fb", "#31406a")}>계약중</span>
              </div>
            ))
          )}
        </section>
      ) : null}

      {activeTab === "민원/하자" ? (
        <section style={panelStyle} aria-label="민원과 하자">
          {tickets.length === 0 ? (
            <EmptyState title="접수된 민원·하자가 없습니다" body="임차인이 하자를 접수하면 여기로 들어옵니다." />
          ) : (
            <>
              {tickets.map((ticket) => (
                <div key={ticket.id} style={rowStyle}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800 }}>{ticket.title}</div>
                    <div style={rowCaptionStyle}>{ticket.unitId}</div>
                  </div>
                  {ticket.urgent ? <span style={statusChipStyle("#fdecec", "#b42222")}>긴급</span> : <span />}
                  <span style={statusChipStyle("#eef2fb", "#31406a")}>{ticket.statusLabel}</span>
                </div>
              ))}
              <Link href={ticketHubHref} style={{ ...actionLinkStyle, justifySelf: "end", marginTop: "var(--space-sm)" }}>
                티켓 처리로 이동
              </Link>
            </>
          )}
        </section>
      ) : null}

      {activeTab === "AI 관리자" ? (
        <section style={panelStyle} aria-label="AI 관리자">
          <EmptyState
            title="실시간 AI 운영 에이전트"
            body="음성·텍스트로 티켓 처리, 청구 관리, 소통 작업을 진행합니다."
            action={<Link href={realtimeAgentHref} style={actionLinkStyle}>AI agent</Link>}
          />
        </section>
      ) : null}
    </div>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "grid", justifyItems: "start", gap: "var(--space-sm)", padding: "var(--space-xl) var(--space-md)" }}>
      <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: 800 }}>{title}</div>
      <div style={{ color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>{body}</div>
      {action ?? null}
    </div>
  );
}

const tabBarStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "var(--space-sm)"
} as const;

const tabStyle = {
  minHeight: "var(--touch-target)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-xs)",
  padding: "0 var(--space-md)",
  borderRadius: "var(--radius-btn)",
  fontWeight: 800,
  cursor: "pointer"
} as const;

const countBadgeStyle = (active: boolean) =>
  ({
    minWidth: 22,
    padding: "2px 7px",
    borderRadius: 999,
    background: active ? "rgba(255, 255, 255, 0.24)" : "var(--surface-container-high)",
    fontSize: "var(--fs-caption)",
    fontWeight: 800,
    textAlign: "center"
  }) as const;

const panelStyle = {
  display: "grid",
  gap: "var(--space-xs)",
  padding: "var(--space-md) var(--space-lg)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  background: "var(--surface-container-lowest)"
} as const;

const rowStyle = {
  minHeight: 64,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto auto",
  gap: "var(--space-md)",
  alignItems: "center",
  borderBottom: "1px solid var(--border)"
} as const;

const rowCaptionStyle = {
  marginTop: 2,
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)"
} as const;

const statusChipStyle = (bg: string, color: string) =>
  ({
    padding: "4px 10px",
    borderRadius: 999,
    background: bg,
    color,
    fontSize: "var(--fs-caption)",
    fontWeight: 800,
    whiteSpace: "nowrap"
  }) as const;

const actionLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 40,
  padding: "0 var(--space-lg)",
  borderRadius: "var(--radius-btn)",
  border: "1.5px solid var(--primary)",
  color: "var(--primary)",
  fontWeight: 800,
  textDecoration: "none"
} as const;
