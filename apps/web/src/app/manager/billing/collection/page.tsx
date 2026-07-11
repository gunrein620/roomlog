import Link from "next/link";
import { getManagerCollection } from "@/lib/billing-manager-api";
import { buildBillingScopeHref } from "@/lib/billing-manager-workspace";
import { MHOME_ROUTES } from "@/lib/manager-home-nav";
import { BillingShell, routes } from "../_components";
import { BillingWorkspaceHeader } from "../BillingWorkspaceHeader";
import { CollectionWorkspace } from "../CollectionWorkspace";
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
  const data = await getManagerCollection({
    building: single(params.building),
    month: single(params.month),
  });
  const createHref = buildBillingScopeHref("/manager/billing/new", {
    building: data.scope.selectedBuilding,
    month: data.billingMonth,
  });
  const hasBuildings = data.scope.buildings.length > 0;

  return (
    <BillingShell title="청구·수납 관리" active={routes.collection}>
      <div className={styles.workspace}>
        <BillingWorkspaceHeader
          eyebrow="성과 분석"
          title="수금 현황"
          description="기간 추이와 건물별 성과를 비교해 수금이 떨어진 지점을 찾습니다. 월세와 관리비를 억지로 비교하지 않습니다."
          basePath="/manager/billing/collection"
          scope={data.scope}
          month={data.billingMonth}
          actionHref={hasBuildings ? createHref : MHOME_ROUTES["M-HOME-05"]}
          actionLabel={hasBuildings ? "청구서 생성" : "건물·호실 등록"}
        />
        {hasBuildings ? (
          <CollectionWorkspace data={data} />
        ) : (
          <section className={styles.section}>
            <div className={styles.emptyState}>
              <h2 className={styles.sectionTitle}>분석할 건물이 없습니다.</h2>
              <p>건물과 호실을 등록하면 월별·건물별 수금 성과를 확인할 수 있습니다.</p>
              <Link className={styles.primaryLink} href={MHOME_ROUTES["M-HOME-05"]}>건물·호실 등록</Link>
            </div>
          </section>
        )}
      </div>
    </BillingShell>
  );
}
