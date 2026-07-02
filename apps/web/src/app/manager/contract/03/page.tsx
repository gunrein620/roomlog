import Link from "next/link";
import { Input } from "@roomlog/ui";
import { getManagerContractDetail } from "@/lib/contract-manager-api";
import { MANAGER_CONTRACT_ROUTES } from "@/lib/contract-manager-nav";
import {
  BackLink,
  Badge,
  Card,
  ContractShell,
  Grid,
  LinkButton,
  MetaRow,
  PageStack,
  Section,
  StaticButton,
  formatDate,
  formatDateTime,
  linkReset,
} from "../_components";

export default async function Page() {
  const detail = await getManagerContractDetail();
  const contract = detail.row.contract;

  return (
    <ContractShell id="M-DOC-03" title="호실·임차인·계약 정보 / 타임라인">
      <PageStack>
        <Card style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-lg)", alignItems: "center" }}>
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            <BackLink />
            <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
              <Badge emphasis>{detail.row.buildingName}</Badge>
              <Badge>{contract.unitId}호</Badge>
              <Badge>{detail.tenant.residentState}</Badge>
              <Badge emphasis={contract.valueSource === "manual"}>계약값 출처: {contract.valueSource === "confirmed" ? "확정" : contract.valueSource === "manual" ? "관리자 수동" : "미확인"}</Badge>
            </div>
            <h1 style={{ margin: 0, fontSize: "var(--fs-title)", lineHeight: "var(--lh-title)" }}>
              계약·옵션·업무 이력 통합 보기
            </h1>
          </div>
          <Input aria-label="건물·호실 검색" placeholder="건물·호실 검색" readOnly style={{ maxWidth: 280 }} />
        </Card>

        <Grid columns={3}>
          <Card>
            <h2 style={{ margin: "0 0 var(--space-md)", fontSize: "var(--fs-subtitle)" }}>임차인 기본</h2>
            <MetaRow label="이름" value={detail.tenant.name} />
            <MetaRow label="연락처" value={detail.tenant.phone} />
            <MetaRow label="입주일" value={detail.tenant.moveInDate} />
            <MetaRow label="상태" value={detail.tenant.residentState} />
          </Card>
          <Card>
            <h2 style={{ margin: "0 0 var(--space-md)", fontSize: "var(--fs-subtitle)" }}>계약 정보</h2>
            <MetaRow label="기간" value={`${formatDate(contract.startDate ?? contract.createdAt)} - ${formatDate(contract.endDate ?? contract.updatedAt)}`} />
            <MetaRow label="월세" value={`${contract.monthlyRent?.toLocaleString("ko-KR") ?? "-"}원`} />
            <MetaRow label="관리비" value={`${contract.maintenanceFee?.toLocaleString("ko-KR") ?? "-"}원`} />
            <MetaRow label="납부일" value={`매월 ${contract.paymentDay ?? "-"}일`} />
          </Card>
          <Card>
            <h2 style={{ margin: "0 0 var(--space-md)", fontSize: "var(--fs-subtitle)" }}>수동 계약값</h2>
            {Object.entries(detail.manualValues).map(([key, value]) => (
              <MetaRow key={key} label={manualLabel[key as keyof typeof detail.manualValues]} value={value} />
            ))}
            <StaticButton variant="secondary">수동값 저장</StaticButton>
          </Card>
        </Grid>

        <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: "var(--space-lg)", alignItems: "start" }}>
          <Section title="호실 옵션 인벤토리">
            <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
              <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>
                퇴실 체크리스트의 원천으로 쓰입니다.
              </div>
              <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
                {detail.inventory.map((item) => (
                  <Badge key={item}>{item}</Badge>
                ))}
              </div>
              <StaticButton variant="secondary">옵션 편집</StaticButton>
            </Card>
          </Section>

          <Section title="통합 타임라인">
            <div style={{ display: "grid", gap: "var(--space-sm)" }}>
              {detail.timeline.map((item) => {
                const content = (
                  <Card style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--space-md)", alignItems: "start" }}>
                    <Badge>{item.kind}</Badge>
                    <div>
                      <div style={{ fontWeight: 800 }}>{item.title}</div>
                      <div style={{ marginTop: "var(--space-xs)", color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>
                        {formatDateTime(item.at)} · {item.detail}
                      </div>
                    </div>
                  </Card>
                );
                return item.href ? (
                  <Link key={`${item.kind}-${item.at}`} href={item.href} style={linkReset}>
                    {content}
                  </Link>
                ) : (
                  <div key={`${item.kind}-${item.at}`}>{content}</div>
                );
              })}
            </div>
          </Section>
        </div>

        <Card style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            <LinkButton href={MANAGER_CONTRACT_ROUTES["M-DOC-01"]}>계약서 열기</LinkButton>
            <LinkButton href={MANAGER_CONTRACT_ROUTES["M-DOC-04"]} variant="secondary">임차인 초대</LinkButton>
            <LinkButton href={MANAGER_CONTRACT_ROUTES["M-DOC-05"]} variant="secondary">보관·삭제 처리</LinkButton>
          </div>
          <StaticButton variant="secondary">CSV 일괄 등록</StaticButton>
        </Card>
      </PageStack>
    </ContractShell>
  );
}

const manualLabel = {
  deposit: "보증금",
  rent: "월세",
  maintenanceFee: "관리비",
  paymentDay: "납부일",
  account: "계좌",
} as const;
