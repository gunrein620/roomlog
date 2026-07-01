import { Module } from "@nestjs/common";
import { FurnitureCatalogController } from "./furniture-catalog.controller";
import { FurnitureCatalogService } from "./furniture-catalog.service";

@Module({
  controllers: [FurnitureCatalogController],
  providers: [FurnitureCatalogService]
})
export class FurnitureCatalogModule {}
