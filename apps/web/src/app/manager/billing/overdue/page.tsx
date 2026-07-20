import Link from "next/link";
import { getManagerOverdue } from "@/lib/billing-manager-api";
import { MHOME_ROUTES } from "@/lib/manager-home-nav";
import { BillingShell, routes } from "../_components";
import { BillingWorkspaceHeader } from "../BillingWorkspaceHeader";
import { OverdueWorkspace } from "../OverdueWorkspace";
import styles from "../billing-workspace.module.css";

type SearchParams = Promise<{ building?: string | string[] }>;

function single(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { building } = await searchParams;
  const data = await getManagerOverdue(single(building));
  const hasBuildings = data.scope.buildings.length > 0;

  return (
    <BillingShell title="청구·수납 관리" active={routes.overdue}>
      <div className={styles.workspace}>
        <BillingWorkspaceHeader
          basePath="/manager/billing/overdue"
          scope={data.scope}
          asOf={data.asOf}
          actionHref={hasBuildings ? undefined : MHOME_ROUTES["M-HOME-05"]}
          actionLabel={hasBuildings ? undefined : "건물·호실 등록"}
        />
        {hasBuildings ? (
          <OverdueWorkspace data={data} />
        ) : (
          <section className={styles.section}>
            <div className={styles.emptyState}>
              <h2 className={styles.sectionTitle}>관리할 건물이 없습니다.</h2>
              <p>건물과 호실을 등록하면 연체 케이스를 청구서와 안전하게 연결할 수 있습니다.</p>
              <Link className={styles.primaryLink} href={MHOME_ROUTES["M-HOME-05"]}>건물·호실 등록</Link>
            </div>
          </section>
        )}
      </div>
    </BillingShell>
  );
}
