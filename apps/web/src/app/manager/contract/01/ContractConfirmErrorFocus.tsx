"use client";

import { useEffect } from "react";

export function ContractConfirmErrorFocus({ targetId }: { targetId: string }) {
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      if (!target) return;

      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [targetId]);

  return null;
}
