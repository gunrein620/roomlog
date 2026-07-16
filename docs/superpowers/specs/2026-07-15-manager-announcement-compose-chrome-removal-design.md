# Manager Announcement Compose Chrome Removal Design

## Goal

관리자 공지 작성 화면(`/manager/messaging/01`)에서만 상단 `허브` 버튼과 우측 `발송은 다음 화면에서만` 안내 박스를 제거한다.

## Scope

- `M-MSG-01`의 `ScreenHeader`에서 `허브` action을 제거한다.
- `AnnouncementComposer` 우측 열의 `primaryInfo` 안내 섹션을 제거한다.
- 더 이상 이 화면에서 사용하지 않는 `LinkButton` import와 `primaryInfo` 전용 CSS를 정리한다.
- 공지 작성, 임시 저장, 번역, 검토 화면 이동 기능은 그대로 유지한다.
- 다른 소통 화면의 `허브` 링크와 안내 문구는 변경하지 않는다.

## Implementation

`apps/web/src/app/manager/messaging/01/page.tsx`는 `ScreenHeader`의 `actions` prop을 제거하고 `ScreenHeader`만 import한다. `apps/web/src/app/manager/messaging/01/AnnouncementComposer.tsx`는 우측 열의 첫 번째 `primaryInfo` 섹션만 제거한다. `AnnouncementComposer.module.css`에서는 해당 섹션 전용 선택자만 삭제한다.

## Testing

기존 `apps/web/property-shell.spec.mjs`의 관리자 공지 작성 계약 테스트에 다음 조건을 추가한다.

- M-MSG-01 페이지 소스에 `허브` action이 없다.
- 공지 작성 컴포넌트에 `발송은 다음 화면에서만` 및 설명 문구가 없다.
- `검토하고 발송으로`, 다국어 번역 등 기존 작성·검토 기능 계약은 계속 존재한다.
- 다른 화면의 허브 링크를 광범위하게 제거하지 않는다.

관련 테스트를 RED→GREEN으로 실행하고 web 프로덕션 빌드 및 Docker web 재빌드 후 로컬 응답을 확인한다. 검증이 통과한 경우에만 현재 `kms-manager-chat` 브랜치에 커밋하고 푸시한다.

## Non-goals

- 공지 검토 또는 실제 발송 로직 변경
- 다른 메시징 화면의 네비게이션 변경
- 인프라·Docker 설정 변경
- 공지 작성 화면의 전체 레이아웃 재설계
