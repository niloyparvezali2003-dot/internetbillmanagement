# ALI AL-FATEEH Loading Screen Update

The startup/authentication loading UI now uses a branded, full-viewport loading experience inspired by the Billsheet reference's orbital animation and glass panel composition, restyled with ALI AL-FATEEH Ocean Electric colors.

- Uses the supplied `/public/ali-al-fateeh-logo.png` asset without altering it.
- Displays different copy during initial startup and administrator-session verification.
- Uses an indeterminate progress sweep rather than a misleading numeric percentage.
- Includes responsive sizing and a `prefers-reduced-motion` fallback.
- Does not change Firebase authentication, API calls, session verification, routes, database structures, or financial logic.

Changed files:
- `src/App.tsx`
- `src/components/LoadingScreen.tsx` (new)
- `src/styles/global.css`

Validation performed: TypeScript/TSX syntax transpilation and CSS parsing. A full typecheck/Vite production build was not run because project dependencies are not installed in this environment.
