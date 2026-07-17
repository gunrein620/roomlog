import type {
  ManagerProxyIntakeInput,
  ManagerProxyIntakeRoom,
} from "@/lib/ticket-manager-api";

export type ProxyIntakeFormFields = {
  title: string;
  description: string;
  location: string;
  occurredAt: string;
  availableTimes: string;
  urgency: 1 | 2 | 3 | 4;
  reportedVia: NonNullable<ManagerProxyIntakeInput["reportedVia"]>;
};

export type ProxyIntakeUploadResponse = {
  fileUrl?: string;
  url?: string;
};

export function createProxyIntakeClientRequestId(
  randomUUID: () => string = () => globalThis.crypto.randomUUID(),
) {
  return randomUUID();
}

export function buildManagerProxyIntakeInput({
  room,
  selectedTenantId,
  clientRequestId,
  fields,
}: {
  room: ManagerProxyIntakeRoom | undefined;
  selectedTenantId: string;
  clientRequestId: string;
  fields: ProxyIntakeFormFields;
}): ManagerProxyIntakeInput {
  if (!room) throw new Error("호실을 선택해 주세요.");
  if (room.tenants.length === 0) {
    throw new Error("연결된 세입자가 없는 호실입니다.");
  }

  const tenantId = selectedTenantId.trim();
  if (room.tenants.length > 1 && !tenantId) {
    throw new Error("세입자를 선택해 주세요");
  }
  if (tenantId && !room.tenants.some((tenant) => tenant.tenantId === tenantId)) {
    throw new Error("선택한 세입자가 해당 호실에 연결되어 있지 않습니다.");
  }

  const occurredAtValue = fields.occurredAt.trim();
  let occurredAt: string | undefined;
  if (occurredAtValue) {
    const occurredAtDate = new Date(occurredAtValue);
    if (Number.isNaN(occurredAtDate.getTime())) {
      throw new Error("발생 시점이 올바르지 않습니다.");
    }
    occurredAt = occurredAtDate.toISOString();
  }

  return {
    roomId: room.roomId,
    ...(room.tenants.length > 1 ? { tenantId } : {}),
    clientRequestId,
    title: fields.title.trim(),
    description: fields.description.trim(),
    location: fields.location.trim(),
    ...(occurredAt ? { occurredAt } : {}),
    availableTimes: fields.availableTimes.trim() || undefined,
    urgency: fields.urgency,
    reportedVia: fields.reportedVia,
  };
}

export const buildManagerProxyIntakePayload = buildManagerProxyIntakeInput;

export function resolveProxyIntakeUploadUrl(data: ProxyIntakeUploadResponse | undefined) {
  const url = data?.fileUrl ?? data?.url;
  if (!url?.trim()) throw new Error("업로드된 이미지 주소를 확인하지 못했습니다.");
  return url.trim();
}

export async function uploadProxyIntakeFiles<T>(
  files: readonly T[],
  cachedUrls: readonly string[],
  uploadFile: (file: T) => Promise<string>,
  onProgress: (urls: readonly string[]) => void,
) {
  const urls = [...cachedUrls.slice(0, files.length)];
  for (let index = urls.length; index < files.length; index += 1) {
    const file = files[index];
    if (file === undefined) continue;
    urls.push(await uploadFile(file));
    onProgress([...urls]);
  }
  return urls;
}

export function focusTrapTarget<T>(
  focusable: readonly T[],
  activeElement: T | null | undefined,
  shiftKey: boolean,
): T | undefined {
  const activeIndex = activeElement == null ? -1 : focusable.indexOf(activeElement);
  const nextIndex = nextProxyIntakeFocusIndex(activeIndex, focusable.length, shiftKey);
  return nextIndex === undefined ? undefined : focusable[nextIndex];
}

export function nextProxyIntakeFocusIndex(
  activeIndex: number,
  focusableCount: number,
  shiftKey: boolean,
): number | undefined {
  if (focusableCount < 1) return undefined;
  if (activeIndex < 0) return shiftKey ? focusableCount - 1 : 0;
  if (shiftKey && activeIndex === 0) return focusableCount - 1;
  if (!shiftKey && activeIndex === focusableCount - 1) return 0;
  return undefined;
}
