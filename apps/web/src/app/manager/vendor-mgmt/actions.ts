"use server";

import { revalidatePath } from "next/cache";
import {
  archiveManagerVendor,
  createManagerVendor,
  registerManagerVendor,
  updateManagerVendorNote,
} from "@/lib/vendor-mgmt-api";
import { MANAGER_VENDOR_MGMT_PATHS } from "@/lib/vendor-mgmt-nav";
import type { ManagerMutationState } from "../_components/manager-mutation-state";
import {
  managerMutationError,
  managerMutationSuccess,
} from "../_components/manager-mutation-state";

function requiredFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} 값이 필요합니다.`);
  }
  return value.trim();
}

function refreshVendorPages(vendorId: string) {
  revalidatePath(MANAGER_VENDOR_MGMT_PATHS.vendors);
  revalidatePath(MANAGER_VENDOR_MGMT_PATHS.search);
  revalidatePath(MANAGER_VENDOR_MGMT_PATHS.vendor(vendorId));
  revalidatePath(MANAGER_VENDOR_MGMT_PATHS.performance(vendorId));
}

export async function createManualVendorAction(
  _previousState: ManagerMutationState,
  formData: FormData,
): Promise<ManagerMutationState> {
  try {
    await createManagerVendor({
      businessName: requiredFormString(formData, "businessName"),
      phone: requiredFormString(formData, "phone"),
      accountNumber: requiredFormString(formData, "accountNumber"),
    });
    revalidatePath(MANAGER_VENDOR_MGMT_PATHS.vendors);
    return managerMutationSuccess("업체를 등록했습니다.");
  } catch (error) {
    return managerMutationError(error);
  }
}

export async function registerVendorAction(
  _previousState: ManagerMutationState,
  formData: FormData,
): Promise<ManagerMutationState> {
  try {
    const vendorId = requiredFormString(formData, "vendorId");
    await registerManagerVendor(vendorId);
    refreshVendorPages(vendorId);
    return managerMutationSuccess("내 업체로 등록했습니다.");
  } catch (error) {
    return managerMutationError(error);
  }
}

export async function archiveVendorAction(
  _previousState: ManagerMutationState,
  formData: FormData,
): Promise<ManagerMutationState> {
  try {
    const vendorId = requiredFormString(formData, "vendorId");
    await archiveManagerVendor(vendorId);
    refreshVendorPages(vendorId);
    return managerMutationSuccess("내 업체에서 해제했습니다.");
  } catch (error) {
    return managerMutationError(error);
  }
}

export async function updateVendorNoteAction(
  _previousState: ManagerMutationState,
  formData: FormData,
): Promise<ManagerMutationState> {
  try {
    const vendorId = requiredFormString(formData, "vendorId");
    const managerNote = String(formData.get("managerNote") ?? "").trim();
    await updateManagerVendorNote(vendorId, managerNote);
    refreshVendorPages(vendorId);
    return managerMutationSuccess("관리자 메모를 저장했습니다.");
  } catch (error) {
    return managerMutationError(error);
  }
}
