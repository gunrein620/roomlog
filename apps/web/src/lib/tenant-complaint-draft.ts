export type TenantComplaintDraftCategory = "민원" | "하자";

export type TenantComplaintDraftInput = {
  roomId: string;
  category: TenantComplaintDraftCategory;
  title: string;
  occurredAt: string | null;
  description: string;
  attachmentUrls: string[];
};

export type TenantComplaintDraft = TenantComplaintDraftInput & {
  id: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type TenantComplaintDraftImage = {
  id: string;
  url: string;
  file?: File;
  uploadedUrl?: string;
};

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type TenantComplaintDraftLoadToken = Readonly<{ sequence: number; roomId: string }>;

export function createTenantComplaintDraftLoadGuard() {
  let sequence = 0;
  return {
    begin(roomId: string): TenantComplaintDraftLoadToken {
      sequence += 1;
      return { sequence, roomId };
    },
    isCurrent(token: TenantComplaintDraftLoadToken) {
      return token.sequence === sequence;
    },
    invalidate() {
      sequence += 1;
    }
  };
}

type TenantComplaintDraftMutation = "save" | "delete" | "submit";
type TenantComplaintDraftMutationToken = Readonly<{ id: symbol; operation: TenantComplaintDraftMutation }>;

export function createTenantComplaintDraftMutationGuard() {
  let active: TenantComplaintDraftMutationToken | null = null;
  return {
    tryBegin(operation: TenantComplaintDraftMutation) {
      if (active) return null;
      active = { id: Symbol(operation), operation };
      return active;
    },
    end(token: TenantComplaintDraftMutationToken) {
      if (active?.id === token.id) active = null;
    }
  };
}

export function serializeTenantComplaintDraftOccurredAt(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function draftRoomPath(roomId: string) {
  return `/api/tenant/complaints/draft?roomId=${encodeURIComponent(roomId)}`;
}

async function responseJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => undefined)) as (T & { message?: string }) | undefined;
  if (!response.ok) throw new Error(data?.message || "민원 초안을 처리하지 못했습니다.");
  return data as T;
}

export async function loadTenantComplaintDraft(
  roomId: string,
  fetcher: Fetcher = fetch
): Promise<TenantComplaintDraft | null> {
  const response = await fetcher(draftRoomPath(roomId), { cache: "no-store" });
  const data = await responseJson<{ draft: TenantComplaintDraft | null }>(response);
  return data.draft;
}

export async function saveTenantComplaintDraft(
  input: TenantComplaintDraftInput,
  fetcher: Fetcher = fetch
): Promise<TenantComplaintDraft> {
  const response = await fetcher("/api/tenant/complaints/draft", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return responseJson<TenantComplaintDraft>(response);
}

export async function deleteTenantComplaintDraft(
  roomId: string,
  fetcher: Fetcher = fetch
): Promise<void> {
  const response = await fetcher(draftRoomPath(roomId), { method: "DELETE" });
  await responseJson<{ deleted: boolean }>(response);
}

export function mergeTenantComplaintDraftImageUrls(
  images: TenantComplaintDraftImage[],
  newlyUploadedUrls: string[]
) {
  let uploadedIndex = 0;
  return images.flatMap((image) => {
    if (image.file) {
      const url = newlyUploadedUrls[uploadedIndex++];
      return url ? [url] : [];
    }
    const url = image.uploadedUrl ?? image.url;
    return url ? [url] : [];
  });
}
