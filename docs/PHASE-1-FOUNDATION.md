# Foundation and current implementation status

## Runtime architecture

- React + TypeScript + Vite for the admin interface.
- Firebase Authentication for email/password sign-in.
- Cloud Firestore on Firebase Spark for persistent application records.
- Vercel Node.js Functions for privileged server-side operations.
- Firebase Admin SDK only inside Vercel functions.
- Browser Firestore access is denied by `firestore.rules`.

## Admin authorization

The only authorized administrator is the Firebase Auth UID stored in the server-only `ADMIN_UID` environment variable. The browser never decides whether a user is an administrator. Each protected API route verifies the Firebase ID token and checks the UID allowlist through `requireAdmin`.

There is no public sign-up route. Create the one admin user manually in Firebase Console.

## Implemented Firestore collections

| Collection | Responsibility |
|---|---|
| `customers` | Customer profile, private permanent customer code, opening-balance state and credit balance |
| `customers/{id}/servicePeriods` | Every join/leave/rejoin interval |
| `customers/{id}/rates` | Effective-dated monthly subscription rates |
| `bills` | One bill snapshot per customer and billing month |
| `payments` | Original manual payment record, generated reference and embedded allocations |
| `ledgerEntries` | Append-only debit/credit entries and running-balance source |
| `auditLogs` | Actor, action, entity, timestamp and metadata |
| `systemCounters` | Transactional permanent customer and payment reference generation |
| `idempotencyKeys` | Duplicate payment submission protection |

## Implemented workflows

- Admin login and server-side UID authorization.
- Customer create/edit, service leave/rejoin, and effective-month rate changes.
- Opening balance recorded once as a distinct debit (due) or credit (advance) ledger entry.
- Full-month bill generation when a service period overlaps at least one calendar day of the month.
- One bill per customer/month using a deterministic Firestore document ID.
- Opening advance and eligible unallocated payment credit are allocated oldest-first to opening dues and generated bills. Allocation is date-aware and recorded against the original payment so the receipt is never credited twice.
- Manual payment recording for cash, bKash, Nagad, bank transfer and other methods, with future-dated receipts rejected.
- Payments are posted once, then allocated oldest-first against opening due and generated bills; excess is customer advance credit.
- Customer ledger with chronological debit, credit and running balance plus service-period history.
- Dashboard, transaction register, monthly reports and administrator activity log.
- Browser print / Save as PDF for bills, payment receipts, customer ledgers and monthly reports. The print template loads Noto Serif Bengali and DM Sans and includes the original supplied logo.

## Financial invariants

1. Store money as integer poisha. Never use floating point for accounting storage or calculations.
2. Positive customer balance means due; negative balance means advance credit.
3. Opening balance is one distinct ledger entry, not a generated historical bill.
4. A bill is unique by customer + billing month. A deterministic document key and transaction guard prevent duplicates.
5. A payment creates one credit entry only. Payment allocations do not create additional credits.
6. Unallocated payment value remains customer advance credit.
7. Bill amount is snapshotted when generated. Later rate changes do not alter old bills.
8. For full-month billing, charge the full monthly amount if any valid service period overlaps the calendar month. Rejoining in the same month does not create a second bill.
9. Customer code is internal-only and is not returned by customer APIs or displayed in the UI/PDFs.
10. Financial records must not be silently deleted or overwritten. Payment corrections use a compensating reversal record; general manual financial adjustments remain a planned enhancement.
11. Use `Asia/Dhaka` for business dates and billing-month boundaries.

## Remaining production work

- Add a general-purpose audited financial adjustment workflow for correcting an opening balance or ledger entry without editing historical records.
- Add paginated reads and export/restore backup controls before customer or ledger volumes grow substantially. Current list endpoints read full collections and are intended for a small initial operation.
- Complete an authenticated staging test with the owner’s Firebase/Vercel configuration, verify Firestore rules and run a production build. The authoring environment could not install npm dependencies, so a full build has not been verified here.

The existing Firestore configuration, environment variable names, route contracts and customer financial invariants must remain stable when these production features are added.
