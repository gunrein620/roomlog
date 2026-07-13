"use client";

import { Loader2, ScanLine } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@roomlog/ui";

export function OcrSubmitButton() {
  const { pending } = useFormStatus();
  const Icon = pending ? Loader2 : ScanLine;

  return (
    <Button
      type="submit"
      variant="secondary"
      disabled={pending}
      aria-busy={pending}
      style={{ gap: "var(--space-xs)", opacity: pending ? 0.72 : 1 }}
    >
      <Icon size={16} strokeWidth={2.5} aria-hidden="true" />
      <span>{pending ? "분석 중..." : "OCR 실행"}</span>
    </Button>
  );
}
