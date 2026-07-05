import type { Contract, ContractExtraction, ContractPrivacy } from "@roomlog/types";
import { serverFetch } from "./server-api";

export function getContract(id: string): Promise<Contract> {
  return serverFetch(`/contracts/${encodeURIComponent(id)}`);
}

export function getExtraction(contractId: string): Promise<ContractExtraction> {
  return serverFetch(`/contracts/${encodeURIComponent(contractId)}/extraction`);
}

export function getPrivacy(contractId: string): Promise<ContractPrivacy> {
  return serverFetch(`/contracts/${encodeURIComponent(contractId)}/privacy`);
}

export function listContracts(): Promise<Contract[]> {
  return serverFetch("/contracts");
}

export function requestContractDeletion(contractId: string): Promise<ContractPrivacy> {
  return serverFetch<ContractPrivacy>(`/contracts/${encodeURIComponent(contractId)}/deletion-request`, {
    method: "POST",
  });
}

export function createTenantContract(input: {
  fileName?: string;
  fileUrl?: string;
  ocrConsent: boolean;
  storageConsent: boolean;
}): Promise<{ contract: Contract; extraction: ContractExtraction; privacy: ContractPrivacy }> {
  return serverFetch("/contracts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getCurrentContractId(): Promise<string | undefined> {
  const contracts = await listContracts();

  return contracts[0]?.id;
}
