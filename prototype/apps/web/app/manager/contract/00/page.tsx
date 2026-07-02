import Link from "next/link";
import { Input } from "@roomlog/ui";
import { getManagerContractDashboard } from "@/lib/contract-manager-api";
import { MANAGER_CONTRACT_ROUTES } from "@/lib/contract-manager-nav";
import {
  Badge,
  Card,
  ContractShell,
  Grid,
  LinkButton,
  MetricCard,
  PageStack,
  Section,
  SourceBadge,
  formatDate,
  linkReset,
} from "../_components";

export default async function Page() {
  const dashboard = await getManagerContractDashboard();
  const sortedRows = [...dashboard.rows].sort((a, b) => {
    const score = (row: (typeof dashboard.rows)[number]) =>
      Number(row.slaOverdue) * 4 + Number(row.needsCheckCount > 0) * 3 + Number(row.contract.review === "pending") * 2;
    return score(b) - score(a) || a.daysToExpire - b.daysToExpire;
  });

  return (
    <ContractShell id="M-DOC-00" title="계약서 검토·확정 대시보드">
      <PageStack>
        <Grid columns={4}>
          <MetricCard label="검토 대기" value={`${dashboard.counts.pending}건`} note="임차인·관리자 업로드 유입" />
          <MetricCard label="확인 필요" value={`${dashboard.counts.needsCheck}개`} note="OCR 원문 대조 필요" />
          <MetricCard label="SLA 초과" value={`${dashboard.counts.slaOverdue}건`} note="장기 미확정 출구 표시" />
          <MetricCard label="미등록 호실" value={`${dashboard.counts.unregistered}호`} note="수동값 또는 초대 필요" />
        </Grid>

        <Card style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-lg)", alignItems: "center" }}>
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
              <Badge emphasis>확인필요 {dashboard.counts.needsCheck}</Badge>
              <Badge emphasis={dashboard.counts.slaOverdue > 0}>SLA 경과 {dashboard.counts.slaOverdue}</Badge>
              <Badge>만료 예정 {dashboard.counts.expiringSoon}</Badge>
              <Badge>삭제 요청 {dashboard.counts.deletionRequests}</Badge>
            </div>
            <Input aria-label="계약 검색" placeholder="건물, 호실, 임차인 검색" readOnly />
          </div>
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <LinkButton href={MANAGER_CONTRACT_ROUTES["M-DOC-02"]}>계약서 등록</LinkButton>
            <LinkButton href={MANAGER_CONTRACT_ROUTES["M-DOC-03"]} variant="secondary">호실·타임라인</LinkButton>
            <LinkButton href={MANAGER_CONTRACT_ROUTES["M-DOC-04"]} variant="secondary">임차인 초대</LinkButton>
          </div>
        </Card>

        <Section title="계약 목록 · 검토대기/확인필요/SLA 초과 상단">
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            {sortedRows.map((row) => (
              <Link key={row.contract.id} href={`${MANAGER_CONTRACT_ROUTES["M-DOC-01"]}?id=${row.contract.id}`} style={linkReset}>
                <Card
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "var(--space-lg)",
                    alignItems: "center",
                    border: row.slaOverdue || row.needsCheckCount > 0 ? "1.5px solid var(--primary)" : "1px solid var(--border)",
                  }}
                >
                  <div style={{ display: "grid", gap: "var(--space-sm)" }}>
                    <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
                      <Badge emphasis={row.contract.review === "pending"}>{row.statusLabel}</Badge>
                      {row.slaOverdue ? <Badge emphasis>SLA 초과</Badge> : null}
                      <SourceBadge origin={row.origin} />
                      {row.mobileQuickConfirm ? <Badge>모바일 1탭 가능</Badge> : null}
                    </div>
                    <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: 800 }}>
                      {row.buildingName} {row.contract.unitId}호 · {row.tenantName}
                    </div>
                    <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>
                      계약월 {formatDate(row.contract.startDate ?? row.contract.createdAt)} · 만료 D-{row.daysToExpire} · 확인필요 {row.needsCheckCount}
                    </div>
                  </div>
                  <Badge emphasis>검토 열기</Badge>
                </Card>
              </Link>
            ))}
          </div>
        </Section>

        <Section
          title="보관·삭제 처리"
          action={<LinkButton href={MANAGER_CONTRACT_ROUTES["M-DOC-05"]} variant="secondary">삭제 큐 열기</LinkButton>}
        >
          <Card style={{ color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>
            삭제 요청은 완료, 제한 보관, 삭제 불가를 분리해 임차인에게 정직하게 고지합니다.
            법정 보관과 정산 예외는 처리 게이트에서 다시 확인합니다.
          </Card>
        </Section>
      </PageStack>
    </ContractShell>
  );
}
