# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Internal Sun Siyam Group staff working at office desktops, daily, handling many records per day. Mobile use is occasional (for example an approver acting away from the desk); it must work but is not the primary scene.

Each user has exactly one role and explicit company access (or full group access):

- **Requester** (Purchasing or Planning team): creates orders (parent requests) and their payment requests, edits own drafts, supplies documents Finance asks for.
- **Reviewer** ("Checked By") and **Approver** (Level 1, Level 2): check, approve, reject or return requests for their team, company and level. They cannot edit financial details.
- **Finance**: adds remarks, puts requests on hold, records exact payments with date, type and evidence.
- **Viewer**: read-only visibility within company access.
- **Admin**: master data, users, settings, unlocks, rejection at any stage; temporarily also data entry during the population period.

Senior management relies on the Dashboard for budget position, but the daily workload is operational: entering, approving and paying requests.

## Product Purpose

The portal replaces email, paper and spreadsheet approvals for project payments across Sun Siyam companies (properties). Every payment request moves through its team's full approval route in one place, and management can see, at any moment, the approved budget against what is utilized, paid, outstanding, on hold and still to be requested, per company and project.

Success means:

1. Payment approvals no longer travel by email or paper; the portal is the record.
2. Budget position is visible and trustworthy for any company, project or the whole group.

## Positioning

A purpose-built ledger for Sun Siyam's own approval contract, not a generic procurement tool: unapproved parent orders anchor independently approved child payment requests, approvals never carry between siblings or from the parent, the parent's full value is utilized once on the first final approval, and every figure follows the agreed bucket definitions (Paid, Outstanding Payments, On Hold, Balance Payments Pending). Company visibility and role actions are enforced on the server.

## Operating Context

- Structure: Company (property) → Project → Approved Budget → Categories. Budgets may be in any configured currency; consolidated totals use saved USD conversions (currency units per USD 1, e.g. MVR 15.42).
- Approval routes: Purchasing is Requester → Reviewer → Approver 1 → Approver 2 → Finance. Planning is Requester → Approver 1 → Finance. Parent amendments follow the same team route.
- Pages: Dashboard, Requests (tabs: Requests, Finance, Balance Payments To Be Requested, My Actions), Master Data, User Manager, Settings (Admin only).
- Documents: supporting PDFs on parents, requested documents and payment evidence (2 MB combined per upload action); a printable A4 payment request document printed or saved as PDF from the browser.
- Imports: CSV/XLSX order and payment import for data population.
- Records are locked exclusively for 10 minutes while open; Admin can unlock (audited).
- Access: username + password + mandatory TOTP, or ERP single sign-on from the ERP sidebar (skips portal password and TOTP by decision).
- Hosting: self-hosted Node.js on the internal server at 130.3 behind HTTPS, PostgreSQL storage. Source is GitHub `Sunsiyam-Resorts/project-monitoring`.

## Capabilities and Constraints

- Stack: static vanilla JavaScript frontend (`public/`), shared stylesheets, Node API, PostgreSQL. No UI framework, no client router; no new packages without reason.
- Preserve sequence, audit, approved budgets, prior revisions, approval history and payment history. Issued references are permanent; counters never reset.
- Paid records are immutable through the application. No partial settlement of a payment request.
- Budget overruns warn and instruct to inform Finance; they never block.
- Duplicate checks: same PO within a company; same invoice under the same supplier across companies.
- Demo workspace: fictional, browser-local data with a role selector. It must always be labelled as demo and never described as secure login.
- Terminology is fixed by the approved contract: Company (portal label for property), order / main request (parent), payment request (child), Budget Utilized, Available Budget, Paid, Outstanding Payments, On Hold, Balance Payments Pending, Not received by Finance, My Actions.
- Deferred: physical project progress and milestones. Open: recovery policy for a lost authenticator.

## Brand Commitments

- Name: Sun Siyam Project Monitoring Portal (Sun Siyam Group).
- Supplied logo `public/logo.svg` and monochrome `public/icon.svg`. Sun Siyam's identity is recorded in the project as black and white.
- Voice: plain, formal finance language. Precise and neutral, using the agreed terms exactly; no casual phrasing, jokes or marketing tone.

## Evidence on Hand

- Approved workflow contract: `docs/SPECIFICATION.md`, `docs/REVIEW-1.md`; acceptance checks `docs/TESTING.md`; import rules `docs/IMPORTS.md`.
- Demo data in `public/demo.js` is fictional sample data only.
- No real finance records, customers, figures or credentials are in the repository and none may be added or invented.

## Product Principles

1. **The figures must be right and explainable.** Every amount traces to its bucket definition and history; never round, merge or relabel figures for presentation.
2. **Independence of approvals is visible.** Each payment request shows its own route, status and history; nothing suggests approval inherited from a parent or sibling.
3. **Work queues first for operators.** Staff should immediately see what waits on them and act on it with few steps on a desktop.
4. **History is never lost.** Revisions, returns, rejections and deletions add to the record; the interface shows prior states rather than hiding them.
5. **Honest about scope.** Demo is labelled demo; capabilities not yet verified (e.g. live email, printer pagination) are not claimed.

## Accessibility & Inclusion

No formal standard has been set. Existing work maintains 4.5:1 text contrast on checked pairs, visible keyboard focus, reduced-motion support, status shown in text (not colour alone), and Light/Dark/System appearance.
