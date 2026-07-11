import Link from "next/link";
import ManagerHomeTabs, {
  type ManagerBillingSummary,
  type ManagerContractRow,
  type ManagerListingRow,
  type ManagerTicketRow,
} from "./ManagerHomeTabs";
import {
  managerDashboardTicketHref,
  selectManagerCurrentTickets,
} from "./manager-dashboard-overview";

export interface ManagerDashboardOverviewProps {
  listingCount: number;
  contractCount: number;
  ticketCount: number;
  billingOutstanding: number | "—";
  listings: ManagerListingRow[];
  contracts: ManagerContractRow[];
  tickets: ManagerTicketRow[];
  billing: ManagerBillingSummary | null;
  ticketHubHref: string;
  billingHref: string;
  realtimeAgentHref: string;
}

export default function ManagerDashboardOverview({
  listingCount,
  contractCount,
  ticketCount,
  billingOutstanding,
  listings,
  contracts,
  tickets,
  billing,
  ticketHubHref,
  billingHref,
  realtimeAgentHref,
}: ManagerDashboardOverviewProps) {
  const kpis = [
    { label: "미계약 매물", value: listingCount, href: "/sell" },
    { label: "계약중인 집", value: contractCount, href: "/manager/contract/00" },
    { label: "진행 중 티켓", value: ticketCount, href: "/manager/ticket/dash/00" },
    { label: "수납 대기·연체", value: billingOutstanding, href: "/manager/billing/overdue" },
  ] as const;
  const currentTickets = selectManagerCurrentTickets(tickets);

  return (
    <div style={overviewStyle}>
      <section aria-labelledby="manager-dashboard-summary-title" style={sectionStyle}>
        <h2 id="manager-dashboard-summary-title" style={sectionTitleStyle}>
          운영 현황
        </h2>
        <div style={kpiGridStyle}>
          {kpis.map((kpi) => (
            <Link key={kpi.label} href={kpi.href} style={kpiCardStyle}>
              <span style={kpiLabelStyle}>{kpi.label}</span>
              <strong style={kpiValueStyle}>
                {typeof kpi.value === "number" ? `${kpi.value}건` : kpi.value}
              </strong>
              <span style={kpiActionStyle}>바로 확인</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="manager-current-work-title" style={panelStyle}>
        <div style={sectionHeaderStyle}>
          <h2 id="manager-current-work-title" style={sectionTitleStyle}>
            오늘 확인할 업무
          </h2>
          <Link href={ticketHubHref} style={sectionLinkStyle}>
            전체 티켓 보기
          </Link>
        </div>
        {currentTickets.length === 0 ? (
          <p style={emptyTextStyle}>현재 확인할 진행 중 티켓이 없습니다.</p>
        ) : (
          <div style={workListStyle}>
            {currentTickets.map((ticket) => (
              <Link key={ticket.id} href={managerDashboardTicketHref(ticket.id)} style={workRowStyle}>
                <div style={workCopyStyle}>
                  <strong style={workTitleStyle}>{ticket.title}</strong>
                  <span style={workCaptionStyle}>{ticket.unitId}</span>
                </div>
                <div style={workMetaStyle}>
                  {ticket.urgent ? <span style={urgentChipStyle}>긴급</span> : null}
                  <span style={statusChipStyle}>{ticket.statusLabel}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="manager-dashboard-details-title" style={sectionStyle}>
        <h2 id="manager-dashboard-details-title" style={sectionTitleStyle}>
          상세 보기
        </h2>
        <ManagerHomeTabs
          listings={listings}
          contracts={contracts}
          tickets={tickets}
          billing={billing}
          ticketHubHref={ticketHubHref}
          billingHref={billingHref}
          realtimeAgentHref={realtimeAgentHref}
        />
      </section>
    </div>
  );
}

const overviewStyle = {
  display: "grid",
  gap: "var(--space-xl)",
} as const;

const sectionStyle = {
  display: "grid",
  gap: "var(--space-md)",
} as const;

const sectionHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-md)",
  flexWrap: "wrap",
} as const;

const sectionTitleStyle = {
  margin: 0,
  color: "var(--on-surface)",
  fontSize: "var(--fs-subtitle)",
  fontWeight: "var(--fw-subtitle)",
  lineHeight: "var(--lh-subtitle)",
  textWrap: "balance",
} as const;

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
  gap: "var(--space-md)",
} as const;

const kpiCardStyle = {
  minHeight: "var(--list-item-min)",
  display: "grid",
  alignContent: "space-between",
  gap: "var(--space-sm)",
  padding: "var(--space-lg)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-container-lowest)",
  color: "var(--on-surface)",
  textDecoration: "none",
} as const;

const kpiLabelStyle = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  fontWeight: "var(--fw-subtitle)",
  lineHeight: "var(--lh-caption)",
} as const;

const kpiValueStyle = {
  color: "var(--primary)",
  fontSize: "var(--fs-title)",
  fontWeight: "var(--fw-title)",
  lineHeight: "var(--lh-title)",
  fontVariantNumeric: "tabular-nums",
} as const;

const kpiActionStyle = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  lineHeight: "var(--lh-caption)",
} as const;

const panelStyle = {
  display: "grid",
  gap: "var(--space-md)",
  padding: "var(--space-lg)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-container-lowest)",
} as const;

const sectionLinkStyle = {
  color: "var(--primary)",
  fontSize: "var(--fs-caption)",
  fontWeight: "var(--fw-subtitle)",
  textDecoration: "none",
} as const;

const emptyTextStyle = {
  margin: 0,
  color: "var(--on-surface-variant)",
  lineHeight: "var(--lh-body)",
  textWrap: "pretty",
} as const;

const workListStyle = {
  display: "grid",
} as const;

const workRowStyle = {
  minHeight: "var(--list-item-min)",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "var(--space-md)",
  padding: "var(--space-sm) 0",
  borderTop: "1px solid var(--border)",
  color: "inherit",
  textDecoration: "none",
} as const;

const workCopyStyle = {
  minWidth: 0,
  display: "grid",
  gap: "var(--space-xs)",
} as const;

const workTitleStyle = {
  overflow: "hidden",
  color: "var(--on-surface)",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

const workCaptionStyle = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  lineHeight: "var(--lh-caption)",
} as const;

const workMetaStyle = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-xs)",
} as const;

const statusChipStyle = {
  padding: "var(--space-xs) var(--space-sm)",
  borderRadius: "var(--radius-full)",
  background: "var(--chip-bg)",
  color: "var(--chip-on)",
  fontSize: "var(--fs-caption)",
  fontWeight: "var(--fw-subtitle)",
  lineHeight: "var(--lh-caption)",
  whiteSpace: "nowrap",
} as const;

const urgentChipStyle = {
  ...statusChipStyle,
  background: "var(--error-container)",
  color: "var(--on-error-container)",
} as const;
