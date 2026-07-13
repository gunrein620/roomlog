import { Input } from "@roomlog/ui";
import { redirect } from "next/navigation";
import {
  createManagerContractInvite,
  getManagerContractDetail,
  updateManagerContractInvite,
} from "@/lib/contract-manager-api";
import { MANAGER_CONTRACT_ROUTES } from "@/lib/contract-manager-nav";
import {
  BackLink,
  Badge,
  Card,
  ContractShell,
  LinkButton,
  MetaRow,
  PageStack,
  Section,
  StaticButton,
} from "../_components";

type SearchParams = Promise<{ id?: string }>;

export const dynamic = "force-dynamic";

async function createInviteAction(formData: FormData) {
  "use server";

  const contractId = String(formData.get("contractId") ?? "");
  await createManagerContractInvite(contractId, {
    tenantName: String(formData.get("tenantName") ?? ""),
    email: String(formData.get("email") ?? "") || undefined,
    phone: String(formData.get("phone") ?? "") || undefined,
  });
  const contractHref = `${MANAGER_CONTRACT_ROUTES["M-DOC-04"]}?id=${encodeURIComponent(contractId)}`;
  redirect(contractHref);
}

async function updateInviteAction(formData: FormData) {
  "use server";

  const contractId = String(formData.get("contractId") ?? "");
  const inviteId = String(formData.get("inviteId") ?? "");
  const state = String(formData.get("state") ?? "") as "waiting" | "connected" | "disputed";
  await updateManagerContractInvite(inviteId, {
    state,
    note: String(formData.get("note") ?? "") || undefined,
  });
  const contractHref = `${MANAGER_CONTRACT_ROUTES["M-DOC-04"]}?id=${encodeURIComponent(contractId)}`;
  redirect(contractHref);
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const detail = await getManagerContractDetail(id);
  const contract = detail.row.contract;

  return (
    <ContractShell id="M-DOC-04" title="임차인 초대·호실 연결">
      <PageStack>
        <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
          <BackLink />
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            <Badge emphasis>링크/QR 초대</Badge>
            <Badge>기존 기록 연결 게이트</Badge>
            <Badge>임차인 알림·이의·감사로그</Badge>
          </div>
          <h1 style={{ margin: 0, fontSize: "var(--fs-title)", lineHeight: "var(--lh-title)" }}>
            임차인을 호실과 안전하게 연결
          </h1>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: "var(--space-lg)", alignItems: "start" }}>
          <Section title="초대 링크/QR 생성">
            <form action={createInviteAction}>
            <Card style={{ display: "grid", gap: "var(--space-md)" }}>
              <input type="hidden" name="contractId" value={contract.id} />
              <Input aria-label="호실" value={contract.unitId} readOnly />
              <input name="tenantName" aria-label="임차인 이름" placeholder="임차인 이름" required style={fieldStyle} defaultValue={detail.row.tenantName !== "미연결 임차인" ? detail.row.tenantName : ""} />
              <input name="email" aria-label="이메일" placeholder="이메일" style={fieldStyle} />
              <input name="phone" aria-label="연락처" placeholder="연락처" style={fieldStyle} />
              <Input aria-label="초대 링크" value={detail.inviteLinks[0]?.link ?? ""} readOnly />
              <div
                style={{
                  aspectRatio: "1",
                  maxWidth: 180,
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border)",
                  background: "var(--surface-container-low)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--on-surface-variant)",
                }}
              >
                QR
              </div>
              <StaticButton type="submit">초대 링크/QR 생성</StaticButton>
            </Card>
            </form>
          </Section>

          <Section title="연결 대기·완료 목록">
            <div style={{ display: "grid", gap: "var(--space-sm)" }}>
              {detail.inviteLinks.map((invite) => (
                <Card key={invite.unitId} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-md)", alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
                      <Badge emphasis={invite.state === "disputed"}>{stateLabel[invite.state]}</Badge>
                      <Badge>{invite.unitId}호</Badge>
                    </div>
                    <div style={{ marginTop: "var(--space-sm)", fontSize: "var(--fs-subtitle)", fontWeight: 800 }}>
                      {invite.tenantName}
                    </div>
                    <div style={{ marginTop: "var(--space-xs)", color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>
                      {invite.audit}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <form action={updateInviteAction}>
                      <input type="hidden" name="contractId" value={contract.id} />
                      <input type="hidden" name="inviteId" value={invite.id} />
                      <input type="hidden" name="state" value={invite.state === "connected" ? "waiting" : "connected"} />
                      <input type="hidden" name="note" value={invite.state === "connected" ? "관리자 연결 해제" : "관리자 확인 후 연결 완료"} />
                      <StaticButton type="submit" variant="secondary">{invite.state === "connected" ? "해제" : "연결 저장"}</StaticButton>
                    </form>
                    <form action={updateInviteAction}>
                      <input type="hidden" name="contractId" value={contract.id} />
                      <input type="hidden" name="inviteId" value={invite.id} />
                      <input type="hidden" name="state" value="disputed" />
                      <input type="hidden" name="note" value="임차인 이의 또는 정보 불일치로 보류" />
                      <StaticButton type="submit" variant="secondary">보류</StaticButton>
                    </form>
                  </div>
                </Card>
              ))}
            </div>
          </Section>
        </div>

        <Section title="기존 임차인 등록 기록 연결">
          <Card style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-lg)", alignItems: "center" }}>
            <div>
              <MetaRow label="관리자 확인" value="호실·이름·연락처 대조 후 연결" />
              <MetaRow label="임차인 알림" value="연결 사실 고지, 이의 시 보류" />
              <MetaRow label="감사로그" value="연결·해제·이의 사유 모두 기록" />
            </div>
            {detail.inviteLinks[0] ? (
              <form action={updateInviteAction}>
                <input type="hidden" name="contractId" value={contract.id} />
                <input type="hidden" name="inviteId" value={detail.inviteLinks[0].id} />
                <input type="hidden" name="state" value="connected" />
                <input type="hidden" name="note" value="기존 임차인 등록 기록 대조 후 연결" />
                <StaticButton type="submit">기존 기록 연결</StaticButton>
              </form>
            ) : (
              <StaticButton disabled>초대 생성 후 연결</StaticButton>
            )}
          </Card>
        </Section>

        <Card style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", alignItems: "center" }}>
          <div style={{ color: "var(--on-surface-variant)" }}>
            연결 완료 후 임차인 T-DOC 홈에 동일 계약 레코드가 표시됩니다.
          </div>
          <LinkButton
            href={`${MANAGER_CONTRACT_ROUTES["M-DOC-03"]}?id=${encodeURIComponent(contract.id)}`}
            variant="secondary"
          >
            연결 완료 후 호실 보기
          </LinkButton>
        </Card>
      </PageStack>
    </ContractShell>
  );
}

const stateLabel = {
  waiting: "연결 대기",
  connected: "연결 완료",
  disputed: "이의 보류",
} as const;

const fieldStyle = {
  minHeight: 46,
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "0 var(--space-md)",
  font: "inherit",
  background: "var(--surface-container-lowest)",
} as const;
