import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FurnitureCatalogService } from "./furniture-catalog.service";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("CSV file path is required. Example: pnpm --filter api import:furniture:csv ./furniture.csv");
  }

  const csv = readFileSync(resolve(filePath), "utf8");
  const service = new FurnitureCatalogService();
  const result = await service.importManualCsv(csv);

  console.log(`Imported ${result.synced} furniture catalog items from CSV.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
