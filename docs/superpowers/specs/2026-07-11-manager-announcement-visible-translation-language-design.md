# 공지 번역 카드 실제 언어만 표시 설계

## 목표

`/manager/messaging/01`에서 한 언어를 번역하거나 첨부했을 때 해당 언어 카드에만 번역 결과를 표시한다. 기존 API 호환을 위한 세 언어 슬롯 복제 데이터는 화면에 노출하지 않는다.

## 원인

단일 언어 첨부 시 기존 서버의 세 언어 요구 조건을 만족시키기 위해 선택한 번역을 `en`, `zh`, `vi` 슬롯에 동일하게 저장한다. 현재 화면은 `lang`만 기준으로 번역을 찾기 때문에 복제된 English 내용이 中文와 Tiếng Việt 카드에도 표시된다.

## 동작

- 카드의 `lang`과 표시 라벨이 번역 데이터의 `lang`과 `langLabel` 모두에 일치할 때만 실제 번역으로 표시한다.
- English를 번역·첨부하면 English 카드만 내용과 `첨부됨` 상태를 표시한다.
- 中文와 Tiếng Việt의 호환 복제 데이터는 빈 카드처럼 취급해 축소 상태를 유지한다.
- 中文를 실제 번역하면 中文 카드만 펼쳐 결과를 표시한다.
- 中文를 첨부하면 中文 카드만 `첨부됨`으로 표시한다.
- 기존 세 슬롯 투영, 저장, 검토, 발송 동작은 변경하지 않는다.

## 범위

- `apps/web/src/app/manager/messaging/01/attachment-state.ts`
- `apps/web/src/app/manager/messaging/01/attachment-state.spec.ts`
- `apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx`
- `/manager/messaging/01` 계약 테스트

API, 공유 타입, `/manager/messaging/00`, `/manager/messaging/02`, 임차인 화면과 인프라는 변경하지 않는다.

## 테스트

- English 호환 투영에서 English 카드용 조회만 결과를 반환하는지 확인한다.
- 동일 데이터의 中文·Tiếng Việt 카드용 조회는 결과를 반환하지 않는지 확인한다.
- 실제 中文 번역은 中文 카드용 조회에 반환되는지 확인한다.
- Docker 브라우저에서 English 첨부 후 English만 펼쳐지고 나머지 두 카드는 축소되는지 확인한다.
- 기존 한 언어 첨부·검토·발송 계약이 유지되는지 확인한다.
