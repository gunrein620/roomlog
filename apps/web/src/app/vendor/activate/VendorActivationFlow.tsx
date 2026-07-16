"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  VENDOR_ACTIVATION_PREVIEW_STORAGE,
  formatVendorActivationKeyInput,
  type VendorActivationBrowserPreview
} from "@/lib/vendor-activation";
import { vendorActivationAuthPaths } from "../vendor-signup";
import styles from "./VendorActivationFlow.module.css";

type ActivationStep = 1 | 2 | 3 | 4 | 5;

const stepLabels = [
  "등록 키 입력",
  "업체 정보 확인",
  "업체 전용 계정",
  "연결 중",
  "연결 완료"
] as const;

function readStoredPreview() {
  try {
    const value = sessionStorage.getItem(VENDOR_ACTIVATION_PREVIEW_STORAGE);
    if (!value) return null;
    const parsed = JSON.parse(value) as VendorActivationBrowserPreview;
    if (!parsed?.vendor?.vendorId || !parsed.vendor.businessName || !parsed.flowId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function formatExpiry(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "잠시 동안";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(date);
}

export function VendorActivationFlow({
  authenticated,
  viewerName
}: {
  authenticated: boolean;
  viewerName?: string;
}) {
  const [step, setStep] = useState<ActivationStep>(1);
  const [rawKey, setRawKey] = useState("");
  const [preview, setPreview] = useState<VendorActivationBrowserPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const authPaths = useMemo(() => vendorActivationAuthPaths(), []);

  useEffect(() => {
    const storedPreview = readStoredPreview();
    if (!storedPreview) return;
    setPreview(storedPreview);
    setStep(authenticated ? 3 : 2);
  }, [authenticated]);

  async function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rawKey || pending) return;

    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/vendor/activation/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: rawKey })
      });
      const body = await response.json().catch(() => undefined);
      setRawKey("");

      if (!response.ok) {
        setError(body?.message ?? "등록 키를 확인하지 못했습니다. 다시 입력해 주세요.");
        return;
      }

      const nextPreview = body as VendorActivationBrowserPreview;
      setPreview(nextPreview);
      sessionStorage.setItem(VENDOR_ACTIVATION_PREVIEW_STORAGE, JSON.stringify(nextPreview));
      setStep(2);
    } catch {
      setRawKey("");
      setError("네트워크 오류로 등록 키를 확인하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  function resetActivation() {
    sessionStorage.removeItem(VENDOR_ACTIVATION_PREVIEW_STORAGE);
    setPreview(null);
    setRawKey("");
    setError("");
    setStep(1);
  }

  async function claim() {
    if (!authenticated || !preview || pending) return;
    setPending(true);
    setError("");
    setStep(4);

    try {
      const response = await fetch("/api/vendor/activation/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId: preview.flowId })
      });
      const body = await response.json().catch(() => undefined);
      if (!response.ok) {
        setError(body?.message ?? "업체 계정을 연결하지 못했습니다. 다시 확인해 주세요.");
        setStep(2);
        return;
      }

      sessionStorage.removeItem(VENDOR_ACTIVATION_PREVIEW_STORAGE);
      setStep(5);
    } catch {
      setError("네트워크 오류로 업체 계정을 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setStep(2);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.flow}>
      <header className={styles.header}>
        <div className={styles.stepMeta}>
          <span>업체 계정 활성화</span>
          <strong>{step} / 5</strong>
        </div>
        <div className={styles.progress} aria-label={`5단계 중 ${step}단계`}>
          {stepLabels.map((label, index) => (
            <span
              key={label}
              className={index + 1 <= step ? styles.progressActive : undefined}
              title={label}
            />
          ))}
        </div>
        <p className={styles.currentStep}>{stepLabels[step - 1]}</p>
      </header>

      {step === 1 ? (
        <form className={styles.content} onSubmit={submitPreview}>
          <div className={styles.intro}>
            <span className={styles.eyebrow}>등록 키 입력</span>
            <h1>운영팀에서 받은 키를 입력해 주세요</h1>
            <p>키는 업체 정보를 확인하는 데 한 번만 사용하며 주소나 브라우저 저장소에 남기지 않습니다.</p>
          </div>
          <label className={styles.field}>
            업체 등록 키
            <input
              value={rawKey}
              onChange={(event) => setRawKey(formatVendorActivationKeyInput(event.target.value))}
              placeholder="운영팀에서 받은 등록 키"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={64}
              required
            />
          </label>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <button className={styles.primaryButton} type="submit" disabled={pending || !rawKey}>
            {pending ? "확인 중" : "업체 정보 확인"}
          </button>
          <a className={styles.textLink} href="/vendor">업체 시작 화면으로 돌아가기</a>
        </form>
      ) : null}

      {step === 2 && preview ? (
        <section className={styles.content}>
          <div className={styles.intro}>
            <span className={styles.eyebrow}>업체 정보 확인</span>
            <h1>{preview.vendor.businessName}</h1>
            <p>내 업체가 맞는지 확인한 뒤 전용 계정 연결을 진행해 주세요.</p>
          </div>
          <dl className={styles.summary}>
            <div><dt>업종</dt><dd>{preview.vendor.trades.join(" · ") || "정보 없음"}</dd></div>
            <div><dt>서비스 지역</dt><dd>{preview.vendor.serviceAreas.join(" · ") || "정보 없음"}</dd></div>
            <div><dt>연락처</dt><dd>{preview.vendor.maskedPhone}</dd></div>
            <div><dt>확인 유효시간</dt><dd>{formatExpiry(preview.activationSessionExpiresAt)}까지</dd></div>
          </dl>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <button className={styles.primaryButton} type="button" onClick={() => setStep(3)}>
            이 업체가 맞아요
          </button>
          <button className={styles.secondaryButton} type="button" onClick={resetActivation}>
            등록 키 다시 입력
          </button>
        </section>
      ) : null}

      {step === 3 && preview ? (
        <section className={styles.content}>
          <div className={styles.intro}>
            <span className={styles.eyebrow}>업체 전용 계정</span>
            <h1>{authenticated ? `${viewerName ?? "현재"} 계정으로 연결할까요?` : "전용 계정으로 로그인해 주세요"}</h1>
            <p>
              {authenticated
                ? "연결이 완료되면 이 계정은 업체 작업함과 정산 화면에 접근할 수 있습니다."
                : "세입자·관리자 계정과 업무 기록이 섞이지 않도록 업체 전용 계정을 사용합니다."}
            </p>
          </div>
          {authenticated ? (
            <button className={styles.primaryButton} type="button" onClick={claim} disabled={pending}>
              업체 계정 연결하기
            </button>
          ) : (
            <div className={styles.authActions}>
              <a className={styles.primaryButton} href={authPaths.login}>업체 계정 로그인</a>
              <a className={styles.secondaryButton} href={authPaths.signup}>업체 전용 계정 만들기</a>
            </div>
          )}
          <button className={styles.textButton} type="button" onClick={() => setStep(2)}>
            업체 정보 다시 보기
          </button>
        </section>
      ) : null}

      {step === 4 ? (
        <section className={`${styles.content} ${styles.centered}`} aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div className={styles.intro}>
            <span className={styles.eyebrow}>연결 중</span>
            <h1>업체 계정을 안전하게 연결하고 있어요</h1>
            <p>잠시만 기다려 주세요. 버튼을 다시 누르지 않아도 됩니다.</p>
          </div>
        </section>
      ) : null}

      {step === 5 ? (
        <section className={`${styles.content} ${styles.centered}`} aria-live="polite">
          <span className={styles.successMark} aria-hidden="true">✓</span>
          <div className={styles.intro}>
            <span className={styles.eyebrow}>연결 완료</span>
            <h1>업체 전용 계정이 준비됐어요</h1>
            <p>새 요청과 진행 중인 수리 업무를 작업함에서 확인할 수 있습니다.</p>
          </div>
          <a className={styles.primaryButton} href="/vendor/job/00">작업함으로 이동</a>
        </section>
      ) : null}
    </div>
  );
}
