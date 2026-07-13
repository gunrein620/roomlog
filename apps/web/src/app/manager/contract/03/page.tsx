import Link from "next/link";
import { redirect } from "next/navigation";
import { Input } from "@roomlog/ui";
import {
  getManagerContractDetail,
  updateManagerContractInventory,
  updateManagerContractManualValues,
} from "@/lib/contract-manager-api";
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
  captionStyle,
  formatDate,
  formatDateTime,
  linkReset,
} from "../_components";

type SearchParams = Promise<{ id?: string }>;

export const dynamic = "force-dynamic";

async function saveManualValuesAction(formData: FormData) {
  "use server";

  const contractId = String(formData.get("contractId") ?? "");
  await updateManagerContractManualValues(contractId, {
    deposit: String(formData.get("deposit") ?? ""),
    monthlyRent: numberValue(formData.get("monthlyRent")),
    maintenanceFee: numberValue(formData.get("maintenanceFee")),
    paymentDay: numberValue(formData.get("paymentDay")),
    startDate: String(formData.get("startDate") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
    account: String(formData.get("account") ?? ""),
  });
  const contractHref = `${MANAGER_CONTRACT_ROUTES["M-DOC-03"]}?id=${encodeURIComponent(contractId)}`;
  redirect(contractHref);
}

async function saveInventoryAction(formData: FormData) {
  "use server";

  const contractId = String(formData.get("contractId") ?? "");
  const items = String(formData.get("items") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  await updateManagerContractInventory(contractId, items);
  const contractHref = `${MANAGER_CONTRACT_ROUTES["M-DOC-03"]}?id=${encodeURIComponent(contractId)}`;
  redirect(contractHref);
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const detail = await getManagerContractDetail(id);
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
            <form action={saveManualValuesAction} style={{ display: "grid", gap: "var(--space-sm)" }}>
              <input type="hidden" name="contractId" value={contract.id} />
              <Field name="deposit" label="보증금" defaultValue={detail.manualValues.deposit} />
              <Field name="startDate" label="계약 시작일" type="date" defaultValue={contract.startDate?.slice(0, 10) ?? ""} />
              <Field name="endDate" label="계약 종료일" type="date" defaultValue={contract.endDate?.slice(0, 10) ?? ""} />
              <Field name="monthlyRent" label="월세" defaultValue={contract.monthlyRent ?? ""} inputMode="numeric" />
              <Field name="maintenanceFee" label="관리비" defaultValue={contract.maintenanceFee ?? ""} inputMode="numeric" />
              <Field name="paymentDay" label="납부일" defaultValue={contract.paymentDay ?? ""} inputMode="numeric" />
              <Field name="account" label="계좌" defaultValue={detail.manualValues.account} />
              <StaticButton type="submit" variant="secondary">수동값 저장</StaticButton>
            </form>
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
              <form action={saveInventoryAction} style={{ display: "grid", gap: "var(--space-sm)" }}>
                <input type="hidden" name="contractId" value={contract.id} />
                <input name="items" defaultValue={detail.inventory.join(", ")} style={fieldStyle} />
                <StaticButton type="submit" variant="secondary">옵션 저장</StaticButton>
              </form>
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
            <LinkButton href={`${MANAGER_CONTRACT_ROUTES["M-DOC-01"]}?id=${encodeURIComponent(contract.id)}`}>계약서 열기</LinkButton>
            <LinkButton href={`${MANAGER_CONTRACT_ROUTES["M-DOC-04"]}?id=${encodeURIComponent(contract.id)}`} variant="secondary">임차인 초대</LinkButton>
            <LinkButton href={`${MANAGER_CONTRACT_ROUTES["M-DOC-05"]}?id=${encodeURIComponent(contract.id)}`} variant="secondary">보관·삭제 처리</LinkButton>
          </div>
          <LinkButton href={MANAGER_CONTRACT_ROUTES["M-DOC-02"]} variant="secondary">계약서 추가 등록</LinkButton>
        </Card>
      </PageStack>
    </ContractShell>
  );
}

function Field({
  name,
  label,
  defaultValue,
  inputMode,
  type,
}: {
  name: string;
  label: string;
  defaultValue: string | number;
  inputMode?: "numeric";
  type?: "text" | "date";
}) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={captionStyle}>{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} inputMode={inputMode} style={fieldStyle} />
    </label>
  );
}

function numberValue(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? "").replace(/[^\d]/g, ""));

  return Number.isFinite(parsed) ? parsed : undefined;
}

const fieldStyle = {
  minHeight: 42,
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "0 var(--space-md)",
  font: "inherit",
  background: "var(--surface-container-lowest)",
} as const;
