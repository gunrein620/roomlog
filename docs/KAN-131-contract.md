# KAN-131 배선 계약서 (납부·청구 T-PAY·M-BILL)

> **얼려둔 인터페이스.** 4개 codex 트랙이 서로를 보지 않고도 이 계약만 지키면 통합 시 충돌이 없다.
> 상태머신·원칙의 정본은 `packages/types/src/payment.ts`(이미 완성, 수정 금지). 이 문서는 그 위의 배선 규약이다.
> 레퍼런스 구현: 하자 도메인 (`defect-api.ts`·`defect-mapping.ts`·`roomlog.controller.ts` complaint/ticket 라우트).

## 0. 파일 소유권 (트랙별 배타적 — 남의 파일 수정 금지)

| 트랙 | 오직 이 파일들만 편집/생성 |
|---|---|
| **BE-schema** | `prisma/schema.prisma` |
| **BE-api** | `apps/api/src/roomlog/roomlog.controller.ts` · `roomlog.service.ts` · `roomlog.types.ts` · `prisma-store-projector.ts` (+ 필요시 `apps/api/src/roomlog/billing.*.ts` 신규 헬퍼) |
| **FE-T** | `apps/web/src/lib/payment-api.ts` · `payment-mapping.ts`(신규) · `demo-payment.ts` · `apps/web/src/app/tenant/payment/**` |
| **FE-M** | `apps/web/src/lib/billing-manager-api.ts` · `billing-manager-mapping.ts`(신규) · `apps/web/src/app/manager/billing/**` |

**공유 파일은 이미 처리됨 — 아무도 안 건드린다:** `packages/types/src/payment.ts`(완성)·`packages/types/src/index.ts`(payment 이미 export)·`apps/api/src/app.module.ts`(라우트는 기존 RoomlogModule에 얹음, 새 모듈 없음).

## 1. 공통 규약

- **인증:** 모든 라우트는 컨트롤러에서 `this.requireRole(authorization, [...])` 게이트. 웹은 `serverFetch`(httpOnly 쿠키 토큰 → `Authorization: Bearer`)로만 호출. 데모 폴백의 무인증 `NEXT_PUBLIC_API_URL` 직접 fetch는 폐기.
- **enum 방향:** 백엔드 Prisma enum = **UPPERCASE**(하자 컨벤션), 프론트 타입(`payment.ts`) = lowercase. `*-mapping.ts`가 단일방향 정합. web은 api 내부 타입을 import하지 않고 느슨한 `Team*` 인터페이스를 매퍼 안에 로컬 선언(하자 `TeamComplaint` 방식).
- **id 스레딩:** 목록→상세는 `?id=`(청구서는 billId)로 스레딩. BFF `resolve*(id?)`: 실제 id면 그 건, 미지정/`"active"` sentinel이면 목록 첫 활성 건. (하자 `resolveComplaint` 그대로.)
- **데모 폴백:** 인증 전/데이터 없음/네트워크 오류 시에만 데모. 실인증+실데이터면 항상 실데이터 우선. `listBills`는 빈 목록이면 `[]`(데모로 은폐 금지).
- **금지(통합은 리더가 중앙에서):** codex는 **파일 편집만**. `pnpm`/`tsc`/`next build`/`prisma migrate`/`db:generate`/`git`/dev 서버 **실행 금지**. 타입 안 맞아도 계약대로 작성하면 됨(리더가 generate 후 타입체크).

## 2. Prisma 모델 (BE-schema 소유 · 필드명 고정)

하자 스타일 준수: `String @id`, `createdAt/updatedAt`, 명시적 `@@index`, enum UPPERCASE.

```
enum BillStatus            { DRAFT SENT CONFIRMING PARTIALLY_PAID PAID OVERDUE CORRECTED CANCELED }
enum PaymentReportStatus   { CONFIRMING MATCHED MISMATCH }
enum DepositMatchStatus    { UNMATCHED MATCHED ORPHAN MISMATCH }
enum OverdueStage          { MINOR WARNING SEVERE }   // 관리인 triage 전용

model Bill {
  id            String     @id
  unitId        String                       // 호실 (Room.roomNo에서 "호" 제거 전 원본 보관은 서비스에서)
  billingMonth  String                       // "YYYY-MM"
  status        BillStatus @default(DRAFT)
  totalAmount   Int
  paidAmount    Int        @default(0)        // 확정(MATCHED) 수납액만. CONFIRMING·ORPHAN 제외
  dueDate       DateTime
  bankName      String
  accountNumber String
  accountHolder String
  correctionHistory        String[]  @default([])
  maintenanceFeeId         String?
  depositConfirmationRequested Boolean @default(false)
  items         BillLineItem[]
  reports       PaymentReport[]
  deposits      Deposit[]                     // matched/mismatch로 연결된 실입금
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  @@index([unitId, billingMonth])
  @@index([status])
}
model BillLineItem { id String @id  billId String  label String  amount Int  bill Bill @relation(fields:[billId],references:[id])  @@index([billId]) }
model PaymentReport {
  id String @id  billId String  unitId String  amount Int  depositorName String?
  status PaymentReportStatus @default(CONFIRMING)  etaHours Int @default(24)  reportedAt DateTime @default(now())
  bill Bill @relation(fields:[billId],references:[id])  @@index([billId])  @@index([unitId, status])
}
model Deposit {
  id String @id  depositorName String  amount Int  depositedAt DateTime
  matchStatus DepositMatchStatus @default(UNMATCHED)  matchedBillId String?  guessedUnitId String?
  bill Bill? @relation(fields:[matchedBillId],references:[id])
  @@index([matchStatus])  @@index([guessedUnitId])
}
model MaintenanceFee {
  id String @id  unitId String  billingMonth String  totalAmount Int  available Boolean @default(false)
  items MaintenanceFeeItem[]  @@index([unitId, billingMonth])
}
model MaintenanceFeeItem { id String @id  maintenanceFeeId String  label String  amount Int  receiptAvailable Boolean @default(false)  fee MaintenanceFee @relation(fields:[maintenanceFeeId],references:[id])  @@index([maintenanceFeeId]) }
```

> `OverdueCase`·`BillDashboardSummary`·`CollectionSummary`는 **테이블 아님** — 서비스에서 Bill/PaymentReport/Deposit로 파생 계산.

## 3. 라우트 표 (BE-api 소유 ↔ FE-T/FE-M가 호출)

역할 프리픽스 컨벤션(하자 `/tenant/complaints`·`/manager/tickets`) 준수. 응답 shape는 §4의 `Team*`(백엔드가 내보내는 느슨한 형태) → 매퍼가 `payment.ts` 타입으로 변환.

### 테넌트 (`requireRole ["TENANT"]`) — FE-T가 호출
| 메서드 · 경로 | 응답 | 매퍼 → 프론트 타입 |
|---|---|---|
| `GET /tenant/bills` | `TeamBill[]` | `Bill[]` |
| `GET /tenant/bills/:billId` | `TeamBill` | `Bill` |
| `GET /tenant/bills/:billId/maintenance` | `TeamMaintenance` | `MaintenanceFee` |
| `POST /tenant/bills/:billId/reports` body `{amount:number, depositorName?:string}` | `TeamReport` | `PaymentReport` |

**연체 존엄:** 테넌트 응답에는 `stage`(minor/warning/severe)를 **절대 포함하지 않는다**. 테넌트는 `overdue` 배지까지만.

### 매니저 (`requireRole ["LANDLORD"]`) — FE-M가 호출
| 메서드 · 경로 | 응답 |
|---|---|
| `GET /manager/bills/dashboard` | `{summary: TeamDashSummary, bills: TeamBillRow[]}` |
| `GET /manager/bills/:billId` | `TeamBill` |
| `GET /manager/bills/collection` | `TeamCollection` |
| `GET /manager/bills/deposits` | `{paymentReports: TeamBillRow[], deposits: TeamDeposit[], orphanDeposits: TeamDeposit[], mismatchDeposits: TeamDeposit[]}` |
| `POST /manager/bills/deposits/:depositId/match` body `{billId:string}` | `TeamDeposit` (매칭 확정 → orphan/confirming 해소) |
| `POST /manager/bills/:billId/reports/:reportId/confirm` | `TeamBill` (신고 확정 → paidAmount 반영) |
| `GET /manager/bills/overdue` | `{activeCases: TeamOverdue[], waitingCases: TeamOverdue[]}` |
| `GET /manager/bills/:billId/dunning` | `TeamDunning` (AI 초안 + guard) |
| `POST /manager/bills/:billId/dunning/send` body `{text:string, channel:string}` | 성공 `{ok:true}` / **가드 차단 시 409** |

> 데모 BFF의 `/bills/manager/*` 경로는 위 `/manager/bills/*`로 정렬. FE-M은 fetch 경로를 이에 맞춘다.

## 4. 백엔드 응답 shape (`Team*` — BE-api가 반환, 매퍼가 소비)

`payment.ts` 타입과 필드명은 같되 enum만 UPPERCASE, 날짜는 ISO 문자열. 예:
- `TeamBill`: `{id, unitId("301호" 형태 가능), billingMonth, status:UPPERCASE, items:[{label,amount}], totalAmount, paidAmount, dueDate:ISO, account:{bankName,accountNumber,accountHolder}, correctionHistory?, maintenanceFeeId?, depositConfirmationRequested?, createdAt, updatedAt}`
- `TeamReport`: `{id, billId, unitId, amount, depositorName?, status:UPPERCASE, etaHours, reportedAt}`
- `TeamDeposit`: `{id, depositorName, amount, depositedAt, matchStatus:UPPERCASE, matchedBillId?, guessedUnitId?}`
- `TeamOverdue`: `{billId, unitId, tenantName, unpaidAmount, daysOverdue, stage:UPPERCASE, dueDate, guard:{blocked,hasConfirming,hasOrphan}}`
- `TeamDunning`: `{billId, unitId, tenantName, unpaidAmount, draftText, channel, guard:{...}}`
- `TeamDashSummary`/`TeamCollection`/`TeamBillRow`: `payment.ts`의 동명 타입과 동형(enum UPPERCASE).

매퍼는 하자 규칙 재사용: `unitId` "301호"→"301"(`replace(/\s*호\s*$/,"")`), UPPERCASE→lowercase enum 맵, 미매핑 시 `console.warn` + 안전 기본값.

## 5. 3대 하드원칙 — 서버측 강제 (BE-api 필수, UI 비활성만으로 불충분)

1. **독촉 단일채널 (M-BILL-05):** 독촉 발송은 `POST /manager/bills/:billId/dunning/send` **하나만**. 일괄 발송 라우트 없음. 자동 발송 없음(항상 관리인이 편집한 `text` + 명시 `channel` 필요). 1:1 메시지 스레드로 독촉 내용 발송 차단(KNOWN-GAPS D20 — messaging 경로에 payment 컨텍스트 독촉 가드).
2. **연체 존엄:** `OverdueStage`(minor/warning/severe)는 **매니저 응답에만**. 테넌트 라우트 응답 DTO에서 완전 배제. Bill이 `OVERDUE`로 진입하는 건 기한 초과 **AND** 가드 비차단일 때만.
3. **orphan 입금 가드:** `guard.blocked = hasConfirming || hasOrphan`. blocked면 (a) 자동연체 진입 제외(→ waitingCases), (b) `dunning/send` 409, (c) 수금 집계에서 confirming·orphan 금액 제외하고 별도 표기. 원칙: "낸 사람은 독촉당하지 않는다."
   - **orphan 기간 스코프 (윈도우 규칙, 설계 확정):** orphan 입금은 청구서를 **연결하지 않은 돈**이라 어느 청구월 것인지 알 수 없다. 따라서 "호실 일치 **AND** `bill.billingMonth <= monthKey(deposit.depositedAt)`"로 가드한다 — 그 입금은 **자기 달 또는 그 이전의 미납분**을 낸 것일 수 있으므로(월경계 지각납부 포함), 미래 청구(입금월 이후)만 제외한다. 이는 "호실만" 과잉차단(KNOWN-GAPS:15)과 "월-정확" 과소차단(지각납부자 독촉) 사이에서, 원칙("모호하면 독촉 보류")에 따라 **과잉가드=안전** 쪽을 택한 것. orphan은 관리인이 M-BILL-03에서 해소하면 가드가 풀린다. 구현: `orphanDepositAppliesToBill` (roomlog.service.ts).

## 6. 통합·검증 (리더가 중앙에서 — Wave 2)

동일 워킹트리·배타 파일이라 머지 불필요. 순서: `pnpm db:generate` → `pnpm db:migrate`(로컬 Postgres) → `pnpm build:api`/`build:web` 타입체크 → api·web 기동 후 하자와 동일한 walking-skeleton live fetch로 T-PAY·M-BILL E2E 확인 → 3대 원칙 적대검증.
