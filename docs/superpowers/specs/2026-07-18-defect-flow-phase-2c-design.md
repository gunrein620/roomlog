# 하자 흐름 2차분C 설계 — 방문 일정협의

## 범위

세입자의 방문 가능 시간이 업체에 보이게 하고(감사 갭 C), 업체의 방문 시간 제안을 세입자/관리자가 **수락하거나 다른 시간을 요청**(재협의)할 수 있는 왕복을 완성한다. 재협의는 **기존 견적 버전 체계를 재사용**한다(REQUEST_REVISION → REVISION_REQUESTED → 업체 새 버전 제출 → 이전 버전 SUPERSEDED). 새 협의 테이블·새 상태 머신을 만들지 않는다.

**방문 확정(confirm-visit) 이후의 일정 변경은 범위 밖** — 기존 채팅으로 해결한다(2B에서 세입자탭 스레드 채팅 완성됨). 자동 알림·독촉도 범위 밖.

## 데이터와 API

- **availableTimes 업체 노출**: `VendorJobDetail`(`packages/types/src/vendor-workflow.ts`)에 `tenantAvailableTimes?: string` 추가. 업체 잡 상세 조회(`prisma-vendor-workflow.repository.ts`)가 RepairRequest → Ticket → Complaint join으로 `Complaint.availableTimes`를 채운다. 스키마 변경 없음(컬럼 이미 존재). 이름·연락처 등 다른 세입자 정보는 절대 추가하지 않는다(기존 publicLocation 원칙 유지).
- **시간 재협의 입력 확장**: 세입자/관리자 estimate review 입력(`REQUEST_REVISION`)에 선택 필드 `tenantAvailableTimes?: string`를 추가한다(`VendorEstimateReviewInput`·`TenantVendorEstimateReviewInput`). 값이 오면 서버가 `Complaint.availableTimes`를 갱신한다(세입자 요청 경로만 — 관리자 경로는 갱신하지 않고 note로만 전달). 검증: 공백 불가·최대 200자.
- 기존 REQUEST_REVISION 흐름·상태 전이·이벤트(`VENDOR_ESTIMATE_REVISION_REQUESTED`)는 그대로 재사용한다. 시간 재협의와 견적 수정 요청을 서버에서 구분하지 않는다 — 구분은 note 내용이 담당한다(클라가 "방문 시간 재협의:" 프리픽스를 붙임).
- **티켓 메시지**: 방문 확정(confirm-visit, 세입자·관리자 양 경로)이 세입자 노출 티켓 메시지("방문 일정이 확정되었습니다 — {일시}")를 남긴다. 재협의 요청은 기존 revision 메시지 경로가 있으면 재사용하고, 없으면 동일하게 추가한다. 이미 브로드캐스트가 있는 엔드포인트에 중복 추가 금지.

## 업체 화면 (PhoneFrame — 업체 전용 유지)

- V-JOB-01(상세)·02(견적 폼): **"세입자 방문 가능 시간"** 표시(`tenantAvailableTimes`, 없으면 "미입력" 성격의 조용한 생략 — 빈 값을 데모로 위조하지 않는다).
- 02 폼: REVISION_REQUESTED 상태로 재진입 시 **직전 버전의 reviewNote(재협의 사유)** 를 상단에 표시해 업체가 무엇을 고쳐 제안해야 하는지 보이게 한다. 이미 표시가 있으면 유지.

## 관리자 화면

- 관리자 견적 검토 화면(dash 04/05 계열 — 실제 위치는 구현 시 확인)에서 방문 제안(visitAvailableAt)에 대해 **"이 일정으로 확정"** 과 **"다른 시간 요청"**(note 필수) 두 액션을 제공한다. 후자는 기존 manager estimate review REQUEST_REVISION을 호출한다.
- UNREGISTERED(자가수리 조회 전용) 잡에는 관리자 액션을 렌더하지 않는 2B 원칙 유지.

## 세입자탭 (living — 별도 작업자 담당, 이 태스크 범위 아님)

- 신규 요청 폼 방문 가능 시간 입력, TenantVendorWorkflowPanel "다른 시간 요청" 폼은 **별도로 작업 중**이다. 이 태스크는 `apps/web/src/app/my/flows/**`와 `apps/web/src/lib/tenant-vendor-workflow-api.ts`를 **수정하지 않는다** (충돌 방지). 세입자 쪽 API 계약(`TenantVendorEstimateReviewInput` 확장)은 `packages/types`에서만 정의한다.

## 오류와 검증

- `tenantAvailableTimes` 검증(공백/길이)은 API 서비스에서. HTML required는 편의일 뿐.
- 회귀 테스트: ① 업체 잡 상세에 availableTimes 노출(값 있음/없음), ② 세입자 REQUEST_REVISION + tenantAvailableTimes → Complaint.availableTimes 갱신 + REVISION_REQUESTED 전이, ③ 관리자 REQUEST_REVISION은 availableTimes 미갱신, ④ confirm-visit 세입자 메시지 생성(양 경로), ⑤ 재협의 후 업체 새 버전 제출 왕복(기존 SUPERSEDED 회귀에 시간 갱신 케이스 추가).
- Prisma generate 불필요(스키마 무변경). 빌드·대상 스펙·`bash scripts/verify.sh`.

## 제약

- git 명령·브랜치·커밋 금지.
- `apps/web/src/app/my/flows/**`·`apps/web/src/lib/tenant-vendor-workflow-api.ts` 수정 금지(다른 작업자 담당).
- 세입자 개인정보를 업체 표면에 추가 노출 금지 — availableTimes(자유 텍스트 시간대)만.
- 자동 발송·독촉 금지. CSS는 `var(--...)` 토큰만.
