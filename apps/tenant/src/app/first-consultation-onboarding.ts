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
      `${label} 화장실 천장에서 오늘 오전부터 물이 떨어지고 있습니다. 지금도 계속 새고 있고 문제 부위 사진은 아직 없습니다. 오늘 저녁 7시 이후 방문 가능합니다.`,
      `${label} 보일러가 어제 밤부터 작동하지 않아 온수와 난방이 모두 안 됩니다. 사진 첨부는 어렵고 보일러 표시창 상태를 글로 설명할 수 있습니다. 내일 오전에 연락 가능합니다.`,
      `${label} 이번 달 관리비 청구 금액이 평소보다 높고 계약서와 다른 것 같습니다. 청구서 사진을 첨부할 수 있습니다. 오늘 오후 6시 이후 확인 가능합니다.`
    ]
  };
}
