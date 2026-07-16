import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, OnModuleDestroy, Optional } from "@nestjs/common";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createFileStorageAdapter, type FileStorageAdapter } from "../roomlog/storage.service";
import type { TradeStoreProjector } from "./trade-store.projector";

/**
 * 거래(매물 직접등록 + 구매 문의 채팅) 도메인.
 * 룸로그(입주 후 관리)와 분리된 "집 구하기/내놓기" 쪽의 계정 간 연결을 담당한다.
 * 채팅은 폴링 기반(REST) — 큰 흐름 연결이 목적이며 WS 전환점은 이 서비스 뒤로 숨겨져 있다.
 */

/** 3D 도면 벽 한 조각(에디터의 walls3D 스냅샷) — 렌더에 필요한 최소 필드만 저장한다. */
export type ListingFloorPlanWall = {
  id: string;
  wall_id: string | number;
  dimensions: { width: number; height: number; depth: number };
  position: [number, number, number];
  rotation: [number, number, number];
};

/** 3D 도면에 배치된 임대인 옵션 가구 한 점 — GLB/박스 렌더에 필요한 필드만 저장한다. */
export type ListingFloorPlanFurniture = {
  id: string;
  furniture_id: string;
  name: string;
  color: string;
  length: [number, number, number];
  modelUrl?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  sizeMm?: { width: number; depth: number; height?: number };
};

/** 매물에 연결된 3D 도면 스냅샷 — 상세 뷰의 "3D 보기"가 실제로 렌더한다. */
export type ListingFloorPlan = {
  walls3D: ListingFloorPlanWall[];
  furnitures: ListingFloorPlanFurniture[];
  name?: string;
};

export type TradeListingInput = {
  title: string;
  roomType: string;
  tradeType: "월세" | "전세" | "매매";
  depositManwon: number;
  monthlyRentManwon: number;
  location: string;
  detailAddress?: string;
  /** 건물명 — 관리 화면에서 건물별 그룹 보기의 기준(선택 입력) */
  buildingName?: string;
  description?: string;
  /** 업로드된 매물 사진 URL 배열(없으면 카드가 목업으로 폴백) */
  images?: string[];
  /** 주소 지오코딩 좌표(없으면 상세 지도는 데모/안내 상태 유지) */
  lat?: number;
  lng?: number;
  /** 등록 시 만든 3D 도면 스냅샷(없으면 상세 "3D 보기"는 미연결 안내) */
  floorPlan?: ListingFloorPlan | null;
};

export type TradeListing = Omit<TradeListingInput, "images"> & {
  id: string;
  ownerId: string;
  ownerName: string;
  status: "노출중" | "계약완료";
  createdAt: string;
  images: string[];
};

/**
 * 계약 — 채팅 스레드에서 집주인이 제안하고 문의자(예비 세입자)가 수락하는 2단계 handshake.
 * 수락 시점의 조건(거래유형/보증금/월세)을 스냅샷으로 고정한다. 실제 계약서/서명/입금은 스코프 밖.
 */
export type TradeContractStatus = "proposed" | "accepted" | "declined" | "cancelled";

export type TradeContract = {
  id: string;
  listingId: string;
  listingTitle: string;
  threadId: string;
  landlordId: string;
  landlordName: string;
  tenantId: string;
  tenantName: string;
  status: TradeContractStatus;
  tradeType: "월세" | "전세" | "매매";
  depositManwon: number;
  monthlyRentManwon: number;
  location: string;
  roomNo?: string;
  proposedAt: string;
  respondedAt?: string;
};

export type TradeMessage = {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
};

export type TradeThread = {
  id: string;
  /** 직접등록 매물이면 그 id, 쇼케이스(데모) 매물 문의면 null */
  listingId: string | null;
  listingTitle: string;
  buyerId: string;
  buyerName: string;
  ownerId: string;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
  messages: TradeMessage[];
  /** 채팅방을 나간 참여자 — 이 사용자의 목록에서 숨긴다. 새 메시지가 오면 되살아난다. */
  leftUserIds?: string[];
};

export type TradeThreadSummary = {
  id: string;
  listingId: string | null;
  listingTitle: string;
  /** 조회자 기준 역할 */
  role: "buyer" | "owner";
  counterpartName: string;
  lastMessage: string;
  lastMessageAt: string;
  lastSenderId: string;
  messageCount: number;
};

type TradeStore = {
  listings: TradeListing[];
  threads: TradeThread[];
  contracts: TradeContract[];
};

/** 쇼케이스(하드코딩) 매물 문의가 도착할 데모 임대인 계정 */
const FALLBACK_OWNER = { id: "landlord-demo", name: "박관리" };

const MAX_LISTING_IMAGES = 10;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic"];
const MAX_FLOOR_PLAN_WALLS = 600;
const MAX_FLOOR_PLAN_FURNITURES = 120;

/** 저장할 사진 URL 배열 정규화 — 문자열만, 최대 10장. */
function normalizeImages(images?: string[]): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .filter((url): url is string => typeof url === "string")
    .map((url) => url.trim())
    .filter((url) => url.length > 0)
    .slice(0, MAX_LISTING_IMAGES);
}

/** 지오코딩 좌표 정규화 — 유한수 쌍일 때만 저장(둘 다 없거나 하나만 있으면 미저장). */
function normalizeCoords(lat?: number, lng?: number): { lat?: number; lng?: number } {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return {};
  if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) return {};
  return { lat: latNum, lng: lngNum };
}

function normalizeDetailAddress(value?: string): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || undefined;
}

function normalizeBuildingName(value?: string): string | undefined {
  const trimmed = typeof value === "string" ? value.trim().slice(0, 80) : "";
  return trimmed || undefined;
}

function fullListingLocation(listing: { location: string; detailAddress?: string }): string {
  return [listing.location, listing.detailAddress].filter(Boolean).join(" ");
}

function finiteTriple(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const nums = value.slice(0, 3).map((item) => Number(item));
  return nums.every((num) => Number.isFinite(num)) ? [nums[0], nums[1], nums[2]] : null;
}

/**
 * 매물에 연결할 3D 도면 스냅샷을 정규화한다.
 * 신뢰할 수 없는 클라이언트 입력이므로 렌더에 필요한 필드만 뽑고, 좌표는 유한수만, 개수는 상한을 둔다.
 * 유효한 벽이 하나도 없으면 null(=미연결)로 취급한다.
 */
function normalizeFloorPlan(input?: ListingFloorPlan | null): ListingFloorPlan | undefined {
  if (!input || typeof input !== "object") return undefined;

  const walls: ListingFloorPlanWall[] = [];
  for (const raw of Array.isArray(input.walls3D) ? input.walls3D : []) {
    if (walls.length >= MAX_FLOOR_PLAN_WALLS) break;
    const position = finiteTriple(raw?.position);
    const rotation = finiteTriple(raw?.rotation);
    const width = Number(raw?.dimensions?.width);
    const height = Number(raw?.dimensions?.height);
    const depth = Number(raw?.dimensions?.depth);
    if (!position || !rotation) continue;
    if (![width, height, depth].every((num) => Number.isFinite(num))) continue;
    const wallId = raw?.wall_id;
    walls.push({
      id: String(raw?.id ?? `wall-${walls.length}`),
      wall_id: typeof wallId === "number" ? wallId : String(wallId ?? walls.length),
      dimensions: { width, height, depth },
      position,
      rotation
    });
  }

  if (walls.length === 0) return undefined;

  const furnitures: ListingFloorPlanFurniture[] = [];
  for (const raw of Array.isArray(input.furnitures) ? input.furnitures : []) {
    if (furnitures.length >= MAX_FLOOR_PLAN_FURNITURES) break;
    const position = finiteTriple(raw?.position);
    const rotation = finiteTriple(raw?.rotation);
    const length = finiteTriple(raw?.length);
    if (!position || !rotation || !length) continue;
    const sizeWidth = Number(raw?.sizeMm?.width);
    const sizeDepth = Number(raw?.sizeMm?.depth);
    const sizeHeight = Number(raw?.sizeMm?.height);
    furnitures.push({
      id: String(raw?.id ?? `furniture-${furnitures.length}`),
      furniture_id: String(raw?.furniture_id ?? raw?.id ?? furnitures.length),
      name: typeof raw?.name === "string" ? raw.name.slice(0, 80) : "가구",
      color: typeof raw?.color === "string" ? raw.color.slice(0, 32) : "#c9c9c9",
      length,
      modelUrl: typeof raw?.modelUrl === "string" ? raw.modelUrl.slice(0, 500) : undefined,
      position,
      rotation,
      scale: Number.isFinite(Number(raw?.scale)) ? Number(raw.scale) : 1,
      sizeMm:
        Number.isFinite(sizeWidth) && Number.isFinite(sizeDepth)
          ? { width: sizeWidth, depth: sizeDepth, ...(Number.isFinite(sizeHeight) ? { height: sizeHeight } : {}) }
          : undefined
    });
  }

  const name = typeof input.name === "string" ? input.name.slice(0, 120) : undefined;
  return { walls3D: walls, furnitures, ...(name ? { name } : {}) };
}

function extensionForUpload(mimeType: string, originalName: string): string {
  const extension = extname(originalName).toLowerCase();
  if (ALLOWED_IMAGE_EXTENSIONS.includes(extension)) return extension;
  const fallback: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/heic": ".heic"
  };
  return fallback[mimeType] ?? ".img";
}

export const TRADE_STORE_FILE = "TRADE_STORE_FILE";
export const TRADE_SERVICE_OPTIONS = "TRADE_SERVICE_OPTIONS";

/**
 * DB(RDS) 연동 옵션 — trade.module이 DATABASE_URL이 있을 때 채워 주입한다.
 * 없으면(로컬 dev/테스트) 매물은 JSON 스토어로만 동작한다(그레이스풀 디그레이드).
 */
export type TradeServiceOptions = {
  storeProjector?: TradeStoreProjector;
  /** 부팅 시 DB에서 미리 로드한 매물(비동기 로드는 모듈 팩토리가 처리). */
  initialListings?: TradeListing[];
};

function defaultStoreFilePath(): string | undefined {
  const explicit = process.env.ROOMLOG_TRADE_FILE?.trim();
  if (explicit) return explicit;
  const roomlogStore = process.env.ROOMLOG_STORE_FILE?.trim();
  if (roomlogStore) return `${dirname(roomlogStore)}/trade-store.json`;
  return undefined; // 로컬 dev — 메모리만으로 동작
}

@Injectable()
export class TradeService implements OnModuleDestroy {
  private store: TradeStore = { listings: [], threads: [], contracts: [] };
  private committedStore: TradeStore = { listings: [], threads: [], contracts: [] };
  private readonly filePath: string | undefined;
  // DATABASE_URL이 있을 때만 주입됨 — 매물(listing)을 RDS로 write-through 프로젝션한다.
  private readonly storeProjector?: TradeStoreProjector;
  // 프로젝션은 순차 큐로 직렬화해 동시 트랜잭션 경합을 피한다(roomlog 패턴과 동일).
  private pendingProjection: Promise<unknown> = Promise.resolve();
  private projectionGeneration = 0;
  private completedProjectionGeneration = 0;
  private projectionFailure?: { generation: number; error: unknown };
  // main.ts와 동일한 기본값 — S3_UPLOADS_ENABLED가 켜지면 자동으로 S3 어댑터로 전환된다.
  private readonly storageAdapter: FileStorageAdapter = createFileStorageAdapter(
    process.env,
    resolve(process.env.LOCAL_UPLOAD_DIR || "uploads"),
    process.env.PUBLIC_UPLOAD_BASE_URL || "/api/files"
  );

  constructor(
    @Optional() @Inject(TRADE_STORE_FILE) filePath?: string,
    @Optional() @Inject(TRADE_SERVICE_OPTIONS) options?: TradeServiceOptions
  ) {
    this.filePath = filePath ?? defaultStoreFilePath();
    this.storeProjector = options?.storeProjector;
    this.load(); // JSON: 스레드/계약 + (DB 없을 때의) 매물 폴백
    this.hydrateListingsFromDb(options?.initialListings);
    this.committedStore = this.cloneStore(this.store);
  }

  /**
   * DB가 매물의 진실원천 — 부팅 시 DB에서 로드한 매물로 JSON 매물을 대체한다.
   * DB가 비어 있고 JSON에 기존 매물이 있으면 일회성 백필(DB로 이관)해 기존 게시물 유실을 막는다.
   */
  private hydrateListingsFromDb(initialListings?: TradeListing[]) {
    if (!this.storeProjector) return;
    // undefined = DB 로드 실패(미도달) — JSON 상태를 유지하고 DB는 건드리지 않는다(기존 DB 매물 보호).
    if (initialListings === undefined) return;
    if (initialListings.length > 0) {
      this.store.listings = initialListings; // DB가 매물의 진실원천
      return;
    }
    // DB에 도달했고 비어 있음 — 기존 JSON 매물이 있으면 일회성 백필(유실 방지).
    if (this.store.listings.length > 0) this.projectListings();
  }

  async onModuleDestroy() {
    await this.pendingProjection.catch(() => undefined);
    await this.storeProjector?.disconnect?.();
  }

  /** 매물 스냅샷을 DB로 프로젝션(순차 큐). DB 미연동이면 no-op. */
  private projectListings(): number {
    if (!this.storeProjector) return this.projectionGeneration;
    const generation = ++this.projectionGeneration;
    const snapshot = this.store.listings.map((listing) => ({ ...listing }));
    this.pendingProjection = this.pendingProjection
      .then(() => this.storeProjector!.persist(snapshot))
      .then(
        () => {
          this.completedProjectionGeneration = Math.max(this.completedProjectionGeneration, generation);
          if ((this.projectionFailure?.generation ?? -1) <= generation) {
            this.projectionFailure = undefined;
          }
        },
        (error) => {
          if (generation >= (this.projectionFailure?.generation ?? -1)) {
            this.projectionFailure = { generation, error };
          }
        }
      );
    return generation;
  }

  async ensureAcceptedListingDurability(contract: TradeContract): Promise<void> {
    if (contract.status !== "accepted") return;
    const listing = this.store.listings.find((item) => item.id === contract.listingId);
    if (!listing) throw new NotFoundException("매물을 찾을 수 없습니다.");

    const failedGenerationAtEntry = this.projectionFailure?.generation;
    if (listing.status !== "계약완료") {
      listing.status = "계약완료";
      this.persist();
      this.projectListings();
    } else if (
      this.storeProjector &&
      failedGenerationAtEntry === this.projectionGeneration &&
      this.completedProjectionGeneration < this.projectionGeneration
    ) {
      this.projectListings();
    }

    if (!this.storeProjector) return;
    const requiredGeneration = this.projectionGeneration;
    await this.pendingProjection;
    if (this.completedProjectionGeneration < requiredGeneration) {
      throw this.projectionFailure?.error ?? new Error("매물 저장을 완료하지 못했습니다.");
    }
  }

  private load() {
    if (!this.filePath || !existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as TradeStore;
      if (Array.isArray(parsed?.listings) && Array.isArray(parsed?.threads)) {
        // 구버전 레코드 후방호환 — images/contracts 없으면 빈 값으로, 손상된 floorPlan은 제거한다.
        parsed.listings.forEach((listing) => {
          listing.images = normalizeImages(listing.images);
          listing.floorPlan = normalizeFloorPlan(listing.floorPlan);
          const detailAddress = normalizeDetailAddress(listing.detailAddress);
          if (detailAddress) listing.detailAddress = detailAddress;
          else delete listing.detailAddress;
          const buildingName = normalizeBuildingName(listing.buildingName);
          if (buildingName) listing.buildingName = buildingName;
          else delete listing.buildingName;
          if (listing.status !== "계약완료") listing.status = "노출중";
        });
        parsed.contracts = Array.isArray(parsed.contracts) ? parsed.contracts : [];
        this.store = parsed;
      }
    } catch {
      // 손상된 파일은 무시하고 빈 스토어로 시작 (데모 데이터 성격)
    }
  }

  /** 매물 사진 업로드 — 이미지 검증 후 스토리지에 저장하고 공개 URL 배열을 돌려준다. */
  async saveListingPhotos(
    files: Array<{ buffer: Buffer; originalname: string; mimetype: string }>
  ): Promise<{ images: string[] }> {
    if (!files?.length) throw new BadRequestException("업로드할 이미지 파일이 필요합니다.");
    if (files.length > MAX_LISTING_IMAGES) {
      throw new BadRequestException(`사진은 최대 ${MAX_LISTING_IMAGES}장까지 업로드할 수 있습니다.`);
    }

    const images: string[] = [];
    for (const file of files) {
      if (!file.mimetype?.startsWith("image/")) {
        throw new BadRequestException("이미지 파일만 업로드할 수 있습니다.");
      }
      if (!file.buffer?.length) {
        throw new BadRequestException("업로드할 파일이 비어 있습니다.");
      }
      if (file.buffer.length > MAX_UPLOAD_BYTES) {
        throw new BadRequestException("이미지는 10MB 이하만 업로드할 수 있습니다.");
      }

      const uploadId = randomUUID().slice(0, 12);
      const safeBaseName =
        basename(file.originalname, extname(file.originalname))
          .replace(/[^a-zA-Z0-9가-힣_-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 48) || "listing";
      const fileName = `listing-${uploadId}-${safeBaseName}${extensionForUpload(file.mimetype, file.originalname)}`;
      const stored = await this.storageAdapter.save({
        buffer: file.buffer,
        fileName,
        mimeType: file.mimetype
      });
      images.push(stored.fileUrl);
    }

    return { images };
  }

  private persist() {
    const snapshot = this.cloneStore(this.store);
    if (!this.filePath) {
      this.committedStore = snapshot;
      return;
    }
    const tempFilePath = `${this.filePath}.tmp`;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(tempFilePath, JSON.stringify(snapshot), "utf8");
      renameSync(tempFilePath, this.filePath);
      this.committedStore = snapshot;
    } catch (error) {
      try {
        unlinkSync(tempFilePath);
      } catch {
        // temp path may be a directory or may not have been created
      }
      this.store = this.cloneStore(this.committedStore);
      throw error;
    }
  }

  private cloneStore(store: TradeStore): TradeStore {
    return structuredClone(store);
  }

  listListings(): TradeListing[] {
    return [...this.store.listings].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  listPublicListings(): TradeListing[] {
    return this.listListings().filter((listing) => listing.status === "노출중");
  }

  createListing(owner: { id: string; name: string }, input: TradeListingInput): TradeListing {
    if (!input.title?.trim()) throw new BadRequestException("매물명이 필요합니다.");
    const detailAddress = normalizeDetailAddress(input.detailAddress);
    const buildingName = normalizeBuildingName(input.buildingName);
    const listing: TradeListing = {
      id: randomUUID().slice(0, 8),
      ownerId: owner.id,
      ownerName: owner.name,
      title: input.title.trim(),
      roomType: input.roomType?.trim() || "원룸",
      tradeType: input.tradeType === "전세" || input.tradeType === "매매" ? input.tradeType : "월세",
      depositManwon: Number(input.depositManwon) || 0,
      monthlyRentManwon: Number(input.monthlyRentManwon) || 0,
      location: input.location?.trim() || "위치 미입력",
      ...(detailAddress ? { detailAddress } : {}),
      ...(buildingName ? { buildingName } : {}),
      description: input.description?.trim() || "",
      images: normalizeImages(input.images),
      ...normalizeCoords(input.lat, input.lng),
      ...(normalizeFloorPlan(input.floorPlan) ? { floorPlan: normalizeFloorPlan(input.floorPlan) } : {}),
      status: "노출중",
      createdAt: new Date().toISOString()
    };
    this.store.listings.unshift(listing);
    this.persist();
    this.projectListings();
    return listing;
  }

  markListingContracted(listingId: string): TradeListing {
    const listing = this.store.listings.find((item) => item.id === listingId);
    if (!listing) throw new NotFoundException("매물을 찾을 수 없습니다.");
    listing.status = "계약완료";
    this.persist();
    this.projectListings();
    return listing;
  }

  /** 소유자 검증 포함 매물 조회 — 수정/삭제 공용. */
  private ownedListing(ownerId: string, listingId: string): TradeListing {
    const listing = this.store.listings.find((item) => item.id === listingId);
    if (!listing) throw new NotFoundException("매물을 찾을 수 없습니다.");
    if (listing.ownerId !== ownerId) throw new ForbiddenException("내 매물만 수정하거나 내릴 수 있습니다.");
    return listing;
  }

  /** 매물 수정 — 전달된 필드만 갱신(소유자 전용). images는 배열이 오면 통째로 교체. */
  updateListing(owner: { id: string }, listingId: string, input: Partial<TradeListingInput>): TradeListing {
    const listing = this.ownedListing(owner.id, listingId);

    if (typeof input.title === "string" && input.title.trim()) listing.title = input.title.trim();
    if (typeof input.roomType === "string" && input.roomType.trim()) listing.roomType = input.roomType.trim();
    if (input.tradeType === "월세" || input.tradeType === "전세" || input.tradeType === "매매") {
      listing.tradeType = input.tradeType;
    }
    if (input.depositManwon !== undefined) listing.depositManwon = Number(input.depositManwon) || 0;
    if (input.monthlyRentManwon !== undefined) listing.monthlyRentManwon = Number(input.monthlyRentManwon) || 0;
    if (typeof input.location === "string" && input.location.trim()) listing.location = input.location.trim();
    if (typeof input.detailAddress === "string") {
      const detailAddress = normalizeDetailAddress(input.detailAddress);
      if (detailAddress) listing.detailAddress = detailAddress;
      else delete listing.detailAddress;
    }
    if (typeof input.buildingName === "string") {
      const buildingName = normalizeBuildingName(input.buildingName);
      if (buildingName) listing.buildingName = buildingName;
      else delete listing.buildingName;
    }
    if (typeof input.description === "string") listing.description = input.description.trim();
    if (Array.isArray(input.images)) listing.images = normalizeImages(input.images);
    if (input.lat !== undefined || input.lng !== undefined) {
      const coords = normalizeCoords(input.lat, input.lng);
      listing.lat = coords.lat;
      listing.lng = coords.lng;
    }
    // floorPlan 키가 오면 교체(null이면 연결 해제). 키 자체가 없으면 기존 도면 유지.
    if (input.floorPlan !== undefined) listing.floorPlan = normalizeFloorPlan(input.floorPlan);

    this.persist();
    this.projectListings();
    return listing;
  }

  /** 매물 삭제(내리기) — 소유자 전용. 연결된 문의 스레드는 대화 기록으로 남긴다. */
  deleteListing(owner: { id: string }, listingId: string): { ok: true } {
    this.ownedListing(owner.id, listingId);
    this.store.listings = this.store.listings.filter((item) => item.id !== listingId);
    this.persist();
    this.projectListings();
    return { ok: true };
  }

  /**
   * 구매 문의 — 같은 매물·같은 구매자의 기존 스레드가 있으면 거기에 메시지를 잇는다.
   * listingId가 직접등록 매물이 아니면(쇼케이스 매물) 데모 임대인에게 전달한다.
   */
  createInquiry(
    buyer: { id: string; name: string },
    input: { listingId?: string | null; listingTitle: string; message: string; visitTime?: string }
  ): TradeThread {
    if (!input.message?.trim()) throw new BadRequestException("문의 내용이 필요합니다.");
    const listing = input.listingId
      ? this.store.listings.find((item) => item.id === input.listingId)
      : undefined;
    const owner = listing ? { id: listing.ownerId, name: listing.ownerName } : FALLBACK_OWNER;
    if (owner.id === buyer.id) {
      throw new BadRequestException("내가 올린 매물에는 문의를 보낼 수 없습니다.");
    }

    const listingTitle = listing?.title ?? input.listingTitle?.trim() ?? "매물 문의";
    const body = input.visitTime?.trim()
      ? `${input.message.trim()} (방문 희망: ${input.visitTime.trim()})`
      : input.message.trim();

    let thread = this.store.threads.find(
      (item) =>
        item.buyerId === buyer.id &&
        item.ownerId === owner.id &&
        (listing ? item.listingId === listing.id : item.listingTitle === listingTitle)
    );

    const now = new Date().toISOString();
    if (!thread) {
      thread = {
        id: randomUUID().slice(0, 12),
        listingId: listing?.id ?? null,
        listingTitle,
        buyerId: buyer.id,
        buyerName: buyer.name,
        ownerId: owner.id,
        ownerName: owner.name,
        createdAt: now,
        updatedAt: now,
        messages: []
      };
      this.store.threads.unshift(thread);
    }

    thread.messages.push({
      id: randomUUID().slice(0, 12),
      senderId: buyer.id,
      senderName: buyer.name,
      body,
      createdAt: now
    });
    thread.updatedAt = now;
    this.persist();
    return thread;
  }

  listThreads(userId: string): TradeThreadSummary[] {
    return this.store.threads
      .filter((thread) => thread.buyerId === userId || thread.ownerId === userId)
      .filter((thread) => !thread.leftUserIds?.includes(userId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((thread) => {
        const last = thread.messages[thread.messages.length - 1];
        const role = thread.buyerId === userId ? "buyer" : "owner";
        return {
          id: thread.id,
          listingId: thread.listingId,
          listingTitle: thread.listingTitle,
          role,
          counterpartName: role === "buyer" ? thread.ownerName : thread.buyerName,
          lastMessage: last?.body ?? "",
          lastMessageAt: last?.createdAt ?? thread.updatedAt,
          lastSenderId: last?.senderId ?? "",
          messageCount: thread.messages.length
        };
      });
  }

  getThread(userId: string, threadId: string): TradeThread {
    const thread = this.store.threads.find((item) => item.id === threadId);
    if (!thread) throw new NotFoundException("대화를 찾을 수 없습니다.");
    if (thread.buyerId !== userId && thread.ownerId !== userId) {
      throw new ForbiddenException("이 대화의 참여자가 아닙니다.");
    }
    return thread;
  }

  sendMessage(user: { id: string; name: string }, threadId: string, body: string): TradeThread {
    if (!body?.trim()) throw new BadRequestException("메시지 내용이 필요합니다.");
    const thread = this.getThread(user.id, threadId);
    this.pushMessage(thread, user, body.trim());
    this.persist();
    return thread;
  }

  private pushMessage(thread: TradeThread, sender: { id: string; name: string }, body: string) {
    const now = new Date().toISOString();
    thread.messages.push({
      id: randomUUID().slice(0, 12),
      senderId: sender.id,
      senderName: sender.name,
      body,
      createdAt: now
    });
    thread.updatedAt = now;
    // 새 메시지는 나간 사람의 목록에도 채팅방을 되살린다(같은 매물 재문의·상대의 후속 연락).
    if (thread.leftUserIds?.length) delete thread.leftUserIds;
  }

  /** 채팅방 나가기 — 내 목록에서만 숨긴다(상대는 그대로). 새 메시지가 오면 다시 나타난다. */
  leaveThread(userId: string, threadId: string): { ok: true } {
    const thread = this.getThread(userId, threadId);
    const left = new Set(thread.leftUserIds ?? []);
    if (!left.has(userId)) {
      left.add(userId);
      thread.leftUserIds = [...left];
      this.persist();
    }
    return { ok: true };
  }

  /** 계약 조건 한 줄 표기 — 채팅 안내 메시지 공용. */
  private contractTermsLabel(contract: Pick<TradeContract, "tradeType" | "depositManwon" | "monthlyRentManwon">): string {
    const deposit = (contract.depositManwon || 0).toLocaleString("ko-KR");
    if (contract.tradeType === "월세") return `월세 ${deposit}/${contract.monthlyRentManwon || 0}`;
    return `${contract.tradeType} ${deposit}만`;
  }

  /**
   * 계약 제안 — 스레드의 집주인만, 직접등록 매물 대화에서만 가능.
   * 같은 매물에 살아있는(proposed/accepted) 계약이 있으면 중복 제안을 막는다.
   */
  proposeContract(owner: { id: string; name: string }, threadId: string): { contract: TradeContract; thread: TradeThread } {
    const thread = this.getThread(owner.id, threadId);
    if (thread.ownerId !== owner.id) {
      throw new ForbiddenException("내 매물의 문의 대화에서만 계약을 제안할 수 있습니다.");
    }
    const listing = thread.listingId
      ? this.store.listings.find((item) => item.id === thread.listingId)
      : undefined;
    if (!listing) {
      throw new BadRequestException("직접 등록한 매물의 대화에서만 계약을 제안할 수 있습니다.");
    }

    const active = this.store.contracts.find(
      (item) => item.listingId === listing.id && (item.status === "proposed" || item.status === "accepted")
    );
    if (active?.status === "accepted") throw new BadRequestException("이미 계약이 체결된 매물입니다.");
    if (active) {
      if (active.tenantId === thread.buyerId) return { contract: active, thread };
      throw new BadRequestException("다른 문의자에게 제안 중인 계약이 있습니다. 먼저 취소한 뒤 제안해주세요.");
    }

    const contract: TradeContract = {
      id: randomUUID().slice(0, 12),
      listingId: listing.id,
      listingTitle: listing.title,
      threadId: thread.id,
      landlordId: thread.ownerId,
      landlordName: thread.ownerName,
      tenantId: thread.buyerId,
      tenantName: thread.buyerName,
      status: "proposed",
      tradeType: listing.tradeType,
      depositManwon: listing.depositManwon,
      monthlyRentManwon: listing.monthlyRentManwon,
      location: fullListingLocation(listing),
      ...(listing.detailAddress ? { roomNo: listing.detailAddress } : {}),
      proposedAt: new Date().toISOString()
    };
    this.store.contracts.unshift(contract);
    this.pushMessage(thread, owner, `📋 계약을 제안했어요 — ${this.contractTermsLabel(contract)} · 수락하면 계약이 체결됩니다.`);
    this.persist();
    return { contract, thread };
  }

  /** 계약 응답 — 제안받은 문의자(예비 세입자)만. 수락하면 매물이 계약완료로 전환된다. */
  respondContract(
    user: { id: string; name: string },
    contractId: string,
    accept: boolean,
    beforeAccept?: (contract: TradeContract) => void
  ): { contract: TradeContract; thread: TradeThread } {
    if (typeof accept !== "boolean") {
      throw new BadRequestException("계약 수락 여부는 true 또는 false boolean이어야 합니다.");
    }
    const contract = this.store.contracts.find((item) => item.id === contractId);
    if (!contract) throw new NotFoundException("계약 제안을 찾을 수 없습니다.");
    if (contract.tenantId !== user.id) throw new ForbiddenException("제안받은 사람만 응답할 수 있습니다.");
    const thread = this.getThread(user.id, contract.threadId);
    if (accept && contract.status === "accepted") {
      beforeAccept?.({ ...contract });
      return { contract, thread };
    }
    if (contract.status !== "proposed") throw new BadRequestException("이미 처리된 계약 제안입니다.");

    const respondedAt = new Date().toISOString();
    const response: TradeContract = {
      ...contract,
      status: accept ? "accepted" : "declined",
      respondedAt
    };
    if (accept) beforeAccept?.(response);
    const listing = accept
      ? this.store.listings.find((item) => item.id === contract.listingId)
      : undefined;
    if (accept && !listing) throw new NotFoundException("매물을 찾을 수 없습니다.");
    contract.status = response.status;
    contract.respondedAt = respondedAt;
    if (accept) {
      listing!.status = "계약완료";
      this.pushMessage(thread, user, "✅ 계약 제안을 수락했어요 — 계약이 체결되었습니다.");
    } else {
      this.pushMessage(thread, user, "계약 제안을 거절했어요.");
    }
    this.persist();
    if (accept) this.projectListings();
    return { contract, thread };
  }

  /** 제안 취소 — 집주인만, 아직 응답 전(proposed)일 때만. */
  cancelContract(owner: { id: string; name: string }, contractId: string): { contract: TradeContract; thread: TradeThread } {
    const contract = this.store.contracts.find((item) => item.id === contractId);
    if (!contract) throw new NotFoundException("계약 제안을 찾을 수 없습니다.");
    if (contract.landlordId !== owner.id) throw new ForbiddenException("제안한 집주인만 취소할 수 있습니다.");
    if (contract.status !== "proposed") throw new BadRequestException("응답 전인 제안만 취소할 수 있습니다.");

    const thread = this.getThread(owner.id, contract.threadId);
    contract.status = "cancelled";
    contract.respondedAt = new Date().toISOString();
    this.pushMessage(thread, owner, "계약 제안을 취소했어요.");
    this.persist();
    return { contract, thread };
  }

  /** 내가 당사자인 계약 전부 — 집주인의 계약중인 집 탭, 세입자의 내 계약 조회 공용. */
  listContracts(userId: string): TradeContract[] {
    return this.store.contracts
      .filter((item) => item.landlordId === userId || item.tenantId === userId)
      .sort((a, b) => b.proposedAt.localeCompare(a.proposedAt));
  }

  listAcceptedContracts(): TradeContract[] {
    return this.store.contracts
      .filter((contract) => contract.status === "accepted")
      .map((contract) => ({ ...contract }));
  }

  /** 스레드의 최신 계약(참여자 전용) — 채팅 화면의 제안 버튼/수락 카드 상태 판단용. */
  contractForThread(userId: string, threadId: string): TradeContract | null {
    this.getThread(userId, threadId);
    return this.store.contracts.find((item) => item.threadId === threadId) ?? null;
  }
}
