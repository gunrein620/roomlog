"use client";

import { useState, useTransition } from "react";
import {
  VENDOR_TRADE_OPTIONS,
  vendorTradeLabel,
  type ResceneVendorActivation,
  type VendorActivationIssueInput,
  type VendorTrade
} from "@roomlog/types";
import { issueVendorActivation } from "./actions";
import styles from "./ResceneVendorIssuer.module.css";

const emptyInput: VendorActivationIssueInput = {
  businessName: "",
  contactPerson: "",
  phone: "",
  trades: [],
  serviceAreas: []
};

export function ResceneVendorIssuer({
  initialItems
}: {
  initialItems: ResceneVendorActivation[];
}) {
  const [input, setInput] = useState(emptyInput);
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const [serviceAreaDraft, setServiceAreaDraft] = useState("");
  const [isPending, startTransition] = useTransition();

  const setText = (field: "businessName" | "contactPerson" | "phone") =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setInput((current) => ({ ...current, [field]: event.target.value }));

  const toggleTrade = (trade: VendorTrade) => {
    setInput((current) => ({
      ...current,
      trades: current.trades.includes(trade)
        ? current.trades.filter((value) => value !== trade)
        : [...current.trades, trade]
    }));
  };

  const addServiceArea = () => {
    const value = serviceAreaDraft.trim();
    if (!value) return;
    setInput((current) => ({
      ...current,
      serviceAreas: current.serviceAreas.includes(value)
        ? current.serviceAreas
        : [...current.serviceAreas, value]
    }));
    setServiceAreaDraft("");
  };

  const removeServiceArea = (area: string) => {
    setInput((current) => ({
      ...current,
      serviceAreas: current.serviceAreas.filter((value) => value !== area)
    }));
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (input.trades.length === 0) {
      setError("업종을 하나 이상 선택해 주세요.");
      return;
    }
    const draft = serviceAreaDraft.trim();
    const serviceAreas = [...new Set([...input.serviceAreas, ...(draft ? [draft] : [])])];
    if (serviceAreas.length === 0) {
      setError("출동 지역을 하나 이상 추가해 주세요.");
      return;
    }
    startTransition(async () => {
      try {
        const created = await issueVendorActivation({ ...input, serviceAreas });
        setItems((current) => [created, ...current]);
        setInput(emptyInput);
        setServiceAreaDraft("");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "업체를 등록하지 못했습니다.");
      }
    });
  };

  const copyKey = async (activationKey: string) => {
    await navigator.clipboard.writeText(activationKey);
    setCopiedKey(activationKey);
  };

  return (
    <div className={styles.workspace}>
      <form className={styles.form} onSubmit={submit}>
        <h2>업체와 등록 키 생성</h2>
        <div className={styles.fields}>
          <label>업체명<input value={input.businessName} onChange={setText("businessName")} required /></label>
          <label>담당자<input value={input.contactPerson} onChange={setText("contactPerson")} required /></label>
          <label>연락처<input value={input.phone} onChange={setText("phone")} required /></label>
          <label>
            출동 지역
            <span className={styles.areaInput}>
              <input
                value={serviceAreaDraft}
                onChange={(event) => setServiceAreaDraft(event.target.value)}
                placeholder="예: 강서구 또는 화곡동"
              />
              <button type="button" onClick={addServiceArea}>추가</button>
            </span>
          </label>
          {input.serviceAreas.length ? (
            <div className={styles.areaTags} aria-label="등록한 출동 지역">
              {input.serviceAreas.map((area) => (
                <button key={area} type="button" onClick={() => removeServiceArea(area)}>
                  {area} ×
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <fieldset className={styles.trades}>
          <legend>업종</legend>
          {VENDOR_TRADE_OPTIONS.map((option) => (
            <label key={option.value}>
              <input
                type="checkbox"
                checked={input.trades.includes(option.value)}
                onChange={() => toggleTrade(option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <button className={styles.primary} type="submit" disabled={isPending}>
          {isPending ? "생성 중" : "업체와 등록 키 생성"}
        </button>
      </form>

      <section className={styles.list} aria-labelledby="rescene-vendors-title">
        <h2 id="rescene-vendors-title">이 페이지에서 생성한 업체</h2>
        {items.length === 0 ? <p className={styles.empty}>아직 생성한 업체가 없습니다.</p> : null}
        {items.map((item) => (
          <article className={styles.vendor} key={item.activationKey}>
            <div className={styles.vendorHeading}>
              <strong>{item.businessName}</strong>
              <span>{item.verificationStatus} · {item.activationStatus}</span>
            </div>
            <p>{item.contactPerson} · {item.phone}</p>
            <p>{item.serviceAreas.join(" · ")} · {item.trades.map(vendorTradeLabel).join(", ")}</p>
            <div className={styles.keyRow}>
              <code>{item.activationKey}</code>
              <button type="button" onClick={() => void copyKey(item.activationKey)}>
                {copiedKey === item.activationKey ? "복사됨" : "키 복사"}
              </button>
            </div>
            <small>만료 {new Date(item.expiresAt).toLocaleString("ko-KR")}</small>
          </article>
        ))}
      </section>
    </div>
  );
}
