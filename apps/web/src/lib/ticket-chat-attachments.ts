export const MAX_TICKET_CHAT_IMAGES = 5;
export const MAX_TICKET_CHAT_IMAGE_BYTES = 10 * 1024 * 1024;

type TicketChatImageCandidate = Pick<File, "name" | "type" | "size">;

export function validateTicketChatImages(
  files: readonly TicketChatImageCandidate[],
  existingCount = 0,
): string | null {
  if (existingCount + files.length > MAX_TICKET_CHAT_IMAGES) {
    return "사진은 한 번에 최대 5장까지 보낼 수 있습니다.";
  }
  if (files.some((file) => !file.type.startsWith("image/"))) {
    return "이미지 파일만 첨부할 수 있습니다.";
  }
  if (files.some((file) => file.size > MAX_TICKET_CHAT_IMAGE_BYTES)) {
    return "이미지는 한 장당 10MB 이하만 첨부할 수 있습니다.";
  }
  return null;
}

export async function uploadTicketChatImages(
  files: readonly File[],
  fetcher: typeof fetch = fetch,
): Promise<string[]> {
  const urls: string[] = [];

  for (const file of files) {
    const form = new FormData();
    form.append("file", file);
    form.append("category", "ADDITIONAL_PHOTO");
    const response = await fetcher("/api/attachments", {
      method: "POST",
      body: form,
    });
    const data = (await response.json().catch(() => undefined)) as
      | { fileUrl?: string; message?: string }
      | undefined;

    if (!response.ok || !data?.fileUrl) {
      throw new Error(data?.message || "이미지 업로드에 실패했습니다.");
    }
    urls.push(data.fileUrl);
  }

  return urls;
}

export function resolveTicketChatAttachmentUrl(
  url: string,
  publicApiBase = process.env.NEXT_PUBLIC_API_URL ?? "",
): string {
  const normalizedUrl = url.trim();
  const normalizedBase = publicApiBase.trim().replace(/\/+$/, "");

  if (!normalizedUrl.startsWith("/api/") || !/^https?:\/\//.test(normalizedBase)) {
    return normalizedUrl;
  }

  return normalizedBase.endsWith("/api")
    ? `${normalizedBase}${normalizedUrl.slice(4)}`
    : `${normalizedBase}${normalizedUrl}`;
}
