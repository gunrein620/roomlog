export type TenantContractListingSummary = {
  id: string;
  title?: string;
  location?: string;
  detailAddress?: string;
  options?: unknown;
};

type TenantContractRoomIdentity = {
  buildingName: string;
  roomNo: string;
  address: string;
};

export function findTenantContractListing<
  T extends TenantContractListingSummary,
>(
  listings: T[],
  listingId: string | undefined,
  room: TenantContractRoomIdentity,
): T | undefined {
  return (
    listings.find((item) => item.id === listingId) ??
    listings.find((item) => {
      const detailAddress = item.detailAddress ?? "";
      return (
        item.title === room.buildingName ||
        item.location === room.address ||
        detailAddress.includes(room.roomNo) ||
        `${item.location ?? ""} ${detailAddress}`.includes(room.address)
      );
    })
  );
}

export function tenantContractOptions(
  listing?: TenantContractListingSummary,
): string[] {
  if (!Array.isArray(listing?.options)) return [];

  return Array.from(
    new Set(
      listing.options
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}
