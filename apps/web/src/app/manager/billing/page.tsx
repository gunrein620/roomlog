import Link from "next/link";
import { CircleAlert, CircleCheck } from "lucide-react";
import { getManagerBill, getManagerDashboard } from "@/lib/billing-manager-api";
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
  billId?: string | string[];
  published?: string | string[];
  publishError?: string | string[];
}>;

function single(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const building = single(params.building);
  const month = single(params.month);
  const created = Number(single(params.created));
  const billId = single(params.billId);
  const published = single(params.published) === "1";
  const publishError = single(params.publishError);
  const [data, initialBillDetail] = await Promise.all([
    getManagerDashboard({ building, month }),
    billId ? getManagerBill(billId) : Promise.resolve(undefined),
  ]);
  const hasBuildings = data.scope.buildings.length > 0;
  const createHref = buildBillingScopeHref("/manager/billing/new", {
    building: data.scope.selectedBuilding,
    month: data.billingMonth,
  });

  return (
    <BillingShell title="청구·수납 관리" active={routes.dashboard}>
      <div className={styles.workspace}>
        <BillingWorkspaceHeader
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
        {published ? (
          <div className={styles.successNotice} role="status">
            <CircleCheck aria-hidden="true" size={18} />
            청구가 확정됐습니다. 결제일 한 달 전부터 세입자에게 공개되고 납부할 수 있습니다.
          </div>
        ) : null}
        {publishError ? (
          <div className={styles.errorNotice} role="alert">
            <CircleAlert aria-hidden="true" size={18} />
            {publishError === "missing-bill" ? "확정할 청구 정보를 찾지 못했습니다." : publishError}
          </div>
        ) : null}
        {hasBuildings ? (
          <BillingDashboardWorkspace
            data={data}
            initialBillId={billId}
            initialBillDetail={initialBillDetail}
          />
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
