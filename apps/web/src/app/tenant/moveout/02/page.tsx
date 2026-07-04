import Link from "next/link";
import { redirect } from "next/navigation";
import type { ChecklistCondition, UpdateMoveoutChecklistItemDto } from "@roomlog/types";
import { Badge, Button, Card } from "@roomlog/ui";
import { DEMO_MOVEOUT_ID, getChecklist, getMoveout, updateMoveoutChecklist } from "@/lib/moveout-api";
import { MOVEOUT_ROUTES } from "@/lib/moveout-nav";

export const dynamic = "force-dynamic";

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

const selectStyle = {
  height: "var(--touch-target)",
  border: "1px solid var(--input-border)",
  borderRadius: "var(--radius-md)",
  padding: "0 12px",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--fs-body)",
  color: "var(--input-text)",
  background: "var(--surface-container-lowest)",
  width: "100%",
  boxSizing: "border-box",
} as const;

function attachmentUrlsFrom(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/[\n,]/)
    .map((url) => url.trim())
    .filter(Boolean);
}

async function saveChecklistAction(formData: FormData) {
  "use server";

  const items = formData.getAll("itemId").map((rawId): UpdateMoveoutChecklistItemDto => {
    const id = String(rawId);

    return {
      id,
      label: String(formData.get(`label-${id}`) ?? "").trim(),
      present: formData.get(`present-${id}`) === "true",
      condition: String(formData.get(`condition-${id}`) ?? "normal") as ChecklistCondition,
      note: String(formData.get(`note-${id}`) ?? "").trim() || undefined,
      attachmentUrls: attachmentUrlsFrom(formData.get(`attachmentUrls-${id}`)),
    };
  });

  await updateMoveoutChecklist(DEMO_MOVEOUT_ID, { items });
  redirect(MOVEOUT_ROUTES["T-OUT-00"]);
}

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

      <form action={saveChecklistAction} style={{ display: "contents" }}>
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
                <Card key={item.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name={`label-${item.id}`} value={item.label} />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{item.label}</div>
                    <Badge emphasis={item.condition === "damage_check"}>
                      {CONDITION_LABEL[item.condition]}
                    </Badge>
                  </div>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    <input
                      type="checkbox"
                      name={`present-${item.id}`}
                      value="true"
                      defaultChecked={item.present}
                    />
                    반납/확인 가능
                  </label>
                  <select
                    name={`condition-${item.id}`}
                    aria-label={`${item.label} 상태`}
                    defaultValue={item.condition}
                    style={selectStyle}
                  >
                    <option value="normal">정상</option>
                    <option value="aging">노후/마모</option>
                    <option value="damage_check">확인 필요</option>
                  </select>
                  <input
                    name={`note-${item.id}`}
                    aria-label={`${item.label} 메모`}
                    defaultValue={item.note ?? ""}
                    placeholder="메모"
                    style={selectStyle}
                  />
                  <input
                    name={`attachmentUrls-${item.id}`}
                    aria-label={`${item.label} 사진 URL`}
                    defaultValue={(item.attachmentUrls ?? []).join(", ")}
                    placeholder="사진 URL(선택, 쉼표로 구분)"
                    style={selectStyle}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Badge>{item.present ? "존재" : "미확인"}</Badge>
                    <Badge>{item.condition === "aging" ? "자연 소모 구분" : "상태 기록"}</Badge>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <section>
            <div style={labelStyle}>메모·사진</div>
            <Card style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
              메모와 사진 URL은 체크리스트 증빙으로 저장됩니다. 훼손 판단은 관리자 검토 전 확정되지
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
          <Button type="submit" fullWidth>체크 저장</Button>
          <Link href={MOVEOUT_ROUTES["T-OUT-01"]} style={{ textDecoration: "none", display: "block" }}>
            <Button fullWidth variant="secondary">
              기록에서 확인
            </Button>
          </Link>
        </footer>
      </form>
    </>
  );
}
