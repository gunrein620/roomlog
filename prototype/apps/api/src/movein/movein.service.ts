import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  AddPhotoDto,
  ChecklistItem,
  ItemRecord,
  MoveinRecord,
} from "@roomlog/types";
import { MoveinRepository } from "./movein.repository";

@Injectable()
export class MoveinService {
  constructor(private readonly repository: MoveinRepository) {}

  listMoveins(): MoveinRecord[] {
    return this.repository.listMoveins();
  }

  getMovein(leaseId: string): MoveinRecord {
    const movein = this.repository.getMovein(leaseId);
    if (!movein) {
      throw new NotFoundException(`Movein not found: ${leaseId}`);
    }

    return movein;
  }

  getChecklist(leaseId: string): ChecklistItem[] {
    const checklist = this.repository.getChecklist(leaseId);
    if (!checklist) {
      throw new NotFoundException(`Movein checklist not found: ${leaseId}`);
    }

    return checklist;
  }

  listItemRecords(leaseId: string): ItemRecord[] {
    const itemRecords = this.repository.listItemRecords(leaseId);
    if (!itemRecords) {
      throw new NotFoundException(`Movein item records not found: ${leaseId}`);
    }

    return itemRecords;
  }

  getItemRecord(leaseId: string, itemId: string): ItemRecord {
    const itemRecord = this.repository.getItemRecord(leaseId, itemId);
    if (!itemRecord) {
      throw new NotFoundException(`Movein item record not found: ${itemId}`);
    }

    return itemRecord;
  }

  addPhoto(leaseId: string, itemId: string, dto: AddPhotoDto): ItemRecord {
    const itemRecord = this.repository.addPhoto(leaseId, itemId, dto);
    if (!itemRecord) {
      throw new NotFoundException(`Movein item not found: ${itemId}`);
    }

    return itemRecord;
  }
}
