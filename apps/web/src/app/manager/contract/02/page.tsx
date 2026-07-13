import { redirect } from "next/navigation";
import {
  createManagerContract,
  createManagerContractInvite,
  uploadManagerContractDocument,
  updateManagerContractManualValues,
} from "@/lib/contract-manager-api";
import { MANAGER_CONTRACT_ROUTES } from "@/lib/contract-manager-nav";
import { ApiError } from "@/lib/server-api";
import { BackLink, Badge, Card, ContractShell, PageStack, Section } from "../_components";
import { ContractRegisterForm } from "./ContractRegisterForm";

export const dynamic = "force-dynamic";

async function createContractAction(formData: FormData) {
  "use server";

  const unitId = textValue(formData, "unitId");
  const tenantName = textValue(formData, "tenantName");
  const tenantPhone = textValue(formData, "tenantPhone");
  const tenantEmail = textValue(formData, "tenantEmail");
  const monthlyRent = numberValue(formData, "monthlyRent");
  const maintenanceFee = numberValue(formData, "maintenanceFee");
  const paymentDay = numberValue(formData, "paymentDay");
  const deposit = textValue(formData, "deposit");
  const landlordAccount = textValue(formData, "landlordAccount");
  const contractFile = uploadedFile(formData, "contractFile");

  let contractId = "";

  try {
    const uploaded = contractFile ? await uploadManagerContractDocument(contractFile) : undefined;
    const detail = await createManagerContract({
      unitId,
      tenantName,
      fileName: uploaded?.fileName ?? uploadedFileName(formData, "contractFile") ?? "manager-contract.pdf",
      fileUrl: uploaded?.fileUrl,
      monthlyRent,
      maintenanceFee,
      paymentDay,
      startDate: dateValue(formData, "startDate"),
      endDate: dateValue(formData, "endDate"),
    });

    contractId = detail.row.contract.id;

    if (deposit || monthlyRent !== undefined || maintenanceFee !== undefined || paymentDay !== undefined || landlordAccount) {
      await updateManagerContractManualValues(contractId, {
        deposit,
        monthlyRent,
        maintenanceFee,
        paymentDay,
        account: landlordAccount,
      });
    }

    if (tenantName && (tenantPhone || tenantEmail)) {
      await createManagerContractInvite(contractId, {
        tenantName,
        phone: tenantPhone,
        email: tenantEmail,
      });
    }
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect("/manager/login");
    }
    throw error;
  }

  redirect(`${MANAGER_CONTRACT_ROUTES["M-DOC-01"]}?id=${encodeURIComponent(contractId)}`);
}

export default function Page() {
  return (
    <ContractShell id="M-DOC-02" title="계약서 등록">
      <PageStack>
        <Card style={{ display: "grid", gap: "var(--space-md)" }}>
          <BackLink />
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            <Badge emphasis>관리자 등록</Badge>
            <Badge>검토 대기 생성</Badge>
            <Badge>원본 파일 저장</Badge>
          </div>
          <div style={{ display: "grid", gap: "var(--space-xs)" }}>
            <h1 style={{ margin: 0, fontSize: "var(--fs-title)", lineHeight: "var(--lh-title)" }}>
              계약 기본값과 원본 파일을 한 번에 접수합니다
            </h1>
            <p style={{ margin: 0, color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>
              등록된 계약은 검토 대기 상태로 이동하고, 다음 단계에서 OCR 추출값과 입력값을 대조합니다.
            </p>
          </div>
        </Card>

        <Section title="계약서 등록 접수">
          <ContractRegisterForm action={createContractAction} />
        </Section>
      </PageStack>
    </ContractShell>
  );
}

function textValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function numberValue(formData: FormData, name: string) {
  const raw = textValue(formData, name).replaceAll(",", "");
  if (!raw) return undefined;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed) : undefined;
}

function dateValue(formData: FormData, name: string) {
  const value = textValue(formData, name);
  return value ? `${value}T00:00:00+09:00` : undefined;
}

function uploadedFileName(formData: FormData, name: string) {
  const file = formData.get(name);
  if (!file || typeof file !== "object" || !("name" in file) || typeof file.name !== "string") return undefined;
  return file.name.trim() || undefined;
}

function uploadedFile(formData: FormData, name: string) {
  const file = formData.get(name);
  if (!(file instanceof File)) return undefined;
  return file.size > 0 ? file : undefined;
}
