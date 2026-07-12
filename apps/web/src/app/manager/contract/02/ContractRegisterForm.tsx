"use client";

import { CheckCircle2, ClipboardCheck, FileSearch, FileUp, Save, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Badge, Button, Card, Input } from "@roomlog/ui";

const DRAFT_KEY = "roomlog:manager-contract-register-draft";

const requiredChecks = [
  { label: "호실", name: "unitId" },
  { label: "임차인", name: "tenantName" },
  { label: "계약 기간", name: "startDate" },
  { label: "만료일", name: "endDate" },
  { label: "계약서 파일", name: "contractFile" },
] as const;

const ocrPreviewRows = [
  { label: "보증금", source: "수동 입력값", ocr: "OCR 미실행" },
  { label: "월세", source: "수동 입력값", ocr: "OCR 미실행" },
  { label: "계약 기간", source: "수동 입력값", ocr: "OCR 미실행" },
  { label: "임대인 계좌", source: "수동 입력값", ocr: "OCR 미실행" },
] as const;

type ContractRegisterAction = (formData: FormData) => void | Promise<void>;

export function ContractRegisterForm({ action }: { action: ContractRegisterAction }) {
  const formRef = useRef<HTMLFormElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [fileName, setFileName] = useState("파일 미선택");
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState("");
  const [readyCount, setReadyCount] = useState(0);
  const [readyByName, setReadyByName] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) {
      updateReadyCount(form);
      return;
    }

    try {
      const draft = JSON.parse(raw) as Record<string, string>;
      Object.entries(draft).forEach(([name, value]) => {
        if (name === "updatedAt") return;
        const field = form.elements.namedItem(name);
        if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
          field.value = value;
        }
      });
      setDraftNotice("저장된 초안을 불러왔습니다. 계약서 파일은 다시 선택하세요.");
    } catch {
      window.localStorage.removeItem(DRAFT_KEY);
    }

    updateReadyCount(form);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function updateReadyCount(form: HTMLFormElement) {
    const nextReadyByName: Record<string, boolean> = {};
    const nextCount = requiredChecks.filter(({ name }) => {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement && field.type === "file") {
        const ready = Boolean(field.files?.length);
        nextReadyByName[name] = ready;
        return ready;
      }
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
        const ready = Boolean(field.value.trim());
        nextReadyByName[name] = ready;
        return ready;
      }
      nextReadyByName[name] = false;
      return false;
    }).length;

    setReadyCount(nextCount);
    setReadyByName(nextReadyByName);
  }

  function handleFormChange() {
    const form = formRef.current;
    if (form) updateReadyCount(form);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    if (!file) {
      setFileName("파일 미선택");
      setFilePreviewUrl(null);
      handleFormChange();
      return;
    }

    setFileName(file.name);
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setFilePreviewUrl(url);
    } else {
      setFilePreviewUrl(null);
    }
    handleFormChange();
  }

  function saveDraft() {
    const form = formRef.current;
    if (!form) return;

    const formData = new FormData(form);
    const draft: Record<string, string> = {};
    formData.forEach((value, key) => {
      if (value instanceof File) return;
      draft[key] = String(value);
    });
    draft.updatedAt = new Date().toISOString();

    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    setDraftNotice("초안이 이 브라우저에 저장되었습니다. 파일은 보안상 저장하지 않습니다.");
  }

  return (
    <form
      ref={formRef}
      action={action}
      onChange={handleFormChange}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
        gap: "var(--space-lg)",
        alignItems: "start",
      }}
    >
      <div style={{ display: "grid", gap: "var(--space-lg)", minWidth: 0 }}>
        <Card style={panelStyle}>
          <PanelTitle eyebrow="STEP 01" title="호실·임차인" />
          <div style={twoColumnGridStyle}>
            <Field label="건물">
              <Input name="buildingName" aria-label="건물" defaultValue="정글빌라" />
            </Field>
            <Field label="호실">
              <Input name="unitId" aria-label="호실" defaultValue="301" required />
            </Field>
            <Field label="임차인 이름">
              <Input name="tenantName" aria-label="임차인 이름" placeholder="예: 김민수" required />
            </Field>
            <Field label="임차인 연락처">
              <Input name="tenantPhone" aria-label="임차인 연락처" placeholder="010-0000-0000" />
            </Field>
            <Field label="임차인 이메일">
              <Input name="tenantEmail" aria-label="임차인 이메일" type="email" placeholder="tenant@example.com" />
            </Field>
            <Field label="계약 유형">
              <select name="contractType" aria-label="계약 유형" defaultValue="new" style={fieldStyle}>
                <option value="new">신규</option>
                <option value="renewal">재계약</option>
                <option value="change">변경계약</option>
                <option value="termination">해지</option>
              </select>
            </Field>
          </div>
        </Card>

        <Card style={panelStyle}>
          <PanelTitle eyebrow="STEP 02" title="금액·기간" />
          <div style={twoColumnGridStyle}>
            <Field label="계약 시작일">
              <Input name="startDate" aria-label="계약 시작일" type="date" required />
            </Field>
            <Field label="계약 종료일">
              <Input name="endDate" aria-label="계약 종료일" type="date" required />
            </Field>
            <Field label="입주 예정일">
              <Input name="moveInDate" aria-label="입주 예정일" type="date" />
            </Field>
            <Field label="납부일">
              <Input name="paymentDay" aria-label="납부일" inputMode="numeric" placeholder="25" />
            </Field>
            <Field label="보증금">
              <Input name="deposit" aria-label="보증금" placeholder="10,000,000원" />
            </Field>
            <Field label="월세">
              <Input name="monthlyRent" aria-label="월세" inputMode="numeric" placeholder="650000" />
            </Field>
            <Field label="관리비">
              <Input name="maintenanceFee" aria-label="관리비" inputMode="numeric" placeholder="70000" />
            </Field>
            <Field label="임대인 계좌">
              <Input name="landlordAccount" aria-label="임대인 계좌" placeholder="은행명 계좌번호" />
            </Field>
          </div>
        </Card>

        <Card style={panelStyle}>
          <PanelTitle eyebrow="STEP 03" title="계약서 파일" />
          <div style={fileLayoutStyle}>
            <div style={dropzoneStyle}>
              {filePreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={filePreviewUrl}
                  alt="선택한 계약서 이미지 미리보기"
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "var(--radius)" }}
                />
              ) : (
                <div style={{ display: "grid", justifyItems: "center", gap: "var(--space-sm)", textAlign: "center" }}>
                  <FileSearch aria-hidden="true" style={iconStyle} />
                  <strong>{fileName}</strong>
                  <span style={mutedStyle}>등록 시 원본 파일이 저장되고 검토 화면의 계약 문서에 연결됩니다.</span>
                </div>
              )}
            </div>
            <div style={{ display: "grid", gap: "var(--space-md)", alignContent: "start" }}>
              <label style={fileButtonStyle}>
                <FileUp aria-hidden="true" style={smallIconStyle} />
                <span>계약서 선택</span>
                <input
                  name="contractFile"
                  type="file"
                  accept="application/pdf,image/*"
                  required
                  onChange={handleFileChange}
                  style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
                />
              </label>
              <textarea
                name="specialTerms"
                aria-label="특약사항 메모"
                placeholder="특약사항, 원상복구, 자동연장 등 담당자 메모"
                style={{ ...fieldStyle, minHeight: 132, paddingTop: "var(--space-md)", resize: "vertical" }}
              />
            </div>
          </div>
        </Card>
      </div>

      <aside style={{ display: "grid", gap: "var(--space-lg)", minWidth: 0 }}>
        <Card style={panelStyle}>
          <PanelTitle eyebrow="GATE" title="등록 준비 상태" />
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            {requiredChecks.map((item) => (
              <div key={item.name} style={checkRowStyle}>
                <span>{item.label}</span>
                <Badge emphasis={readyByName[item.name]}>{readyByName[item.name] ? "확인" : "대기"}</Badge>
              </div>
            ))}
          </div>
          <div style={summaryBoxStyle}>
            <ClipboardCheck aria-hidden="true" style={smallIconStyle} />
            <span>
              필수 항목 {readyCount}/{requiredChecks.length}
            </span>
          </div>
        </Card>

        <Card style={panelStyle}>
          <PanelTitle eyebrow="OCR" title="추출 결과 자리" />
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            <Badge emphasis>OCR 미실행</Badge>
            <Badge>민감정보 마스킹</Badge>
            <Badge>검토 대기</Badge>
          </div>
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            {ocrPreviewRows.map((row) => (
              <div key={row.label} style={ocrRowStyle}>
                <div style={{ fontWeight: 800 }}>{row.label}</div>
                <div style={mutedStyle}>입력값: {row.source}</div>
                <div style={mutedStyle}>OCR값: {row.ocr}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card style={panelStyle}>
          <PanelTitle eyebrow="LINK" title="호실·타임라인 연결" />
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            <InfoLine label="등록 후 상태" value="원본 저장 · 검토 대기" />
            <InfoLine label="대조 화면" value="M-DOC-01" />
            <InfoLine label="호실 이력" value="타임라인에서 확인" />
          </div>
          <div style={privacyBoxStyle}>
            <ShieldCheck aria-hidden="true" style={smallIconStyle} />
            <span>계약 원문과 민감정보는 검토 단계에서 마스킹 기준을 확인합니다.</span>
          </div>
        </Card>

        {draftNotice ? <div style={noticeStyle}>{draftNotice}</div> : null}

        <div style={actionBarStyle}>
          <Button type="button" variant="secondary" onClick={saveDraft} style={buttonWithIconStyle}>
            <Save aria-hidden="true" style={smallIconStyle} />
            초안 저장
          </Button>
          <Button type="submit" style={buttonWithIconStyle}>
            <CheckCircle2 aria-hidden="true" style={smallIconStyle} />
            검토 대기 등록
          </Button>
        </div>
      </aside>
    </form>
  );
}

function PanelTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-xs)" }}>
      <div style={{ color: "var(--primary)", fontSize: "var(--fs-caption)", fontWeight: 900 }}>{eyebrow}</div>
      <h2 style={{ margin: 0, fontSize: "var(--fs-subtitle)", lineHeight: "var(--lh-title)" }}>{title}</h2>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: "var(--space-xs)", color: "var(--on-surface)", fontSize: "var(--fs-caption)", fontWeight: 800 }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={checkRowStyle}>
      <span style={mutedStyle}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const panelStyle = {
  display: "grid",
  gap: "var(--space-lg)",
} as const;

const twoColumnGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
  gap: "var(--space-md)",
} as const;

const fieldStyle = {
  minHeight: "var(--touch-target)",
  border: "1px solid var(--input-border)",
  borderRadius: "var(--radius-md)",
  padding: "0 14px",
  color: "var(--input-text)",
  background: "var(--surface-container-lowest)",
  font: "inherit",
  width: "100%",
} as const;

const fileLayoutStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
  gap: "var(--space-lg)",
  alignItems: "stretch",
} as const;

const dropzoneStyle = {
  minHeight: 260,
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
  border: "1.5px dashed var(--outline-variant)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-container-low)",
  color: "var(--on-surface-variant)",
  padding: "var(--space-lg)",
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

const actionBarStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "var(--space-sm)",
} as const;

const buttonWithIconStyle = {
  gap: "var(--space-sm)",
} as const;

const checkRowStyle = {
  minHeight: 42,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-md)",
  borderBottom: "1px solid var(--border)",
  fontSize: "var(--fs-caption)",
} as const;

const ocrRowStyle = {
  display: "grid",
  gap: "var(--space-xs)",
  padding: "var(--space-sm) 0",
  borderBottom: "1px solid var(--border)",
} as const;

const summaryBoxStyle = {
  minHeight: "var(--touch-target)",
  display: "flex",
  alignItems: "center",
  gap: "var(--space-sm)",
  borderRadius: "var(--radius)",
  padding: "0 var(--space-md)",
  color: "var(--on-primary-container)",
  background: "var(--primary-container)",
  fontWeight: 800,
} as const;

const privacyBoxStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: "var(--space-sm)",
  borderRadius: "var(--radius)",
  padding: "var(--space-md)",
  color: "var(--on-surface-variant)",
  background: "var(--surface-container-low)",
  fontSize: "var(--fs-caption)",
  lineHeight: "var(--lh-body)",
} as const;

const noticeStyle = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "var(--space-md)",
  color: "var(--on-success-container)",
  background: "var(--success-container)",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
  lineHeight: "var(--lh-body)",
} as const;

const iconStyle = {
  width: 44,
  height: 44,
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
