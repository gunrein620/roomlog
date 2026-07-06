import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@roomlog/ui";
import { CONTRACT_ROUTES } from "@/lib/contract-nav";
import { createTenantContract } from "@/lib/contract-api";

const groupLabel = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
} as const;

async function uploadContractAction(formData: FormData) {
  "use server";

  const file = formData.get("contractFile");
  const fileName = file instanceof File && file.name ? file.name : "tenant-contract.pdf";
  await createTenantContract({
    fileName,
    ocrConsent: formData.get("ocrConsent") === "on",
    storageConsent: formData.get("storageConsent") === "on",
  });
  redirect(CONTRACT_ROUTES["T-DOC-02"]);
}

export default function Page() {
  return (
    <>
      <header
        style={{
          flex: "none",
          padding: "12px 14px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link
          href={CONTRACT_ROUTES["T-DOC-00"]}
          style={{ fontSize: 13, color: "var(--on-surface-variant)", textDecoration: "none" }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ fontSize: 14, fontWeight: 700 }}>계약서 등록</div>
        <div style={{ width: 34 }} />
      </header>

      <form
        action={uploadContractAction}
        style={{
          flex: 1,
          overflow: "auto",
          padding: "16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={groupLabel}>파일</div>
          <label
            style={{
              minHeight: 96,
              border: "1.5px dashed var(--outline-variant)",
              borderRadius: "var(--radius-md)",
              background: "var(--surface-container-low)",
              color: "var(--on-surface-variant)",
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: 12,
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: 22 }}>＋</span>
            사진 여러 장 또는 PDF 선택
            <input name="contractFile" type="file" accept="application/pdf,image/*" required />
          </label>
        </section>

        <section
          style={{
            border: "1.5px solid var(--outline-variant)",
            borderRadius: "var(--radius-md)",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            background: "var(--surface-container-low)",
          }}
        >
          <div style={groupLabel}>동의 (필수)</div>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
            <input name="ocrConsent" type="checkbox" required style={{ width: 18, height: 18, marginTop: 1, accentColor: "var(--primary)" }} />
            <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>계약서 이미지를 OCR로 분석합니다 (핵심 값 추출용)</span>
          </label>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
            <input name="storageConsent" type="checkbox" required style={{ width: 18, height: 18, marginTop: 1, accentColor: "var(--primary)" }} />
            <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>추출값과 원본을 보관합니다 (정산·분쟁 대비 · 종료 후 5년)</span>
          </label>
        </section>

        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 12,
            color: "var(--on-surface-variant)",
            background: "var(--surface-container-lowest)",
          }}
        >
          상세주소·계좌번호는 기본 가림 처리됩니다. 업체 전달 동의는 전달 시점에 따로 받습니다.
        </div>

        <footer
          style={{
            flex: "none",
            marginTop: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <Button fullWidth type="submit">동의하고 업로드</Button>
          <Link
            href={CONTRACT_ROUTES["T-DOC-04"]}
            style={{
              alignSelf: "center",
              padding: 4,
              fontSize: 12,
              color: "var(--on-surface-variant)",
              textDecoration: "none",
            }}
          >
            약관·보관정책
          </Link>
        </footer>
      </form>
    </>
  );
}
