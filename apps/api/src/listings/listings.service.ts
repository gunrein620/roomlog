import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";
import { PrismaClient, type Listing as PersistedListing } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { LISTINGS, findListing, type Listing, type PropertyKind, type TradeType } from "./listings.data";

type ListingFilters = {
  kind?: PropertyKind;
  tradeType?: TradeType;
  lawdCd?: string;
  petsAllowed?: string;
  ownerId?: string;
  ownerEmail?: string;
};

type ListingPayload = Partial<Omit<Listing, "id">> & {
  id?: string;
  ownerId?: string;
  ownerEmail?: string;
  ownerName?: string;
  unitName?: string;
};

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function intValue(value: unknown, fallback = 0) {
  return Math.round(numberValue(value, fallback));
}

function booleanValue(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return fallback;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function registeredDate(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value !== "string" || !value.trim()) return new Date();

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function isoDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

function matchesFilters(listing: Listing, filters: ListingFilters) {
  if (filters.ownerId || filters.ownerEmail) return false;
  if (filters.kind && listing.kind !== filters.kind) return false;
  if (filters.tradeType && listing.tradeType !== filters.tradeType) return false;
  if (filters.lawdCd && listing.lawdCd !== filters.lawdCd) return false;
  if (filters.petsAllowed === "true" && !listing.petsAllowed) return false;
  return true;
}

function toApiListing(listing: PersistedListing): Listing {
  return {
    id: listing.id,
    title: listing.title,
    headline: listing.headline,
    registeredAt: isoDate(listing.registeredAt),
    status: listing.status as Listing["status"],
    viewCount: listing.viewCount,
    tradeType: listing.tradeType as TradeType,
    depositManwon: listing.depositManwon,
    monthlyRentManwon: listing.monthlyRentManwon,
    salePriceManwon: listing.salePriceManwon,
    maintenanceManwon: listing.maintenanceManwon,
    maintenanceIncludes: listing.maintenanceIncludes,
    loanManwon: listing.loanManwon,
    availableFrom: listing.availableFrom,
    contractMonths: listing.contractMonths,
    kind: listing.kind as PropertyKind,
    areaExclusiveM2: listing.areaExclusiveM2,
    areaSupplyM2: listing.areaSupplyM2,
    floor: listing.floor,
    totalFloors: listing.totalFloors,
    rooms: listing.rooms,
    bathrooms: listing.bathrooms,
    direction: listing.direction,
    buildYear: listing.buildYear,
    parking: listing.parking,
    elevator: listing.elevator,
    heating: listing.heating,
    address: listing.address,
    jibunAddress: listing.jibunAddress,
    dong: listing.dong,
    lawdCd: listing.lawdCd,
    lat: listing.lat,
    lng: listing.lng,
    nearestStation: listing.nearestStation,
    walkMinutes: listing.walkMinutes,
    options: listing.options,
    petsAllowed: listing.petsAllowed,
    tags: listing.tags,
    coverImage: listing.coverImage,
    gallery: listing.gallery,
    tourId: listing.tourId,
    registrantType: listing.registrantType as Listing["registrantType"],
    brokerName: listing.brokerName,
    contactPhone: listing.contactPhone,
    responseMinutes: listing.responseMinutes,
    verified: listing.verified,
    reviewStatus: listing.reviewStatus,
    safetyScore: listing.safetyScore
  };
}

function normalizePayload(payload: ListingPayload) {
  const title = stringValue(payload.title);
  const address = stringValue(payload.address);
  const kind = stringValue(payload.kind, "원룸");
  const tradeType = stringValue(payload.tradeType, "월세");

  if (!title) {
    throw new BadRequestException("title is required.");
  }
  if (!address) {
    throw new BadRequestException("address is required.");
  }

  return {
    ownerId: stringValue(payload.ownerId) || null,
    ownerEmail: stringValue(payload.ownerEmail) || null,
    ownerName: stringValue(payload.ownerName) || null,
    title,
    headline: stringValue(payload.headline, `${address} ${stringValue(payload.unitName)}`.trim()),
    registeredAt: registeredDate(payload.registeredAt),
    status: stringValue(payload.status, "거래중"),
    viewCount: intValue(payload.viewCount),
    tradeType,
    depositManwon: intValue(payload.depositManwon),
    monthlyRentManwon: intValue(payload.monthlyRentManwon),
    salePriceManwon: intValue(payload.salePriceManwon),
    maintenanceManwon: intValue(payload.maintenanceManwon),
    maintenanceIncludes: stringArray(payload.maintenanceIncludes),
    loanManwon: intValue(payload.loanManwon),
    availableFrom: stringValue(payload.availableFrom, "즉시"),
    contractMonths: intValue(payload.contractMonths, 24),
    kind,
    areaExclusiveM2: numberValue(payload.areaExclusiveM2),
    areaSupplyM2: numberValue(payload.areaSupplyM2),
    floor: intValue(payload.floor, 1),
    totalFloors: intValue(payload.totalFloors, 1),
    rooms: intValue(payload.rooms, 1),
    bathrooms: intValue(payload.bathrooms, 1),
    direction: stringValue(payload.direction),
    buildYear: intValue(payload.buildYear),
    parking: booleanValue(payload.parking),
    elevator: booleanValue(payload.elevator),
    heating: stringValue(payload.heating),
    address,
    jibunAddress: stringValue(payload.jibunAddress),
    dong: stringValue(payload.dong),
    lawdCd: stringValue(payload.lawdCd),
    lat: numberValue(payload.lat, 37.5665),
    lng: numberValue(payload.lng, 126.978),
    nearestStation: stringValue(payload.nearestStation),
    walkMinutes: intValue(payload.walkMinutes),
    options: stringArray(payload.options),
    petsAllowed: booleanValue(payload.petsAllowed),
    tags: stringArray(payload.tags),
    coverImage: stringValue(payload.coverImage),
    gallery: stringArray(payload.gallery),
    tourId: stringValue(payload.tourId) || null,
    registrantType: stringValue(payload.registrantType, "집주인"),
    brokerName: stringValue(payload.brokerName),
    contactPhone: stringValue(payload.contactPhone),
    responseMinutes: intValue(payload.responseMinutes),
    verified: booleanValue(payload.verified),
    reviewStatus: stringValue(payload.reviewStatus, "등록"),
    safetyScore: intValue(payload.safetyScore)
  };
}

@Injectable()
export class ListingsService implements OnModuleDestroy {
  private readonly prisma?: PrismaClient;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (databaseUrl) {
      const adapter = new PrismaPg({ connectionString: databaseUrl });
      this.prisma = new PrismaClient({ adapter });
    }
  }

  async list(filters: ListingFilters) {
    const staticListings = LISTINGS.filter((listing) => matchesFilters(listing, filters));
    const persistedListings = await this.findPersisted(filters);
    return [...persistedListings, ...staticListings];
  }

  async mine(filters: Pick<ListingFilters, "ownerId" | "ownerEmail">) {
    if (!filters.ownerId && !filters.ownerEmail) {
      throw new BadRequestException("ownerId or ownerEmail is required.");
    }
    return this.findPersisted(filters);
  }

  async detail(id: string) {
    const persisted = await this.findPersistedById(id);
    if (persisted) return persisted;

    const seeded = findListing(id);
    if (seeded) return seeded;

    throw new NotFoundException(`Listing ${id} not found`);
  }

  async create(payload: ListingPayload) {
    const prisma = this.requirePrisma();
    const listing = await prisma.listing.create({
      data: normalizePayload(payload)
    });
    return toApiListing(listing);
  }

  async update(id: string, payload: ListingPayload) {
    const prisma = this.requirePrisma();
    const current = await this.ensurePersisted(id);

    const listing = await prisma.listing.update({
      where: { id },
      data: normalizePayload({
        ...toApiListing(current),
        ownerId: current.ownerId ?? undefined,
        ownerEmail: current.ownerEmail ?? undefined,
        ownerName: current.ownerName ?? undefined,
        ...payload
      })
    });
    return toApiListing(listing);
  }

  async onModuleDestroy() {
    await this.prisma?.$disconnect();
  }

  private async findPersisted(filters: ListingFilters) {
    if (!this.prisma) return [];

    const listings = await this.prisma.listing.findMany({
      where: {
        kind: filters.kind,
        tradeType: filters.tradeType,
        lawdCd: filters.lawdCd,
        petsAllowed: filters.petsAllowed === "true" ? true : undefined,
        ownerId: filters.ownerId,
        ownerEmail: filters.ownerEmail
      },
      orderBy: { createdAt: "desc" }
    });

    return listings.map(toApiListing);
  }

  private async findPersistedById(id: string) {
    if (!this.prisma) return null;

    const listing = await this.prisma.listing.findUnique({ where: { id } });
    return listing ? toApiListing(listing) : null;
  }

  private async ensurePersisted(id: string) {
    const listing = await this.prisma?.listing.findUnique({ where: { id } });
    if (!listing) {
      throw new NotFoundException(`Persisted listing ${id} not found`);
    }
    return listing;
  }

  private requirePrisma() {
    if (!this.prisma) {
      throw new ServiceUnavailableException("DATABASE_URL is required to save listings.");
    }
    return this.prisma;
  }
}
