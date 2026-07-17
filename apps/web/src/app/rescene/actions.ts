"use server";

import type {
  VendorActivationIssueInput,
  VendorActivationIssueResult
} from "@roomlog/types";
import { requireUser } from "@/lib/session";
import { serverFetch } from "@/lib/server-api";

export async function issueVendorActivation(
  input: VendorActivationIssueInput
): Promise<VendorActivationIssueResult> {
  await requireUser(undefined, "/rescene");
  return await serverFetch("/auth/vendor-activations/rescene", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
