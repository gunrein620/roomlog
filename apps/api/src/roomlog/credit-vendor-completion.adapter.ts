import { Injectable } from "@nestjs/common";
import { CreditService } from "../credit/credit.service";
import type { VendorCompletionCreditBoundary } from "./vendor-completion-credit.boundary";

@Injectable()
export class CreditVendorCompletionAdapter
  implements VendorCompletionCreditBoundary
{
  readonly availability = "READY" as const;

  constructor(private readonly credit: CreditService) {}

  evaluateAfterCompletion(
    input: Parameters<CreditService["evaluateAfterCompletion"]>[0]
  ) {
    return this.credit.evaluateAfterCompletion(input);
  }
}
