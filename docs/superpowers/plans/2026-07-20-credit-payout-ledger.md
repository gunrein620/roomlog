# Credit Payout Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show completed Gara credit debits as withdrawals in the manager billing transaction ledger.

**Architecture:** The financial reader will project only negative `CreditLedgerEntry` rows linked to completed Gara payout requests into the existing transaction-ledger response. The billing service will merge those rows with deposits and costs. A typed source discriminator lets the UI label the detail accurately without persisting a duplicate cost.

**Tech Stack:** NestJS, Prisma, Next.js, TypeScript, Node test runner.

## Global Constraints

- Update `packages/types` before web or API consumers and rebuild that package.
- Use CSS tokens only; no styling change is required for this feature.
- Exclude top-ups, opening balances, and reversal entries from payout withdrawals.
- Keep `CreditLedgerEntry.id` as the projected row ID.

---

### Task 1: Define and map the credit-payout ledger source

**Files:**
- Modify: `packages/types/src/payment.ts`
- Modify: `apps/api/src/roomlog/roomlog.types.ts`
- Modify: `apps/web/src/lib/billing-manager-mapping.ts`

- [x] Add `source?: "cost" | "credit_vendor_payout"` to the shared row contract.
- [x] Add the same optional field to the API response shape and preserve it in the web mapper.
- [x] Typecheck `@roomlog/types` so web and API consume the new declaration.

### Task 2: Project completed Gara debit entries into billing rows

**Files:**
- Modify: `apps/api/src/roomlog/services/prisma-financial-cost.reader.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Test: `apps/api/src/roomlog/roomlog.service.spec.ts`

- [x] Write a failing service test whose financial reader returns a completed Gara debit row and assert the response contains one 100,000 won withdrawal with `credit_vendor_payout` source.
- [x] Run the focused test and observe the missing row failure.
- [x] Extend the reader interface with projected transaction rows and query only `CREDIT_DEBITED` Gara payouts that have a negative linked ledger amount.
- [x] Merge those rows into `listManagerBillDeposits`, preserving source row IDs and reverse-chronological ordering.
- [x] Run the focused test and the related roomlog ledger test.

### Task 3: Label the withdrawal detail and verify the application

**Files:**
- Modify: `apps/web/src/app/manager/billing/matching/ManagerTransactionLedger.tsx`
- Test: `apps/web/src/app/manager/billing/billing-workspace-redesign.spec.ts`

- [x] Write a focused assertion for the credit-payout source label.
- [x] Render `크레딧 원장 · 업체 지급` instead of the cost-only label for that source.
- [x] Typecheck types, build API and web, then run `bash scripts/verify.sh`.
