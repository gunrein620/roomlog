import { FurnitureCatalogService } from "./furniture-catalog.service";

async function main() {
  const limit = Number(process.argv[2] ?? 30);
  const service = new FurnitureCatalogService();
  const result = await service.syncFromDummyJson({ limit });

  console.log(`Synced ${result.synced} furniture catalog items from DummyJSON.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
