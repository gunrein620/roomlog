"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@roomlog/ui";
import { confirmDirectPaymentAction } from "../actions";

export function DirectPaymentConfirmButton({ paymentRequestId }: { paymentRequestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirmReceipt() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await confirmDirectPaymentAction(paymentRequestId);
      if (!result.ok) throw new Error(result.error);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "직접결제 수령 확인을 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-sm)" }}>
      {error ? (
        <p role="alert" style={{ margin: 0, color: "var(--error)", fontSize: "var(--fs-caption)" }}>
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        fullWidth
        disabled={busy}
        aria-busy={busy}
        onClick={() => void confirmReceipt()}
      >
        {busy ? "확인 중…" : "직접결제 받았어요"}
      </Button>
    </div>
  );
}
