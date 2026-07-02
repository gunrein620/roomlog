import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import type {
  AddPhotoDto,
  ChecklistItem,
  ItemRecord,
  MoveinRecord,
} from "@roomlog/types";
import { MoveinService } from "./movein.service";

@Controller("moveins")
export class MoveinController {
  constructor(private readonly moveinService: MoveinService) {}

  @Get()
  listMoveins(): MoveinRecord[] {
    return this.moveinService.listMoveins();
  }

  @Get(":leaseId")
  getMovein(@Param("leaseId") leaseId: string): MoveinRecord {
    return this.moveinService.getMovein(leaseId);
  }

  @Get(":leaseId/checklist")
  getChecklist(@Param("leaseId") leaseId: string): ChecklistItem[] {
    return this.moveinService.getChecklist(leaseId);
  }

  @Get(":leaseId/items")
  listItemRecords(@Param("leaseId") leaseId: string): ItemRecord[] {
    return this.moveinService.listItemRecords(leaseId);
  }

  @Get(":leaseId/items/:itemId")
  getItemRecord(
    @Param("leaseId") leaseId: string,
    @Param("itemId") itemId: string,
  ): ItemRecord {
    return this.moveinService.getItemRecord(leaseId, itemId);
  }

  @Post(":leaseId/items/:itemId/photos")
  addPhoto(
    @Param("leaseId") leaseId: string,
    @Param("itemId") itemId: string,
    @Body() dto: AddPhotoDto,
  ): ItemRecord {
    return this.moveinService.addPhoto(leaseId, itemId, dto);
  }
}
