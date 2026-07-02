import { FurnitureCatalogService } from "./furniture-catalog.service";

async function main() {
  const pageUrl = process.argv[2];
  if (!pageUrl) {
    throw new Error("Product URL is required. Example: pnpm --filter api crawl:furniture:url https://example.com/product");
  }

  const service = new FurnitureCatalogService();
  const result = await service.crawlAndImportProductPage(pageUrl);

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
