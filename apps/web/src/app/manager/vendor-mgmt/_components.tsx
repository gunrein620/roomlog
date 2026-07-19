import Link from "next/link";
import type { ReactNode } from "react";
import type {
  ManagerVendorView,
  VendorAccountProjectionStatus,
  VendorCatalogRecord,
  VendorCatalogSearchResult,
  VendorEstimate,
  VendorEstimateStatus,
  VendorJobSummary,
  VendorVerificationStatus,
} from "@roomlog/types";
import { vendorTradeLabel } from "@roomlog/types";
import { Badge } from "@roomlog/ui";
import { MANAGER_VENDOR_MGMT_PATHS } from "@/lib/vendor-mgmt-nav";
import { vendorJobStatusLabel as sharedVendorJobStatusLabel } from "@/lib/vendor-workflow-presenter";
import styles from "./VendorWorkspace.module.css";

export const accountStatusLabel: Record<VendorAccountProjectionStatus, string> = {
  ACTIVE: "계정 연결",
  DISABLED: "계정 비활성",
  UNLINKED: "계정 미연결",
};

export const verificationLabel: Record<VendorVerificationStatus, string> = {
  VERIFIED: "검증 완료",
  PENDING: "검증 중",
  REJECTED: "검증 반려",
};

export const assignmentBlockLabel: Record<
  VendorCatalogSearchResult["assignmentBlockReasons"][number],
  string
> = {
  UNVERIFIED: "운영 검증 필요",
  INACTIVE: "운영 중지 업체",
  ACCOUNT_UNLINKED: "업체 계정 미연결",
  NOT_REGISTERED: "내 업체 등록 필요",
};

const vendorEstimateStatusLabel: Record<VendorEstimateStatus, string> = {
  DRAFT: "작성 중",
  SUBMITTED: "검토 필요",
  VISIT_SCHEDULED: "방문 예정",
  DECLINED: "업체 거절",
  REVISION_REQUESTED: "수정 요청",
  APPROVED: "승인 완료",
  REJECTED: "견적 반려",
  WITHDRAWN: "업체 회수",
  SUPERSEDED: "이전 견적",
};

export function formatVendorJobStatus(status: string) {
  return sharedVendorJobStatusLabel(status);
}

export function formatVendorEstimateStatus(status: VendorEstimateStatus) {
  return vendorEstimateStatusLabel[status];
}

export function VendorPageStack({ children }: { children: ReactNode }) {
  return <div className={styles.pageStack}>{children}</div>;
}

export function VendorScreenHeader({
  eyebrow,
  title,
  description,
  actions,
  demo,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  demo?: boolean;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headerCopy}>
        <div className={styles.eyebrowRow}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          {demo ? <DemoDataBadge /> : null}
        </div>
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}

export function DemoDataBadge() {
  return <span className={styles.demoBadge}>데모 데이터</span>;
}

export function VendorSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function LinkButton({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <Link className={secondary ? styles.secondaryButton : styles.primaryButton} href={href}>
      {children}
    </Link>
  );
}

export function CatalogIdentity({ catalog }: { catalog: VendorCatalogRecord }) {
  return (
    <div>
      <strong className={styles.vendorName}>{catalog.businessName}</strong>
      <span className={styles.subtle}>{catalog.contactPerson} · {catalog.phone}</span>
    </div>
  );
}

export function TagList({ values }: { values: string[] }) {
  return (
    <div className={styles.tagList}>
      {values.map((value) => <span className={styles.tag} key={value}>{vendorTradeLabel(value)}</span>)}
    </div>
  );
}

export function ManagerVendorTable({
  vendors,
}: {
  vendors: ManagerVendorView[];
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>업체</th>
            <th>전문 분야</th>
            <th>진행 현황</th>
            <th>관리 상태</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((vendor) => (
            <tr key={vendor.id}>
              <td>
                <Link className={styles.rowLink} href={MANAGER_VENDOR_MGMT_PATHS.vendor(vendor.vendorId)}>
                  <CatalogIdentity catalog={vendor.catalog} />
                </Link>
              </td>
              <td><TagList values={vendor.catalog.trades} /></td>
              <td>
                <span className={styles.statusStack}>
                  <span>진행 {vendor.activeJobCount}건</span>
                  <span>결제 대기 {vendor.waitingPaymentCount}건</span>
                </span>
              </td>
              <td><StatusPill active={vendor.status === "ACTIVE"}>{vendor.status === "ACTIVE" ? "등록" : "보관"}</StatusPill></td>
              <td>
                <div className={styles.managementActions}>
                  <Link className={styles.detailButton} href={MANAGER_VENDOR_MGMT_PATHS.vendor(vendor.vendorId)}>
                    상세 보기
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusPill({ active, children }: { active: boolean; children: ReactNode }) {
  return <span className={active ? styles.statusPositive : styles.statusMuted}>{children}</span>;
}

export function MetricGrid({
  metrics,
}: {
  metrics: Array<{ label: string; value: ReactNode; note?: string }>;
}) {
  return (
    <div className={styles.metricGrid}>
      {metrics.map((metric) => (
        <article className={styles.metricCard} key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          {metric.note ? <small>{metric.note}</small> : null}
        </article>
      ))}
    </div>
  );
}

export function KeyValueGrid({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className={styles.keyValueGrid}>
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function JobTable({ jobs }: { jobs: VendorJobSummary[] }) {
  if (jobs.length === 0) return <EmptyState title="아직 작업 이력이 없습니다" description="업체를 배정하면 견적과 완료 내역이 이곳에 쌓입니다." />;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th>작업</th><th>위치</th><th>상태</th><th>최신 견적</th><th>최근 갱신</th></tr></thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.repairId}>
              <td><strong>{job.title}</strong><span className={styles.subtle}>{vendorTradeLabel(job.trade)}</span></td>
              <td>{job.publicLocation}</td>
              <td>{formatVendorJobStatus(job.status)}</td>
              <td>{formatWon(job.latestEstimate?.totalAmount)}</td>
              <td>{formatDate(job.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EstimateSummary({ estimate }: { estimate: VendorEstimate }) {
  return (
    <div className={styles.estimateCard}>
      <div className={styles.estimateHeader}>
        <div>
          <Badge emphasis>{formatVendorEstimateStatus(estimate.status)}</Badge>
          <h3>견적 v{estimate.version}</h3>
          <p>{estimate.workDescription ?? estimate.declineReason ?? "현장 확인이 필요한 견적입니다."}</p>
        </div>
        <strong>{formatWon(estimate.totalAmount)}</strong>
      </div>
      {estimate.lineItems.length > 0 ? (
        <div className={styles.lineItems}>
          {estimate.lineItems.map((item) => (
            <div key={item.id}>
              <span>{item.description}<small>{item.quantity} × {formatWon(item.unitAmount)}</small></span>
              <strong>{formatWon(item.lineAmount)}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className={styles.emptyState}><strong>{title}</strong><p>{description}</p></div>;
}

export function ErrorState({ title = "업체 정보를 불러오지 못했습니다", message }: { title?: string; message: string }) {
  return <div className={styles.errorState} role="alert"><strong>{title}</strong><p>{message}</p></div>;
}

export function formatWon(amount?: number) {
  return amount === undefined ? "-" : `${amount.toLocaleString("ko-KR")}원`;
}

export function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(value));
}

export { styles };
