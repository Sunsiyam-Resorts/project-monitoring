# Approved workflow — first review release

**Revision 2 (November 2026) supersedes everything below where they differ.** The Purchasing and Planning teams and every approval stage are removed: a submitted payment request goes straight to Finance. Roles are Requester, Finance, Viewer and Admin. Finance has full operational access except User Manager and Settings: it maintains companies, projects, approved budgets (with revisions), suppliers and currencies, imports records, raises orders and payment requests, approves amendments, rejects orders, releases locks and deletes recorded payments. Nobody acts on a request or amendment they raised themselves, so a Finance user's own request is processed by another Finance user or Admin. Projects carry tasks (name, status To do / In progress / Done, optional owner and due date); a project's progress is the share of its tasks that are Done, and only Finance and Admin change tasks. The Projects page lists projects with their progress; each project page shows that project's budget, payments, progress, tasks, breakdowns and activity. Existing data migrates once: requests and amendments waiting at Reviewer, Approval 1 or Approval 2 move to Finance (committing their order if needed), Reviewer and Approver accounts become Viewer, and each change is audited.

The approved first-review contract is documented in [REVIEW-1.md](REVIEW-1.md). It supersedes the earlier testing-release rules below where they differ, including Planning approvals, financial calculations, amendments, payment deletion, numbering and currencies.

## Temporary Admin data population access

For the current data population period, Admin may also create orders and draft payment requests, import orders/payments, edit and submit drafts, propose parent amendments and supply requested documents within assigned company access. Admin selects Planning or Purchasing for new orders (and for each order-import batch); the team stays fixed after numbering. Master data and user creation remain Admin capabilities.

Admin additions to an existing order preserve its original requester; `createdBy` and the audit trail identify the actual creator. These data-entry permissions do not grant Reviewer, Approver or Finance payment-processing actions. Each payment and amendment still follows the complete team approval route, and locks, duplicate checks, reservations, documents, references and prior history remain enforced. This exception supersedes requester-only data-entry restrictions below and in REVIEW-1.md until explicitly withdrawn.

# Approved workflow — testing release 0.1

## Repository and scope

Only `Sunsiyam-Resorts/project-monitoring` may be used, plus the ERP repository `Sunsiyam-Resorts/rene-next` for the ERP single sign-on link only. No other repository, including Test1, may be accessed or changed. GitHub is the source repository; the portal is self-hosted on the internal server at 130.3 behind HTTPS. Project progress is tracked from project tasks (Revision 2).

## Master structure

Company (also referred to as property) → Project → Approved Budget → Categories and approved amounts. Company is the portal label. Admin maintains these, shared supplier master and currencies. Budget currency is USD. Currency rates represent currency units per USD 1: USD 1, MVR 15.42. Other currencies can be added. Rates are saved with an order to keep historical reporting stable. No FX gain/loss model in this release.

## Parent and children

The main request is an order anchor and is not approved. It holds company, project, approved budget, supplier, PO number, optional invoice number, description, currency, full amount, multiple category allocations, team and supporting PDFs. Allocations in order currency must sum to the full amount. One parent covers one project and one budget, with multiple categories within that budget.

Each child payment request has a permanent generated number, request date, percentage of the original full amount, calculated exact amount, terms, requester, independent status, approval history, Finance remarks and its own payment evidence. No due date. The same parent information is reused for further part or balance requests. Paid + non-rejected pending requests cannot exceed the order total. Rejected requests release their reserved instalment amount.

## Approval and correction

All payment requests: Requester → Finance → Paid (Revision 2).


Every child follows the complete workflow. No approvals carry from its parent or siblings. Reviewer and approver actions require matching team, company access and approval level. Users cannot approve their own requests.

Submitting removes requester editing access. Reviewers and approvers check/approve, reject or return with a reason; they cannot edit financial details. Return goes directly to the requester and reopens that child as Draft. Resubmission restarts at Reviewer. Current approvals are cleared but all prior actions remain in review history and audit. The parent is frozen while any child is submitted or after commitment. Before commitment, if all children are Draft or Rejected, the original requester can correct parent details. Paid records are immutable through the application.

## Commitment and budget

On the first child's final approval, record the entire parent's commitment once. Subsequent approved children do not add commitment again.

Available budget = approved budget − committed order allocations.

Outstanding commitment = full commitment − paid requests.

With Finance = approved unpaid requests + requests on hold.

Not received by Finance = outstanding commitment − With Finance; includes unrequested amounts and draft/approval-stage children under committed orders.

Budget overrun produces a category warning and the instruction to inform Finance of additional approvals. It never blocks request creation or approval. Admin records approved budget revisions with a mandatory reason; earlier category amounts and revision history remain intact. Additional approval routing for overruns is not introduced.

## Duplicates

Checks run only on parents. Block same PO within same company across both Planning and Purchasing. Block same invoice under the same supplier across companies. Case and repeated whitespace are normalised. Blank advance invoice values do not trigger duplicate detection. Children can share all their parent's references.

## Finance

Company access grants visibility; Finance role grants payment processing. Any Finance user with access to that company can act. Remarks may be added before payment. On Hold needs a reason; release returns to Finance. Record exact requested amount only; require payment date, type (Cheque, Transfer, TT) and a separate payment supporting PDF. No partial settlement of a child. To split a payment, create appropriately sized child requests first.

## Access and login

Single role per user: Requester, Finance, Viewer, Admin. Users have explicit company access or full group access. Full group users can inspect all companies and projects; role still controls actions. Admin manages all configuration. Master data, User Manager and Settings are Admin-only in this release. Requesters see and create their team's requests within company access; they can edit their own drafts only. Group scope updates automatically when new companies are added.

Admin creates username, email and initial password (minimum 12 characters). Sign-in requires password plus mandatory authenticator TOTP. First sign-in enrols TOTP after successful password verification. Email OTP resets password without removing TOTP. Sessions are revoked on password reset, Admin user changes and logout. Recovery from a lost authenticator needs an operational policy before wider rollout; there is no insecure bypass button.

ERP single sign-on: users signed in to the ERP open the portal from the ERP sidebar. The ERP signs a 60-second, single-use HMAC-SHA256 token with the user's email; the portal matches an existing active user by email (never creates one) and starts a normal session. By decision, this path trusts the ERP sign-in completely and skips the portal password and TOTP, so its security depends on the ERP's authentication and on the shared `ERP_SSO_SECRET`. This is acceptable because ERP sign-in uses Microsoft SSO with the Microsoft Authenticator enforced; if the ERP ever allows sign-in without enforced MFA (e.g. plain email/password), restore portal TOTP on this path. It is disabled when that secret is not set. Each ERP sign-in is audited as "Signed in via ERP".

## Locks and audit

Opening a parent or child obtains an exclusive 10-minute lock. Another user cannot open the same record while the lock is active. Closing releases it. Expiry handles abandoned sessions; Admin can unlock and that override is audited. Separate siblings have separate locks. All mutations are serialized by PostgreSQL row-level transaction locking, including permanent sequence allocation and duplicate validation.

Audit tracks actor, timestamp, action, entity, company and relevant reason/details. Admin reads it on its own Audit Log page in the sidebar (newest first, searchable, read-only). Earlier budget revisions and request stage actions remain. The database administrator can edit storage outside the application; this is an application audit trail, not an externally sealed ledger.

## Pages and documents

Dashboard: all defined financial and workflow KPIs, company/project scope, group view, project comparisons, category balances, recent activity and export.

Dashboard trends: year-to-date, one point per calendar month (UTC) from 1 January to today; the current month runs to today, and the last value always equals the figure shown. Total Approved Budget, Budget Utilized and Available Budget share one main card with a combined chart on a zero-based scale: approved budget and utilized as lines, available as the band between them, with a legend and month labels. Paid, Outstanding Payments, On Hold and Balance Payments Pending each show a single line beside the figure. The period is given in each chart's tooltip and accessible summary, not as tile text. Trends follow the selected company and project, and are rebuilt only from dated records: order commitment dates, dated budget revisions, each payment request's final approval and payment times, and the audit trail's hold, release, payment and rejection events; Available = Approved Budget − Budget Utilized and Balance Payments Pending = Budget Utilized − all approved payment requests at each date. A budget's creation date is not recorded, so a budget counts from 1 January; an order amended after commitment counts at its current value from its commitment date; a request on hold with no recorded hold event counts as held from its latest Finance remark. No figures are estimated.

Requests: all parent and child records, My action queue and Not received by Finance; date/company/project/status filters. Date and status apply to payment lists; commitment tab is the current full position.

Master Data, User Manager, Admin Settings. Settings allow number format changes using {YYYY} and {SEQ}; sequence is never editable/resettable.

View Payment Request displays a printable A4 document including main details, child amount and terms, requester, current child approvals and dates, status, prior paid instalments and Finance remarks/payment details. Print/Save as PDF uses the browser.

## Initial implementation choices and limits

- PDF supporting is mandatory at parent creation and each payment completion. Combined parent supporting limit: 2 MB; each child payment PDF: 2 MB. These explicit release limits keep uploads below serverless request limits.
- PDF contents are stored in PostgreSQL for the first testing release; they are fetched only by an authorised, lock-owning user and omitted from general state responses. Move to private object storage before substantial document volume.
- Data is persisted as a JSONB workspace under one transactional lock: simple and atomic for initial testing, with limited high-volume concurrency. Normalised storage and incremental queries can be introduced after testing.
- The demo is not a secure multi-user service and never writes to the live database.
- No live financial data is preloaded. Demo names, figures, references and evidence are samples.
