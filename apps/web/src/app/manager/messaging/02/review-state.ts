export interface AnnouncementRecipientState {
  canSend: boolean;
  emptyMessage?: string;
}

export function announcementRecipientState(recipientCount: number): AnnouncementRecipientState {
  if (recipientCount <= 0) {
    return {
      canSend: false,
      emptyMessage: "연결된 계약 세입자가 없습니다. 계약 세입자를 연결한 뒤 발송해 주세요.",
    };
  }

  return { canSend: true };
}
