import type {
  GaraVendorCreditPublicView,
  ManagerCreditAccountView,
  ManagerCreditTopupOrderView,
  ManagerCreditWorkspace
} from "@roomlog/types";

export const CREDIT_QUERY_REPOSITORY = Symbol("CREDIT_QUERY_REPOSITORY");

export type GaraTopupOrder = Readonly<{
  managerId: string;
  managerVendorId: string;
  order: ManagerCreditTopupOrderView;
}>;

export interface CreditQueryRepository {
  assertManagerAccess(userId: string): Promise<void>;
  getAccount(managerId: string): Promise<ManagerCreditAccountView>;
  getWorkspace(
    managerId: string,
    page?: {
      ledgerCursor?: string;
      topupCursor?: string;
      paymentCursor?: string;
      limit?: number;
    }
  ): Promise<ManagerCreditWorkspace>;
  getTopupOrder(
    managerId: string,
    orderId: string
  ): Promise<ManagerCreditTopupOrderView>;
  listPublicGaraVendors(): Promise<GaraVendorCreditPublicView[]>;
  getGaraTopupOrder(orderId: string): Promise<GaraTopupOrder>;
}
