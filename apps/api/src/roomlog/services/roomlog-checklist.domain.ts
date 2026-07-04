// 입주 체크리스트(move-in checklist) 도메인 협력 클래스 — roomlog.service.ts에서 추출(동작 불변).
// getTenantRoomTimeline은 공유 presentRoomTimeline 래퍼라 RoomlogService에 잔류(여기 미포함).
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException
} from "@nestjs/common";
import { id, now } from "../roomlog-support";
import type { CreateMoveInChecklistItemInput, MoveInChecklistItem } from "../roomlog.types";
import type { Store } from "../roomlog.service";

export class RoomlogChecklistDomain {
  constructor(
    private readonly store: Store,
    private readonly persistStore: () => void,
    private readonly findRoom: (roomId: string) => unknown,
    private readonly assertManagerCanAccessRoom: (managerId: string, roomId: string) => void
  ) {}

  createMoveInChecklistItem(tenantId: string, input: CreateMoveInChecklistItemInput) {
    const roomId = input.roomId?.trim() || this.store.tenantRooms[tenantId];

    if (!roomId || this.store.tenantRooms[tenantId] !== roomId) {
      throw new ForbiddenException("본인 호실의 체크리스트만 등록할 수 있습니다.");
    }

    const area = input.area?.trim();
    const itemName = input.itemName?.trim();
    const memo = input.memo?.trim();
    const attachmentUrls = input.attachmentUrls?.map((url) => url.trim()).filter(Boolean) ?? [];

    if (!area) {
      throw new BadRequestException("공간명을 입력해주세요.");
    }

    if (!itemName) {
      throw new BadRequestException("체크 항목명을 입력해주세요.");
    }

    if (attachmentUrls.length === 0) {
      throw new BadRequestException("입주 전 기준 사진을 한 장 이상 첨부해주세요.");
    }

    this.findRoom(roomId);
    const createdAt = now();
    const item: MoveInChecklistItem = {
      id: id("mchk"),
      tenantId,
      roomId,
      area,
      itemName,
      memo,
      guidance: this.moveInChecklistGuidance(area, itemName),
      attachmentUrls,
      createdAt,
      updatedAt: createdAt
    };

    this.store.moveInChecklist.unshift(item);
    this.persistStore();

    return this.presentMoveInChecklistItem(item);
  }

  listTenantMoveInChecklist(tenantId: string) {
    const roomId = this.store.tenantRooms[tenantId];

    if (!roomId) {
      throw new NotFoundException("연결된 호실을 찾을 수 없습니다.");
    }

    return this.store.moveInChecklist
      .filter((item) => item.tenantId === tenantId && item.roomId === roomId)
      .map((item) => this.presentMoveInChecklistItem(item));
  }

  listManagerMoveInChecklist(managerId: string, roomId: string) {
    this.assertManagerCanAccessRoom(managerId, roomId);

    return this.store.moveInChecklist
      .filter((item) => item.roomId === roomId)
      .map((item) => this.presentMoveInChecklistItem(item));
  }

  private presentMoveInChecklistItem(item: MoveInChecklistItem) {
    return {
      ...item,
      attachmentUrls: [...item.attachmentUrls],
      room: this.store.rooms.find((room) => room.id === item.roomId)
    };
  }

  private moveInChecklistGuidance(area: string, itemName: string) {
    return [
      `${area} ${itemName}은 정면에서 전체가 보이게 촬영해주세요.`,
      "같은 위치는 전체 사진 1장과 문제 부위가 보이는 근접 사진 1장을 남기면 이후 비교가 쉬워집니다.",
      "퇴실 비교를 위해 문, 창문, 가전, 벽면처럼 기준점이 함께 보이게 촬영해주세요."
    ].join(" ");
  }
}
