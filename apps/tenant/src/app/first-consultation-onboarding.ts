export type FirstConsultationRoom = {
  buildingName?: string;
  roomNo?: string;
  roomId?: string;
};

export type FirstConsultationStep = {
  title: string;
  description: string;
};

function roomLabel(room: FirstConsultationRoom) {
  const detail = [room.buildingName?.trim(), room.roomNo?.trim()].filter(Boolean).join(" ");

  if (detail) {
    return detail;
  }

  return "연결된 호실";
}

export function firstConsultationOnboarding(room: FirstConsultationRoom) {
  const label = roomLabel(room);

  return {
    title: `${label} 첫 AI 상담 준비`,
    description:
      "상담마다 독립 스레드로 저장되며 사진과 대화 기록, AI 접수 초안, 최종 티켓이 서로 연결됩니다.",
    steps: [
      {
        title: "상황 설명",
        description: "증상, 위치, 언제부터인지, 지금도 계속되는지 한 번에 말해도 됩니다."
      },
      {
        title: "사진 첨부",
        description: "문제 부위 근접 사진과 공간 전체 사진을 올리면 AI가 비교 근거를 정리합니다."
      },
      {
        title: "초안 확인",
        description: "AI가 유형, 긴급도, 방문 가능 시간, 추가 질문을 정리한 뒤 접수 전 수정할 수 있습니다."
      }
    ] satisfies FirstConsultationStep[],
    starterPrompts: [
      "화장실 천장에서 물이 떨어지고 있습니다. 언제부터인지, 지금도 계속 새는지 확인해주세요.",
      "보일러가 작동하지 않습니다. 온수와 난방 중 어떤 문제가 더 큰지 정리해주세요.",
      "월세나 관리비 청구 내역이 이상합니다. 계약/납부 기록 기준으로 확인해주세요."
    ]
  };
}
