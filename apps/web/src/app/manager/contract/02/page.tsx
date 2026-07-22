import {
  createManagerContract,
  createManagerContractInvite,
  runManagerContractOcr,
  uploadManagerContractDocument,
  updateManagerContractManualValues,
} from "@/lib/contract-manager-api";
import { MANAGER_CONTRACT_ROUTES } from "@/lib/contract-manager-nav";
import { ApiError, serverFetch } from "@/lib/server-api";
import { getUser } from "@/lib/session";
import { ContractShell, PageStack } from "../_components";
import {
  ContractRegisterForm,
  type ContractRegisterActionState,
  type ManagedContractRoomOption,
} from "./ContractRegisterForm";

export const dynamic = "force-dynamic";

type OwnerTradeListing = {
  roomId?: string;
};

type ManagedRoom = {
  id: string;
  buildingName?: string;
  roomNo?: string;
  address?: string;
};

async function createContractAction(
  _state: ContractRegisterActionState,
  formData: FormData
): Promise<ContractRegisterActionState> {
  "use server";

  const unitId = textValue(formData, "unitId");
  const roomId = textValue(formData, "roomId");
  const tenantName = textValue(formData, "tenantName");
  const tenantPhone = textValue(formData, "tenantPhone");
  const tenantEmail = textValue(formData, "tenantEmail");
  const monthlyRent = numberValue(formData, "monthlyRent");
  const maintenanceFee = numberValue(formData, "maintenanceFee");
  const paymentDay = numberValue(formData, "paymentDay");
  const deposit = textValue(formData, "deposit");
  const landlordAccount = textValue(formData, "landlordAccount");
  const contractFile = uploadedFile(formData, "contractFile");
  const intent = textValue(formData, "intent");

  let contractId = "";

  try {
    const uploaded = contractFile ? await uploadManagerContractDocument(contractFile) : undefined;
    const detail = await createManagerContract({
      roomId: roomId || undefined,
      unitId: unitId || undefined,
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
        startDate: dateValue(formData, "startDate"),
        endDate: dateValue(formData, "endDate"),
      });
    }

    if (tenantName && (tenantPhone || tenantEmail)) {
      await createManagerContractInvite(contractId, {
        tenantName,
        phone: tenantPhone,
        email: tenantEmail,
      });
    }

    if (intent === "ocr-first") {
      await runManagerContractOcr(contractId);
    }
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return { redirectTo: "/manager/login" };
    }
    return { error: contractActionErrorMessage(error) };
  }

  const nextUrl =
    intent === "ocr-first"
      ? `${MANAGER_CONTRACT_ROUTES["M-DOC-01"]}?id=${encodeURIComponent(contractId)}&source=ocr-first`
      : `${MANAGER_CONTRACT_ROUTES["M-DOC-01"]}?id=${encodeURIComponent(contractId)}`;
  return { redirectTo: nextUrl };
}

export default async function Page() {
  const user = await getUser();
  const managedRooms = await visibleContractRooms(user?.managedRooms ?? []);

  return (
    <ContractShell id="M-DOC-02" title="계약서 등록">
      <PageStack>
        <ContractRegisterForm action={createContractAction} rooms={managedRooms} />
      </PageStack>
    </ContractShell>
  );
}

async function visibleContractRooms(
  rooms: readonly ManagedRoom[],
): Promise<ManagedContractRoomOption[]> {
  const currentListingRoomIds = await currentOwnerListingRoomIds();

  return rooms
    .filter((room) => currentListingRoomIds.has(room.id))
    .map((room) => ({
      id: room.id,
      buildingName: room.buildingName || "이름 미입력 건물",
      roomNo: room.roomNo || "-",
      address: room.address || "",
    }));
}

async function currentOwnerListingRoomIds(): Promise<Set<string>> {
  try {
    const listings = await serverFetch<OwnerTradeListing[]>("/trade/listings?mine=1");
    return new Set(
      listings
        .map((listing) => listing.roomId?.trim())
        .filter((roomId): roomId is string => Boolean(roomId)),
    );
  } catch {
    return new Set<string>();
  }
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
  return value || undefined;
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

function contractActionErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.message.trim()) return error.message;
  if (error instanceof Error && /fetch failed|failed to fetch|networkerror|load failed/i.test(error.message)) {
    return "API 서버에 연결하지 못했습니다. 현재 localhost:3000/4000을 Docker 컨테이너가 잡고 있거나 API 서버가 다른 환경으로 떠 있는지 확인해 주세요.";
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return "계약서 등록 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}
