# Monthly bill generation transaction fix

## Root cause

The Firebase Web SDK `Transaction.get()` method accepts a `DocumentReference`; it does not accept a `Query` or `CollectionReference`. The previous implementation passed service-period, rate, bill, and payment queries into `tx.get()`. The SDK then attempted to resolve a document path from an object that was not a document reference, resulting in `Cannot read properties of undefined (reading 'path')`.

## Resolution

- Collection/query reads are performed with `getDocs()` before starting the transaction.
- Each returned document ID is converted into an explicit, owner-scoped document reference.
- The transaction re-reads those individual documents with `tx.get(documentReference)` before making any writes.
- The same unsupported query-read pattern was corrected in customer leave/rejoin and payment recording.
- Existing document IDs, bill IDs, ledger IDs, financial field names, and billing calculations remain unchanged.

## Deployment

Deploy the updated frontend build to Vercel. No Firestore data migration, collection rename, or Firebase plan change is required for this source fix.

## Verification

The modified data service passed TypeScript transpilation and an isolated strict type-check against the Firebase Web SDK transaction contract. A complete application build and live Firestore transaction test require the project's full dependency installation and authenticated Firebase environment, respectively.
