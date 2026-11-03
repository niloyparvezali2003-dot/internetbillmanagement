# ALI AL-FATEEH — OCEAN ELECTRIC

## Design tokens

| Token | Value | Use |
|---|---|---|
| Electric Blue | `#075FE4` | Primary actions and selected states |
| Neon Cyan | `#00D5F5` | Focus rings, active indicator, accents |
| Deep Navy | `#071B3A` | Sidebar and dark brand surfaces |
| Silver Blue | `#E7EFF8` | Borders and separators |
| Ice White | `#F4F8FD` | Main application background |
| Pure White | `#FFFFFF` | Cards and form surfaces |
| Midnight Text | `#12233F` | Primary text |

The tokens are centralized in `src/styles/global.css` under `:root`. Existing React components, route identifiers, Firebase code and API/business logic consume the shared theme layer.

## Semantic status colors

- Paid/success: green
- Due/pending: amber
- Failed/overdue: red
- Informational: Electric Blue
- Neutral: grey

## Brand artwork

The original user-provided transparent PNG is stored at `public/ali-al-fateeh-logo.png`. It is included without recoloring, cropping or stretching. It is displayed on Deep Navy surfaces in the sidebar, admin login, loading state, configuration state and browser-print documents.
