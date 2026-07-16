import type {
  ManagerCreditAccountView,
  ManagerCreditTopupOrderView,
  ManagerCreditWorkspace
} from "@roomlog/types";

export const CREDIT_QUERY_REPOSITORY = Symbol("CREDIT_QUERY_REPOSITORY");

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
}
