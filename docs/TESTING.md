# First portal review

## Handover history and authenticator checks

- As Admin or Finance, use New Request. Save and submit a draft (it goes straight to Finance), add a further payment to an existing requester's order, propose an amendment and supply requested PDFs. A different Finance user, or Admin, processes a request Finance raised.
- As Admin or Finance, preview and confirm an order import; import additional payments for existing orders. Preview must not save records, and failed batches must preserve all existing records and counters.
- In a browser where `crypto.randomUUID` is unavailable, create an Approved Budget with several categories, save, then revise it. Verify category IDs remain stable and previous amounts remain in history. Repeat ordinary record creation and imports; the shared ID helper must use cryptographic random bytes without changing issued references.

- Open a payment's printable view after a return/correction/resubmission. Verify its current approvals, earlier decisions and reasons, order reference, and separate order/additional/payment document filenames appear. It records when the request was submitted to Finance.
- Open an order with approved, rejected and returned amendment attempts. Expand Amendment history and each saved version; check previous/proposed details, supplier, PO/invoice, budget/category allocations, totals, reasons and decision history. Download both the old and approved supporting PDFs. A missing/expired lock or inaccessible company must block downloads.
- Revise an MVR budget, then change the current MVR rate. Previous budget versions must display MVR amounts and USD equivalents using that version's saved rate. Legacy revisions without a currency default to USD.
- With a new actual account, enter the correct password. Choose Scan QR code, scan it in an authenticator, switch to Enter setup key, and verify the same key configures the same account. Switching methods must preserve any entered verification code. Complete enrollment with a valid six-digit code. Subsequent sign-ins must show only code verification, without offering enrollment again. Back to sign in must remove enrollment material from the page.
- Review DATABASE.md and database-example.sql before changing database structure. The SQL file may be run against an isolated development database; Admin and workspace bootstrap remain application responsibilities.

All demo records and uploaded demo changes remain in the current browser. Start with **Explore demo workspace**. The top role selector simulates users; real authentication is separate.

1. As Admin, inspect all five pages. Test group/company/project dashboards. Review category balances and export summary.
2. Under Master Data, add a company and project, then an approved budget with several USD categories. Add a supplier and currency. Revise a budget and check the old amounts and reason are preserved.
3. Switch to Project Requester. Create a parent with one company/project/budget, supplier, unique PO/invoice, full amount, category allocations and a PDF. Open it and create a 30% child payment request. Submit it to Finance.
4. Switch to Finance Officer. The child is in the Finance tab and Finance payments shortcut; there is no approval step.
5. Verify the parent full amount is committed, although only 30% was requested. Finance's Not received by Finance tab should show the remaining 70%.
6. Switch to Finance Officer. Add a remark, put the child on hold with a reason, release the hold, and record the exact payment with date/type and a PDF.
7. Return to the original Requester and create another part or the remaining balance under the same parent. Verify independent empty approvals and no double commitment.
8. As Finance Officer, open Projects, open a project, add a task, change a task status inline and delete one. Progress (Done ÷ all tasks) updates on the project page and the Projects list, and each change appears in the Audit Log. As Group Viewer the same pages show no task controls. On the project page, use New request (company, project and budget are preset) and use Payment request on an order with value left to request; the new payment request opens as a draft.
9. Return a child from Finance with a reason. Confirm it returns to requester Draft, allows correction, and resubmission goes straight back to Finance. Check earlier review history.
10. Try a duplicate parent PO in the same company from another requester; try the same invoice under the same supplier. Both should be blocked. A child reuses the parent's PO without duplicate warnings.
11. Allocate an order above a category budget. Confirm warning and instruction to inform Finance, with submission still allowed.
12. View Payment Request and Print / Save as PDF. Check names, dates, child approvals, terms, amount, main details and Finance information.
13. Switch to Group Viewer: all projects are visible, with no processing controls. Company-restricted users must not see companies outside their access.
14. Review numbering settings and record locks in Settings, and the Audit Log page. Reset sample data only when you want to discard browser-local demo edits.

Separate real-browser and connected-service acceptance checks are in DEPLOYMENT.md. Record requested adjustments against the relevant page and workflow step.

## Interface upgrade review

Review the same records at desktop (1440 px), tablet (1024/768 px) and mobile (390 px):

- Read the dashboard budget/available summary and its three commitment/payment totals. Open each operational shortcut and confirm the matching requests, including held payments in the Finance queue.
- Change company/project, expand Filters, search, sort by date/request number/USD amount and clear filters. Confirm scope and record counts.
- At mobile size, inspect request/order work items; scroll other financial tables horizontally without scrolling the whole page.
- Tab through navigation, filters, tables and dialogs. Verify current location, visible focus, Escape-to-close and focus return. Test native mandatory fields and server validation messages.
- On each form, check persistent labels, grouped sections and footer actions. On the main form, confirm the allocated amount readout matches your entered category amounts.
- Review the main order's documents and its linked children. Review a child instalment, approval progress, decision buttons, Finance remarks and expandable history. Permissions should match the original role/company rules.
- Check all five master forms, budget revision history, user creation/editing, numbering settings, locks, audit, password reset and TOTP screens.
- Open View Payment Request and use Print / Save as PDF. Inspect A4 pagination, full amounts, names, dates and the individual child's approvals.
- Enable reduced motion and zoom text to 200%; inspect overflow and controls in a real browser. These final visual checks were not available in the development environment.

## First review release acceptance

Use REVIEW-1.md as the current contract. Check these scenarios with separate test accounts:

1. Create an order and first 30% payment together. Confirm child Draft, no dashboard payment effect, 70% operational balance; then final-approve the child and confirm full Budget Utilized, 30% Outstanding and 70% dashboard Balance.
2. Raise the other 70% without approval: order leaves Balance Payments To Be Requested, remains expandable in Requests, dashboard balance remains 70%. Reject it and check the operational balance reopens.
3. Submitted requests leave requester My Actions and arrive only with Finance users who have access to that company (never the user who raised them).
4. Hold, release and pay an approved child. Holds move out of Outstanding into On Hold; releasing moves them back. Confirm Utilized = Paid + Outstanding + On Hold + Balance Payments Pending.
5. Request additional PDFs from Finance; requester uploads several files; request returns directly to Finance. Financial correction instead returns it to Draft for resubmission to Finance.
6. Try rejecting a paid child and a parent with active children: both must fail. Only Admin can Delete Payment with a reason; verify the supporting and payment details are removed, audit remains, and child returns to Pending Payment.
7. Amend shared text and total. Effective details must stay unchanged until the amendment's final approval. Reductions below reserved child amounts must fail; approved increases reopen the balance workflow.
8. On a USD order create an MVR child at 15.42. Test percent/amount in both directions, saved rates after currency-master changes, exact child-currency settlement, raw-currency subtotals and consolidated USD totals.
9. Check company/project short-code uniqueness, independent sequences, format changes without renumbering issued references, original-document PDFs and current printable payment request.
10. Review dashboard, all four tabs, dialogs and print at desktop/tablet/mobile sizes in a real browser. Verify no clipping, focus loss, nested-table overflow or print pagination defects.
