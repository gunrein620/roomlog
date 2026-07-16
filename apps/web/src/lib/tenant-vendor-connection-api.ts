import type {
  ConfirmTenantVendorConnectionInput,
  PrepareTenantVendorConnectionInput,
  TenantPartnerVendorSearchResult,
  TenantVendorConnectionPreview,
  TenantVendorConnectionRequestResult,
} from "@roomlog/types";
import { TenantClientApiError } from "./tenant-intake-api";

type BrowserFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

async function connectionJson<T>(
  path: string,
  init: RequestInit,
  fetcher: BrowserFetcher,
): Promise<T> {
  const response = await fetcher(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    const rawMessage = payload && typeof payload === "object" && "message" in payload
      ? (payload as { message?: unknown }).message
      : undefined;
    const message = Array.isArray(rawMessage)
      ? rawMessage.filter((item): item is string => typeof item === "string").join(", ")
      : typeof rawMessage === "string"
        ? rawMessage
        : "협력업체 요청을 처리하지 못했습니다.";
    throw new TenantClientApiError(response.status, message);
  }
  return payload as T;
}

function complaintPath(complaintId: string) {
  return `/api/tenant/complaints/${encodeURIComponent(complaintId)}`;
}

export function shouldRefreshTenantVendorSelection(error: unknown) {
  return error instanceof TenantClientApiError
    && error.status === 400
    && error.message === "업체 선택 확인 정보가 만료되었거나 올바르지 않습니다.";
}

export function searchTenantPartnerVendors(
  complaintId: string,
  query = "",
  fetcher: BrowserFetcher = fetch,
) {
  const params = new URLSearchParams();
  const normalizedQuery = query.trim();
  if (normalizedQuery) params.set("query", normalizedQuery);
  const search = params.toString();
  return connectionJson<TenantPartnerVendorSearchResult>(
    `${complaintPath(complaintId)}/vendor-candidates${search ? `?${search}` : ""}`,
    { method: "GET" },
    fetcher,
  );
}

export function prepareTenantVendorConnection(
  complaintId: string,
  input: PrepareTenantVendorConnectionInput,
  fetcher: BrowserFetcher = fetch,
) {
  return connectionJson<TenantVendorConnectionPreview>(
    `${complaintPath(complaintId)}/vendor-connection/preview`,
    { method: "POST", body: JSON.stringify(input) },
    fetcher,
  );
}

export function confirmTenantVendorConnection(
  complaintId: string,
  input: ConfirmTenantVendorConnectionInput,
  fetcher: BrowserFetcher = fetch,
) {
  const requestNote = input.requestNote?.trim();
  return connectionJson<TenantVendorConnectionRequestResult>(
    `${complaintPath(complaintId)}/vendor-connection/confirm`,
    {
      method: "POST",
      body: JSON.stringify({
        previewId: input.previewId,
        idempotencyKey: input.idempotencyKey,
        ...(requestNote ? { requestNote } : {}),
      } satisfies ConfirmTenantVendorConnectionInput),
    },
    fetcher,
  );
}
