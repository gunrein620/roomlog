import { Module } from "@nestjs/common";
import { MapSearchController } from "./map-search.controller";
import { MapSearchService } from "./map-search.service";

@Module({
  controllers: [MapSearchController],
  providers: [MapSearchService]
})
export class MapSearchModule {}
