"use client";

import { useState, type FormEvent } from "react";
import type { TenantFurniture } from "@roomlog/types/tenant-furniture";
import { updateTenantFurnitureDimensions } from "@/lib/tenant-furniture-api";
import styles from "./furniture.module.css";

export function DimensionEditor({
  item,
  onCancel,
  onSaved
}: {
  item: TenantFurniture;
  onCancel: () => void;
  onSaved: (item: TenantFurniture) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const sizeMm = {
      width: Number(data.get("width")),
      depth: Number(data.get("depth")),
      height: Number(data.get("height"))
    };

    if (Object.values(sizeMm).some((value) => !Number.isFinite(value) || value < 50 || value > 10000)) {
      setError("각 치수는 50~10,000mm 사이로 입력해 주세요.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      onSaved(await updateTenantFurnitureDimensions(item.id, sizeMm));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "치수를 저장하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.editForm} onSubmit={submit}>
      <div className={styles.fieldGrid}>
        {(["width", "depth", "height"] as const).map((field) => (
          <label className={styles.field} key={field}>
            {{ width: "너비", depth: "깊이", height: "높이" }[field]} (mm)
            <input
              className={styles.input}
              name={field}
              type="number"
              inputMode="numeric"
              min="50"
              max="10000"
              step="1"
              defaultValue={item.sizeMm[field]}
              required
            />
          </label>
        ))}
      </div>
      {error ? <p className={styles.errorText} role="alert">{error}</p> : null}
      <div className={styles.actionRow}>
        <button type="button" className={styles.compactButton} onClick={onCancel} disabled={pending}>취소</button>
        <button type="submit" className={styles.compactButton} data-emphasis="true" disabled={pending}>
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}
