The sections below record the completed design and branding releases. Current workflow and verification details are in [REVIEW-1.md](REVIEW-1.md); its workflow changes supersede the earlier preservation-only scope.

# Interface system — October 2026

## Direction

Sun Siyam’s identity is black and white. Black typography, white surfaces and neutral grey dividers replace green and teal throughout the portal. The portfolio ledger is a white card with a black progress bar. Semantic warning and error colours are retained only for their existing states.

Cards and table containers use 4px corners, thin token-based borders and a soft neutral shadow. Table headers are uppercase on `#EAEAEA`; Total rows are bold on `#F2F2F2`, and financial amounts remain right-aligned. The previous interface treated most content as similar cards, used small supporting text and gave detail dialogs too little hierarchy. This revision separates portfolio totals, actionable operational figures, financial tables and record decisions.

## Shared foundations

`public/style.css` owns the design tokens: canvas/surfaces, ink/secondary/muted, accent, semantic colours, borders, radii, spacing and shadow. Inter and Inter Tight are self-hosted WOFF2 variable fonts from the google/fonts repository, with their OFL licences in `public/fonts/`. Inter is the body face; Inter Tight is used for h1 and KPI figures with −0.025em tracking. Financial values retain tabular numerals. The on-screen scale is 12, 13, 14, 16, 20, 28 and 36px; smaller type is confined to print. No external font request or CSP change is needed. The supplied `public/logo.svg` replaces the previous drawn mark and wordmark in navigation, login and printable payment requests; `public/icon.svg` is monochrome. Shared interface icons retain one stroke family.

`public/app.js` shares brand, page header, form sections/footer, row actions, amount formatting, status badges, label association and accessible table-region helpers. No UI framework or backend dependency has been added.

## Screen changes

- Dashboard: a single portfolio ledger for approved/available budget, a three-value commitment/payment strip, compact operational totals and actionable queue links. Project comparisons and category balances remain. Payment coverage uses a linear actual-payment proportion rather than a decorative ring.
- Requests: counted views, company/project scope, progressive date/status/team filters, search and date/number/USD-amount sorting. The Finance shortcut includes held requests, consistent with its KPI. The original Finance commitment view remains intact.
- Main request detail: full order and remaining-to-request amounts, core context, category allocations, downloadable evidence and independently approved children.
- Payment detail: requested instalment and terms first, approval progress, evidence entry points, a dedicated role-aware decision area, payment supporting and remarks. Category/review history is progressively disclosed. All original actions and permission checks remain.
- Forms: numbered, semantic fieldsets for account/order/budget/payment context. Persistent labels, linked hints, native validity plus inline error feedback, allocation readout and visible in-flight action state. Footer actions remain accessible in longer dialogs.
- Master Data: a consistent tab/search/table experience for all five master types, preserving approved budget revisions and currency editing.
- User Manager: identity, responsibility and company scope separated clearly. All original access controls remain.
- Settings: numbering standards and record locks separated from the complete audit list.
- Login/password reset/TOTP: a consistent, restrained entry experience. The monochrome abstract illustration contains no invented numeric data. Demo is still explicitly labelled and browser-local.
- Printable payment request: the existing data and approval document are preserved, styled with the same typography and a print-specific A4 layout.

## Accessibility and responsive behaviour

Visible focus rings, native dialog focus handling, focus restoration, skip navigation, current-page markers, labelled table regions, column scopes, textual statuses and accessible names for icon actions. Main text and primary/semantic control combinations meet the tested 4.5:1 contrast threshold. Reduced-motion preferences remove transitions/spinners. Authentication and form errors are announced; modal validation stays within the browser's top layer.

Desktop: persistent navigation and full financial tables. Tablet: compact navigation width, stacked analysis panels and adaptive form/grid layout. Mobile: navigation becomes a horizontal bar, forms become single-column and request/order tables become labelled work items. Other financial/audit tables remain keyboard-focusable horizontal scroll regions, preserving numeric comparison. No server data, permissions or approval sequencing changes for any viewport.

## Verification

- `npm test`: 34 passing checks, including all original 27 checks and seven additional UI/filter/accessibility/style regressions.
- `npm run build`: passed.
- UI tests exercise all five pages, master and user forms, login reset state, scoped user switching, request document, independent approvals, return/correction, immutable submitted details, inline errors, search, USD-aware sorting and grouped Finance queue.
- CSS/DOM checks at widths 1440, 1024, 768 and 390 confirm responsive rule selection, mobile table mode, form columns and hidden disclosure state. These are style/DOM checks, not a browser layout engine.
- Core foreground/background pairs are checked for WCAG AA contrast.

No browser-control capability was available in the execution environment. Actual screenshot review, clipping/overflow, browser-native focus/touch behaviour and A4 pagination still need visual acceptance in a real browser. Live PostgreSQL/email/authentication integration and Vercel production deployment were not exercised by this UI-only change.

## Preservation

`public/domain.js`, `public/demo.js`, `api/`, `lib/`, existing records, browser-local storage key, integration configuration and workflow tests are unchanged. Request sorting/filtering changes presentation only. No data migration or reset is performed. Only the designated GitHub repository is used.


## Black-and-white branding verification

The branding pass changes only stylesheet tokens/rules, branded presentation templates, theme metadata, favicon, supplied logo, local fonts/licences and this documentation. The financial overview’s Total row displays the existing KPI values without introducing new calculations. The existing contrast test accepts uppercase or lowercase CSS hexadecimal values. All workflow tests are retained, and byte-for-byte checks confirm `domain.js`, `demo.js`, `api/`, `lib/`, dependency manifests, `AGENTS.md` and CSP configuration are unchanged.

Font provenance and SHA-256 digests are recorded in `public/fonts/README.md`. FontTools verified that both bundled fonts decode as WOFF2 and preserve variable weight axes from 100 to 900. CSS audits verify the discrete screen type scale, centralized colours, exact requested brand tokens and retained responsive/print rules. Real-browser visual and print-pagination verification remains outstanding.

## First review working screens

Requests now groups independently approved payments under expandable order rows. Dashboard labels and totals follow REVIEW-1.md, with consolidated USD figures and original-currency statistics. The identity remains black and white.

The dashboard summary uses two aligned desktop rows: three equal budget tiles and four equal payment tiles. Headings and amounts stand alone without explanatory copy. On Hold is a separate payment bucket, excluded from Outstanding Payments.
