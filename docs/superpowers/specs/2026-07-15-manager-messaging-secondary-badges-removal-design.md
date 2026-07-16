# 관리인 메시징 보조 배지 제거 설계

## 목표

관리인 메시징 상세 화면의 맥락 카드에서 임차인 ID 배지와 문의 유형 배지를 표시하지 않는다.

## 변경 범위

- `thread.tenantId`를 표시하는 배지를 제거한다.
- `CONTEXT_LABEL[thread.context]`를 표시하는 배지를 제거한다.
- 건물·호수를 표시하는 `locationLabel` 배지는 유지한다.
- 추가 요청이 있을 때 표시되는 `추가요청 대기` 배지는 유지한다.
- `thread.contextLabel ?? "일반 문의"` 제목은 유지한다.
- 메시지 타임라인, 답장 입력 및 우측 보조 기능은 변경하지 않는다.

## 구현 방법

`apps/web/src/app/manager/messaging/04/page.tsx`의 `ContextCard`에서 대상 `<Badge>` 두 개만 삭제한다. CSS 숨김이나 새로운 조건부 렌더링은 추가하지 않는다.

## 검증

- 관리인 메시징 상세 페이지의 `ContextCard`에 `thread.tenantId` 배지가 없는지 확인한다.
- 같은 영역에 `CONTEXT_LABEL[thread.context]` 배지가 없는지 확인한다.
- `locationLabel`, `추가요청 대기`, `thread.contextLabel ?? "일반 문의"` 렌더링이 유지되는지 확인한다.
- 관리인 메시징 상세 집중 테스트를 실행한다.
