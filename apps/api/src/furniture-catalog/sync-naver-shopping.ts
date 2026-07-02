import { FurnitureCatalogService } from "./furniture-catalog.service";

async function main() {
  const query = process.argv[2] ?? "가구";
  const display = Number(process.argv[3] ?? 30);
  const service = new FurnitureCatalogService();
  const result = await service.syncFromNaverShopping({ display, query });

  console.log(`Synced ${result.synced} furniture catalog items from Naver Shopping for "${query}".`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
