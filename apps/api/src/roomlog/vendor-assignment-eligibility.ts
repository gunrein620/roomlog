import { Prisma } from "@prisma/client";

export function vendorAssignmentWhere(
  managerId?: string,
): Prisma.VendorProfileWhereInput {
  return {
    verificationStatus: "VERIFIED",
    isActive: true,
    accountLinks: {
      some: { status: "ACTIVE", user: { status: "ACTIVE" } },
    },
    ...(managerId
      ? { managerVendors: { some: { managerId, status: "ACTIVE" } } }
      : {}),
  };
}

export function isDirectManagerVendor(
  vendor: { createdByManagerId: string | null },
  managerId: string,
) {
  return vendor.createdByManagerId === managerId;
}

export function managerVendorAssignmentWhere(
  managerId: string,
): Prisma.VendorProfileWhereInput {
  return {
    managerVendors: {
      some: { managerId, status: "ACTIVE" },
    },
    OR: [
      vendorAssignmentWhere(),
      { createdByManagerId: managerId, isActive: true },
    ],
  };
}

function normalizeServiceArea(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("ko")
    .replace(/서울특별시|서울시/g, "서울")
    .replace(/부산광역시|부산시/g, "부산")
    .replace(/대구광역시|대구시/g, "대구")
    .replace(/인천광역시|인천시/g, "인천")
    .replace(/광주광역시|광주시/g, "광주")
    .replace(/대전광역시|대전시/g, "대전")
    .replace(/울산광역시|울산시/g, "울산")
    .replace(/세종특별자치시|세종시/g, "세종")
    .replace(/\s+/g, "")
    .replace(/(?:전지역|전역|전체)$/g, "");
}

export function vendorServesAddress(
  vendor: { serviceArea: string; serviceAreas: readonly string[] },
  address: string,
) {
  const target = normalizeServiceArea(address);
  return [vendor.serviceArea, ...vendor.serviceAreas].some((area) => {
    const candidate = normalizeServiceArea(area);
    return Boolean(candidate) && (target.includes(candidate) || candidate.includes(target));
  });
}
