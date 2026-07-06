import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createFileStorageAdapter, type FileStorageAdapter } from "../roomlog/storage.service";

/**
 * 거래(매물 직접등록 + 구매 문의 채팅) 도메인.
 * 룸로그(입주 후 관리)와 분리된 "집 구하기/내놓기" 쪽의 계정 간 연결을 담당한다.
 * 채팅은 폴링 기반(REST) — 큰 흐름 연결이 목적이며 WS 전환점은 이 서비스 뒤로 숨겨져 있다.
 */

export type TradeListingInput = {
  title: string;
  roomType: string;
  tradeType: "월세" | "전세" | "매매";
  depositManwon: number;
  monthlyRentManwon: number;
  location: string;
  description?: string;
  /** 업로드된 매물 사진 URL 배열(없으면 카드가 목업으로 폴백) */
  images?: string[];
  /** 주소 지오코딩 좌표(없으면 상세 지도는 데모/안내 상태 유지) */
  lat?: number;
  lng?: number;
};

export type TradeListing = Omit<TradeListingInput, "images"> & {
  id: string;
  ownerId: string;
  ownerName: string;
  status: "노출중";
  createdAt: string;
  images: string[];
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
};

/** 쇼케이스(하드코딩) 매물 문의가 도착할 데모 임대인 계정 */
const FALLBACK_OWNER = { id: "landlord-demo", name: "박관리" };

const MAX_LISTING_IMAGES = 10;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic"];

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

function defaultStoreFilePath(): string | undefined {
  const explicit = process.env.ROOMLOG_TRADE_FILE?.trim();
  if (explicit) return explicit;
  const roomlogStore = process.env.ROOMLOG_STORE_FILE?.trim();
  if (roomlogStore) return `${dirname(roomlogStore)}/trade-store.json`;
  return undefined; // 로컬 dev — 메모리만으로 동작
}

@Injectable()
export class TradeService {
  private store: TradeStore = { listings: [], threads: [] };
  private readonly filePath: string | undefined;
  // main.ts와 동일한 기본값 — S3_UPLOADS_ENABLED가 켜지면 자동으로 S3 어댑터로 전환된다.
  private readonly storageAdapter: FileStorageAdapter = createFileStorageAdapter(
    process.env,
    resolve(process.env.LOCAL_UPLOAD_DIR || "uploads"),
    process.env.PUBLIC_UPLOAD_BASE_URL || "/api/files"
  );

  constructor(@Optional() @Inject(TRADE_STORE_FILE) filePath?: string) {
    this.filePath = filePath ?? defaultStoreFilePath();
    this.load();
  }

  private load() {
    if (!this.filePath || !existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as TradeStore;
      if (Array.isArray(parsed?.listings) && Array.isArray(parsed?.threads)) {
        // 구버전 레코드 후방호환 — images 없으면 빈 배열로 채운다.
        parsed.listings.forEach((listing) => {
          listing.images = normalizeImages(listing.images);
        });
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
    if (!this.filePath) return;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.store), "utf8");
    } catch {
      // 영속화 실패는 치명적이지 않다 — 메모리 상태로 계속 동작
    }
  }

  listListings(): TradeListing[] {
    return [...this.store.listings].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  createListing(owner: { id: string; name: string }, input: TradeListingInput): TradeListing {
    if (!input.title?.trim()) throw new BadRequestException("매물명이 필요합니다.");
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
      description: input.description?.trim() || "",
      images: normalizeImages(input.images),
      ...normalizeCoords(input.lat, input.lng),
      status: "노출중",
      createdAt: new Date().toISOString()
    };
    this.store.listings.unshift(listing);
    this.persist();
    return listing;
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
    const now = new Date().toISOString();
    thread.messages.push({
      id: randomUUID().slice(0, 12),
      senderId: user.id,
      senderName: user.name,
      body: body.trim(),
      createdAt: now
    });
    thread.updatedAt = now;
    this.persist();
    return thread;
  }
}
