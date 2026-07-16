import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { RoomlogService } from "./roomlog.service";

const fieldKeys = [
  "depositBaseAmount",
  "depositConversionAmount",
  "depositFinalAmount",
  "specialTerms",
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
type OcrItem = {
  label: string;
  value: string;
  group: "money" | "term" | "responsibility";
  needsCheck: boolean;
  evidence: string;
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

async function runContractOcrEval(
  fields: Record<OcrFieldKey, OcrField>,
  items: OcrItem[] = []
) {
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
          items,
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
  it("keeps converted deposit fields and special clauses in the displayed extraction value", async () => {
    const result = await runContractOcrEval(
      ocrFields({
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
        specialTerms: {
          value: "보증금 반환 전 미납 관리비와 원상복구 비용을 정산한다.",
          evidence: "특약사항 제1항",
          needsCheck: false
        }
      })
    );

    const deposit = extractionValue(result, "보증금");
    const specialTerms = extractionValue(result, "특약");

    assert.match(deposit?.value ?? "", /기본 36,288,000원/);
    assert.match(deposit?.value ?? "", /전환보증금 17,000,000원/);
    assert.match(deposit?.value ?? "", /전환 후 53,288,000원/);
    assert.equal(deposit?.needsCheck, false);
    assert.equal(specialTerms?.value, "보증금 반환 전 미납 관리비와 원상복구 비용을 정산한다.");
    assert.equal(extractionValue(result, "월세"), undefined);
    assert.equal(extractionValue(result, "계약 기간"), undefined);
  });

  it("filters miscellaneous OCR item labels but accepts special-term aliases", async () => {
    const result = await runContractOcrEval(
      ocrFields({}),
      [
        {
          label: "월세",
          value: "650,000원",
          group: "money",
          needsCheck: false,
          evidence: "월 임대료 표기",
          masked: false
        },
        {
          label: "특별약정",
          value: "전대 및 양도는 임대인 사전 동의를 받는다.",
          group: "responsibility",
          needsCheck: false,
          evidence: "특별약정",
          masked: false
        }
      ]
    );

    assert.equal(extractionValue(result, "월세"), undefined);
    assert.equal(extractionValue(result, "특약")?.value, "전대 및 양도는 임대인 사전 동의를 받는다.");
  });

  it("marks deposit text without an amount as needs-check", async () => {
    const result = await runContractOcrEval(
      ocrFields({
        depositBaseAmount: {
          value: "보증금 별도 협의",
          evidence: "보증금 별도 협의라고만 기재",
          needsCheck: false
        }
      })
    );

    const deposit = extractionValue(result, "보증금");

    assert.equal(deposit?.value, "기본 보증금 별도 협의");
    assert.equal(deposit?.needsCheck, true);
    assert.match(deposit?.evidence ?? "", /금액 항목인데 원 단위 숫자를 확인하지 못했습니다/);
  });
});
