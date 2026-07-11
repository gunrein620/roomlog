import type { BriefingInput } from "./briefing-input";

export type CopilotPresetResponse = {
  label: string;
  response: string;
};

export function buildBriefing(input: BriefingInput): string {
  const managerLabel = `${input.managerName.trim() || "관리인"}님`;
  const allQuiet =
    input.overdueCount === 0 &&
    input.urgentTicketCount === 0 &&
    input.openTicketCount === 0 &&
    input.expiringContractCount === 0 &&
    input.unansweredThreadCount === 0;
  const sentences: string[] = [];

  // 리드 — 지금 가장 급한 것 하나만 짚는다.
  if (input.overdueCount > 0 && input.urgentTicketCount > 0) {
    sentences.push(
      `${managerLabel}, 미납 ${input.overdueCount}건과 긴급 하자 ${input.urgentTicketCount}건부터 확인하면 좋아요.`
    );
  } else if (input.overdueCount > 0) {
    sentences.push(`${managerLabel}, 미납 ${input.overdueCount}건 확인이 먼저예요.`);
  } else if (input.urgentTicketCount > 0) {
    sentences.push(`${managerLabel}, 긴급 하자 ${input.urgentTicketCount}건부터 봐주세요.`);
  } else if (allQuiet) {
    sentences.push(`${managerLabel}, 오늘은 바로 붙잡아야 할 일이 없습니다.`);
  } else {
    sentences.push(`${managerLabel}, 급한 불은 없어요.`);
  }

  // 나머지 — 0건인 항목은 말하지 않는다. 사람 비서는 없는 일을 보고하지 않는다.
  const followUps: string[] = [];
  if (input.openTicketCount > 0) followUps.push(`진행 중 하자 ${input.openTicketCount}건`);
  if (input.expiringContractCount > 0) followUps.push(`30일 내 만료 계약 ${input.expiringContractCount}건`);
  if (input.unansweredThreadCount > 0) followUps.push(`답장을 기다리는 대화 ${input.unansweredThreadCount}건`);
  if (followUps.length > 0) {
    sentences.push(`그 밖에 ${followUps.join(", ")}이 있어요.`);
  }

  // 입금률·집 현황 — 확인된 것만.
  if (allQuiet) {
    sentences.push(
      input.depositRatePct === null
        ? `관리 중인 집 ${input.homeCount}채 모두 조용합니다.`
        : `관리 중인 집 ${input.homeCount}채 모두 조용하고, 이번 달 입금률은 ${input.depositRatePct}%예요.`
    );
  } else {
    sentences.push(
      input.depositRatePct === null
        ? `관리 중인 집은 ${input.homeCount}채입니다.`
        : `이번 달 입금률은 ${input.depositRatePct}%예요.`
    );
  }

  return sentences.join(" ");
}

export function buildPresetResponses(input: BriefingInput): CopilotPresetResponse[] {
  return [
    {
      label: "이번 달 입금 현황",
      response:
        input.depositRatePct === null
          ? `이번 달 입금률은 아직 확인되지 않았어요. 연체 청구는 ${input.overdueCount}건입니다.`
          : `이번 달 입금률은 ${input.depositRatePct}%이고, 연체 청구는 ${input.overdueCount}건입니다.`
    },
    {
      label: "미납 있어?",
      response:
        input.overdueCount > 0
          ? `연체 청구가 ${input.overdueCount}건 있어요. 발송이 필요한 경우 대상을 확인한 뒤 한 번 더 확인받고 진행하겠습니다.`
          : "현재 연체 청구는 0건이에요. 독촉 발송할 항목은 없습니다."
    },
    {
      label: "하자 어떻게 되고 있어?",
      response: `진행 중 하자는 ${input.openTicketCount}건이고, 그중 긴급 하자는 ${input.urgentTicketCount}건입니다.`
    },
    {
      label: "이번 주 뭐 해야 해?",
      response:
        getPendingWorkCount(input) > 0
          ? `이번 주 우선 볼 일은 ${getPendingWorkCount(input)}건입니다. 연체 ${input.overdueCount}건, 긴급 하자 ${input.urgentTicketCount}건, 만료 임박 계약 ${input.expiringContractCount}건, 미응답 대화 ${input.unansweredThreadCount}건을 순서대로 확인하면 됩니다.`
          : "이번 주 우선 처리할 대기 업무는 0건이에요. 입금 변동과 새 메시지만 가볍게 확인하세요."
    }
  ];
}

function getPendingWorkCount(input: BriefingInput): number {
  return (
    input.overdueCount +
    input.urgentTicketCount +
    input.expiringContractCount +
    input.unansweredThreadCount
  );
}
