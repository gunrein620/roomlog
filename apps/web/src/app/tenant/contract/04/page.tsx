import Link from "next/link";
import { redirect } from "next/navigation";
import { CONTRACT_ROUTES } from "@/lib/contract-nav";
import { getCurrentContractId, getPrivacy, requestContractDeletion } from "@/lib/contract-api";
import { PrivacyPanel } from "./PrivacyPanel";

// T-DOC-04 · 개인정보·마스킹·보관·삭제
// 마스킹 관리 + 보관기간 정직 고지 + 전달 동의 철회 + 삭제 요청(3상태·SLA 게이트).
// 뒤로 → 00. 삭제 처리 결과는 M-DOC-05로 흐름(크로스, 스텁).

export const dynamic = "force-dynamic";

async function requestDeletionAction(formData: FormData) {
  "use server";

  const contractId = String(formData.get("contractId") ?? "");
  await requestContractDeletion(contractId);
  redirect(CONTRACT_ROUTES["T-DOC-04"]);
}

export default async function Page() {
  const contractId = await getCurrentContractId();
  if (!contractId) {
    return (
      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 800 }}>등록된 계약서가 없습니다.</div>
        <Link href={CONTRACT_ROUTES["T-DOC-01"]} style={{ color: "var(--primary)", fontWeight: 800, textDecoration: "none" }}>
          계약서 등록하기
        </Link>
      </div>
    );
  }
  const privacy = await getPrivacy(contractId);

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
          href={CONTRACT_ROUTES["T-DOC-00"]}
          style={{ fontSize: 13, color: "var(--on-surface-variant)", textDecoration: "none" }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ fontSize: 14, fontWeight: 700 }}>개인정보·보관</div>
        <div style={{ width: 34 }} />
      </header>

      <PrivacyPanel privacy={privacy} contractId={contractId} requestDeletionAction={requestDeletionAction} />
    </>
  );
}
