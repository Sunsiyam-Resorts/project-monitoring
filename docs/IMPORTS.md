# CSV and Excel imports

Use **Import CSV / Excel** in Master Data (Admin) or on the Requests tab (Requester). Download the template for the selected type, fill it, upload it, then choose **Validate and preview**. Review the displayed values and choose **Import records**. No records are saved during preview. The server validates again at confirmation; any error rejects the entire batch, without consuming reference numbers.

Imports create new records only. Edit existing masters through their normal forms, including mandatory reasons and preserved history for budget revisions. Currency imports cannot replace configured currencies. Imports cannot set request numbers, actors, statuses, approvals, payment history or commitment flags.

## File format

- UTF-8 CSV with comma separators, or `.xlsx` with exactly one populated worksheet. CSV supports quoted commas, quotes and line breaks. Legacy `.xls` is unsupported.
- Keep all template headings, including optional fields; column order and heading case may vary. Leave optional cells blank. Unknown or duplicate headings are rejected.
- Up to 100 records and a 2 MB spreadsheet per batch. XLSX expanded content is limited to 20 MB and 500 archive entries. Use plain cells without formulas, hyperlinks or rich text.
- Company/project fields accept a unique existing name, short code or ID. Project lookup is scoped to its company; budget lookup is scoped to that project. Supplier, approved budget and category names must match existing Master Data. Ambiguous references fail validation.
- Currency fields use configured three-letter codes. Numbers use a decimal point with no thousands separators or currency symbols. Dates use `YYYY-MM-DD`; native Excel date cells are supported.
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

Fill **either Payment Amount or Payment request %**, leaving the other blank. A percentage is entered as `30` for 30%, using a plain numeric Excel cell. The other value is calculated using the same saved conversion rules as manual creation. Blank payment date defaults to today's Maldives date, blank payment currency to the order currency, and blank terms to the normal website default. Each new parent is unapproved and its first payment is a Draft with no approvals.

**Additional payment requests:** Main request number, Payment request date, Payment currency, Payment request %, Payment Amount, Payment terms. Use the existing main request reference. Only the original requester with matching team/company access can add children, subject to record locks and the remaining order balance. Each imported child starts its own independent approval workflow after manual submission.

## Verification

`npm test` covers real XLSX serialization/loading, CSV quoting and headings, DOM file upload/preview/confirmation, atomic rollback, access restrictions, locks, evidence, preserved history and draft creation. `npm run build` copies the locally installed ExcelJS browser bundle and license into static assets. Excel parsing runs locally in the browser; the live API receives plain rows and PDF attachments and enforces workflow rules in the existing PostgreSQL transaction.

ExcelJS is lazy-loaded only when an Excel import/template is used. Its npm dependency tree currently reports moderate advisories in Node archiving/glob and legacy UUID APIs; this feature uses the browser bundle's workbook reader/writer, not those Node archiving APIs or UUID buffer APIs. Recheck these advisories when updating the dependency. Production PostgreSQL/Vercel integration still needs the connected-service acceptance checks in DEPLOYMENT.md.
