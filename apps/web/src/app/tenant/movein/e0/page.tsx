import Link from "next/link";
import { Button, Card } from "@roomlog/ui";
import { ROUTES } from "@/lib/movein-nav";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function returnHref(value: string | undefined) {
  if (value === "02") return ROUTES["T-IN-02"];
  if (value === "03") return ROUTES["T-IN-03"];
  if (value === "04") return ROUTES["T-IN-04"];
  return ROUTES["T-IN-00"];
}

export default async function Page({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const href = returnHref(one(params.return_to));

  return (
    <>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          padding: "30px 24px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            border: "1.5px dashed var(--outline)",
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 30,
            color: "var(--on-surface-variant)",
          }}
        >
          !
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>기록을 불러오지 못했어요</div>
          <div style={{ fontSize: 12, color: "var(--on-surface-variant)", marginTop: 6 }}>
            연결이 끊겼거나 촬영 저장을 마치지 못했어요
          </div>
        </div>
        <Card style={{ padding: "12px 14px" }}>
          <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.55 }}>
            입력한 공간, 메모, 사진 선택은 가능한 범위에서 보존돼요. 다시 시도해도 책임이 추정되지
            않아요.
          </div>
        </Card>
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
        <Link href={href} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth>다시 시도</Button>
        </Link>
        <Link href={ROUTES["T-IN-00"]} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth variant="secondary">
            홈으로
          </Button>
        </Link>
      </footer>
    </>
  );
}
