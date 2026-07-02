import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type {
  AddPhotoDto,
  CaptureStage,
  ChecklistItem,
  EvidenceGrade,
  ItemRecord,
  MoveinPhoto,
  MoveinRecord,
} from "@roomlog/types";

export abstract class MoveinRepository {
  abstract listMoveins(): MoveinRecord[];
  abstract getMovein(leaseId: string): MoveinRecord | undefined;
  abstract getChecklist(leaseId: string): ChecklistItem[] | undefined;
  abstract listItemRecords(leaseId: string): ItemRecord[] | undefined;
  abstract getItemRecord(
    leaseId: string,
    itemId: string,
  ): ItemRecord | undefined;
  abstract addPhoto(
    leaseId: string,
    itemId: string,
    dto: AddPhotoDto,
  ): ItemRecord | undefined;
}

const DEMO_LEASE_ID = "ls_0001";

const DEMO_MOVEIN: MoveinRecord = {
  leaseId: DEMO_LEASE_ID,
  unitId: "302",
  checklistVersion: "cl_v1",
  moveinDate: "2026-06-30T00:00:00+09:00",
  lockWindowStartAt: "2026-06-30T00:00:00+09:00",
  lockWindowEndAt: "2026-07-03T00:00:00+09:00",
  capturedCount: 3,
};

const DEMO_CHECKLIST: ChecklistItem[] = [
  {
    id: "item_aircon",
    spaceId: "space_living",
    spaceLabel: "거실",
    label: "에어컨",
    labelI18n: {
      ko: "에어컨",
      en: "Air conditioner",
      zh: "空调",
      vi: "Máy lạnh",
    },
    icon: "❄️",
    sourceTier: "contract_option",
    contractLabel: "벽걸이 에어컨(LG)",
    isCore: true,
    coreReason: "고가 옵션",
  },
  {
    id: "item_fridge",
    spaceId: "space_kitchen",
    spaceLabel: "주방",
    label: "빌트인 냉장고",
    labelI18n: {
      ko: "빌트인 냉장고",
      en: "Built-in fridge",
      zh: "嵌入式冰箱",
      vi: "Tủ lạnh âm tủ",
    },
    icon: "🧊",
    sourceTier: "contract_option",
    contractLabel: "빌트인 냉장고",
    isCore: true,
    coreReason: "고가 옵션",
  },
  {
    id: "item_sink",
    spaceId: "space_kitchen",
    spaceLabel: "주방",
    label: "싱크대 하부",
    labelI18n: {
      ko: "싱크대 하부",
      en: "Under-sink",
      zh: "水槽下方",
      vi: "Dưới bồn rửa",
    },
    icon: "🚰",
    sourceTier: "standard_fallback",
    fallbackItemId: "std_sink",
    isCore: true,
    coreReason: "누수 잦은 곳",
  },
  {
    id: "item_bath_drain",
    spaceId: "space_bath",
    spaceLabel: "욕실",
    label: "화장실 배수구",
    labelI18n: {
      ko: "화장실 배수구",
      en: "Bathroom drain",
      zh: "浴室排水口",
      vi: "Cống thoát nước",
    },
    icon: "🚿",
    sourceTier: "standard_fallback",
    fallbackItemId: "std_bath_drain",
    isCore: true,
    coreReason: "누수 잦은 곳",
  },
  {
    id: "item_wallpaper",
    spaceId: "space_living",
    spaceLabel: "거실",
    label: "벽지·도배",
    labelI18n: {
      ko: "벽지·도배",
      en: "Wallpaper",
      zh: "墙纸",
      vi: "Giấy dán tường",
    },
    icon: "🧱",
    sourceTier: "standard_fallback",
    fallbackItemId: "std_wallpaper",
    isCore: false,
    recommended: true,
  },
  {
    id: "item_floor",
    spaceId: "space_living",
    spaceLabel: "거실",
    label: "바닥",
    labelI18n: {
      ko: "바닥",
      en: "Floor",
      zh: "地板",
      vi: "Sàn nhà",
    },
    icon: "🟫",
    sourceTier: "standard_fallback",
    fallbackItemId: "std_floor",
    isCore: false,
    recommended: true,
  },
  {
    id: "item_window",
    spaceId: "space_living",
    spaceLabel: "거실",
    label: "창문·샷시",
    labelI18n: {
      ko: "창문·샷시",
      en: "Window/frame",
      zh: "窗户",
      vi: "Cửa sổ",
    },
    icon: "🪟",
    sourceTier: "standard_fallback",
    fallbackItemId: "std_window",
    isCore: false,
    recommended: true,
  },
];

const DEMO_ITEM_RECORDS: ItemRecord[] = [
  {
    itemId: "item_aircon",
    photos: [
      {
        id: "ph_0001",
        itemId: "item_aircon",
        role: "wide",
        captureStage: "movein_window",
        capturedAt: "2026-06-30T11:20:00+09:00",
        serverReceivedAt: "2026-06-30T11:20:12+09:00",
        fileHash: "sha256:a1b2c3aircon-wide",
        edited: false,
        locationAnchorId: "anc_living_wall_e",
        viewpointId: "vp_living_01",
      },
      {
        id: "ph_0002",
        itemId: "item_aircon",
        role: "closeup",
        captureStage: "movein_window",
        capturedAt: "2026-06-30T11:21:00+09:00",
        serverReceivedAt: "2026-06-30T11:21:08+09:00",
        fileHash: "sha256:a1b2c3aircon-close",
        edited: false,
        locationAnchorId: "anc_living_wall_e",
        viewpointId: "vp_living_01",
      },
    ],
    memo: "송풍구 하단 미세 스크래치 있음",
    shareScope: "private",
    capturedAt: "2026-06-30T11:21:00+09:00",
    evidenceGrade: "primary",
  },
  {
    itemId: "item_fridge",
    photos: [
      {
        id: "ph_0003",
        itemId: "item_fridge",
        role: "wide",
        captureStage: "movein_window",
        capturedAt: "2026-06-30T11:35:00+09:00",
        serverReceivedAt: "2026-06-30T11:35:10+09:00",
        fileHash: "sha256:d4e5f6fridge-wide",
        edited: false,
        locationAnchorId: "anc_kitchen_builtin",
        viewpointId: "vp_kitchen_01",
      },
      {
        id: "ph_0004",
        itemId: "item_fridge",
        role: "closeup",
        captureStage: "movein_window",
        capturedAt: "2026-06-30T11:36:00+09:00",
        serverReceivedAt: "2026-06-30T11:36:09+09:00",
        fileHash: "sha256:d4e5f6fridge-close",
        edited: false,
        locationAnchorId: "anc_kitchen_builtin",
        viewpointId: "vp_kitchen_01",
      },
    ],
    shareScope: "private",
    capturedAt: "2026-06-30T11:36:00+09:00",
    evidenceGrade: "primary",
  },
  {
    itemId: "item_sink",
    photos: [
      {
        id: "ph_0005",
        itemId: "item_sink",
        role: "wide",
        captureStage: "movein_window",
        capturedAt: "2026-06-30T12:02:00+09:00",
        serverReceivedAt: "2026-06-30T12:02:11+09:00",
        fileHash: "sha256:g7h8i9sink-wide",
        edited: false,
        locationAnchorId: "anc_kitchen_sink",
        viewpointId: "vp_kitchen_02",
      },
    ],
    memo: "배수 연결부 물기 흔적 — 확인 필요",
    shareScope: "defect_submitted",
    shareDetail: "하자 1건에 제출됨",
    capturedAt: "2026-06-30T12:02:00+09:00",
    evidenceGrade: "primary",
  },
];

@Injectable()
export class InMemoryMoveinRepository implements MoveinRepository {
  private readonly moveins = new Map<string, MoveinRecord>();
  private readonly checklistsByLeaseId = new Map<string, ChecklistItem[]>();
  private readonly itemRecordsByLeaseId = new Map<string, Map<string, ItemRecord>>();

  constructor() {
    this.moveins.set(DEMO_MOVEIN.leaseId, { ...DEMO_MOVEIN });
    this.checklistsByLeaseId.set(DEMO_LEASE_ID, cloneChecklist(DEMO_CHECKLIST));
    this.itemRecordsByLeaseId.set(
      DEMO_LEASE_ID,
      new Map(
        DEMO_ITEM_RECORDS.map((itemRecord) => [
          itemRecord.itemId,
          cloneItemRecord(itemRecord),
        ]),
      ),
    );
  }

  listMoveins(): MoveinRecord[] {
    return Array.from(this.moveins.values());
  }

  getMovein(leaseId: string): MoveinRecord | undefined {
    return this.moveins.get(leaseId);
  }

  getChecklist(leaseId: string): ChecklistItem[] | undefined {
    return this.checklistsByLeaseId.get(leaseId);
  }

  listItemRecords(leaseId: string): ItemRecord[] | undefined {
    const itemRecords = this.itemRecordsByLeaseId.get(leaseId);
    if (!itemRecords) {
      return undefined;
    }

    return Array.from(itemRecords.values());
  }

  getItemRecord(leaseId: string, itemId: string): ItemRecord | undefined {
    return this.itemRecordsByLeaseId.get(leaseId)?.get(itemId);
  }

  addPhoto(
    leaseId: string,
    itemId: string,
    dto: AddPhotoDto,
  ): ItemRecord | undefined {
    const movein = this.moveins.get(leaseId);
    const checklist = this.checklistsByLeaseId.get(leaseId);
    const itemExists = checklist?.some((item) => item.id === itemId);
    if (!movein || !itemExists) {
      return undefined;
    }

    const capturedAt = dto.capturedAt ?? new Date().toISOString();
    const serverReceivedAt = new Date().toISOString();
    const photo: MoveinPhoto = {
      id: this.createPhotoId(),
      itemId,
      role: dto.role,
      captureStage: getCaptureStage(movein, capturedAt),
      capturedAt,
      serverReceivedAt,
      fileHash: createFileHash(leaseId, itemId, dto, serverReceivedAt),
      edited: false,
      locationAnchorId: dto.locationAnchorId,
      viewpointId: dto.viewpointId,
    };

    const itemRecords = this.ensureItemRecords(leaseId);
    const existing = itemRecords.get(itemId);
    const itemRecord: ItemRecord = existing ?? {
      itemId,
      photos: [],
      shareScope: "private",
    };
    const wasUncaptured = itemRecord.photos.length === 0;

    itemRecord.photos.push(photo);
    itemRecord.memo = dto.memo ?? itemRecord.memo;
    itemRecord.capturedAt = capturedAt;
    itemRecord.evidenceGrade = getEvidenceGrade(itemRecord.photos);

    itemRecords.set(itemId, itemRecord);
    if (wasUncaptured) {
      movein.capturedCount += 1;
    }

    return itemRecord;
  }

  private ensureItemRecords(leaseId: string): Map<string, ItemRecord> {
    let itemRecords = this.itemRecordsByLeaseId.get(leaseId);
    if (!itemRecords) {
      itemRecords = new Map<string, ItemRecord>();
      this.itemRecordsByLeaseId.set(leaseId, itemRecords);
    }

    return itemRecords;
  }

  private createPhotoId(): string {
    return `ph_${Date.now().toString(36)}`;
  }
}

function getCaptureStage(
  movein: MoveinRecord,
  capturedAt: string,
): CaptureStage {
  const capturedTime = Date.parse(capturedAt);
  const lockWindowStartTime = Date.parse(movein.lockWindowStartAt);
  const lockWindowEndTime = Date.parse(movein.lockWindowEndAt);

  if (capturedTime < lockWindowStartTime) {
    return "before_movein";
  }

  if (capturedTime <= lockWindowEndTime) {
    return "movein_window";
  }

  return "after_reference";
}

function getEvidenceGrade(photos: MoveinPhoto[]): EvidenceGrade {
  return photos.some((photo) => photo.captureStage !== "after_reference")
    ? "primary"
    : "reference";
}

function createFileHash(
  leaseId: string,
  itemId: string,
  dto: AddPhotoDto,
  serverReceivedAt: string,
): string {
  const hash = createHash("sha256")
    .update(JSON.stringify({ leaseId, itemId, dto, serverReceivedAt }))
    .digest("hex");

  return `sha256:${hash}`;
}

function cloneChecklist(checklist: ChecklistItem[]): ChecklistItem[] {
  return checklist.map((item) => ({
    ...item,
    labelI18n: item.labelI18n ? { ...item.labelI18n } : undefined,
  }));
}

function cloneItemRecord(itemRecord: ItemRecord): ItemRecord {
  return {
    ...itemRecord,
    photos: itemRecord.photos.map((photo) => ({ ...photo })),
  };
}
