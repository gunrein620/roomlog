"use client";

import { FileSearch, FileUp, ScanLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Button, Card } from "@roomlog/ui";

export type ContractRegisterActionState = {
  redirectTo?: string;
  error?: string;
};

type ContractRegisterAction = (
  state: ContractRegisterActionState,
  formData: FormData
) => Promise<ContractRegisterActionState>;

const INITIAL_ACTION_STATE: ContractRegisterActionState = {};

type FilePreviewKind = "image" | "pdf";

export type ManagedContractRoomOption = {
  id: string;
  buildingName: string;
  roomNo: string;
  address?: string;
};

export function ContractRegisterForm({
  action,
  rooms,
}: {
  action: ContractRegisterAction;
  rooms: ManagedContractRoomOption[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const navigatedRedirectRef = useRef<string | null>(null);
  const [actionState, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE);
  const [fileName, setFileName] = useState("파일 미선택");
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [filePreviewKind, setFilePreviewKind] = useState<FilePreviewKind | null>(null);
  const [hasFile, setHasFile] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState(rooms[0]?.id ?? "");
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId);
  const hasRooms = rooms.length > 0;
  const submitDisabled = pending || !hasFile || !selectedRoomId;

  useEffect(() => {
    if (!actionState.redirectTo) return;
    if (navigatedRedirectRef.current === actionState.redirectTo) return;
    navigatedRedirectRef.current = actionState.redirectTo;
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
      setFilePreviewKind(null);
      setHasFile(false);
      return;
    }

    setFileName(file.name);
    setHasFile(true);
    if (file.type.startsWith("image/") || isPdfFile(file)) {
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setFilePreviewUrl(url);
      setFilePreviewKind(file.type.startsWith("image/") ? "image" : "pdf");
    } else {
      setFilePreviewUrl(null);
      setFilePreviewKind(null);
    }
  }

  return (
    <form ref={formRef} action={formAction} encType="multipart/form-data" aria-busy={pending} style={pageGridStyle}>
      <div className="contract-register-upload-grid" style={uploadGridStyle}>
        <Card style={uploadCardStyle}>
          <div style={dropzoneStyle}>
            <label htmlFor="manager-contract-file" style={dropzonePreviewStyle}>
              {filePreviewUrl && filePreviewKind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={filePreviewUrl} alt="선택한 계약서 미리보기" style={previewImageStyle} />
              ) : filePreviewUrl && filePreviewKind === "pdf" ? (
                <iframe
                  title="선택한 계약서 PDF 미리보기"
                  src={pdfPreviewSrc(filePreviewUrl)}
                  style={previewPdfStyle}
                />
              ) : (
                <div style={dropzoneInnerStyle}>
                  <FileSearch aria-hidden="true" style={largeIconStyle} />
                  <strong>{fileName}</strong>
                  <span style={dropzoneHintStyle}>PDF 또는 이미지 파일을 선택하면 원문 미리보기와 OCR 품질 체크를 먼저 보여줍니다.</span>
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
              {pending && hasFile ? (
                <span aria-hidden="true" className="contract-ocr-scan-overlay">
                  <span className="contract-ocr-scanline" />
                </span>
              ) : null}
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
            </div>
          </div>
          {actionState.error ? <div role="alert" style={errorNoticeStyle}>{actionState.error}</div> : null}
        </Card>

        <Card style={ocrGuideCardStyle}>
          <div style={roomSelectPanelStyle}>
            <label htmlFor="manager-contract-room" style={roomSelectLabelStyle}>매물 선택</label>
            <select
              id="manager-contract-room"
              name="roomId"
              value={selectedRoomId}
              required={hasRooms}
              disabled={pending || !hasRooms}
              onChange={(event) => setSelectedRoomId(event.currentTarget.value)}
              style={pending || !hasRooms ? disabledRoomSelectStyle : roomSelectStyle}
            >
              {hasRooms ? (
                rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.buildingName} {room.roomNo}
                  </option>
                ))
              ) : (
                <option value="">등록된 매물 없음</option>
              )}
            </select>
            <span style={roomSelectMetaStyle}>
              {selectedRoom ? selectedRoom.address || "주소 미입력" : "매물을 먼저 등록해 주세요"}
            </span>
          </div>
          <h3 style={guideTitleStyle}>이번 OCR이 읽는 항목</h3>
          <div style={guideListStyle}>
            <OcrReadItem index="1" title="보증금 구조" note="기본 보증금, 전환보증금, 최종 보증금" badge="필수" emphasis />
            <OcrReadItem index="2" title="특약" note="계약서에 없으면 문서에 없음으로 확정" badge="선택" />
            <OcrReadItem index="3" title="자동연장·원상복구·수선 책임" note="있으면 원문 기준으로 저장, 없으면 숨김 처리" badge="선택" />
          </div>
        </Card>
      </div>
    </form>
  );
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function pdfPreviewSrc(url: string) {
  return url.includes("#") ? url : `${url}#toolbar=0&navpanes=0&view=Fit`;
}

function OcrReadItem({
  index,
  title,
  note,
  badge,
  emphasis = false,
}: {
  index: string;
  title: string;
  note: string;
  badge: string;
  emphasis?: boolean;
}) {
  return (
    <div style={guideItemStyle}>
      <span style={guideIndexStyle}>{index}</span>
      <div style={guideItemTextStyle}>
        <strong style={guideItemTitleStyle}>{title}</strong>
        <span>{note}</span>
      </div>
      <span style={emphasis ? requiredBadgeStyle : optionalBadgeStyle}>{badge}</span>
    </div>
  );
}

const pageGridStyle = {
  display: "grid",
  gap: "var(--space-lg)",
} as const;

const uploadGridStyle = {
  display: "grid",
  width: "100%",
  maxWidth: "none",
  marginInline: 0,
  gridTemplateColumns: "minmax(320px, 0.86fr) minmax(360px, 1.04fr)",
  gap: "var(--space-lg)",
  alignItems: "stretch",
} as const;

const uploadCardStyle = {
  minHeight: 430,
  display: "grid",
  gap: "var(--space-md)",
  borderRadius: "var(--radius-lg)",
  padding: "var(--space-lg)",
} as const;

const dropzoneStyle = {
  minHeight: 390,
  display: "grid",
  placeItems: "center",
  alignContent: "center",
  gap: "var(--space-lg)",
  border: "1.5px dashed var(--outline-variant)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-container-low)",
  overflow: "hidden",
  padding: "var(--space-lg)",
} as const;

const dropzonePreviewStyle = {
  position: "relative",
  width: "100%",
  minHeight: 220,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
} as const;

const dropzoneInnerStyle = {
  display: "grid",
  justifyItems: "center",
  gap: "var(--space-sm)",
  textAlign: "center",
  color: "var(--on-surface-variant)",
} as const;

const dropzoneHintStyle = {
  maxWidth: 430,
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-body)",
  fontWeight: 700,
  lineHeight: "var(--lh-body)",
} as const;

// 웹 전용 화면 — 계약서 한 장(A4 세로)이 통째로 보이도록 미리보기를 문서 비율로 키운다.
const previewImageStyle = {
  width: "100%",
  height: "auto",
  maxHeight: "none",
  objectFit: "contain",
  borderRadius: "var(--radius)",
  background: "var(--surface-container-lowest)",
} as const;

const previewPdfStyle = {
  width: "100%",
  aspectRatio: "210 / 297",
  height: "auto",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  background: "var(--surface-container-lowest)",
} as const;

const uploadActionStyle = {
  display: "flex",
  justifyContent: "center",
  gap: "var(--space-sm)",
  flexWrap: "wrap",
} as const;

const fileButtonStyle = {
  minHeight: "var(--touch-target)",
  width: "auto",
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-sm)",
  border: "1.5px solid var(--primary)",
  borderRadius: "var(--radius-btn)",
  padding: "0 var(--space-lg)",
  color: "var(--primary)",
  background: "var(--surface-container-lowest)",
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
  width: "auto",
  gap: "var(--space-sm)",
  minHeight: "var(--touch-target)",
  paddingInline: "var(--space-lg)",
} as const;

const disabledSubmitButtonStyle = {
  ...buttonWithIconStyle,
  opacity: 0.55,
  cursor: "not-allowed",
} as const;

const ocrGuideCardStyle = {
  minHeight: 430,
  display: "grid",
  alignContent: "start",
  gap: "var(--space-lg)",
  borderRadius: "var(--radius-lg)",
  padding: "var(--space-xl)",
} as const;

const roomSelectPanelStyle = {
  display: "grid",
  gap: "var(--space-sm)",
  padding: "var(--space-md)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-container-low)",
} as const;

const roomSelectLabelStyle = {
  color: "var(--on-surface)",
  fontSize: "var(--fs-body)",
  fontWeight: 900,
} as const;

const roomSelectStyle = {
  minHeight: "var(--touch-target)",
  width: "100%",
  border: "1px solid var(--input-border)",
  borderRadius: "var(--radius-btn)",
  padding: "0 var(--space-md)",
  color: "var(--input-text)",
  background: "var(--surface-container-lowest)",
  font: "inherit",
  fontWeight: 800,
} as const;

const disabledRoomSelectStyle = {
  ...roomSelectStyle,
  opacity: 0.55,
  cursor: "not-allowed",
} as const;

const roomSelectMetaStyle = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
  lineHeight: "var(--lh-caption)",
} as const;

const guideTitleStyle = {
  margin: 0,
  color: "var(--on-surface)",
  fontSize: "var(--fs-subtitle)",
  lineHeight: "var(--lh-subtitle)",
} as const;

const guideListStyle = {
  display: "grid",
  gap: "var(--space-sm)",
} as const;

const guideItemStyle = {
  minHeight: 78,
  display: "grid",
  gridTemplateColumns: "44px minmax(0, 1fr) auto",
  gap: "var(--space-md)",
  alignItems: "center",
  padding: "var(--space-md)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  background: "var(--surface-container-lowest)",
} as const;

const guideIndexStyle = {
  width: 42,
  height: 42,
  display: "grid",
  placeItems: "center",
  borderRadius: "var(--radius-sm)",
  color: "var(--primary)",
  background: "var(--primary-container)",
  fontWeight: 900,
} as const;

const guideItemTextStyle = {
  minWidth: 0,
  display: "grid",
  gap: "var(--space-xs)",
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  lineHeight: "var(--lh-caption)",
} as const;

const guideItemTitleStyle = {
  color: "var(--on-surface)",
  fontSize: "var(--fs-body)",
  lineHeight: "var(--lh-body)",
} as const;

const requiredBadgeStyle = {
  borderRadius: "var(--radius-full)",
  padding: "var(--space-xs) var(--space-sm)",
  color: "var(--success)",
  background: "color-mix(in srgb, var(--success) 14%, var(--surface-container-lowest))",
  fontSize: "var(--fs-caption)",
  fontWeight: 900,
} as const;

const optionalBadgeStyle = {
  ...requiredBadgeStyle,
  color: "var(--on-surface-variant)",
  background: "var(--surface-container-low)",
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
