import type {
  Bill,
  BillDashboardSummary,
  CollectionSummary,
  Deposit,
  DunningDraft,
  ManagerBillCreationData,
  ManagerBillRow,
  ManagerBillingDashboardData,
  ManagerBillingDashboardSummary,
  ManagerBillingScope,
  ManagerCollectionAnalytics,
  ManagerOverdueWorkspace,
  OverdueCase,
} from "@roomlog/types";
import type { ManagerPaymentReportRow } from "./billing-manager-mapping";

export type ManagerDashboardData = Omit<ManagerBillingDashboardData, "summary"> & {
  summary: ManagerBillingDashboardSummary & BillDashboardSummary;
};

export interface ManagerDepositsData {
  paymentReports: ManagerPaymentReportRow[];
  deposits: Deposit[];
  orphanDeposits: Deposit[];
  mismatchDeposits: Deposit[];
}

export type ManagerOverdueData = ManagerOverdueWorkspace;

export interface ManagerBillingDemoQuery {
  building?: string;
  month?: string;
}

export const DEMO_BILLING_SCOPE: ManagerBillingScope = {
  buildings: [
    { buildingName: "성수 라움", address: "서울 성동구 연무장길 21", roomCount: 8 },
    { buildingName: "한남 리브", address: "서울 용산구 독서당로 84", roomCount: 6 },
  ],
};

const DEMO_ACCOUNT = {
  bankName: "하나은행",
  accountNumber: "123-456789-0000",
  accountHolder: "룸로그관리",
};

const paymentReportRows: ManagerPaymentReportRow[] = [
  ["301", "김민수", 720000],
  ["302", "김하윤", 732000],
  ["303", "이준서", 744000],
  ["304", "박서연", 756000],
  ["305", "최민재", 768000],
].map(([unitId, tenantName, totalAmount]) => ({
  billId: `bill-demo-report-${unitId}`,
  reportId: `report-demo-${unitId}`,
  roomId: `room-seongsu-${unitId}`,
  buildingName: "성수 라움",
  unitId: String(unitId),
  tenantName: String(tenantName),
  billingMonth: "2026-07",
  totalAmount: Number(totalAmount),
  paidAmount: 0,
  unpaidAmount: Number(totalAmount),
  daysOverdue: 1,
  status: "confirming",
  dueDate: "2026-07-10",
  badge: "confirming",
  guard: { blocked: true, hasConfirming: true, hasOrphan: false },
}));

export const DEMO_BILLS: ManagerBillRow[] = [
  {
    billId: "bill-2026-07-302",
    roomId: "room-seongsu-302",
    buildingName: "성수 라움",
    unitId: "302",
    tenantName: "김하윤",
    billingMonth: "2026-07",
    totalAmount: 680000,
    paidAmount: 0,
    unpaidAmount: 680000,
    daysOverdue: 4,
    status: "confirming",
    dueDate: "2026-07-10",
    badge: "confirming",
    guard: { blocked: true, hasConfirming: true, hasOrphan: false },
  },
  {
    billId: "bill-2026-07-401",
    roomId: "room-hannam-401",
    buildingName: "한남 리브",
    unitId: "401",
    tenantName: "이준서",
    billingMonth: "2026-07",
    totalAmount: 720000,
    paidAmount: 0,
    unpaidAmount: 720000,
    daysOverdue: 36,
    status: "overdue",
    dueDate: "2026-06-25",
    badge: "overdue",
    guard: { blocked: false, hasConfirming: false, hasOrphan: false },
  },
  {
    billId: "bill-2026-07-205",
    roomId: "room-seongsu-205",
    buildingName: "성수 라움",
    unitId: "205",
    tenantName: "박서연",
    billingMonth: "2026-07",
    totalAmount: 635000,
    paidAmount: 300000,
    unpaidAmount: 335000,
    daysOverdue: 1,
    status: "partially_paid",
    dueDate: "2026-07-10",
    badge: "partial",
    guard: { blocked: false, hasConfirming: false, hasOrphan: false },
  },
  {
    billId: "bill-2026-07-501",
    roomId: "room-hannam-501",
    buildingName: "한남 리브",
    unitId: "501",
    tenantName: "최민재",
    billingMonth: "2026-07",
    totalAmount: 705000,
    paidAmount: 705000,
    unpaidAmount: 0,
    daysOverdue: 0,
    status: "paid",
    dueDate: "2026-07-10",
    badge: "paid",
    guard: { blocked: false, hasConfirming: false, hasOrphan: false },
  },
  {
    billId: "bill-2026-07-502",
    roomId: "room-hannam-502",
    buildingName: "한남 리브",
    unitId: "502",
    tenantName: "윤서진",
    billingMonth: "2026-07",
    totalAmount: 740000,
    paidAmount: 0,
    unpaidAmount: 740000,
    daysOverdue: 0,
    status: "sent",
    dueDate: "2026-07-25",
    badge: "due",
    guard: { blocked: false, hasConfirming: false, hasOrphan: false },
  },
];

export const DEMO_PAYMENT_REPORTS: ManagerPaymentReportRow[] = paymentReportRows;

export const DEMO_DEPOSITS: Deposit[] = [
  {
    id: "dep-match-301",
    depositorName: "김민수",
    amount: 720000,
    depositedAt: "2026-07-05T09:24:00+09:00",
    matchStatus: "unmatched",
    guessedUnitId: "301",
  },
  {
    id: "dep-match-302",
    depositorName: "김하윤",
    amount: 320000,
    depositedAt: "2026-07-04T10:11:00+09:00",
    matchStatus: "matched",
    matchedBillId: "bill-2026-07-302",
  },
  {
    id: "dep-match-303",
    depositorName: "이준서",
    amount: 744000,
    depositedAt: "2026-07-03T11:03:00+09:00",
    matchStatus: "matched",
    matchedBillId: "bill-demo-report-303",
  },
  {
    id: "dep-match-304",
    depositorName: "박서연",
    amount: 756000,
    depositedAt: "2026-07-02T17:42:00+09:00",
    matchStatus: "unmatched",
    guessedUnitId: "304",
  },
  {
    id: "dep-match-305",
    depositorName: "최민재",
    amount: 768000,
    depositedAt: "2026-07-01T12:08:00+09:00",
    matchStatus: "matched",
    matchedBillId: "bill-demo-report-305",
  },
  {
    id: "dep-orphan-601",
    depositorName: "김미숙",
    amount: 720000,
    depositedAt: "2026-06-30T09:20:00+09:00",
    matchStatus: "orphan",
    guessedUnitId: "601",
  },
  {
    id: "dep-orphan-602",
    depositorName: "홍길동",
    amount: 732000,
    depositedAt: "2026-06-29T10:20:00+09:00",
    matchStatus: "orphan",
    guessedUnitId: "602",
  },
  {
    id: "dep-orphan-603",
    depositorName: "윤세아",
    amount: 744000,
    depositedAt: "2026-06-28T11:20:00+09:00",
    matchStatus: "orphan",
    guessedUnitId: "603",
  },
  {
    id: "dep-orphan-604",
    depositorName: "문태오",
    amount: 756000,
    depositedAt: "2026-06-27T12:20:00+09:00",
    matchStatus: "orphan",
    guessedUnitId: "604",
  },
  {
    id: "dep-orphan-605",
    depositorName: "배수진",
    amount: 768000,
    depositedAt: "2026-06-26T13:20:00+09:00",
    matchStatus: "orphan",
    guessedUnitId: "605",
  },
  {
    id: "dep-mismatch-301",
    depositorName: "김민수",
    amount: 690000,
    depositedAt: "2026-06-25T09:10:00+09:00",
    matchStatus: "mismatch",
    matchedBillId: "bill-demo-report-301",
    guessedUnitId: "301",
  },
  {
    id: "dep-mismatch-302",
    depositorName: "김하윤",
    amount: 702000,
    depositedAt: "2026-06-24T10:10:00+09:00",
    matchStatus: "mismatch",
    matchedBillId: "bill-demo-report-302",
    guessedUnitId: "302",
  },
  {
    id: "dep-mismatch-303",
    depositorName: "이준서",
    amount: 714000,
    depositedAt: "2026-06-23T11:10:00+09:00",
    matchStatus: "mismatch",
    matchedBillId: "bill-demo-report-303",
    guessedUnitId: "303",
  },
  {
    id: "dep-mismatch-304",
    depositorName: "박서연",
    amount: 726000,
    depositedAt: "2026-06-22T12:10:00+09:00",
    matchStatus: "mismatch",
    matchedBillId: "bill-demo-report-304",
    guessedUnitId: "304",
  },
  {
    id: "dep-mismatch-305",
    depositorName: "최민재",
    amount: 738000,
    depositedAt: "2026-06-21T13:10:00+09:00",
    matchStatus: "mismatch",
    matchedBillId: "bill-demo-report-305",
    guessedUnitId: "305",
  },
];

export const DEMO_DASHBOARD: ManagerDashboardData = {
  scope: DEMO_BILLING_SCOPE,
  billingMonth: "2026-07",
  summary: {
    total: DEMO_BILLS.length,
    confirmNeeded: 2,
    pending: 1,
    overdue: 1,
    billedAmount: 3480000,
    collectedAmount: 1005000,
    unpaidAmount: 2475000,
    collectionRate: 1005000 / 3480000,
    overdueUnits: 1,
  },
  recentDeposits: DEMO_DEPOSITS.slice(0, 5).map((deposit) => ({
    ...deposit,
    buildingName: "성수 라움",
    unitId: deposit.guessedUnitId,
    needsBuildingReview: false,
  })),
  overduePreview: [
    {
      billId: "bill-2026-07-401",
      roomId: "room-hannam-401",
      buildingName: "한남 리브",
      unitId: "401",
      tenantName: "이준서",
      billingMonth: "2026-07",
      totalAmount: 720000,
      paidAmount: 0,
      unpaidAmount: 720000,
      daysOverdue: 36,
      stage: "severe",
      dueDate: "2026-06-25",
      guard: { blocked: false, hasConfirming: false, hasOrphan: false },
    },
  ],
  bills: DEMO_BILLS,
};

function demoBillFromRow(row: ManagerBillRow): Bill {
  const maintenanceAmount = row.totalAmount > 0 ? Math.min(70000, row.totalAmount) : 0;
  const rentAmount = Math.max(row.totalAmount - maintenanceAmount, 0);
  return {
    id: row.billId,
    roomId: row.roomId,
    unitId: row.unitId,
    billingMonth: row.billingMonth,
    status: row.status,
    items: [
      { label: "월 임대료", amount: rentAmount },
      { label: "관리비", amount: maintenanceAmount },
    ].filter((item) => item.amount > 0),
    totalAmount: row.totalAmount,
    paidAmount: row.paidAmount,
    dueDate: row.dueDate,
    account: DEMO_ACCOUNT,
    createdAt: `${row.billingMonth}-01T09:00:00+09:00`,
    updatedAt: `${row.billingMonth}-01T09:00:00+09:00`,
  };
}

export const DEMO_MANAGER_BILLS: Bill[] = [...DEMO_BILLS, ...DEMO_PAYMENT_REPORTS].map(demoBillFromRow);

export const DEMO_NEW_BILL: Bill = {
  id: "new",
  unitId: "전체",
  billingMonth: "2026-08",
  status: "draft",
  items: [
    { label: "월 임대료", amount: 650000 },
    { label: "관리비", amount: 70000 },
  ],
  totalAmount: 720000,
  paidAmount: 0,
  dueDate: "2026-08-10",
  account: DEMO_ACCOUNT,
  createdAt: "2026-08-01T09:00:00+09:00",
  updatedAt: "2026-08-01T09:00:00+09:00",
};

export const DEMO_COLLECTION: CollectionSummary = {
  billingMonth: "2026-07",
  collectionRate: 0.47,
  collectedAmount: 1005000,
  unpaidAmount: 2035000,
  vacancyLoss: 350000,
  confirmingAmount: DEMO_PAYMENT_REPORTS.reduce((sum, bill) => sum + bill.totalAmount, 0),
  orphanAmount: DEMO_DEPOSITS.filter((deposit) => deposit.matchStatus === "orphan").reduce(
    (sum, deposit) => sum + deposit.amount,
    0
  ),
  recentDeposits: DEMO_DEPOSITS.slice(0, 5),
};

function demoShiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

const collectionTrend = Array.from({ length: 12 }, (_, index) => {
  const billedAmount = index === 11 ? 3480000 : 3100000 + index * 35000;
  const collectionRate = index === 11 ? 1005000 / 3480000 : 0.25 + index * 0.007;
  const collectedAmount = index === 11 ? 1005000 : Math.round(billedAmount * collectionRate);
  return {
    billingMonth: demoShiftMonth("2026-07", index - 11),
    billedAmount,
    collectedAmount,
    unpaidAmount: billedAmount - collectedAmount,
    collectionRate,
  };
});

export const DEMO_COLLECTION_ANALYTICS: ManagerCollectionAnalytics = {
  scope: DEMO_BILLING_SCOPE,
  billingMonth: "2026-07",
  brief: {
    billedAmount: 3480000,
    collectedAmount: 1005000,
    unpaidAmount: 1795000,
    collectionRate: 1005000 / 3480000,
    previousCollectionRate: 0.32,
    rateDelta: 1005000 / 3480000 - 0.32,
    confirmingAmount: 680000,
  },
  trend: collectionTrend,
  buildings: DEMO_BILLING_SCOPE.buildings.map((building) => {
    const bills = DEMO_BILLS.filter((bill) => bill.buildingName === building.buildingName);
    const billedAmount = bills.reduce((sum, bill) => sum + bill.totalAmount, 0);
    const collectedAmount = bills.reduce((sum, bill) => sum + bill.paidAmount, 0);
    const collectionRate = billedAmount > 0 ? collectedAmount / billedAmount : 0;
    return {
      ...building,
      billingMonth: "2026-07",
      billedAmount,
      collectedAmount,
      unpaidAmount: billedAmount - collectedAmount,
      collectionRate,
      previousCollectionRate: building.buildingName === "성수 라움" ? 0.26 : 0.36,
      rateDelta: collectionRate - (building.buildingName === "성수 라움" ? 0.26 : 0.36),
      bills,
    };
  }),
};

export const DEMO_DEPOSITS_DATA: ManagerDepositsData = {
  paymentReports: DEMO_PAYMENT_REPORTS,
  deposits: DEMO_DEPOSITS.filter((deposit) => deposit.matchStatus === "unmatched" || deposit.matchStatus === "matched"),
  orphanDeposits: DEMO_DEPOSITS.filter((deposit) => deposit.matchStatus === "orphan"),
  mismatchDeposits: DEMO_DEPOSITS.filter((deposit) => deposit.matchStatus === "mismatch"),
};

const overdueNames = ["정예린", "한도윤", "오지후", "서민지", "유현우"];

export const DEMO_OVERDUE: ManagerOverdueData = {
  scope: DEMO_BILLING_SCOPE,
  asOf: "2026-07-11",
  summary: {
    activeUnpaidAmount: 3970000,
    activeCount: 5,
    severeCount: 2,
    waitingCount: 5,
  },
  activeCases: overdueNames.map((tenantName, index) => ({
    billId: `bill-demo-overdue-${411 + index}`,
    roomId: `${index % 2 === 0 ? "room-seongsu" : "room-hannam"}-${411 + index}`,
    buildingName: index % 2 === 0 ? "성수 라움" : "한남 리브",
    unitId: String(411 + index),
    tenantName,
    billingMonth: index >= 3 ? "2026-05" : "2026-06",
    totalAmount: 770000 + index * 12000,
    paidAmount: 0,
    unpaidAmount: 770000 + index * 12000,
    daysOverdue: [5, 12, 23, 37, 64][index],
    stage: index >= 3 ? "severe" : index >= 1 ? "warning" : "minor",
    dueDate: `2026-06-${25 - index}`,
    guard: { blocked: false, hasConfirming: false, hasOrphan: false },
  })),
  waitingCases: DEMO_PAYMENT_REPORTS.map((bill, index) => ({
    billId: bill.billId,
    roomId: bill.roomId,
    buildingName: bill.buildingName,
    unitId: bill.unitId,
    tenantName: bill.tenantName,
    billingMonth: bill.billingMonth,
    totalAmount: bill.totalAmount,
    paidAmount: bill.paidAmount,
    unpaidAmount: bill.totalAmount - bill.paidAmount,
    daysOverdue: 2 + index,
    stage: index >= 3 ? "warning" : "minor",
    dueDate: "2026-06-30",
    guard: { blocked: true, hasConfirming: true, hasOrphan: false },
  })),
};

export const DEMO_BILL_CREATION: ManagerBillCreationData = {
  scope: DEMO_BILLING_SCOPE,
  billingMonth: "2026-08",
  account: DEMO_ACCOUNT,
  options: [
    ["room-seongsu-205", "성수 라움", "205", "박서연", 590000, 45000, 25],
    ["room-seongsu-302", "성수 라움", "302", "김하윤", 630000, 50000, 25],
    ["room-hannam-401", "한남 리브", "401", "이준서", 660000, 60000, 20],
    ["room-hannam-501", "한남 리브", "501", "최민재", 645000, 60000, 25],
  ].map(([roomId, buildingName, unitId, tenantName, monthlyRent, maintenanceFee, day]) => ({
    roomId: String(roomId),
    buildingName: String(buildingName),
    unitId: String(unitId),
    tenantName: String(tenantName),
    contractId: `contract-${String(roomId)}`,
    monthlyRent: Number(monthlyRent),
    maintenanceFee: Number(maintenanceFee),
    dueDate: `2026-08-${String(day).padStart(2, "0")}`,
  })),
};

export const DEMO_DUNNING: DunningDraft = {
  billId: "bill-demo-overdue-411",
  unitId: "411",
  tenantName: "정예린",
  unpaidAmount: 770000,
  draftText:
    "안녕하세요. 411호 2026년 7월 청구 중 미납 잔액이 확인되어 안내드립니다. 이미 이체하셨거나 입금자명이 다른 경우 확인을 도와드리겠습니다. 납부가 어려우시면 분할 또는 일정 상담을 요청해 주세요.",
  channel: "룸로그 알림",
  guard: { blocked: false, hasConfirming: false, hasOrphan: false },
};

export const DEMO_MANAGER_BILL_ID = "bill-demo-overdue-411";

export function demoBillFallback(billId?: string): Bill {
  if (billId === "new") return DEMO_NEW_BILL;
  return (
    DEMO_MANAGER_BILLS.find((bill) => bill.id === billId) ??
    DEMO_MANAGER_BILLS.find((bill) => bill.id === DEMO_MANAGER_BILL_ID) ??
    DEMO_MANAGER_BILLS[0] ??
    DEMO_NEW_BILL
  );
}

function demoScope(building?: string): ManagerBillingScope {
  return {
    ...DEMO_BILLING_SCOPE,
    selectedBuilding: building || undefined,
  };
}

export function demoManagerDashboard(
  query: ManagerBillingDemoQuery = {},
): ManagerDashboardData {
  const month = query.month ?? DEMO_DASHBOARD.billingMonth;
  const bills = DEMO_BILLS.filter(
    (bill) =>
      bill.billingMonth === month && (!query.building || bill.buildingName === query.building),
  );
  const billedAmount = bills.reduce((sum, bill) => sum + bill.totalAmount, 0);
  const collectedAmount = bills.reduce((sum, bill) => sum + bill.paidAmount, 0);
  const overdue = bills.filter((bill) => bill.status === "overdue" && !bill.guard?.blocked);
  const confirmNeeded = bills.filter(
    (bill) => bill.guard?.blocked || (bill.status === "overdue" && (bill.daysOverdue ?? 0) >= 30),
  );
  return {
    scope: demoScope(query.building),
    billingMonth: month,
    summary: {
      total: bills.length,
      confirmNeeded: new Set(confirmNeeded.map((bill) => bill.billId)).size,
      pending: bills.filter((bill) => ["sent", "partially_paid"].includes(bill.status)).length,
      overdue: overdue.length,
      billedAmount,
      collectedAmount,
      unpaidAmount: Math.max(0, billedAmount - collectedAmount),
      collectionRate: billedAmount > 0 ? collectedAmount / billedAmount : 0,
      overdueUnits: new Set(overdue.map((bill) => bill.roomId ?? bill.unitId)).size,
    },
    recentDeposits: DEMO_DASHBOARD.recentDeposits.filter(
      (deposit) => !query.building || deposit.buildingName === query.building,
    ),
    overduePreview: DEMO_DASHBOARD.overduePreview.filter(
      (item) => !query.building || item.buildingName === query.building,
    ),
    bills,
  };
}

export function demoManagerCollection(
  query: ManagerBillingDemoQuery = {},
): ManagerCollectionAnalytics {
  const month = query.month ?? DEMO_COLLECTION_ANALYTICS.billingMonth;
  const buildings = DEMO_COLLECTION_ANALYTICS.buildings
    .filter((building) => !query.building || building.buildingName === query.building)
    .map((building) => ({
      ...building,
      billingMonth: month,
      bills: month === "2026-07" ? building.bills : [],
      ...(month === "2026-07"
        ? {}
        : {
            billedAmount: 0,
            collectedAmount: 0,
            unpaidAmount: 0,
            collectionRate: 0,
            rateDelta: 0,
          }),
    }));
  const billedAmount = buildings.reduce((sum, item) => sum + item.billedAmount, 0);
  const collectedAmount = buildings.reduce((sum, item) => sum + item.collectedAmount, 0);
  const confirmingAmount = month === "2026-07" ? 680000 : 0;
  const trend = Array.from({ length: 12 }, (_, index) => {
    const trendMonth = demoShiftMonth(month, index - 11);
    const source = DEMO_COLLECTION_ANALYTICS.trend.find(
      (point) => point.billingMonth === trendMonth,
    );
    return (
      source ?? {
        billingMonth: trendMonth,
        billedAmount: 0,
        collectedAmount: 0,
        unpaidAmount: 0,
        collectionRate: 0,
      }
    );
  });
  return {
    scope: demoScope(query.building),
    billingMonth: month,
    brief: {
      billedAmount,
      collectedAmount,
      unpaidAmount: Math.max(0, billedAmount - collectedAmount - confirmingAmount),
      collectionRate: billedAmount > 0 ? collectedAmount / billedAmount : 0,
      previousCollectionRate: DEMO_COLLECTION_ANALYTICS.brief.previousCollectionRate,
      rateDelta:
        billedAmount > 0
          ? collectedAmount / billedAmount -
            (DEMO_COLLECTION_ANALYTICS.brief.previousCollectionRate ?? 0)
          : 0,
      confirmingAmount,
    },
    trend,
    buildings,
  };
}

export function demoManagerOverdue(building?: string): ManagerOverdueData {
  const activeCases = DEMO_OVERDUE.activeCases.filter(
    (item) => !building || item.buildingName === building,
  );
  const waitingCases = DEMO_OVERDUE.waitingCases.filter(
    (item) => !building || item.buildingName === building,
  );
  return {
    scope: demoScope(building),
    asOf: DEMO_OVERDUE.asOf,
    summary: {
      activeUnpaidAmount: activeCases.reduce((sum, item) => sum + item.unpaidAmount, 0),
      activeCount: activeCases.length,
      severeCount: activeCases.filter((item) => item.daysOverdue >= 31).length,
      waitingCount: waitingCases.length,
    },
    activeCases,
    waitingCases,
  };
}

export function demoManagerBillCreation(
  query: ManagerBillingDemoQuery = {},
): ManagerBillCreationData {
  const month = query.month ?? DEMO_BILL_CREATION.billingMonth;
  return {
    scope: demoScope(query.building),
    billingMonth: month,
    account: DEMO_BILL_CREATION.account,
    options: DEMO_BILL_CREATION.options
      .filter((option) => !query.building || option.buildingName === query.building)
      .map((option) => ({
        ...option,
        dueDate: `${month}-${option.dueDate.slice(-2)}`,
        duplicateBillId: month === "2026-07" ? `bill-${option.roomId}-2026-07` : undefined,
      })),
  };
}
