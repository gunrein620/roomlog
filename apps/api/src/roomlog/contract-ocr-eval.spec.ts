import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { RoomlogService } from "./roomlog.service";

const fieldKeys = [
  "contractStartDate",
  "contractEndDate",
  "depositBaseAmount",
  "depositConversionAmount",
  "depositFinalAmount",
  "rentBaseAmount",
  "rentConversionAmount",
  "maintenanceFee",
  "paymentDay",
  "landlordAccount",
  "address",
  "autoRenewal",
  "restorationDuty",
  "repairDuty"
] as const;

type OcrFieldKey = (typeof fieldKeys)[number];
type OcrField = {
  value: string;
  evidence: string;
  needsCheck: boolean;
  masked: boolean;
};

function emptyField(): OcrField {
  return { value: "", evidence: "", needsCheck: true, masked: false };
}

function ocrFields(overrides: Partial<Record<OcrFieldKey, Partial<OcrField>>>) {
  return Object.fromEntries(
    fieldKeys.map((key) => [key, { ...emptyField(), ...(overrides[key] ?? {}) }])
  ) as Record<OcrFieldKey, OcrField>;
}

async function runContractOcrEval(fields: Record<OcrFieldKey, OcrField>) {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalContractOcrModel = process.env.OPENAI_CONTRACT_OCR_MODEL;
  const originalFetch = globalThis.fetch;
  const uploadDir = mkdtempSync(join(tmpdir(), "roomlog-contract-ocr-eval-"));

  process.env.OPENAI_API_KEY = "sk-test-roomlog";
  process.env.OPENAI_CONTRACT_OCR_MODEL = "gpt-contract-ocr-eval-test";
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        output_text: JSON.stringify({
          summary: "계약 OCR eval 샘플",
          highlights: ["eval fixture"],
          items: [],
          fields,
          helpNotes: []
        })
      }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    )) as typeof fetch;

  try {
    const service = new RoomlogService({ uploadDir });
    const upload = await service.saveManagerContractUpload("landlord-demo", {
      buffer: Buffer.from("fake-contract-image"),
      originalName: "contract.png",
      mimeType: "image/png"
    });
    const created = service.createManagerContract("landlord-demo", {
      unitId: "301",
      fileName: upload.fileName,
      fileUrl: upload.fileUrl
    });

    return await service.runManagerContractOcr("landlord-demo", created.row.contract.id);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
    else delete process.env.OPENAI_API_KEY;
    if (originalContractOcrModel) process.env.OPENAI_CONTRACT_OCR_MODEL = originalContractOcrModel;
    else delete process.env.OPENAI_CONTRACT_OCR_MODEL;
    rmSync(uploadDir, { force: true, recursive: true });
  }
}

function extractionValue(result: Awaited<ReturnType<typeof runContractOcrEval>>, label: string) {
  return result.extraction.items.find((item) => item.label === label);
}

describe("Contract OCR eval fixtures", () => {
  it("keeps converted deposit and rent fields separated in the displayed extraction value", async () => {
    const result = await runContractOcrEval(
      ocrFields({
        contractStartDate: {
          value: "2025.05.01",
          evidence: "임대차 계약기간 2025.05.01부터",
          needsCheck: false
        },
        contractEndDate: {
          value: "2027.04.30",
          evidence: "2027.04.30까지",
          needsCheck: false
        },
        depositBaseAmount: {
          value: "36,288,000원",
          evidence: "임대보증금 36,288,000원",
          needsCheck: false
        },
        depositConversionAmount: {
          value: "17,000,000원",
          evidence: "전환보증금 17,000,000원",
          needsCheck: false
        },
        depositFinalAmount: {
          value: "53,288,000원",
          evidence: "전환 후 임대보증금 53,288,000원",
          needsCheck: false
        },
        rentBaseAmount: {
          value: "152,510원",
          evidence: "월임대료 152,510원",
          needsCheck: false
        },
        rentConversionAmount: {
          value: "67,510원",
          evidence: "전환후월임대료 67,510원",
          needsCheck: false
        }
      })
    );

    const term = extractionValue(result, "계약 기간");
    const deposit = extractionValue(result, "보증금");
    const rent = extractionValue(result, "월세");

    assert.equal(term?.value, "2025.05.01 ~ 2027.04.30");
    assert.equal(term?.needsCheck, false);
    assert.match(deposit?.value ?? "", /기본 36,288,000원/);
    assert.match(deposit?.value ?? "", /전환보증금 17,000,000원/);
    assert.match(deposit?.value ?? "", /전환 후 53,288,000원/);
    assert.equal(deposit?.needsCheck, false);
    assert.match(rent?.value ?? "", /기본 152,510원/);
    assert.match(rent?.value ?? "", /전환 후 67,510원/);
    assert.equal(rent?.needsCheck, false);
  });

  it("marks impossible payment days as needs-check even when OCR was confident", async () => {
    const result = await runContractOcrEval(
      ocrFields({
        paymentDay: {
          value: "45일",
          evidence: "차임은 매월 45일 지급",
          needsCheck: false
        }
      })
    );

    const paymentDay = extractionValue(result, "납부일");

    assert.equal(paymentDay?.value, "매월 45일");
    assert.equal(paymentDay?.needsCheck, true);
    assert.match(paymentDay?.evidence ?? "", /납부일은 1일부터 31일/);
  });

  it("marks reversed contract dates as needs-check", async () => {
    const result = await runContractOcrEval(
      ocrFields({
        contractStartDate: {
          value: "2027.04.30",
          evidence: "계약 시작일 2027.04.30",
          needsCheck: false
        },
        contractEndDate: {
          value: "2025.05.01",
          evidence: "계약 종료일 2025.05.01",
          needsCheck: false
        }
      })
    );

    const term = extractionValue(result, "계약 기간");

    assert.equal(term?.value, "2027.04.30 ~ 2025.05.01");
    assert.equal(term?.needsCheck, true);
    assert.match(term?.evidence ?? "", /시작일이 종료일보다 늦습니다/);
  });
});
