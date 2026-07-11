import Link from "next/link";
import { redirect } from "next/navigation";
import { getManagerBillCreationOptions } from "@/lib/billing-manager-api";
import { buildBillingScopeHref } from "@/lib/billing-manager-workspace";
import { MHOME_ROUTES } from "@/lib/manager-home-nav";
import { BillingShell, routes } from "../_components";
import { BillingWorkspaceHeader } from "../BillingWorkspaceHeader";
import { ManagerBillCreateForm } from "../ManagerBillCreateForm";
import styles from "../billing-workspace.module.css";

type SearchParams = Promise<{
  building?: string | string[];
  month?: string | string[];
}>;

function single(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requestedBuilding = single(params.building);
  const data = await getManagerBillCreationOptions({
    building: requestedBuilding,
    month: single(params.month),
  });
  if (!requestedBuilding && data.scope.buildings[0]) {
    redirect(
      buildBillingScopeHref("/manager/billing/new", {
        building: data.scope.buildings[0].buildingName,
        month: data.billingMonth,
      }),
    );
  }

  return (
    <BillingShell title="청구·수납 관리" active={routes.dashboard}>
      <div className={styles.workspace}>
        <BillingWorkspaceHeader
          eyebrow="계약 기반 초안"
          title="청구서 생성"
          description="확정된 활성 계약을 기준으로 월세와 관리비 청구 초안을 여러 호실에 한 번에 만듭니다."
          basePath="/manager/billing/new"
          scope={data.scope}
          month={data.billingMonth}
        />
        {data.scope.buildings.length ? (
          <ManagerBillCreateForm data={data} />
        ) : (
          <section className={styles.section}>
            <div className={styles.emptyState}>
              <h2 className={styles.sectionTitle}>청구할 건물이 없습니다.</h2>
              <p>먼저 건물과 호실을 등록한 뒤 확정 계약을 연결해주세요.</p>
              <Link className={styles.primaryLink} href={MHOME_ROUTES["M-HOME-05"]}>건물·호실 등록</Link>
            </div>
          </section>
        )}
      </div>
    </BillingShell>
  );
}
