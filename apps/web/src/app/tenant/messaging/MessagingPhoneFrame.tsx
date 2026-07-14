import type { ReactNode } from "react";
import { PhoneFrame } from "@roomlog/ui";

export function MessagingPhoneFrame({ children }: { children: ReactNode }) {
  return <PhoneFrame label={<span>사는 집 · 메시지</span>}>{children}</PhoneFrame>;
}
