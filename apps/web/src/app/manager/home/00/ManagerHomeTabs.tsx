"use client";

// 관리 중인 집 홈 — 4개 탭으로 재편: 올려놓은 매물(미계약) / 계약중인 집 / 민원·하자 / AI 관리자.
// 데이터는 서버 컴포넌트(page.tsx)가 세션 기준으로 모아 props로 내려주고, 여기는 탭 전환만 담당한다.
// 계약중인 집은 행을 클릭하면 세입자 마이페이지(사는집)와 유사한 계약 상세 대시보드로 들어가고,
// 우측 하단 "세입자 채팅"이 해당 계약의 문의 스레드로 잠긴 대화 패널을 연다.

import Link from "next/link";
import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { TradeChatCenter } from "../../../_components/TradeChatCenter";

export interface ManagerListingRow {
  id: string;
  title: string;
  location: string;
  detailAddress?: string;
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
  /** 계약이 체결된 문의 스레드 — 상세 대시보드의 세입자 채팅이 여기에 잠긴다. */
  threadId: string;
}

export interface ManagerTicketRow {
  id: string;
  title: string;
  unitId: string;
  statusLabel: string;
  urgent: boolean;
}

/** 청구 요약 — null이면 조회 실패(지어내지 않고 실패 사실을 보여준다). */
export interface ManagerBillingSummary {
  total: number;
  pending: number;
  overdue: number;
}

const TABS = ["올려놓은 매물", "계약중인 집", "민원/하자", "AI 관리자"] as const;
type TabId = (typeof TABS)[number];

export default function ManagerHomeTabs({
  listings,
  contracts,
  tickets,
  billing,
  ticketHubHref,
  billingHref,
  realtimeAgentHref
}: {
  listings: ManagerListingRow[];
  contracts: ManagerContractRow[];
  tickets: ManagerTicketRow[];
  billing: ManagerBillingSummary | null;
  ticketHubHref: string;
  billingHref: string;
  realtimeAgentHref: string;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("올려놓은 매물");
  const [openContractId, setOpenContractId] = useState<string | null>(null);
  const openContract = contracts.find((contract) => contract.id === openContractId) ?? null;

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
              body="매물등록에서 매물을 올리면 계약 전 매물이 여기에 모입니다."
              action={<Link href="/sell" style={actionLinkStyle}>매물 등록하러 가기</Link>}
            />
          ) : (
            listings.map((listing) => (
              <div key={listing.id} style={rowStyle}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{listing.title}</div>
                  <div style={rowCaptionStyle}>
                    {listing.location} · 세부주소 {listing.detailAddress?.trim() || "없음"} · 사진 {listing.photoCount}장{listing.has3D ? " · 3D 연결" : ""}
                  </div>
                </div>
                <strong style={{ whiteSpace: "nowrap" }}>{listing.priceLabel}</strong>
                <span style={statusChipStyle("#e8f7ee", "#136c34")}>노출중 · 미계약</span>
              </div>
            ))
          )}
        </section>
      ) : null}

      {activeTab === "계약중인 집" ? (
        openContract ? (
          <ContractDashboard
            contract={openContract}
            tickets={tickets}
            billing={billing}
            ticketHubHref={ticketHubHref}
            billingHref={billingHref}
            onBack={() => setOpenContractId(null)}
          />
        ) : (
          <section style={panelStyle} aria-label="계약중인 집">
            {contracts.length === 0 ? (
              <EmptyState
                title="계약중인 집이 아직 없습니다"
                body="문의 채팅에서 '이 분과 계약하기'로 제안하고 상대가 수락하면 여기에 표시됩니다."
                action={<Link href="/?tab=inquiry" style={actionLinkStyle}>문의 채팅 열기</Link>}
              />
            ) : (
              contracts.map((contract) => (
                <button
                  key={contract.id}
                  type="button"
                  onClick={() => setOpenContractId(contract.id)}
                  aria-label={`${contract.listingTitle} 계약 상세 보기`}
                  style={{ ...rowStyle, width: "100%", background: "transparent", textAlign: "left", cursor: "pointer" }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contract.listingTitle}</div>
                    <div style={rowCaptionStyle}>
                      임차인 {contract.tenantName}
                      {contract.acceptedAtLabel ? ` · ${contract.acceptedAtLabel} 체결` : ""}
                    </div>
                  </div>
                  <strong style={{ whiteSpace: "nowrap" }}>{contract.priceLabel}</strong>
                  <span style={statusChipStyle("#eef2fb", "#31406a")}>계약중</span>
                </button>
              ))
            )}
          </section>
        )
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

// 계약중인 집 상세 — 세입자 마이페이지(사는집)와 같은 구성: 계약 상태 카드 + 요약 그리드 +
// 관리비·수리요청 카드, 우측 하단에 해당 문의 스레드로 잠긴 세입자 채팅.
function ContractDashboard({
  contract,
  tickets,
  billing,
  ticketHubHref,
  billingHref,
  onBack
}: {
  contract: ManagerContractRow;
  tickets: ManagerTicketRow[];
  billing: ManagerBillingSummary | null;
  ticketHubHref: string;
  billingHref: string;
  onBack: () => void;
}) {
  const [isTenantChatOpen, setIsTenantChatOpen] = useState(false);

  return (
    <section style={{ display: "grid", gap: "var(--space-md)" }} aria-label={`${contract.listingTitle} 계약 상세`}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-md)" }}>
        <button type="button" onClick={onBack} style={{ ...actionLinkStyle, border: "1px solid var(--border)", color: "var(--on-surface)", cursor: "pointer", background: "var(--surface-container-lowest)" }}>
          ← 계약중인 집 목록
        </button>
        <span style={statusChipStyle("#eef2fb", "#31406a")}>계약중</span>
      </div>

      <section style={{ ...panelStyle, gap: "var(--space-sm)" }} aria-label="집·계약 정보">
        <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: 800 }}>{contract.listingTitle}</div>
        <div style={{ color: "var(--on-surface-variant)" }}>{contract.location || "주소 미입력"}</div>
        <dl style={infoGridStyle}>
          <InfoItem label="세입자" value={contract.tenantName} />
          <InfoItem label="임대 조건" value={contract.priceLabel} />
          <InfoItem label="계약 체결일" value={contract.acceptedAtLabel || "정보 없음"} />
          <InfoItem label="계약 방식" value="문의 채팅 제안 · 수락" />
        </dl>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-md)" }}>
        <section style={{ ...panelStyle, alignContent: "start" }} aria-label="관리비·청구">
          <div style={cardHeadStyle}>
            <strong>관리비·청구</strong>
            <Link href={billingHref} style={cardHeadLinkStyle}>청구 관리</Link>
          </div>
          {billing ? (
            <dl style={infoGridStyle}>
              <InfoItem label="이번 달 청구" value={`${billing.total}건`} />
              <InfoItem label="수납 대기" value={`${billing.pending}건`} />
              <InfoItem label="연체" value={`${billing.overdue}건`} />
            </dl>
          ) : (
            <p style={mutedTextStyle}>청구 정보를 불러오지 못했습니다. 청구 관리에서 확인해주세요.</p>
          )}
        </section>

        <section style={{ ...panelStyle, alignContent: "start" }} aria-label="수리요청·민원">
          <div style={cardHeadStyle}>
            <strong>수리요청·민원 {tickets.length}건</strong>
            <Link href={ticketHubHref} style={cardHeadLinkStyle}>티켓 처리</Link>
          </div>
          {tickets.length === 0 ? (
            <p style={mutedTextStyle}>진행 중인 수리요청·민원이 없습니다.</p>
          ) : (
            tickets.slice(0, 4).map((ticket) => (
              <div key={ticket.id} style={{ ...rowStyle, minHeight: 48 }}>
                <div style={{ minWidth: 0, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.title}</div>
                {ticket.urgent ? <span style={statusChipStyle("#fdecec", "#b42222")}>긴급</span> : <span />}
                <span style={statusChipStyle("#eef2fb", "#31406a")}>{ticket.statusLabel}</span>
              </div>
            ))
          )}
        </section>
      </div>

      {/* 세입자 채팅 — 세입자 마이페이지의 '집주인 채팅'과 같은 패턴(공용 채팅 패널 클래스 재사용).
          계약이 체결된 문의 스레드에 잠겨, 관리인은 이 집 대화만 본다. */}
      <button
        className="tenant-landlord-chat-button"
        type="button"
        aria-expanded={isTenantChatOpen}
        aria-controls="manager-tenant-chat-panel"
        onClick={() => setIsTenantChatOpen(true)}
      >
        <MessageCircle size={18} strokeWidth={2.5} aria-hidden="true" />
        세입자 채팅
      </button>

      {isTenantChatOpen ? (
        <>
          <button
            className="tenant-chat-backdrop"
            type="button"
            aria-label="세입자 채팅 닫기"
            onClick={() => setIsTenantChatOpen(false)}
          />
          <aside
            className="tenant-chat-panel"
            id="manager-tenant-chat-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manager-tenant-chat-title"
          >
            <header className="tenant-chat-panel-head">
              <div>
                <span>{contract.tenantName} 세입자</span>
                <h2 id="manager-tenant-chat-title">세입자 채팅</h2>
                <p>{contract.listingTitle}</p>
              </div>
              <button type="button" onClick={() => setIsTenantChatOpen(false)} aria-label="세입자 채팅 닫기">
                <X size={18} strokeWidth={2.5} aria-hidden="true" />
              </button>
            </header>
            <div className="tenant-chat-panel-body">
              <TradeChatCenter
                roleFilter="owner"
                lockedThreadId={contract.threadId}
                emptyText="이 계약의 문의 대화를 찾지 못했습니다."
              />
            </div>
          </aside>
        </>
      ) : null}
    </section>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: 3 }}>
      <dt style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", fontWeight: 800 }}>{label}</dt>
      <dd style={{ margin: 0, fontWeight: 800 }}>{value}</dd>
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

const infoGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "var(--space-md)",
  margin: 0,
  paddingTop: "var(--space-sm)"
} as const;

const cardHeadStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-md)",
  minHeight: 32
} as const;

const cardHeadLinkStyle = {
  color: "var(--primary)",
  fontWeight: 800,
  fontSize: "var(--fs-caption)",
  textDecoration: "none"
} as const;

const mutedTextStyle = {
  color: "var(--on-surface-variant)",
  lineHeight: "var(--lh-body)"
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
