import { redirect } from "next/navigation";
import { Card } from "@roomlog/ui";
import {
  createVendorProfile,
  getVendorDetail,
  listVendorDuplicateCandidates,
  updateVendorProfile,
} from "@/lib/vendor-mgmt-api";
import { MANAGER_VENDOR_MGMT_ROUTES } from "@/lib/vendor-mgmt-nav";
import {
  LinkButton,
  ManagerVendorMgmtShell,
  MetaRow,
  NoticeCard,
  PageStack,
  ScreenHeader,
  Section,
  grid2Style,
  tradeLabel,
  tradeOptions,
  vendorHref,
} from "../_components";

type SearchParams = Promise<{ id?: string }>;

async function saveVendorAction(formData: FormData) {
  "use server";

  const vendorId = String(formData.get("vendorId") ?? "");
  const input = {
    businessName: String(formData.get("businessName") ?? ""),
    contactPerson: String(formData.get("contactPerson") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    serviceArea: String(formData.get("serviceArea") ?? ""),
  };
  const detail = vendorId
    ? await updateVendorProfile(vendorId, input)
    : await createVendorProfile(input);

  redirect(vendorHref("M-VEND-01", detail.vendor.id));
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const [detail, duplicates] = await Promise.all([
    id ? getVendorDetail(id) : Promise.resolve(undefined),
    listVendorDuplicateCandidates(),
  ]);
  const vendor = detail?.vendor;
  const cancelHref = vendor ? vendorHref("M-VEND-01", vendor.id) : MANAGER_VENDOR_MGMT_ROUTES["M-VEND-00"];

  return (
    <ManagerVendorMgmtShell title="업체 등록/편집">
      <PageStack>
        <ScreenHeader
          eyebrow="M-VEND-03"
          title={vendor ? `${vendor.name} 편집` : "업체 직접 추가"}
          desc="완료된 수리에서 자동 누적되는 주소록을 보조합니다. 직접 추가한 업체는 현재 관리인의 주소록 범위에서만 관리합니다."
          actions={<LinkButton href={cancelHref} variant="ghost">취소</LinkButton>}
        />

        <form action={saveVendorAction} style={{ display: "grid", gap: "var(--space-lg)" }}>
          <input type="hidden" name="vendorId" value={vendor?.id ?? ""} />

          <section style={grid2Style}>
            <Section title="업체 기본 정보">
              <Card style={{ display: "grid", gap: "var(--space-md)" }}>
                <label style={fieldLabelStyle}>
                  업체명
                  <input name="businessName" required placeholder="업체명을 입력하세요" defaultValue={vendor?.name ?? ""} style={inputStyle} />
                </label>
                <label style={fieldLabelStyle}>
                  담당자
                  <input name="contactPerson" required placeholder="담당자명을 입력하세요" defaultValue={vendor?.contactPerson ?? ""} style={inputStyle} />
                </label>
                <label style={fieldLabelStyle}>
                  연락처
                  <input name="phone" required placeholder="010-0000-0000" defaultValue={vendor?.phone ?? ""} style={inputStyle} />
                </label>
                <label style={fieldLabelStyle}>
                  서비스 지역
                  <input name="serviceArea" required placeholder="예: 서울 서초구, 강남구" defaultValue={vendor?.address ?? ""} style={inputStyle} />
                </label>
              </Card>
            </Section>

            <Section title="상태 · 분야">
              <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
                <MetaRow label="vendor_id" value={vendor?.id ?? "저장 후 생성"} />
                <MetaRow label="등록 경로" value={vendor ? (vendor.source === "auto" ? "수리 완료 자동 누적" : "직접 추가") : "직접 추가"} />
                <MetaRow label="거래 이력" value={vendor ? `${vendor.dealCount}건` : "0건"} />
                <div style={{ display: "flex", gap: "var(--space-xs)", flexWrap: "wrap", paddingTop: "var(--space-sm)" }}>
                  {tradeOptions.map((trade) => (
                    <span key={trade} style={chipStyle}>
                      {tradeLabel[trade]}
                    </span>
                  ))}
                </div>
                <p style={{ margin: 0, color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", lineHeight: "var(--lh-body)" }}>
                  담당 분야는 현재 별도 입력값으로 저장하지 않고, 업체명·서비스 지역·완료 수리 이력에서 자동 분류합니다.
                </p>
              </Card>
            </Section>
          </section>

          <Section title="중복 후보">
            <div style={{ display: "grid", gap: "var(--space-sm)" }}>
              {duplicates.length > 0 ? (
                duplicates.map((candidate) => (
                  <MetaRow
                    key={`${candidate.vendorId}-${candidate.reason}`}
                    label={candidate.reason === "same_phone" ? "같은 연락처" : "같은 이름"}
                    value={`${candidate.name} (${candidate.vendorId})`}
                  />
                ))
              ) : (
                <Card style={{ color: "var(--on-surface-variant)" }}>현재 중복 후보가 없습니다.</Card>
              )}
            </div>
          </Section>

          <NoticeCard title="개인정보 고지" emphasis>
            연락처와 주소는 관리인 전용 정보입니다. 세입자에게 노출하지 않고, 성과 평가는 최소 표본 기준을 넘을 때만 공개합니다.
          </NoticeCard>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            <LinkButton href={cancelHref} variant="ghost">취소</LinkButton>
            <button type="submit" style={submitButtonStyle}>저장</button>
          </div>
        </form>
      </PageStack>
    </ManagerVendorMgmtShell>
  );
}

const fieldLabelStyle = {
  display: "grid",
  gap: "var(--space-xs)",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
  color: "var(--on-surface-variant)",
};

const inputStyle = {
  minHeight: "var(--touch-target)",
  width: "100%",
  padding: "0 var(--space-md)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  background: "var(--surface-container-lowest)",
  color: "var(--on-surface)",
  font: "inherit",
  fontWeight: 800,
};

const chipStyle = {
  minHeight: 34,
  display: "inline-flex",
  alignItems: "center",
  padding: "0 var(--space-sm)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-btn)",
  background: "var(--surface-container-lowest)",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
};

const submitButtonStyle = {
  minHeight: "var(--touch-target)",
  padding: "0 var(--space-lg)",
  border: "none",
  borderRadius: "var(--radius-btn)",
  background: "var(--primary)",
  color: "var(--on-primary)",
  font: "inherit",
  fontWeight: 800,
  cursor: "pointer",
};
