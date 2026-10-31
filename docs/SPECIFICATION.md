# Approved workflow — first review release

The approved first-review contract is documented in [REVIEW-1.md](REVIEW-1.md). It supersedes the earlier testing-release rules below where they differ, including Planning approvals, financial calculations, amendments, payment deletion, numbering and currencies.

# Approved workflow — testing release 0.1

## Repository and scope

Only `abuney9/sun-siyam-project-monitoring` may be used, plus the ERP repository `Sunsiyam-Resorts/rene-next` for the ERP single sign-on link only. No other repository, including Test1, may be accessed or changed. GitHub is the source repository; the portal is self-hosted on the internal server at 130.3 behind HTTPS. Physical project progress and milestones are deferred.

## Master structure

Company (also referred to as property) → Project → Approved Budget → Categories and approved amounts. Company is the portal label. Admin maintains these, shared supplier master and currencies. Budget currency is USD. Currency rates represent currency units per USD 1: USD 1, MVR 15.42. Other currencies can be added. Rates are saved with an order to keep historical reporting stable. No FX gain/loss model in this release.

## Parent and children

The main request is an order anchor and is not approved. It holds company, project, approved budget, supplier, PO number, optional invoice number, description, currency, full amount, multiple category allocations, team and supporting PDFs. Allocations in order currency must sum to the full amount. One parent covers one project and one budget, with multiple categories within that budget.

Each child payment request has a permanent generated number, request date, percentage of the original full amount, calculated exact amount, terms, requester, independent status, approval history, Finance remarks and its own payment evidence. No due date. The same parent information is reused for further part or balance requests. Paid + non-rejected pending requests cannot exceed the order total. Rejected requests release their reserved instalment amount.

## Approval and correction

Purchasing: Requester → Reviewer (Checked By) → Approver Level 1 → Approver Level 2 → Finance.

Planning: Requester → Reviewer → Approver Level 1 → Finance.

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

Single role per user: Requester, Reviewer, Approver, Finance, Viewer, Admin. Users have explicit company access or full group access. Full group users can inspect all companies and projects; role still controls actions. Admin manages all configuration. Master data, User Manager and Settings are Admin-only in this release. Requesters see and create their team's requests within company access; they can edit their own drafts only. Group scope updates automatically when new companies are added.

Admin creates username, email and initial password (minimum 12 characters). Sign-in requires password plus mandatory authenticator TOTP. First sign-in enrols TOTP after successful password verification. Email OTP resets password without removing TOTP. Sessions are revoked on password reset, Admin user changes and logout. Recovery from a lost authenticator needs an operational policy before wider rollout; there is no insecure bypass button.

ERP single sign-on: users signed in to the ERP open the portal from the ERP sidebar. The ERP signs a 60-second, single-use HMAC-SHA256 token with the user's email; the portal matches an existing active user by email (never creates one) and starts a normal session. By decision, this path trusts the ERP sign-in completely and skips the portal password and TOTP, so its security depends on the ERP's authentication and on the shared `ERP_SSO_SECRET`. This is acceptable because ERP sign-in uses Microsoft SSO with the Microsoft Authenticator enforced; if the ERP ever allows sign-in without enforced MFA (e.g. plain email/password), restore portal TOTP on this path. It is disabled when that secret is not set. Each ERP sign-in is audited as "Signed in via ERP".

## Locks and audit

Opening a parent or child obtains an exclusive 10-minute lock. Another user cannot open the same record while the lock is active. Closing releases it. Expiry handles abandoned sessions; Admin can unlock and that override is audited. Separate siblings have separate locks. All mutations are serialized by PostgreSQL row-level transaction locking, including permanent sequence allocation and duplicate validation.

Audit tracks actor, timestamp, action, entity, company and relevant reason/details. Earlier budget revisions and request stage actions remain. The database administrator can edit storage outside the application; this is an application audit trail, not an externally sealed ledger.

## Pages and documents

Dashboard: all defined financial and workflow KPIs, company/project scope, group view, project comparisons, category balances, recent activity and export.

Requests: all parent and child records, My action queue and Not received by Finance; date/company/project/team/status filters. Date and status apply to payment lists; commitment tab is the current full position.

Master Data, User Manager, Admin Settings. Settings allow number format changes using {YYYY} and {SEQ}; sequence is never editable/resettable.

View Payment Request displays a printable A4 document including main details, child amount and terms, requester, current child approvals and dates, status, prior paid instalments and Finance remarks/payment details. Print/Save as PDF uses the browser.

## Initial implementation choices and limits

- PDF supporting is mandatory at parent creation and each payment completion. Combined parent supporting limit: 2 MB; each child payment PDF: 2 MB. These explicit release limits keep uploads below serverless request limits.
- PDF contents are stored in PostgreSQL for the first testing release; they are fetched only by an authorised, lock-owning user and omitted from general state responses. Move to private object storage before substantial document volume.
- Data is persisted as a JSONB workspace under one transactional lock: simple and atomic for initial testing, with limited high-volume concurrency. Normalised storage and incremental queries can be introduced after testing.
- The demo is not a secure multi-user service and never writes to the live database.
- No live financial data is preloaded. Demo names, figures, references and evidence are samples.
