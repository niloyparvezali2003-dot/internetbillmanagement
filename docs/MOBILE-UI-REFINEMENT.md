# Mobile UI readability refinement

This update adds a final responsive CSS layer for ALI AL-FATEEH Internet Billing.

- Uses the already-loaded Inter font with Noto Serif Bengali as the Bengali-script fallback.
- Increases mobile body copy, labels, helper text, financial summaries and status labels.
- Gives buttons, navigation, inputs and icon controls larger touch targets.
- Adds safe-area-aware spacing for the fixed bottom navigation.
- Improves the customer mobile cards, monthly generation report, confirmation dialog,
  tables, dashboard cards, reports, settings, login and configuration screens.
- Keeps dense data tables inside their own horizontal scroll area instead of allowing
  the full page to overflow horizontally.

No component behavior, Firebase configuration, billing calculations, stored records,
Firestore schema or desktop layout is intentionally changed by this styling layer.
