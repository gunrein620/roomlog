"use client";

import { FileSearch, FileUp, ScanLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Badge, Button, Card } from "@roomlog/ui";

export type ContractRegisterActionState = {
  redirectTo?: string;
  error?: string;
};

type ContractRegisterAction = (
  state: ContractRegisterActionState,
  formData: FormData
) => Promise<ContractRegisterActionState>;

const INITIAL_ACTION_STATE: ContractRegisterActionState = {};

export function ContractRegisterForm({ action }: { action: ContractRegisterAction }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [actionState, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE);
  const [fileName, setFileName] = useState("파일 미선택");
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [hasFile, setHasFile] = useState(false);
  const submitDisabled = pending || !hasFile;

  useEffect(() => {
    if (!actionState.redirectTo) return;
    router.push(actionState.redirectTo);
  }, [actionState.redirectTo, router]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    if (!file) {
      setFileName("파일 미선택");
      setFilePreviewUrl(null);
      setHasFile(false);
      return;
    }

    setFileName(file.name);
    setHasFile(true);
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setFilePreviewUrl(url);
    } else {
      setFilePreviewUrl(null);
    }
  }

  return (
    <form ref={formRef} action={formAction} encType="multipart/form-data" aria-busy={pending} style={pageGridStyle}>
      <Card style={heroCardStyle}>
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          <div style={stepRowStyle}>
            <StepPill active>1 계약서 입력</StepPill>
            <StepPill>2 OCR 분석</StepPill>
            <StepPill>3 값 보강</StepPill>
            <StepPill>4 확정</StepPill>
          </div>
          <h2 style={titleStyle}>계약서 파일만 먼저 입력하세요</h2>
          <p style={mutedStyle}>매물 기본값은 DB를 사용하고, OCR은 계약서 원문에서 보증금과 특약성 조항만 확인합니다.</p>
        </div>

        <div className="contract-register-upload-grid" style={uploadGridStyle}>
          <label style={dropzoneStyle}>
            {filePreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={filePreviewUrl} alt="선택한 계약서 이미지 미리보기" style={previewImageStyle} />
            ) : (
              <div style={dropzoneInnerStyle}>
                <FileSearch aria-hidden="true" style={largeIconStyle} />
                <strong>{fileName}</strong>
                <span style={mutedStyle}>PDF 또는 이미지 파일을 선택하세요.</span>
              </div>
            )}
            <input
              id="manager-contract-file"
              name="contractFile"
              type="file"
              accept="application/pdf,image/*"
              required
              disabled={pending}
              onChange={handleFileChange}
              style={visuallyHiddenStyle}
            />
          </label>

          <div className="contract-register-upload-actions" style={uploadActionStyle}>
            <label
              className="contract-register-upload-button"
              htmlFor="manager-contract-file"
              aria-disabled={pending}
              style={pending ? disabledFileButtonStyle : fileButtonStyle}
            >
              <FileUp aria-hidden="true" style={smallIconStyle} />
              <span>파일 선택</span>
            </label>
            <Button
              className="contract-register-submit-button"
              type="submit"
              name="intent"
              value="ocr-first"
              disabled={submitDisabled}
              aria-disabled={submitDisabled}
              style={submitDisabled ? disabledSubmitButtonStyle : buttonWithIconStyle}
            >
              <ScanLine aria-hidden="true" style={smallIconStyle} />
              {pending ? "처리 중" : "계약서 입력"}
            </Button>
            {actionState.error ? <div role="alert" style={errorNoticeStyle}>{actionState.error}</div> : null}
          </div>
        </div>
      </Card>
    </form>
  );
}

function StepPill({ active = false, children }: { active?: boolean; children: ReactNode }) {
  return <Badge emphasis={active}>{children}</Badge>;
}

const pageGridStyle = {
  display: "grid",
  gap: "var(--space-lg)",
} as const;

const heroCardStyle = {
  display: "grid",
  gap: "var(--space-lg)",
} as const;

const stepRowStyle = {
  display: "flex",
  gap: "var(--space-sm)",
  flexWrap: "wrap",
} as const;

const titleStyle = {
  margin: 0,
  fontSize: "var(--fs-title)",
  lineHeight: "var(--lh-title)",
} as const;

const uploadGridStyle = {
  display: "grid",
  width: "100%",
  maxWidth: 980,
  marginInline: "auto",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
  gap: "var(--space-lg)",
  alignItems: "stretch",
} as const;

const dropzoneStyle = {
  minHeight: 300,
  display: "grid",
  placeItems: "center",
  border: "1.5px dashed var(--outline-variant)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-container-low)",
  cursor: "pointer",
  overflow: "hidden",
  padding: "var(--space-lg)",
} as const;

const dropzoneInnerStyle = {
  display: "grid",
  justifyItems: "center",
  gap: "var(--space-sm)",
  textAlign: "center",
  color: "var(--on-surface-variant)",
} as const;

const previewImageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  borderRadius: "var(--radius)",
} as const;

const uploadActionStyle = {
  display: "grid",
  gap: "var(--space-md)",
  alignContent: "center",
  justifyItems: "center",
} as const;

const fileButtonStyle = {
  minHeight: "var(--touch-target)",
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-sm)",
  borderRadius: "var(--radius-btn)",
  color: "var(--on-primary)",
  background: "var(--primary)",
  fontWeight: 800,
  cursor: "pointer",
} as const;

const disabledFileButtonStyle = {
  ...fileButtonStyle,
  opacity: 0.55,
  cursor: "not-allowed",
  pointerEvents: "none",
} as const;

const visuallyHiddenStyle = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
} as const;

const buttonWithIconStyle = {
  gap: "var(--space-sm)",
  minHeight: "var(--touch-target)",
} as const;

const disabledSubmitButtonStyle = {
  ...buttonWithIconStyle,
  opacity: 0.55,
  cursor: "not-allowed",
} as const;

const errorNoticeStyle = {
  border: "1px solid color-mix(in srgb, var(--error, #dc2626) 45%, var(--border))",
  borderRadius: "var(--radius)",
  padding: "var(--space-md)",
  color: "var(--error, #dc2626)",
  background: "color-mix(in srgb, var(--error, #dc2626) 10%, var(--surface-container-lowest))",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
  lineHeight: "var(--lh-body)",
} as const;

const largeIconStyle = {
  width: 48,
  height: 48,
} as const;

const smallIconStyle = {
  width: 18,
  height: 18,
  flex: "0 0 auto",
} as const;

const mutedStyle = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  lineHeight: "var(--lh-body)",
} as const;
