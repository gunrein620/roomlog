export type FurnitureCatalogSource = "mine" | "catalog" | "poly";

export const FURNITURE_CATALOG_SOURCE_TABS: ReadonlyArray<{
  id: FurnitureCatalogSource;
  label: string;
}> = [
  { id: "mine", label: "내가구" },
  { id: "catalog", label: "등록된 가구" },
  { id: "poly", label: "폴리" },
];
