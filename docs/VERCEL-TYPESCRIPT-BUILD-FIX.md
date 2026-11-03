# Vercel TypeScript Build Fix

Fixed the two TypeScript errors reported by the Vercel production build:

1. `updateCustomer()` now supplies an `async` callback to Firestore `runTransaction()`, matching the Firebase Web SDK requirement that the transaction callback return a Promise.
2. The conditional monthly-bill customer update payload is now typed as Firestore `DocumentData` rather than `Record<string, unknown>`, so it is accepted by `Transaction.update()` while retaining the same fields and runtime behavior.

No billing calculations, data paths, Firestore schema, UI, or deployment settings were changed.
