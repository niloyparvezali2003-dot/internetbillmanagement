# ALI AL-FATEEH — Vercel rate-history type fix

## Change

Updated `api/customers/[id]/rates.ts` to explicitly normalize Firestore rate documents into the API response shape:

- `id`
- `effectiveMonth` (read from the document, falling back to its document ID)
- `amount` (converted from integer poisha to BDT)
- `note` (string or empty string)

This resolves the TypeScript error where the mapped rate object was inferred as containing only `id` and `amount`, while the sort callback referenced `effectiveMonth`. Chronological sorting remains newest effective month first.

## Preserved

No Firestore collection names, document IDs, write operations, billing calculations, customer records, or API request contracts were changed.
