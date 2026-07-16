# 수리비 결제 마일스톤 설계

## 목표

관리자와 세입자가 업체 수리비를 테스트 Toss 일회성 결제로 납부할 수 있게 한다. 기존 관리자 크레딧 결제는 유지하고, 세입자 책임 수리는 관리자 승인 없이 세입자의 완료 확인을 거쳐 결제한다. UI와 AI가 같은 결제 애플리케이션 명령을 사용하도록 만들어 향후 AI 결제 요청을 연결할 수 있게 한다.

## 확정 범위

- 테스트 Toss 결제위젯을 사용한다.
- 빌링키, 저장 결제수단, 실제 자동 카드 결제는 구현하지 않는다.
- AI 에이전트 내부 구현은 변경하지 않는다.
- AI가 나중에 호출할 결제 조회·준비·재조회·취소·재결제 명령 계약과 감사 문맥만 제공한다.
- 선택형 외부업체 검색과 전화 기록은 이번 범위에 포함하지 않는다.
- 각 마일스톤은 구현, 집중 테스트, 전체 검증, Docker 확인, 커밋까지 끝낸 뒤 다음 단계로 넘어간다.

## 현재 구조와 변경 원칙

현재 `VendorPaymentRequest`는 승인된 업체 견적과 완료 보고를 근거로 업체에 지급할 의무를 나타낸다. 관리자 크레딧 차감과 외부 이체 기록은 이 요청을 최종 지급 상태로 바꾼다. 기존 `DIRECT`는 관리자가 확인한 외부 지급 기록을 뜻하므로 Toss 결제 의미로 재사용하지 않는다.

새 `RepairPaymentOrder`는 한 번의 Toss 결제 시도를 나타낸다. 지급 의무와 결제 시도를 분리해 하나의 `VendorPaymentRequest`에 실패·취소·재시도 주문이 여러 개 연결될 수 있게 한다.

```text
VendorPaymentRequest 1 ── N RepairPaymentOrder
        지급 의무                Toss 결제 시도
```

`VendorPaymentRequest`에는 다음 지급 책임 정보를 추가한다.

- `payerRole`: `MANAGER` 또는 `TENANT`
- `payerUserId`: 실제 결제 권한을 가진 사용자
- 기존 `managerId`: 건물 운영 주체와 기존 관리자 조회 범위를 위해 유지
- 기존 데이터는 `payerRole=MANAGER`, `payerUserId=managerId`로 보정

세입자 책임 작업도 건물의 관리자를 운영 문맥으로 유지하지만, 세입자 결제 주문의 생성·조회·승인·취소 권한은 `payerUserId`로 판정한다.

## 역할별 업무 흐름

### 관리자 책임

```text
관리자 완료 승인
→ VendorPaymentRequest 생성 또는 지급 가능 전환
→ 크레딧 자동 차감 / 크레딧 수동 차감 / Toss 일회성 결제
→ 업체 지급 완료
```

### 세입자 책임

```text
AI 책임 분류
→ 세입자 협력업체 선택·연결 확인
→ 업체 견적 제출
→ 세입자 견적 수락
→ 업체 수리·완료 보고
→ 세입자 완료 확인
→ VendorPaymentRequest 생성 또는 지급 가능 전환
→ 세입자 Toss 일회성 결제
→ 업체 지급 완료
```

세입자 책임 수리에는 관리자 완료 승인을 추가하지 않는다. 지급 요청이 만들어졌다는 사실이 역할별 완료 게이트를 이미 통과했다는 증거가 되도록 하고, 결제 주문 서비스는 지급 요청의 소유권과 지급 가능 상태만 확인한다.

## 공통 결제 주문 모델

`RepairPaymentOrder`는 최소한 다음 정보를 가진다.

- 내부 ID와 Toss `orderId`
- `paymentRequestId`
- `payerRole`, `payerUserId`
- 승인된 견적에서 복사한 `amount`
- `status`
- 멱등 생성키 `creationKey`
- 활성 주문 중복 방지용 nullable unique `openOrderKey`
- Toss `paymentKey`, 결제수단, 실패 코드·사유
- 복귀 경로
- 생성·변경·승인 시각
- `initiatedBy`: `USER_UI`, `AI_AGENT`, `SYSTEM_POLICY`
- 선택적 `confirmationId`, `toolCallId`

`paymentKey`와 내부 ID는 공개 응답에서 제거한다. AI 감사 정보에는 확인·도구 실행 식별자만 저장하고 대화 원문은 저장하지 않는다.

현재 결제 흐름 값은 `TOSS_ONE_TIME`만 사용한다. 향후 빌링 결제가 필요하면 같은 애플리케이션 명령 뒤에 새 결제 흐름 구현을 추가하되 이번 스키마와 API에서는 빌링키를 받거나 저장하지 않는다.

## 주문 상태와 전이

| 상태 | 의미 | 활성 주문 여부 | 허용 동작 |
|---|---|---:|---|
| `READY` | 주문 생성 후 Toss 결제 완료 전 | 예 | 결제, 취소, 새 주문으로 재결제 |
| `CONFIRMING` | Toss 승인 요청 처리 중 | 예 | 상태 조회만 |
| `RECONCILIATION_REQUIRED` | 승인 결과가 불명확함 | 예 | 재조회만 |
| `APPROVED` | Toss 승인 및 지급 요청 반영 완료 | 아니요 | 조회만; 환불은 별도 범위 |
| `FAILED` | 명확한 결제 실패 | 아니요 | 새 주문으로 재결제, 주문 정리 |
| `CANCELLED` | 사용자가 주문을 취소함 | 아니요 | 조회만 |

사용자 문구는 다음 원칙을 따른다.

- `READY`, `FAILED`: `결제 미완료`
- `CONFIRMING`, `RECONCILIATION_REQUIRED`: `결제 확인 중`
- `APPROVED`: `결제 완료`
- `CANCELLED`: `주문 취소`

`CONFIRMING`과 `RECONCILIATION_REQUIRED` 상태에서 새 주문을 만들면 이중 결제 위험이 있으므로 재결제를 차단한다.

## 동시성·멱등성

- 지급 요청 행을 잠그고 주문 생성·취소·재결제를 직렬화한다.
- `openOrderKey`에는 활성 상태일 때만 `paymentRequestId`를 저장하고 터미널 상태로 전환할 때 `null`로 해제한다.
- nullable unique 제약으로 지급 요청당 활성 주문을 하나만 허용한다.
- 동일 `creationKey`와 동일 payload는 같은 주문을 반환한다.
- 같은 키로 다른 금액·지급 요청·사용자가 들어오면 충돌로 거절한다.
- 결제 금액은 요청 본문을 신뢰하지 않고 `VendorPaymentRequest.amount`에서 읽는다.

### 다시 결제

재결제는 클라이언트가 취소와 생성을 따로 호출하지 않는다. 서버의 단일 명령이 다음을 한 트랜잭션으로 처리한다.

```text
현재 READY 주문 취소
→ openOrderKey 해제
→ 같은 paymentRequestId와 금액으로 새 주문 생성
→ 새 Toss checkout 반환
```

현재 주문이 `FAILED`이면 새 주문만 생성한다. `CONFIRMING`, `RECONCILIATION_REQUIRED`, `APPROVED`에서는 재결제를 거절한다.

### 주문 취소

- `READY`는 Toss 승인 전에 `CANCELLED`로 전환한다.
- `FAILED` 주문은 실패 정보와 감사 기록을 남긴 채 사용자가 정리한 상태로 `CANCELLED` 전환을 허용한다.
- `CONFIRMING`, `RECONCILIATION_REQUIRED`는 먼저 재조회해야 한다.
- `APPROVED`는 주문 취소가 아니라 향후 별도 환불 명령의 대상이다.

## Toss 승인·재조회

기존 Toss gateway와 테스트 키를 재사용한다.

1. 서버가 checkout을 만들고 공개 client key, customer key, 주문 정보를 반환한다.
2. 웹은 Toss 결제위젯을 렌더하고 사용자 행동으로 결제를 요청한다.
3. 성공 콜백은 `paymentKey`, `orderId`, `amount`를 서버에 전달한다.
4. 서버는 저장된 주문과 소유권·금액을 검증한 뒤 Toss 승인 API를 호출한다.
5. 승인과 `VendorPaymentRequest=TOSS_PAID` 반영을 멱등하게 완료한다.

명확한 Toss 거절은 `FAILED`로 전환한다. 타임아웃이나 응답 단절처럼 결제 여부를 단정할 수 없는 오류는 `RECONCILIATION_REQUIRED`로 유지한다. 재조회는 Toss 조회 결과에 따라 `APPROVED`, `FAILED`, 또는 확인 필요 상태로 귀결한다.

기존 `VendorPaymentRequestStatus`와 `VendorPaymentAttemptMode`에는 각각 `TOSS_PAID`, `TOSS`를 추가한다. 기존 `DIRECT_PAID`와 외부 지급 근거 필드는 그대로 유지한다.

## API 경계

관리자와 세입자는 역할별 URL을 사용하지만 같은 결제 주문 애플리케이션 서비스를 호출한다.

```text
POST /manager/vendor-payment-requests/:id/toss-orders
GET  /manager/repair-payment-orders/:orderId
POST /manager/repair-payment-orders/:orderId/confirm
POST /manager/repair-payment-orders/:orderId/reconcile
POST /manager/repair-payment-orders/:orderId/cancel
POST /manager/repair-payment-orders/:orderId/retry

POST /tenant/vendor-payment-requests/:id/toss-orders
GET  /tenant/repair-payment-orders/:orderId
POST /tenant/repair-payment-orders/:orderId/confirm
POST /tenant/repair-payment-orders/:orderId/reconcile
POST /tenant/repair-payment-orders/:orderId/cancel
POST /tenant/repair-payment-orders/:orderId/retry
```

M1은 서비스와 양 역할의 API 계약까지 구현한다. 세입자 책임 수리에서 실제 지급 요청을 만드는 연결은 M3에서 추가한다.

## AI 확장 경계

UI와 AI가 별도 결제 로직을 갖지 않도록 다음 애플리케이션 명령을 공통화한다.

- 결제 가능 항목 조회
- 결제 주문 준비
- 주문 상태 재조회
- 주문 취소
- 새 주문으로 재결제 준비

AI 호출은 `initiatedBy=AI_AGENT`와 사람 principal을 함께 전달해야 한다. 결제 금액·업체·수리 항목을 묶은 단기 확인 토큰을 향후 추가할 수 있도록 `confirmationId`를 선택 필드로 둔다. 이번 범위에서 AI가 결제를 승인하거나 Toss 인증을 우회하지는 않는다.

## 마일스톤

### M1 · 공통 수리비 결제 주문 — Max

- 공유 타입과 상태 계약
- Prisma 모델·마이그레이션·기존 관리자 지급 요청 보정
- 공통 주문 저장소·서비스·Toss gateway 연결
- 관리자·세입자 API 계약
- 권한, 멱등성, 동시성, 승인, 재조회, 취소, 재결제 테스트
- 전체 빌드·Docker API 검증

M1에는 결제 화면을 추가하지 않는다.

### M2 · 관리자 업체비 Toss 직접 결제 — Xhigh

- 관리자 크레딧·결제 화면에 `Toss로 결제` 제공
- 결제위젯, 성공·실패 콜백, 공통 사용자 문구로 주문 상태 표시
- 크레딧 자동·수동 결제 및 외부 지급 기록과 선택지 분리
- M1 API의 관리자 실제 화면 검증

### M3 · 세입자 업체 연결·견적·완료 확인 — Xhigh

- 기존 협력업체 후보·미리보기·확인 API를 세입자 AI 도구 계약과 연결
- 세입자 책임 수리의 실제 업체 작업 생성
- 업체 견적을 세입자 화면에 연결하고 수락 상태 저장
- 업체 완료 보고를 세입자가 확인하는 명시적 상태·명령 추가
- 완료 확인 후 세입자 소유 `VendorPaymentRequest` 생성

AI 에이전트 내부 프롬프트·모델·음성 구현은 제외한다.

### M4 · 세입자 업체비 Toss 결제 — Max

- 완료 확인된 지급 요청에만 결제 버튼 활성화
- PhoneFrame 반응형 Toss 결제위젯
- 성공·실패·재조회 콜백과 공통 사용자 문구 적용
- 세입자 소유권과 완료 게이트 통합 테스트

### M5 · 결제 복구 UX와 통합 검증 — Xhigh

- 관리자·세입자 전 화면에서 `결제 미완료`, `결제 확인 중` 문구 일관성 점검
- 해당 행에 `다시 결제`, `주문 취소`, 필요한 경우 `상태 다시 확인` 제공
- 재결제 시 이전 READY 주문 취소와 새 주문 생성을 한 번에 실행
- 관리자·세입자·업체 지급 상태의 일관성 확인
- 전체 테스트, Docker 재빌드, 역할별 브라우저 검증

## M1 테스트 기준

- 공유 타입과 Prisma 스키마 계약 테스트
- 기존 지급 요청 보정과 관계 제약 테스트
- 같은 지급 요청의 동시 주문 생성 시 하나만 활성화되는 테스트
- 생성키 재사용과 payload 충돌 테스트
- 관리자·세입자 상호 주문 접근 차단 테스트
- 서버 금액 고정과 클라이언트 금액 변조 차단 테스트
- Toss 승인 성공·명확한 실패·불명확한 실패·재조회 테스트
- READY 재결제의 원자적 취소·재생성 테스트
- CONFIRMING·확인 필요·승인 완료 주문의 재결제 차단 테스트
- 기존 크레딧 충전, 자동 차감, 외부 지급 기록 회귀 테스트
- `bash scripts/verify.sh`와 Docker API 스모크 통과

## 비목표

- 실제 운영 결제키와 법무·PG 계약 처리
- 빌링키·저장 카드·무인 자동 카드 결제
- 환불·부분취소
- 외부업체 전화 연결과 전화 기록
- AI 에이전트 구현 또는 대화 원문 저장
- 업체 정산 송금 시스템
