import { createHash } from "node:crypto";
import type { MessagingAnnouncementLanguage } from "../roomlog.types";

export const ANNOUNCEMENT_LANGUAGES: ReadonlyArray<{
  lang: MessagingAnnouncementLanguage;
  label: string;
  promptName: string;
}> = [
  { lang: "en", label: "English", promptName: "English" },
  { lang: "zh", label: "中文", promptName: "Simplified Chinese" },
  { lang: "vi", label: "Tiếng Việt", promptName: "Vietnamese" }
];

export function announcementSourceHash(title: string, body: string): string {
  return createHash("sha256").update(`${title.trim()}\n${body.trim()}`).digest("hex");
}
