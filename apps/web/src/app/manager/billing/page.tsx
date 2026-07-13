import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { getManagerDashboard } from "@/lib/billing-manager-api";
import { buildBillingScopeHref } from "@/lib/billing-manager-workspace";
import { MHOME_ROUTES } from "@/lib/manager-home-nav";
import { BillingShell, routes } from "./_components";
import { BillingWorkspaceHeader } from "./BillingWorkspaceHeader";
import { BillingDashboardWorkspace } from "./BillingDashboardWorkspace";
import styles from "./billing-workspace.module.css";

type SearchParams = Promise<{
  building?: string | string[];
  month?: string | string[];
  created?: string | string[];
}>;

function single(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const building = single(params.building);
  const month = single(params.month);
  const created = Number(single(params.created));
  const data = await getManagerDashboard({ building, month });
  const hasBuildings = data.scope.buildings.length > 0;
  const createHref = buildBillingScopeHref("/manager/billing/new", {
    building: data.scope.selectedBuilding,
    month: data.billingMonth,
  });

  return (
    <BillingShell title="청구·수납 관리" active={routes.dashboard}>
      <div className={styles.workspace}>
        <BillingWorkspaceHeader
          eyebrow="종합 업무 화면"
          title="청구 대시보드"
          description="선택한 달의 수금, 최근 입금, 연체를 빠르게 확인하고 아래 원장에서 처리 대상을 찾습니다."
          basePath="/manager/billing"
          scope={data.scope}
          month={data.billingMonth}
          actionHref={hasBuildings ? createHref : MHOME_ROUTES["M-HOME-05"]}
          actionLabel={hasBuildings ? "청구서 생성" : "건물·호실 등록"}
        />
        {created > 0 ? (
          <div className={styles.successNotice} role="status">
            <CircleCheck aria-hidden="true" size={18} />
            {created}건의 청구 초안을 저장했습니다. 자동 발송되지 않았습니다.
          </div>
        ) : null}
        {hasBuildings ? (
          <BillingDashboardWorkspace data={data} />
        ) : (
          <section className={styles.section}>
            <div className={styles.emptyState}>
              <h2 className={styles.sectionTitle}>첫 건물 등록이 필요합니다.</h2>
              <p>건물과 호실을 등록하면 청구 범위와 계약 후보를 정확히 연결할 수 있습니다.</p>
              <Link className={styles.primaryLink} href={MHOME_ROUTES["M-HOME-05"]}>건물·호실 등록</Link>
            </div>
          </section>
        )}
      </div>
    </BillingShell>
  );
}
