"use client";

// 마이페이지 흐름 공용 — MyFlow 타입/탭 바/저장 조건. 역할 흐름 분리(3단계)로 HomeApp에서 추출.
import type { ReactNode } from "react";

export // 내 주거 프로세스: 한 계정이 상황에 따라 갖는 집과의 관계(흐름) 단위.
// "역할 전환"이 아니라 같은 계정에서 여러 흐름을 오간다는 관점으로 표현한다.
type MyFlow = "seeking" | "listing" | "living" | "managing";

export const myFlowItems: Array<{ id: MyFlow; label: string }> = [
  { id: "seeking", label: "방 찾는 중" },
  { id: "listing", label: "내놓은 집" },
  { id: "living", label: "사는 집" },
  { id: "managing", label: "관리 중인 집" }
];

export const savedConditions = [
  { label: "방배동 월세 1000/130 이하", area: "서초구 방배동", category: "원룸", filters: ["월세", "풀옵션"] },
  { label: "내방역 도보 10분", area: "내방역 7호선", category: "오피스텔", filters: ["월세", "주차"] },
  { label: "풀옵션 · 주차 가능", area: "강남역 오피스텔", category: "오피스텔", filters: ["월세", "주차", "풀옵션"] }
];

export function MyFlowBar({
  activeFlow,
  onSelectFlow,
  menuSlot
}: {
  activeFlow: MyFlow;
  onSelectFlow: (flow: MyFlow) => void;
  /** 바 왼쪽에 끼워 넣는 화면별 부가 버튼(예: 집주인 대시보드 메뉴 토글) */
  menuSlot?: ReactNode;
}) {
  // 흐름 전환은 숨기지 않는다 — 바의 빈 공간을 큼직한 탭 4개로 채워 한 번에 눌러 이동한다.
  return (
    <div className="mypage-role-bar my-flow-bar">
      {menuSlot}
      <span>
        내 주거 프로세스 — 한 계정으로 <b>여러 집과 관계</b>를 이어갑니다
      </span>
      <div className="my-flow-chips my-flow-tabs" aria-label="연결된 흐름" role="tablist">
        {myFlowItems.map((flow) => (
          <button
            key={flow.id}
            type="button"
            role="tab"
            aria-selected={flow.id === activeFlow}
            className={flow.id === activeFlow ? "active" : ""}
            onClick={() => onSelectFlow(flow.id)}
          >
            {flow.label}
          </button>
        ))}
      </div>
    </div>
  );
}
