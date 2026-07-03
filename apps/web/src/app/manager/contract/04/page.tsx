import { Input } from "@roomlog/ui";
import { getManagerContractDetail } from "@/lib/contract-manager-api";
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

export const dynamic = "force-dynamic";

export default async function Page() {
  const detail = await getManagerContractDetail();

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
            <Card style={{ display: "grid", gap: "var(--space-md)" }}>
              <Input aria-label="호실" value="302" readOnly />
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
              <StaticButton>초대 링크/QR 생성</StaticButton>
            </Card>
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
                  <StaticButton variant="secondary">{invite.state === "connected" ? "해제" : "연결 저장"}</StaticButton>
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
            <StaticButton>기존 기록 연결</StaticButton>
          </Card>
        </Section>

        <Card style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", alignItems: "center" }}>
          <div style={{ color: "var(--on-surface-variant)" }}>
            연결 완료 후 임차인 T-DOC 홈에 동일 계약 레코드가 표시됩니다.
          </div>
          <LinkButton href={MANAGER_CONTRACT_ROUTES["M-DOC-03"]} variant="secondary">연결 완료 후 호실 보기</LinkButton>
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
