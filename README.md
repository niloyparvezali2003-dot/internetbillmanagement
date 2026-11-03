# ALI AL-FATEEH — Internet Billing Management System

The existing Internet Billing product UI and accounting workflows are retained. Its hosting and data layer now follow the same model as the supplied POS reference project:

- **Frontend:** React + TypeScript + Vite, deployed to Vercel.
- **Authentication:** Firebase Authentication (email/password).
- **Database:** Cloud Firestore on Firebase Spark.
- **Data access:** Firebase Web SDK directly from the authenticated browser session.
- **Data ownership:** each account's records live under `users/{uid}/...`; Firestore Security Rules allow only that UID to access its workspace.
- **No deployed API backend:** there is no `api/` folder, Vercel Function, Firebase Admin SDK runtime, or Firebase Cloud Function.

## Product features retained

- Dashboard with active customers, billed amount, net collection, outstanding balance, advance credit, and annual income chart.
- Customer creation and editing, permanent customer IDs, service join/leave/rejoin history, effective-month subscription rates, and opening due/advance balance.
- Monthly bill generation with one bill per customer/month, full-month charging, chronological credit allocation, and protection against out-of-order backfills.
- Manual payments by cash, bKash, Nagad, bank, or other methods; partial and advance payments; unique payment references; idempotency; and eligible payment reversals.
- Customer ledgers, transactions, reports, activity history, printing, and Save as PDF.

The UI files and styling are kept from the supplied Internet Billing project. Existing UI calls use a compatibility layer in `src/services/firebase/data.ts`; those calls now execute browser-side Firestore operations rather than HTTP calls to Vercel API routes.

## Firebase Spark setup

1. Open the Firebase project used by this application.
2. Enable **Authentication → Email/Password**.
3. Create the administrator account in Firebase Authentication. The signed-in UID becomes the owner of that account's workspace.
4. Create or enable the Cloud Firestore database.
5. Add your local Vercel domain and production domain under **Authentication → Settings → Authorized domains**.
6. Publish the repository's `firestore.rules` using Firebase Console or `firebase deploy --only firestore:rules`.
7. Configure these four required environment variables in Vercel and in local `.env.local`:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
```

`VITE_FIREBASE_STORAGE_BUCKET` and `VITE_FIREBASE_MESSAGING_SENDER_ID` are optional in this app. They are included in the template for parity with the POS Firebase client setup.

## Local development on Windows

From the project folder:

```powershell
npm.cmd install
npm.cmd run dev
```

Vite normally opens `http://localhost:5173`. Build locally before deployment:

```powershell
npm.cmd run build
```

## Vercel deployment

1. Push the project to GitHub.
2. In Vercel, import the GitHub repository.
3. Keep the framework preset as **Vite**.
4. Use `npm run build` as the build command and `dist` as the output directory.
5. Add the four `VITE_FIREBASE_*` environment variables above to the Vercel project.
6. Deploy. Vercel serves the static frontend; Firestore reads/writes go directly from the browser to Firebase.

The supplied `vercel.json` includes the SPA fallback and the manifest content type header. No service-account key, `ADMIN_UID`, Vercel API environment secret, or paid Firebase Blaze plan is required for the application runtime.

## Firestore data layout

All data is isolated by the current Firebase Authentication UID:

```text
users/{uid}/
  customers/{customerId}
    servicePeriods/{periodId}
    rates/{YYYY-MM}
  bills/{customerId_YYYY-MM}
  payments/{paymentId}
  ledgerEntries/{entryId}
  auditLogs/{auditId}
  systemCounters/{name}
  idempotencyKeys/{key}
```

Money remains stored as integer poisha. The permanent document IDs and business references remain independent. A payment posts one ledger credit; its allocations do not create duplicate credits. Reversals retain the original payment and post a separate debit reversal.

## Existing data migration (only when needed)

The older Internet Billing build stored records in root collections (`customers`, `bills`, `payments`, `ledgerEntries`, `systemCounters`, `idempotencyKeys`, and `auditLogs`) and customer subcollections (`servicePeriods`, `rates`). The new POS-style rules intentionally close those root collections.

If the old deployment already contains real records, run the included local migration **before switching the live app to the new version**. It copies documents into `users/{LEGACY_ADMIN_UID}/...`, retains every document ID and field, and never deletes or edits the original source records. Existing destination documents are skipped.

PowerShell example (keep the service-account file outside the project folder):

```powershell
$env:LEGACY_ADMIN_UID = "YOUR_FIREBASE_AUTH_UID"
$env:FIREBASE_SERVICE_ACCOUNT_JSON = Get-Content "C:\secure\firebase-service-account.json" -Raw
Set-Location tools\legacy-migration
npm.cmd install
npm.cmd start
Set-Location ..\..
```

The standalone migration utility has its own `package.json` and dependency install, so the application and Vercel deployment do not install or ship Firebase Admin SDK. The service-account credential is used only by this one-time local migration script. It is not used by the deployed app and must never be placed in Vercel environment variables or committed to GitHub. If the old root collections were never populated, skip this migration.

## Firebase plan and limits

This setup does not call Firebase Cloud Functions, Firebase App Hosting, or any other Blaze-only backend service. Firebase Authentication and Firestore run within Firebase Spark's quotas and limits. Vercel provides the frontend hosting. Keep an eye on Firestore read/write quotas as the dataset and number of users grow.
