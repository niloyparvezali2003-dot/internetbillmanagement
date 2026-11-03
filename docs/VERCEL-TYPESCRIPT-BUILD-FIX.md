# Vercel TypeScript build fix

This update addresses the TypeScript errors reported by the Vercel build at commit `d4c8df1`.

## Changes

- Corrected the shared API helper imports in `api/customers/[id]/leave.ts`, `rates.ts`, and `service.ts` from `../_lib/...` to `../../_lib/...`. These files are nested one directory deeper under `api/customers/[id]/`.
- Changed the bill generator's Firestore update payload from `Record<string, unknown>` to `Record<string, number | FieldValue>`. All values assigned to this update payload are integer poisha amounts or Firestore `FieldValue` sentinels, so this accurately types the existing update without changing accounting behavior.

No billing formulas, collection names, document IDs, payment allocation rules, Firebase configuration, or API request/response contracts were intentionally changed.

## Validation

The changed import paths resolve to the existing shared files. Source syntax and the update-payload type shape were checked locally. A complete production build was not run in this environment because dependency installation did not complete; Vercel should be used for the authoritative clean build.
