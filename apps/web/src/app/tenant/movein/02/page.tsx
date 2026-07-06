import Link from "next/link";
import { Badge, Button, Card, Input } from "@roomlog/ui";
import { DEMO_LEASE_ID, getChecklist, getMovein } from "@/lib/movein-api";
import { ROUTES } from "@/lib/movein-nav";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function stageLabel(endAt: string) {
  return Date.now() <= new Date(endAt).getTime()
    ? "입주 직후 윈도우 내 · 1급"
    : "입주 후 참고 · 참고";
}

export default async function Page({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const from = one(params.from) === "04" ? "04" : "01";
  const itemId = one(params.item) ?? "item_aircon";
  const [movein, items] = await Promise.all([getMovein(DEMO_LEASE_ID), getChecklist(DEMO_LEASE_ID)]);
  const item = items.find((candidate) => candidate.id === itemId) ?? items[0];
  const returnHref = from === "04" ? `${ROUTES["T-IN-04"]}?item=${item.id}&from=03` : ROUTES["T-IN-01"];

  return (
    <>
      <header
        style={{
          flex: "none",
          padding: 14,
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Link
          href={returnHref}
          style={{
            fontSize: 13,
            color: "var(--on-surface-variant)",
            textDecoration: "none",
            marginTop: 2,
          }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{item?.label ?? "추가 항목"}</div>
          <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginTop: 2 }}>
            {from === "04" ? "재촬영 모드" : "항목 촬영"}
          </div>
        </div>
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
        <Card style={{ display: "flex", flexDirection: "column", gap: 10, padding: 13 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>광각 1 + 근접 1 페어</div>
          <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.55 }}>
            같은 위치를 재현하려 애쓰지 않아도 돼요. 공간이 식별되는 광각과 상태가 보이는 근접을
            남기면 충분해요.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <PhotoSlot label="광각" hint="공간과 위치가 보이게" />
            <PhotoSlot label="근접" hint="상태가 식별되게" />
          </div>
        </Card>

        <Card style={{ padding: 13, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>공간/위치 anchor</div>
          <Input defaultValue={item?.spaceLabel ?? "직접 입력"} aria-label="공간" />
          <Input defaultValue="벽면 기준 왼쪽 / 가까운 기준점" aria-label="위치 anchor" />
          <div style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>
            정밀 측정은 강제하지 않아요. 나중에 찾을 수 있을 정도면 돼요.
          </div>
        </Card>

        <Card style={{ padding: 13, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>메모(선택)</div>
          <Input placeholder="예: 하단 미세 스크래치, 물기 흔적" aria-label="메모" />
        </Card>

        <Card style={{ padding: 13, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>capture_stage 자동 판정</div>
            <Badge emphasis>{stageLabel(movein.lockWindowEndAt)}</Badge>
          </div>
          <div style={{ fontSize: 11, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
            원본은 불변 보관되고 EXIF, 서버 수신시각, 파일 해시가 함께 남아요.
          </div>
        </Card>
      </div>

      <footer
        style={{
          flex: "none",
          padding: "12px 14px",
          borderTop: "1px solid var(--border)",
        }}
      >
        <Link href={returnHref} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth>이 항목 저장</Button>
        </Link>
      </footer>
    </>
  );
}

function PhotoSlot({ label, hint }: { label: string; hint: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      style={{
        height: "auto",
        minHeight: 116,
        border: "1.5px dashed var(--outline)",
        borderRadius: 8,
        background: "var(--surface-container-lowest)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        color: "var(--on-surface)",
        padding: 8,
      }}
    >
      <span style={{ fontSize: 22 }}>＋</span>
      <span style={{ fontSize: 13, fontWeight: 800 }}>{label}</span>
      <span style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>{hint}</span>
    </Button>
  );
}
