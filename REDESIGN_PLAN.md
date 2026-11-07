# Simple Bill redesign plan

## Design direction

The redesign takes the supplied Chelaveee / Apple-inspired reference as the visual source: quiet white space, near-black typography, soft system-grey grouping, hairline dividers, compact rounded controls, and motion only where it confirms an action. Simple Bill remains recognisably an invoicing tool, not a generic lifestyle dashboard. The recurring visual anchor is a precise financial summary row: clear amount, concise label, and an unambiguous state.

This is deliberately not a card-per-section redesign. Surfaces are reserved for forms, invoice information, and important states; lists use separators and spacing first. Teal continues only as a restrained product identity and active-action colour. Invoice type keeps its semantic teal/amber distinction with text labels so colour is never the only cue.

## Tokens

### Light

| Token | Value | Use |
| --- | --- | --- |
| `--bg` / `--surface` | `#ffffff` | Page and primary panels |
| `--ink` | `#0b0b0c` | Main text |
| `--muted` | `#86868b` | Supporting text |
| `--fill` | `#f5f5f7` | Grouped backgrounds and controls |
| `--fill-strong` | `#e8e8ed` | Selected neutral controls |
| `--line` | `rgba(0,0,0,.08)` | Separators and control borders |
| `--accent` | `#0f766e` | Primary action and active navigation |
| `--danger` | `#d0473e` | Destructive action |

Dark mode remains supported with equivalent neutral tokens, because it is persisted application behaviour. It will use deep charcoal surfaces, high-contrast off-white text, and muted teal/amber states; no storage or theme logic changes are needed.

Typography uses the supplied system stack. Main desktop headings scale toward 48px/600; mobile headings use 30-34px/600. Section headings use 20px/600. Body copy is 16px/400 and supporting text is 14px/500. Labels are 12px/600. All application copy stays sentence case.

## Component system

The existing `components/ui.tsx` remains the shared ownership point and will be evolved rather than replaced with a component library.

| Primitive | Planned visual responsibility |
| --- | --- |
| Buttons | Pill geometry, compact hierarchy: primary filled, secondary neutral fill, quiet outline, destructive text/soft-danger |
| Fields | 12px label, 16px input, 9px radius, clear focus ring, error/hint treatment |
| Sheets/dialogs | Mobile bottom sheet and desktop centered panel, dimmed backdrop, safe-area padding, preserved keyboard close |
| Status badges | Fine-lined semantic pills with text plus dot |
| Empty states | Single purposeful grouped surface, explicit next action |
| Page heading | Consistent title/action row, supporting context only where it helps a decision |
| List rows | Thin separators and generous vertical rhythm in place of repeated heavy cards |

No external UI dependency will be added.

## Layout and navigation

- **Mobile:** maximum content width 520px, 20px side padding, a 72px safe-area-aware bottom dock, and no floating action that covers a form or list action.
- **Tablet/desktop:** retain the existing client router but use a wider content frame, a compact top identity/navigation rail when space permits, and a readable content column. Bottom navigation remains the deliberate small-screen affordance.
- **Invoice editor:** preserve the current form sequence but group it as document metadata, customer, items, charges, notes, and totals. The total section remains in reading flow; actions become a clear mobile-safe action bar.
- **Motion:** 160-200ms `cubic-bezier(.32,.72,0,1)` for button/sheet/state changes. Respect `prefers-reduced-motion`.

## Screen-by-screen change map

1. **Application shell:** neutral background, responsive container, refined navigation, safe-area spacing, consistent page headers.
2. **Dashboard:** financial summary becomes an editorial amount-led overview; empty state and install guidance remain intact.
3. **Invoices:** structured search/filter controls and compact invoice rows with restrained status treatment.
4. **Invoice editor:** strongest visual upgrade; clear information hierarchy and input rhythm without moving or changing calculations, validation, autosave, or save/finalize semantics.
5. **Invoice detail:** calm document preview, aligned metadata and totals, action hierarchy that keeps cancel visually distinct.
6. **Customers and products:** separator-led management lists, clearer active/inactive states, preserved dialogs/forms and product constraints.
7. **Reports:** grouped filter controls, amount-led net totals, restrained export controls, responsive table containment retained.
8. **Settings:** grouped preference sections, compact install information, readable long-form profile inputs, unchanged backup confirmation.

## Controlled implementation stages

1. Add global tokens, typography, focus/motion/safe-area rules in `src/index.css`.
2. Update shared primitives and navigation in `src/components/ui.tsx` and `src/components/BottomNav.tsx`.
3. Restyle the app shell and Dashboard.
4. Restyle list/management pages: Invoices, Customers, Products, Reports.
5. Restyle invoice editor and detail page while keeping their TSX logic unchanged.
6. Restyle Welcome, Settings, and install section.
7. Run typecheck/tests/build and browser regression/screenshots at mobile and desktop widths; audit accessibility.

## Functional and rollback safety

Only CSS classes, semantic wrappers, and reusable presentation primitives may change. `src/lib`, `src/App.tsx` routing logic, data types, Dexie schema/version, PWA configuration, report/PDF algorithms, and state ownership are excluded unless a defect is demonstrated and separately covered by a failing test.

The forward path is presentation-only, so old IndexedDB records and mixed cached application versions remain readable. Rollback is a source rollback/redeploy; it requires no data migration or cache/database clearing. Each stage stays buildable and testable before the next begins.

## Verification strategy

- Preserve the existing 65 unit tests and add tests first only for any changed behaviour (none planned).
- Run typecheck and the full test suite after each high-risk visual stage.
- Build production at the end and confirm PWA precache generation.
- Capture screenshots at 390px, tablet, and desktop widths; inspect for overflow, safe-area collisions, and form readability.
- Repeat the isolated create/finalize/detail workflow and inspect browser console/accessibility results.
- Report physical-device, real HTTPS install, and native share-sheet limits honestly rather than treating desktop automation as proof.
