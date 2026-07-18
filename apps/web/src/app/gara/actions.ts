"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createGaraVendorPayout } from "@/lib/vendor-credit-api";

export type GaraPayoutMutationState =
  | { status: "idle" }
  | { status: "success"; message: string; balance: number }
  | { status: "error"; message: string };

export const INITIAL_GARA_PAYOUT_MUTATION_STATE: GaraPayoutMutationState = {
  status: "idle",
};

function required(value: FormDataEntryValue | null, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(label + "을(를) 확인해 주세요.");
  return value.trim();
}

export async function createGaraPayoutAction(
  _previousState: GaraPayoutMutationState,
  formData: FormData,
): Promise<GaraPayoutMutationState> {
  try {
    const rawAmount = required(formData.get("amount"), "요청 금액");
    if (!/^\d+$/.test(rawAmount)) throw new Error("요청 금액은 1원 이상의 정수여야 합니다.");
    const amount = Number(rawAmount);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error("요청 금액은 1원 이상의 정수여야 합니다.");
    }

    const result = await createGaraVendorPayout({
      managerVendorId: required(formData.get("managerVendorId"), "업체"),
      amount,
      idempotencyKey: String(formData.get("idempotencyKey") ?? "").trim() || randomUUID(),
    });
    revalidatePath("/gara");
    return {
      status: "success",
      message: "크레딧을 차감하고 지급 요청을 생성했습니다.",
      balance: result.account.balance,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error && error.message
        ? error.message
        : "지급 요청을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}
