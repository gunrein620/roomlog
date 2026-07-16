import { Controller, Get, Query } from "@nestjs/common";
import { MapSearchService } from "./map-search.service";

@Controller("map")
export class MapSearchController {
  constructor(private readonly mapSearch: MapSearchService) {}

  @Get("search")
  search(@Query("q") query = "") {
    return this.mapSearch.searchLocal(query);
  }
}
