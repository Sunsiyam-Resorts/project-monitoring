# CSV and Excel imports

Use **Import CSV / Excel** in Master Data (Admin for every type; Finance for suppliers only) or on the Requests tab (Finance and Admin). Download the template for the selected type, fill it, upload it, then choose **Validate and preview**. Review the displayed values and choose **Import records**. No records are saved during preview. The server validates again at confirmation; any error rejects the entire batch, without consuming reference numbers.

Imports create new records only, apart from payment updates (below). Edit existing masters through their normal forms, including mandatory reasons and preserved history for budget revisions. Currency imports cannot replace configured currencies. Imports cannot set request numbers, actors, statuses, approvals, payment history or commitment flags.

## File format

- UTF-8 CSV with comma separators, or `.xlsx` with exactly one populated worksheet. CSV supports quoted commas, quotes and line breaks. Legacy `.xls` is unsupported.
- Keep all template headings, including optional fields; column order and heading case may vary. Leave optional cells blank. Unknown or duplicate headings are rejected.
- Up to 100 records and a 2 MB spreadsheet per batch. XLSX expanded content is limited to 20 MB and 500 archive entries. Use plain cells without formulas, hyperlinks or rich text.
- Company/project fields accept a unique existing name, short code or ID. Project lookup is scoped to its company; budget lookup is scoped to that project. Supplier, approved budget and category names must match existing Master Data. Ambiguous references fail validation.
- Currency fields use configured three-letter codes. Numbers use a decimal point with no thousands separators or currency symbols. Dates are day first, `DD/MM/YYYY` (for example `23/11/2026`; a one-digit day or month such as `3/4/2026` is accepted) and are stored as `YYYY-MM-DD`. Native Excel date cells are supported, and the Excel template formats its date column as `dd/mm/yyyy`. A CSV saved from Excel uses the computer's regional date format, so check that it is day first before importing.
- Imports retain the signed-in user's company access and team. Demo imports remain fictional, browser-local records; demo role switching is only a testing tool.

## Master fields

| Import | Columns |
| --- | --- |
| Companies | Name, Short code |
| Projects | Name, Short code, Company |
| Suppliers | Name, Email (optional) |
| Currencies | Name, Currency code, Currency units per USD 1 |
| Budgets | Name, Company, Project, Budget currency, Categories |

For **Categories**, enter `Category name:amount | Other category:amount` in one cell. All amounts use the budget currency. Category names must be unique and amounts positive. Short codes and currency rates follow the same validation as the website. Import companies, currencies and suppliers before dependent projects/budgets/requests.

## Request fields

**New requests with first payment:** Company, Project, Approved budget, Supplier, PO number, Invoice number (optional), Currency, Full order amount, Description, Budget category allocations, Supporting PDFs, Payment request date, Payment currency, Payment request %, Payment Amount, Payment terms.

Use `Category name:amount | Other category:amount` for **Budget category allocations**, in the original order currency. The allocations must equal the full order amount. Existing duplicate PO and supplier/invoice rules apply across the entire batch and existing records.

Attach supporting PDFs using the import dialog and put their exact filenames in **Supporting PDFs**, separated by `|`. Each referenced name must match exactly one attachment. The combined attachments for the entire batch must fit within 2 MB. There is no fetching of file paths or external URLs. Evidence remains attached to each imported parent.

Fill **either Payment Amount or Payment request %**, leaving the other blank. A percentage is entered as `30` for 30%, using a plain numeric Excel cell. The other value is calculated using the same saved conversion rules as manual creation. Blank payment date defaults to today's Maldives date, blank payment currency to the order currency, and blank terms to the normal website default. Each imported payment request goes straight to Finance, as when it is created one by one, and the first one commits its order (Revision 4).

**Additional payment requests:** Main request number, Payment request date, Payment currency, Payment request %, Payment Amount, Payment terms. Use the existing main request reference. Only the original requester with matching team/company access can add children, subject to record locks and the remaining order balance. Each imported child starts its own independent approval workflow after manual submission.

## Payment updates by reference

**Payment updates by reference** (Requests tab, Finance and Admin) records payments, holds and rejections for existing payment requests in one file instead of one by one. Each payment request is found by its system-generated reference, the payment request number shown on the Requests page (for example `FLR-VU-PAY-000001`).

Columns: Payment request reference, Main request number, Supplier, Currency, Amount, Current status, New status, Payment type, Payment date, Remark.

- **The template comes filled in.** It lists every payment request you can process now (with Finance or On Hold, up to 1,000), by reference, with its main request, supplier, currency, amount and current status. Those context columns are for reading only and the import ignores them. The Excel template offers New status and Payment type as drop-down lists.
- **Fill in New status on the rows to change** (up to 100 per file) and leave it blank on the rest; blank rows are skipped. A file with no New status filled in is refused.
- **Paid** needs Payment type (`Cheque`, `Transfer` or `TT`) and Payment date (`DD/MM/YYYY`, no later than today). A request On Hold is released first. A Remark, if given, is recorded as a Finance remark before the payment.
- **On Hold** and **Rejected** need a Remark, which becomes the reason; leave Payment type and Payment date blank. A request already On Hold cannot be put on hold again.
- Status and type values ignore case. Only payment requests with Finance or On Hold can be updated.
- Each row becomes the ordinary actions (release, remark, pay, hold, reject) with their usual checks: company access, the record lock, and separation of duties (a Finance user never processes a request they raised; Admin may). Each action is audited as if taken one by one, and any failing row rejects the whole file.

## Verification

`npm test` in `frontend/` covers real XLSX serialization/loading, CSV quoting and headings, DOM file upload/preview/confirmation, atomic rollback, access restrictions, locks, evidence, preserved history and payment requests created with Finance; the Go parity test in `backend/` replays the recorded import commands against the server's rules. `npm run build` bundles ExcelJS into its own lazily loaded file. Excel parsing runs locally in the browser; the live API receives plain rows and PDF attachments and enforces workflow rules in the existing PostgreSQL transaction.

ExcelJS is lazy-loaded only when an Excel import/template is used. Its npm dependency tree currently reports moderate advisories in Node archiving/glob and legacy UUID APIs; this feature uses the browser bundle's workbook reader/writer, not those Node archiving APIs or UUID buffer APIs. Recheck these advisories when updating the dependency. Production PostgreSQL integration still needs the connected-service acceptance checks in DEPLOYMENT.md.
