# First review release — 18 October 2026

This release implements the approved dashboard, Requests and workflow review in `abuney9/sun-siyam-project-monitoring` only. The existing black-and-white identity, logo, authentication and company access remain.

## Financial rules

- The first final-approved payment request utilizes its parent's full order value once.
- Only final-approved payment requests count toward Paid, Outstanding Payments or On Hold. As confirmed in the dashboard review, Outstanding Payments excludes held requests; On Hold is a separate bucket, including a document task returned to a hold. The internal Payment Pending at Finance total equals Outstanding Payments.
- Balance Payments Pending = utilized order values minus current approved child amounts, including paid and held children.
- **Budget Utilized = Paid + Outstanding Payments + On Hold + Balance Payments Pending.** Each amount belongs to one payment bucket only. Project and currency summaries use the same distinction.
- Operational remaining-to-request subtracts all non-rejected child reservations, including drafts and requests in approval. Unapproved requests can remove an order from the balance tab without changing dashboard payment figures.
- Child rejection releases only the child reservation/payment figures. Parent rejection releases utilization and requires every child to be rejected first.

## Working screens

Dashboard has three equal-width primary tiles in one desktop row: Total Approved Budget, Budget Utilized, Available Budget. Four equal-width secondary tiles form the next row: Paid, Outstanding Payments, On Hold, Balance Payments Pending. Tiles show only headings and currency amounts, with responsive wrapping on smaller screens.

Requests has exactly four tabs: Requests, Finance, Balance Payments To Be Requested, My Actions. Parent rows expand with +/− into independently numbered child requests. New Request appears only on Requests and creates the parent plus its first child draft in one transaction. Amount and percentage work both ways. Subsequent children reuse the parent, default to today's Maldives date and original currency, and allow another currency.

Finance can reject at its stage, return financial corrections through the complete approval workflow, or request additional documents. Document-only uploads go from the original requester directly back to Finance, retain approvals and cannot edit payment financial details. Multiple PDFs are supported for parents, requested documents and payment evidence, with a combined 2 MB limit per upload action.

Reviewer/Approver rejection is limited to their action stage; Finance rejection to its stage; Admin can reject at any stage within company access. Remarks are mandatory. A paid request cannot be rejected. Only Admin can Delete Payment with remarks; this permanently clears payment details and payment supporting PDFs, records “Payment deleted” in audit/history, and returns the approved child to Pending Payment. It can then be rejected.

My Actions includes current child tasks and parent amendment tasks only. Submitted/completed work leaves the user's queue.

## Amendments

Shared parent changes are proposals with independent team approval. Current details remain effective until final approval; approved details then appear on existing child views/documents. Previous effective values, proposals and approvals are retained. A reduction cannot be below any non-rejected child reservations. Pending reductions also constrain new reservations, and reductions are checked again at final approval. Increasing the approved order reopens the balance workflow.

Company, project, team and original order currency remain fixed after numbering, preserving access, scoped references and frozen child conversions. Supplier, PO, invoice, description, budget/category allocations, total and supporting can be amended. Payment amounts and percentages recorded at creation do not silently change when a parent is amended.

Purchasing: Requester → Reviewer → Approver 1 → Approver 2 → Finance. Planning: Requester → Approver 1 → Finance. Every child is approved independently. Parent amendments follow the same team approval route.

## Master data, currency and numbering

Companies require unique 2–12 character short codes; project codes are unique within their company. Parent and child formats are separate and require {COMPANY}, {PROJECT}, {SEQ}; {YYYY} is optional. Independent counters run per company/project and record type, never reset on format changes. Existing issued references stay unchanged.

Budgets can use any configured currency; category amounts use that budget currency. Dashboard consolidated totals use saved USD conversions. Each payment request saves its currency, currency units per USD, order-equivalent reservation and parent rate. Later currency-master changes never reprice saved requests. Changing a draft's selected currency intentionally creates a new conversion snapshot; editing within its saved currency retains the snapshot. Payments settle exactly the child's amount and currency.

## Additive migration

Workspace schema version 2 is migrated under the existing PostgreSQL transaction. It assigns missing company/project short codes and parent references, preserves issued child references, budgets, documents, users, audit and existing sequences, initializes scoped counters from issued references, and adds explicit payment currency/reservation fields. Existing budgets default to USD. Legacy single payment evidence becomes a files array.

Legacy Planning children awaiting Reviewer move to Approval 1 with an audit event. No existing Reviewer user gains Approver permission. Admin must explicitly reassign any legacy Planning Reviewer accounts; the server prohibits Planning Reviewer assignments. Generated company/project codes can be reviewed and adjusted in Master Data; issued references remain permanent. Legacy reference formats are replaced with the new scoped defaults for future issues.

## Verification

`npm test` covers domain transitions, access, locks, migration, currencies, amendments, rejection/deletion, document-only workflow, authentication primitives, DOM interactions, responsive rules and contrast. `npm run build` builds static assets; Vercel deploys the API separately. DOM viewport checks do not replace a real browser visual review. Production PostgreSQL concurrency, email delivery, actual TOTP login and live PDF print/download require connected-service acceptance checks described in DEPLOYMENT.md.
