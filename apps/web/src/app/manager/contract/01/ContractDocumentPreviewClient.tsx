"use client";

import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

type PreviewKind = "image" | "pdf";

type HighlightRegion = {
  page?: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type HighlightItem = {
  label: string;
  value: string;
  needsCheck: boolean;
  regions?: HighlightRegion[];
};

type HighlightBox = {
  key: string;
  label: string;
  page?: number;
  top: string;
  left: string;
  width: string;
  height: string;
  tone: "deposit" | "rent" | "period" | "special" | "autoRenewal" | "restoration" | "repair" | "clause";
  needsCheck: boolean;
};

type PdfViewport = {
  width: number;
  height: number;
};

type PdfRenderTask = {
  promise: Promise<unknown>;
  cancel: () => void;
};

type PdfPageProxy = {
  getViewport: (options: { scale: number }) => PdfViewport;
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => PdfRenderTask;
  cleanup?: () => void;
};

type PdfDocumentProxy = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
  destroy?: () => Promise<void>;
};

type ContractDocumentPreviewClientProps = {
  previewUrl: string;
  previewKind: PreviewKind;
  tenantName: string;
  highlights: HighlightItem[];
};

const MONEY_LABELS = new Set(["보증금", "월세"]);
const TERM_LABELS = new Set(["계약 시작일", "계약 종료일"]);
const CLAUSE_LABELS = new Set(["특약", "자동연장", "원상복구", "수선 책임"]);

export function ContractDocumentPreviewClient({
  previewUrl,
  previewKind,
  tenantName,
  highlights,
}: ContractDocumentPreviewClientProps) {
  const [showOcrOverlay, setShowOcrOverlay] = useState(false);
  const highlightBoxes = useMemo(() => buildHighlightBoxes(highlights, previewKind), [highlights, previewKind]);
  const hasHighlightBoxes = highlightBoxes.length > 0;
  const showHighlights = showOcrOverlay && hasHighlightBoxes;

  const showReadValues = () => {
    if (!hasHighlightBoxes) return;
    setShowOcrOverlay(true);
  };
  const hideReadValues = () => setShowOcrOverlay(false);
  const handleReadValuesKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    showReadValues();
  };
  const handleReadValuesKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    hideReadValues();
  };

  return (
    <div style={documentPreviewClientStyle}>
      <div style={documentFrameStyle}>
        <div style={documentPreviewNavStyle}>
          <button
            type="button"
            data-contract-highlight-button="read-values"
            data-highlight-count={highlightBoxes.length}
            data-preview-kind={previewKind}
            disabled={!hasHighlightBoxes}
            aria-pressed={showOcrOverlay}
            title={hasHighlightBoxes ? "읽어온 값 위치를 누르는 동안만 표시합니다." : "저장된 OCR 위치 좌표가 없습니다. OCR을 다시 실행해야 표시됩니다."}
            onPointerDown={showReadValues}
            onPointerUp={hideReadValues}
            onPointerCancel={hideReadValues}
            onPointerLeave={hideReadValues}
            onMouseUp={hideReadValues}
            onTouchEnd={hideReadValues}
            onClick={hideReadValues}
            onKeyDown={handleReadValuesKeyDown}
            onKeyUp={handleReadValuesKeyUp}
            onBlur={hideReadValues}
            style={!hasHighlightBoxes ? readValuesButtonDisabledStyle : showOcrOverlay ? readValuesButtonActiveStyle : readValuesButtonStyle}
          >
            읽어온 값
          </button>
        </div>
        {previewUrl ? (
          previewKind === "image" ? (
            <div style={documentPreviewSurfaceStyle}>
              <img src={previewUrl} alt="계약서 원문 미리보기" style={documentImageStyle} />
              {showHighlights ? <HighlightOverlay boxes={highlightBoxes} previewKind="image" /> : null}
            </div>
          ) : (
            <PdfDocumentFrame previewUrl={previewUrl} showHighlights={showHighlights} boxes={highlightBoxes} />
          )
        ) : (
          <ContractDocumentFallback tenantName={tenantName} showHighlights={showHighlights} boxes={highlightBoxes} />
        )}
      </div>
    </div>
  );
}

function PdfDocumentFrame({
  previewUrl,
  showHighlights,
  boxes,
}: {
  previewUrl: string;
  showHighlights: boolean;
  boxes: HighlightBox[];
}) {
  const [pdfDocument, setPdfDocument] = useState<PdfDocumentProxy | null>(null);
  const [pageNumbers, setPageNumbers] = useState<number[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let loadedDocument: PdfDocumentProxy | null = null;
    let loadingTask: { promise: Promise<PdfDocumentProxy>; destroy: () => Promise<void> } | null = null;

    setPdfDocument(null);
    setPageNumbers([]);
    setLoadError(false);

    async function loadPdf() {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
        loadingTask = pdfjs.getDocument({ url: previewUrl }) as unknown as {
          promise: Promise<PdfDocumentProxy>;
          destroy: () => Promise<void>;
        };
        const documentProxy = await loadingTask.promise;
        loadedDocument = documentProxy;
        if (cancelled) return;

        setPdfDocument(documentProxy);
        setPageNumbers(Array.from({ length: documentProxy.numPages }, (_, index) => index + 1));
      } catch {
        if (!cancelled) setLoadError(true);
      }
    }

    void loadPdf();

    return () => {
      cancelled = true;
      void loadingTask?.destroy();
      void loadedDocument?.destroy?.();
    };
  }, [previewUrl]);

  return (
    <div style={pdfDocumentSurfaceStyle}>
      {loadError ? (
        <iframe
          title="계약서 PDF 원문 미리보기"
          src={pdfPreviewSrc(previewUrl)}
          style={documentIframeStyle}
        />
      ) : pdfDocument ? (
        <div style={pdfCanvasPageStackStyle}>
          {pageNumbers.map((pageNumber) => (
            <PdfCanvasPage
              key={pageNumber}
              pdfDocument={pdfDocument}
              pageNumber={pageNumber}
              showHighlights={showHighlights}
              boxes={boxes.filter((box) => (box.page ?? 1) === pageNumber)}
            />
          ))}
        </div>
      ) : (
        <div style={pdfLoadingStyle}>PDF 미리보기를 불러오는 중입니다.</div>
      )}
    </div>
  );
}

function PdfCanvasPage({
  pdfDocument,
  pageNumber,
  showHighlights,
  boxes,
}: {
  pdfDocument: PdfDocumentProxy;
  pageNumber: number;
  showHighlights: boolean;
  boxes: HighlightBox[];
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pageRatio, setPageRatio] = useState("210 / 297");

  useEffect(() => {
    let cancelled = false;
    let renderTask: PdfRenderTask | null = null;
    let pageProxy: PdfPageProxy | null = null;

    async function renderPage() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      pageProxy = await pdfDocument.getPage(pageNumber);
      if (cancelled) return;

      const viewport = pageProxy.getViewport({ scale: 1.7 });
      const context = canvas.getContext("2d");
      if (!context) return;

      const devicePixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * devicePixelRatio);
      canvas.height = Math.floor(viewport.height * devicePixelRatio);
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      setPageRatio(`${viewport.width} / ${viewport.height}`);

      renderTask = pageProxy.render({ canvasContext: context, viewport });
      await renderTask.promise.catch(() => undefined);
    }

    void renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      pageProxy?.cleanup?.();
    };
  }, [pageNumber, pdfDocument]);

  return (
    <div data-pdf-page={pageNumber} style={{ ...pdfCanvasPageStyle, aspectRatio: pageRatio }}>
      <canvas ref={canvasRef} style={pdfCanvasStyle} />
      {showHighlights && boxes.length ? (
        <div
          data-contract-highlight-overlay="pdf-page"
          data-highlight-count={boxes.length}
          style={highlightOverlayStyle}
          aria-hidden="true"
        >
          {boxes.map((box) => (
            <div
              key={box.key}
              data-contract-highlight={box.label}
              data-highlight-page={pageNumber}
              style={{
                ...highlightBoxStyle,
                ...highlightToneStyle(box.tone, box.needsCheck),
                top: box.top,
                left: box.left,
                width: box.width,
                height: box.height,
              }}
            >
              <span style={highlightLabelStyle}>{box.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HighlightOverlay({ boxes, previewKind }: { boxes: HighlightBox[]; previewKind: PreviewKind }) {
  if (previewKind === "pdf") {
    return (
      <div
        data-contract-highlight-overlay="pdf"
        data-highlight-count={boxes.length}
        style={highlightOverlayStyle}
        aria-hidden="true"
      >
        <PdfHighlightPageStack boxes={boxes} />
      </div>
    );
  }

  return (
    <div
      data-contract-highlight-overlay="image"
      data-highlight-count={boxes.length}
      style={highlightOverlayStyle}
      aria-hidden="true"
    >
      <div style={imagePageGuideStyle}>
        {boxes.map((box) => (
          <div
            key={box.key}
            data-contract-highlight={box.label}
            data-highlight-page={box.page ?? 1}
            style={{
              ...highlightBoxStyle,
              ...highlightToneStyle(box.tone, box.needsCheck),
              top: box.top,
              left: box.left,
              width: box.width,
              height: box.height,
            }}
          >
            <span style={highlightLabelStyle}>{box.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PdfHighlightPageStack({ boxes }: { boxes: HighlightBox[] }) {
  const pageCount = Math.max(1, ...boxes.map((box) => box.page ?? 1));

  return (
    <div style={pdfPageStackStyle}>
      {Array.from({ length: pageCount }, (_, index) => {
        const page = index + 1;
        const pageBoxes = boxes.filter((box) => (box.page ?? 1) === page);

        return (
          <div key={page} style={pdfPageGuideStyle}>
            {pageBoxes.map((box) => (
              <div
                key={box.key}
                data-contract-highlight={box.label}
                data-highlight-page={page}
                style={{
                  ...highlightBoxStyle,
                  ...highlightToneStyle(box.tone, box.needsCheck),
                  top: box.top,
                  left: box.left,
                  width: box.width,
                  height: box.height,
                }}
              >
                <span style={highlightLabelStyle}>{box.label}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ContractDocumentFallback({
  tenantName,
  showHighlights,
  boxes,
}: {
  tenantName: string;
  showHighlights: boolean;
  boxes: HighlightBox[];
}) {
  return (
    <div style={fallbackFrameStyle}>
      <StaticContractSheet tenantName={tenantName} />
      {showHighlights ? <HighlightOverlay boxes={boxes} previewKind="image" /> : null}
    </div>
  );
}

function StaticContractSheet({ tenantName }: { tenantName: string }) {
  return (
    <div style={documentPageStyle}>
      <div style={documentTitleStyle}>계약(해약) 사실확인원</div>
      <div style={docLineMidStyle} />
      <div style={docLineStyle} />
      <div style={docLineShortStyle} />
      <div style={contractTableStyle}>
        <div style={contractTableHeaderStyle}>계약기간</div>
        <div style={contractTableValueStyle}>2025.05.01 ~ 2027.04.30</div>
        <div style={contractTableHeaderStyle}>보증금</div>
        <div style={contractTableValueStyle}>전환 후 임대보증금</div>
        <div style={contractTableHeaderStyle}>월 임대료</div>
        <div style={contractTableValueStyle}>전환후월 임대료</div>
      </div>
      <div style={depositHighlightStyle}>
        <span>보증금 근거</span>
      </div>
      <div style={{ ...docLineStyle, marginTop: 76 }} />
      <div style={docLineMidStyle} />
      <div style={docLineShortStyle} />
      <div style={clauseHighlightStyle}>
        <span>특약성 조항 영역</span>
      </div>
      <div style={{ ...docLineStyle, marginTop: 84 }} />
      <div style={docLineMidStyle} />
      <div style={docLineStyle} />
      <div style={documentMetaStyle}>
        <strong>{tenantName}</strong>
        <span>OCR 미리보기</span>
      </div>
    </div>
  );
}

function buildHighlightBoxes(items: HighlightItem[], previewKind: PreviewKind): HighlightBox[] {
  const regionBoxes = buildRegionHighlightBoxes(items);
  if (regionBoxes.length > 0) return regionBoxes;
  if (previewKind === "pdf") return [];

  return buildFallbackHighlightBoxes(items);
}

function buildRegionHighlightBoxes(items: HighlightItem[]): HighlightBox[] {
  return items
    .filter((item) => !isMissingHighlightValue(item.value))
    .flatMap((item) =>
      (item.regions ?? [])
        .filter((region) => isValidHighlightRegion(region) && isReadableHighlightRegion(region))
        .map((region, index) => ({
          key: `${item.label}-${index}-${region.x}-${region.y}`,
          label: highlightLabel(item.label),
          page: Math.max(1, Math.round(region.page ?? 1)),
          top: `${region.y * 100}%`,
          left: `${region.x * 100}%`,
          width: `${region.width * 100}%`,
          height: `${region.height * 100}%`,
          tone: highlightTone(item.label),
          needsCheck: item.needsCheck,
        }))
    );
}

function buildFallbackHighlightBoxes(items: HighlightItem[]): HighlightBox[] {
  const activeLabels = new Set(
    items
      .filter((item) => !isMissingHighlightValue(item.value))
      .map((item) => item.label)
      .filter((label) => MONEY_LABELS.has(label) || TERM_LABELS.has(label) || CLAUSE_LABELS.has(label))
  );
  const needsCheckByLabel = new Map(items.map((item) => [item.label, item.needsCheck]));
  const boxes: HighlightBox[] = [];

  if (activeLabels.has("계약 시작일") || activeLabels.has("계약 종료일")) {
    boxes.push({
      key: "term",
      label: "계약 기간",
      page: 1,
      top: "40.8%",
      left: "22%",
      width: "46%",
      height: "5.2%",
      tone: "period",
      needsCheck: Boolean(needsCheckByLabel.get("계약 시작일") || needsCheckByLabel.get("계약 종료일")),
    });
  }

  if (activeLabels.has("보증금")) {
    boxes.push({
      key: "deposit",
      label: "보증금",
      page: 1,
      top: "53.8%",
      left: "20%",
      width: "49%",
      height: "7.8%",
      tone: "deposit",
      needsCheck: Boolean(needsCheckByLabel.get("보증금")),
    });
  }

  if (activeLabels.has("월세")) {
    boxes.push({
      key: "rent",
      label: "월 임대료",
      page: 1,
      top: "58.8%",
      left: "56%",
      width: "34%",
      height: "5.8%",
      tone: "rent",
      needsCheck: Boolean(needsCheckByLabel.get("월세")),
    });
  }

  if (Array.from(activeLabels).some((label) => CLAUSE_LABELS.has(label))) {
    boxes.push({
      key: "clauses",
      label: "특약·책임 조항",
      page: 2,
      top: "12%",
      left: "18%",
      width: "72%",
      height: "44%",
      tone: "clause",
      needsCheck: Array.from(CLAUSE_LABELS).some((label) => needsCheckByLabel.get(label)),
    });
  }

  return boxes;
}

function isValidHighlightRegion(region: HighlightRegion) {
  return (
    Number.isFinite(region.x) &&
    Number.isFinite(region.y) &&
    Number.isFinite(region.width) &&
    Number.isFinite(region.height) &&
    region.x >= 0 &&
    region.y >= 0 &&
    region.width > 0 &&
    region.height > 0 &&
    region.x + region.width <= 1.01 &&
    region.y + region.height <= 1.01
  );
}

function isReadableHighlightRegion(region: HighlightRegion) {
  return region.width <= 0.82 && region.height <= 0.32;
}

function highlightTone(label: string): HighlightBox["tone"] {
  if (label === "보증금") return "deposit";
  if (label === "월세") return "rent";
  if (TERM_LABELS.has(label)) return "period";
  if (label === "특약") return "special";
  if (label === "자동연장") return "autoRenewal";
  if (label === "원상복구") return "restoration";
  if (label === "수선 책임") return "repair";
  return "clause";
}

function highlightLabel(label: string) {
  if (label === "월세") return "월 임대료";
  if (label === "계약 시작일" || label === "계약 종료일") return "계약 기간";
  return label;
}

function isMissingHighlightValue(value?: string) {
  const normalized = value?.replace(/\s+/g, "").trim();
  return (
    !normalized ||
    normalized === "미확인" ||
    normalized === "원문확인필요" ||
    normalized === "문서에없음" ||
    normalized === "없음" ||
    normalized === "해당없음"
  );
}

function pdfPreviewSrc(url: string) {
  const hash = "toolbar=0&navpanes=0&scrollbar=0&view=FitH";
  return url.includes("#") ? url : `${url}#${hash}`;
}

const documentModeButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "auto",
  minWidth: 78,
  height: 36,
  border: "1px solid transparent",
  borderRadius: "999px",
  padding: "0 14px",
  color: "var(--primary)",
  background: "var(--surface-container)",
  font: "inherit",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
  pointerEvents: "auto",
  cursor: "pointer",
} as const;

const readValuesButtonStyle = {
  ...documentModeButtonStyle,
  minWidth: 104,
  color: "white",
  borderColor: "var(--primary)",
  background: "var(--primary)",
  boxShadow: "0 10px 24px rgba(86, 68, 212, 0.24)",
} as const;

const readValuesButtonActiveStyle = {
  ...readValuesButtonStyle,
  transform: "translateY(1px)",
  boxShadow: "0 6px 16px rgba(86, 68, 212, 0.22)",
} as const;

const readValuesButtonDisabledStyle = {
  ...readValuesButtonStyle,
  opacity: 0.46,
  cursor: "not-allowed",
  boxShadow: "none",
} as const;

const documentPreviewClientStyle = {
  display: "grid",
  gridTemplateRows: "1fr",
  height: "100%",
  minHeight: 0,
} as const;

const documentFrameStyle = {
  position: "relative",
  display: "grid",
  height: "100%",
  minHeight: 720,
  minWidth: 0,
} as const;

const documentPreviewNavStyle = {
  position: "absolute",
  top: "var(--space-sm)",
  right: "var(--space-sm)",
  zIndex: 10,
  display: "flex",
  justifyContent: "flex-end",
  pointerEvents: "none",
} as const;

const documentPreviewSurfaceStyle = {
  position: "relative",
  display: "grid",
  height: "100%",
  minHeight: 720,
  overflow: "hidden",
  borderRadius: "var(--radius-sm)",
} as const;

const fallbackFrameStyle = {
  position: "relative",
  display: "grid",
  height: "100%",
  minHeight: 720,
  overflow: "hidden",
} as const;

const pdfDocumentSurfaceStyle = {
  position: "relative",
  display: "grid",
  height: "100%",
  minHeight: 860,
  overflowX: "hidden",
  overflowY: "auto",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  padding: "var(--space-sm)",
  background: "#2f2f2f",
  alignContent: "start",
} as const;

const documentIframeStyle = {
  width: "100%",
  minHeight: 980,
  height: 980,
  border: 0,
  background: "var(--surface-container-lowest)",
} as const;

const pdfCanvasPageStackStyle = {
  display: "grid",
  gap: "var(--space-sm)",
  alignContent: "start",
  minWidth: 0,
} as const;

const pdfCanvasPageStyle = {
  position: "relative",
  width: "min(100%, 860px)",
  margin: "0 auto",
  overflow: "hidden",
  background: "white",
  boxShadow: "0 1px 0 rgba(255, 255, 255, 0.12)",
} as const;

const pdfCanvasStyle = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  display: "block",
} as const;

const pdfLoadingStyle = {
  minHeight: 720,
  display: "grid",
  placeItems: "center",
  color: "white",
  fontWeight: 800,
} as const;

const documentImageStyle = {
  width: "100%",
  minHeight: 720,
  height: "100%",
  objectFit: "contain",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface-container-lowest)",
} as const;

const highlightOverlayStyle = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  zIndex: 2,
} as const;

const pdfPageStackStyle = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 18,
  display: "grid",
  gap: 12,
} as const;

const pdfPageGuideStyle = {
  position: "relative",
  width: "100%",
  aspectRatio: "210 / 297",
} as const;

const imagePageGuideStyle = {
  position: "absolute",
  inset: "4% 8%",
} as const;

const highlightBoxStyle = {
  position: "absolute",
  borderRadius: 6,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "flex-start",
  padding: 4,
  boxShadow: "0 0 0 2px rgba(255, 255, 255, 0.66), 0 8px 18px rgba(15, 23, 42, 0.16)",
} as const;

function highlightToneStyle(tone: HighlightBox["tone"], needsCheck: boolean) {
  const colors: Record<HighlightBox["tone"], string> = {
    deposit: "rgba(37, 99, 235, 0.86)",
    rent: "rgba(8, 145, 178, 0.86)",
    period: "rgba(16, 185, 129, 0.86)",
    special: "rgba(124, 58, 237, 0.84)",
    autoRenewal: "rgba(79, 70, 229, 0.84)",
    restoration: "rgba(217, 119, 6, 0.86)",
    repair: "rgba(225, 29, 72, 0.82)",
    clause: "rgba(100, 116, 139, 0.82)",
  };
  const color = colors[tone];

  return {
    border: `2px solid ${color}`,
    background: color.replace(/0\.\d+\)/, "0.16)"),
    boxShadow: needsCheck
      ? `0 0 0 2px rgba(245, 158, 11, 0.7), 0 8px 18px rgba(15, 23, 42, 0.16)`
      : highlightBoxStyle.boxShadow,
  } as const;
}

const highlightLabelStyle = {
  borderRadius: 999,
  padding: "2px 7px",
  color: "white",
  background: "rgba(17, 24, 39, 0.78)",
  fontSize: 11,
  fontWeight: 900,
  lineHeight: 1.35,
  whiteSpace: "nowrap",
  wordBreak: "keep-all",
  writingMode: "horizontal-tb",
  flexShrink: 0,
} as const;

const documentPageStyle = {
  position: "relative",
  minHeight: 980,
  padding: "52px 48px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface-container-lowest)",
  overflow: "hidden",
} as const;

const documentTitleStyle = {
  textAlign: "center",
  color: "var(--on-surface)",
  fontSize: "var(--fs-title)",
  fontWeight: 900,
} as const;

const docLineStyle = {
  height: 16,
  marginTop: 34,
  borderRadius: 3,
  background: "var(--surface-container-high)",
} as const;

const docLineMidStyle = {
  ...docLineStyle,
  width: "78%",
} as const;

const docLineShortStyle = {
  ...docLineStyle,
  width: "58%",
} as const;

const depositHighlightStyle = {
  margin: "32px auto 0",
  width: "82%",
  minHeight: 58,
  border: "2px solid var(--primary)",
  borderRadius: "var(--radius-sm)",
  padding: "var(--space-sm)",
  color: "var(--primary)",
  background: "var(--primary-container)",
  fontWeight: 900,
} as const;

const clauseHighlightStyle = {
  ...depositHighlightStyle,
  minHeight: 92,
  borderColor: "var(--success)",
  color: "var(--success)",
  background: "rgba(16, 185, 129, 0.10)",
} as const;

const documentMetaStyle = {
  position: "absolute",
  right: 36,
  bottom: 30,
  display: "grid",
  gap: 4,
  color: "var(--on-surface-variant)",
  textAlign: "right",
  fontSize: "var(--fs-caption)",
} as const;

const contractTableStyle = {
  display: "grid",
  gridTemplateColumns: "28% 1fr",
  marginTop: 36,
  border: "1px solid var(--border)",
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  overflow: "hidden",
} as const;

const contractTableHeaderStyle = {
  padding: "10px 12px",
  borderRight: "1px solid var(--border)",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface-container)",
  fontWeight: 800,
} as const;

const contractTableValueStyle = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface-container-lowest)",
  fontWeight: 700,
} as const;
