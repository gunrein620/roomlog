import Link from "next/link";
import type { ChecklistCondition } from "@roomlog/types";
import { Badge, Button, Card } from "@roomlog/ui";
import { DEMO_MOVEOUT_ID, getChecklist, getMoveout } from "@/lib/moveout-api";
import { MOVEOUT_ROUTES } from "@/lib/moveout-nav";

const labelStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  marginBottom: 8,
} as const;

const CONDITION_LABEL: Record<ChecklistCondition, string> = {
  normal: "정상",
  aging: "노후/마모",
  damage_check: "확인 필요",
};

export default async function Page() {
  const [moveout, checklist] = await Promise.all([
    getMoveout(DEMO_MOVEOUT_ID),
    getChecklist(DEMO_MOVEOUT_ID),
  ]);

  return (
    <>
      <header
        style={{
          flex: "none",
          padding: 14,
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link
          href={MOVEOUT_ROUTES["T-OUT-00"]}
          style={{ fontSize: 13, color: "var(--on-surface-variant)", textDecoration: "none" }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ fontSize: 14, fontWeight: 700 }}>퇴실 체크리스트</div>
        <div style={{ width: 34 }} />
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            border: "1.5px solid var(--primary)",
            borderRadius: "var(--radius-md)",
            padding: 12,
            background: "var(--surface-container-high)",
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.5,
          }}
        >
          이 체크는 정산 참고용이며, 자연 노후는 임차인 책임이 아닙니다.
        </div>

        <section>
          <div style={labelStyle}>옵션 인벤토리 · {moveout.unitId}호</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {checklist.map((item) => (
              <Card key={item.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{item.label}</div>
                  <Badge emphasis={item.condition === "damage_check"}>
                    {CONDITION_LABEL[item.condition]}
                  </Badge>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Badge>{item.present ? "존재" : "미확인"}</Badge>
                  <Badge>{item.condition === "aging" ? "자연 소모 구분" : "상태 기록"}</Badge>
                </div>
                {item.note && (
                  <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
                    {item.note}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </section>

        <section>
          <div style={labelStyle}>메모·사진</div>
          <Card style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
            선택 입력 영역입니다. 체크 결과는 기록에 반영되지만 훼손 판단은 관리자 검토 전 확정되지
            않아요.
          </Card>
        </section>
      </div>

      <footer
        style={{
          flex: "none",
          padding: "12px 14px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <Link href={MOVEOUT_ROUTES["T-OUT-00"]} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth>체크 저장</Button>
        </Link>
        <Link href={MOVEOUT_ROUTES["T-OUT-01"]} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth variant="secondary">
            기록에서 확인
          </Button>
        </Link>
      </footer>
    </>
  );
}
