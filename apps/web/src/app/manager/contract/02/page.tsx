import { Input } from "@roomlog/ui";
import { redirect } from "next/navigation";
import { createManagerContract, getManagerContractDetail } from "@/lib/contract-manager-api";
import { MANAGER_CONTRACT_ROUTES } from "@/lib/contract-manager-nav";
import {
  BackLink,
  Badge,
  Card,
  ContractShell,
  LinkButton,
  PageStack,
  Section,
  StaticButton,
  captionStyle,
} from "../_components";

export const dynamic = "force-dynamic";

async function createContractAction(formData: FormData) {
  "use server";

  const file = formData.get("contractFile");
  const fileName = file instanceof File && file.name ? file.name : "manager-contract.pdf";
  const detail = await createManagerContract({
    unitId: String(formData.get("unitId") ?? ""),
    tenantName: String(formData.get("tenantName") ?? ""),
    fileName,
  });
  redirect(`${MANAGER_CONTRACT_ROUTES["M-DOC-01"]}?id=${encodeURIComponent(detail.row.contract.id)}`);
}

export default async function Page() {
  const detail = await getManagerContractDetail();

  return (
    <ContractShell id="M-DOC-02" title="계약서 등록">
      <PageStack>
        <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
          <BackLink />
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            <Badge emphasis>관리자 업로드</Badge>
            <Badge>저장·근거 활용 권한 확인</Badge>
            <Badge>업체 전달 동의는 전달 시점 분리</Badge>
          </div>
          <h1 style={{ margin: 0, fontSize: "var(--fs-title)", lineHeight: "var(--lh-title)" }}>
            호실 선택 후 업로드하고 검토로 이동
          </h1>
        </Card>

        <form action={createContractAction} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)", alignItems: "start" }}>
          <Section title="호실·임차인 선택">
            <Card style={{ display: "grid", gap: "var(--space-md)" }}>
              <Input aria-label="건물" value="연남 스테이" readOnly />
              <input name="unitId" aria-label="호실" defaultValue={detail.row.contract.unitId} style={fieldStyle} />
              <input name="tenantName" aria-label="임차인" defaultValue={detail.row.tenantName} style={fieldStyle} />
              <LinkButton href={MANAGER_CONTRACT_ROUTES["M-DOC-04"]} variant="secondary">미연결 호실 초대 안내</LinkButton>
            </Card>
          </Section>

          <Section title="파일 선택·미리보기">
            <Card style={{ display: "grid", gap: "var(--space-md)" }}>
              <div
                style={{
                  minHeight: 220,
                  border: "1.5px dashed var(--outline-variant)",
                  borderRadius: "var(--radius-md)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--on-surface-variant)",
                  textAlign: "center",
                  padding: "var(--space-lg)",
                }}
              >
                PDF 또는 사진 여러 장 미리보기 영역
              </div>
              <input name="contractFile" type="file" accept="application/pdf,image/*" style={fieldStyle} />
            </Card>
          </Section>
          <Card style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", gap: "var(--space-md)", alignItems: "center" }}>
            <div style={{ color: "var(--on-surface-variant)" }}>
              병합·채택 시 사유와 출처를 감사로그에 남기고 임차인에게 알립니다.
            </div>
            <div style={{ display: "flex", gap: "var(--space-sm)" }}>
              <LinkButton href={MANAGER_CONTRACT_ROUTES["M-DOC-00"]} variant="secondary">취소</LinkButton>
              <StaticButton type="submit">업로드하고 검토로</StaticButton>
            </div>
          </Card>
        </form>

        <Section title="중복·상충 검사">
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            {detail.conflictCandidates.map((candidate) => (
              <Card key={`${candidate.source}-${candidate.uploadedAt}`} style={{ display: "grid", gap: "var(--space-sm)" }}>
                <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
                  <Badge emphasis={candidate.source === "tenant"}>{candidate.source === "tenant" ? "임차인 업로드본" : "관리자 보관본"}</Badge>
                  <span style={captionStyle}>{candidate.uploadedAt}</span>
                </div>
                <div style={{ fontWeight: 800 }}>{candidate.summary}</div>
                <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>
                  {candidate.decision}
                </div>
              </Card>
            ))}
          </div>
        </Section>

      </PageStack>
    </ContractShell>
  );
}

const fieldStyle = {
  minHeight: 46,
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "0 var(--space-md)",
  font: "inherit",
  background: "var(--surface-container-lowest)",
} as const;
