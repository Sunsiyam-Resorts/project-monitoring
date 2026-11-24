package domain

// Port of frontend/src/domain/import-data.js (the parts the server uses): spreadsheet
// rows become ordinary commands, applied to a copy of the state so that an import
// succeeds or fails as a whole.

import (
	"math"
	"slices"
	"strconv"
	"strings"
)

// ImportFields are the template columns of each import type.
var ImportFields = map[string][]string{
	"companies":  {"Name", "Short code"},
	"projects":   {"Name", "Short code", "Company"},
	"suppliers":  {"Name", "Email"},
	"currencies": {"Name", "Currency code", "Currency units per USD 1"},
	"budgets":    {"Name", "Company", "Project", "Budget currency", "Categories"},
	"orders": {"Company", "Project", "Approved budget", "Supplier", "PO number", "Invoice number", "Currency",
		"Full order amount", "Description", "Budget category allocations", "Supporting PDFs",
		"Payment request date", "Payment currency", "Payment request %", "Payment Amount", "Payment terms"},
	"payments": {"Main request number", "Payment request date", "Payment currency", "Payment request %", "Payment Amount", "Payment terms"},
	// Updates existing payment requests found by their system-generated reference. Main
	// request number to Current status are read-only context from the template and ignored.
	"paymentUpdates": {"Payment request reference", "Main request number", "Supplier", "Currency", "Amount",
		"Current status", "New status", "Payment type", "Payment date", "Remark"},
}

var (
	paymentUpdateStatuses = []string{"Paid", "On Hold", "Rejected"}
	paymentTypes          = []string{"Cheque", "Transfer", "TT"}
)

// importFields[kind] also finds Object.prototype members in JavaScript; their function
// lengths decide what happens next (__proto__ has none).
var objectPrototype = map[string]int{
	"constructor": 1, "__defineGetter__": 2, "__defineSetter__": 2, "hasOwnProperty": 1,
	"__lookupGetter__": 1, "__lookupSetter__": 1, "isPrototypeOf": 1, "propertyIsEnumerable": 1,
	"toString": 0, "valueOf": 0, "toLocaleString": 0, "__proto__": -1,
}

type importType struct {
	fields []string
	found  bool
	length int // Object.prototype member: function length, -1 for undefined
}

func importTypeOf(kind any) importType {
	key := toString(kind)
	if f, ok := ImportFields[key]; ok {
		return importType{fields: f, found: true}
	}
	if n, ok := objectPrototype[key]; ok {
		return importType{found: true, length: n}
	}
	return importType{}
}

func importNorm(v any) string { return lower(collapseSpace(jsTrim(toString(coalesce(v, ""))))) }

func importFind[T any](records []*T, value any, label string) *T {
	want := importNorm(value)
	var matches []*T
	for _, rec := range records {
		for _, k := range []string{"id", "name", "code", "number"} {
			if x := field(rec, k); truthy(x) && importNorm(x) == want {
				matches = append(matches, rec)
				break
			}
		}
	}
	need(truthy(value) && len(matches) == 1, "Select a unique "+label+" by name, code or reference")
	return matches[0]
}

// importNumberShape is /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s).
func importNumberShape(s string) bool {
	intPart := len(s) - len(strings.TrimLeft(s, "0123456789"))
	rest := s[intPart:]
	if rest == "" {
		return intPart > 0
	}
	if rest[0] != '.' {
		return false
	}
	frac := rest[1:]
	return strings.Trim(frac, "0123456789") == "" && (intPart > 0 || frac != "")
}

func importPositive(value any, label string) float64 {
	n := toNumber(value)
	need(importNumberShape(toString(value)) && n > 0 && !math.IsInf(n, 0),
		label+" must be a positive number without currency symbols or thousands separators")
	return n
}

type importCategory struct {
	name   string
	amount float64
}

func importCategories(value any) []importCategory {
	s, ok := value.(string)
	if !ok {
		if nullish(value) {
			throw("Cannot read properties of " + nullName(value) + " (reading 'split')")
		}
		throw("value.split is not a function")
	}
	var out []importCategory
	for _, part := range strings.Split(s, "|") {
		at := strings.LastIndex(part, ":")
		need(at > 0, "Use Category:amount | Category:amount")
		out = append(out, importCategory{jsTrim(part[:at]), importPositive(jsTrim(part[at+1:]), "Category amount")})
	}
	return out
}

// upperOf is expr.toUpperCase() for a dynamic value.
func upperOf(v any, expr string) string {
	s, ok := v.(string)
	if !ok {
		if nullish(v) {
			throw("Cannot read properties of " + nullName(v) + " (reading 'toUpperCase')")
		}
		throw(expr + ".toUpperCase is not a function")
	}
	return upper(s)
}

func kindIs(kind any, names ...string) bool {
	k, ok := kind.(string)
	return ok && slices.Contains(names, k)
}

// importDate converts an import's day-first DD/MM/YYYY date (day and month may be one digit)
// to the stored YYYY-MM-DD. A blank date stays blank.
func importDate(value any, label string) string {
	s := jsTrim(toString(coalesce(value, "")))
	if s == "" {
		return ""
	}
	parts := strings.Split(s, "/")
	digits := func(p string, min, max int) bool {
		if len(p) < min || len(p) > max {
			return false
		}
		for i := 0; i < len(p); i++ {
			if !isDigit(p[i]) {
				return false
			}
		}
		return true
	}
	ok := len(parts) == 3 && digits(parts[0], 1, 2) && digits(parts[1], 1, 2) && digits(parts[2], 4, 4)
	var d, m, y int
	if ok {
		d, _ = strconv.Atoi(parts[0])
		m, _ = strconv.Atoi(parts[1])
		y, _ = strconv.Atoi(parts[2])
	}
	days := 31
	switch m {
	case 2:
		days = 28
		if y%4 == 0 && (y%100 != 0 || y%400 == 0) {
			days = 29
		}
	case 4, 6, 9, 11:
		days = 30
	}
	need(ok && m >= 1 && m <= 12 && d >= 1 && d <= days,
		label+" must be a real date written DD/MM/YYYY, for example 23/11/2026 (found "+s+")")
	pad := func(p string) string {
		if len(p) == 1 {
			return "0" + p
		}
		return p
	}
	return parts[2] + "-" + pad(parts[1]) + "-" + pad(parts[0])
}

func importCell(v any) string { return jsTrim(toString(coalesce(v, ""))) }

func importOneOf(value any, options []string, label string) string {
	want := importNorm(value)
	for _, o := range options {
		if importNorm(o) == want {
			return o
		}
	}
	throw(label + " must be one of " + strings.Join(options, ", "))
	return ""
}

// paymentUpdate turns a payment update row into the ordinary request actions Finance would
// take one by one: Paid releases a hold first and records the remark, if any, before the
// payment; On Hold and Rejected need the remark as their reason.
func paymentUpdate(s *State, v any) map[string]any {
	q := importFind(filter(s.Requests, func(x *Request) bool { return x.Deleted == nil }), get(v, "Payment request reference"), "payment request")
	need(strIn(q.Status, "Finance", "On Hold"), tpl(q.Number)+" is "+tpl(q.Status)+"; only payment requests with Finance or On Hold can be updated")
	status := importOneOf(get(v, "New status"), paymentUpdateStatuses, "New status")
	remark, id := importCell(get(v, "Remark")), dynString(q.ID)
	steps := []any{}
	if status == "Paid" {
		paymentType := importOneOf(get(v, "Payment type"), paymentTypes, "Payment type")
		paymentDate := importDate(get(v, "Payment date"), "Payment date")
		need(paymentDate != "", "Enter the Payment date")
		if is(q.Status, "On Hold") {
			steps = append(steps, map[string]any{"type": "request.resume", "id": id})
		}
		if remark != "" {
			steps = append(steps, map[string]any{"type": "request.remark", "id": id, "data": map[string]any{"reason": remark}})
		}
		steps = append(steps, map[string]any{"type": "request.pay", "id": id, "data": map[string]any{"paymentType": paymentType, "paymentDate": paymentDate}})
	} else {
		need(!(status == "On Hold" && is(q.Status, "On Hold")), tpl(q.Number)+" is already On Hold")
		need(importCell(get(v, "Payment type")) == "" && importCell(get(v, "Payment date")) == "",
			"Leave Payment type and Payment date blank when New status is "+status)
		need(remark != "", "Enter a Remark giving the reason for "+status)
		typ := "request.reject"
		if status == "On Hold" {
			typ = "request.hold"
		}
		steps = append(steps, map[string]any{"type": typ, "id": id, "data": map[string]any{"reason": remark}})
	}
	return map[string]any{"type": "import.update", "id": id, "steps": steps}
}

// importCommand turns one row's values into the command that creates the record.
func (r *Rules) importCommand(s *State, u *User, kind, v, files any) map[string]any {
	t := importTypeOf(kind)
	need(t.found, "Invalid import type")
	keys := keysOf(v)
	columns := false
	switch {
	case t.fields != nil:
		columns = len(keys) == len(t.fields)
		for _, k := range keys {
			columns = columns && slices.Contains(t.fields, k)
		}
	case t.length >= 0 && len(keys) == t.length:
		if len(keys) > 0 {
			throw("importFields[kind].includes is not a function")
		}
		columns = true
	}
	need(columns, "Use the template columns only")
	payment := func() map[string]any {
		amount, percent := get(v, "Payment Amount"), get(v, "Payment request %")
		need(truthy(amount) || truthy(percent), "Enter Payment Amount or Payment request %")
		p := map[string]any{"date": importDate(get(v, "Payment request date"), "Payment request date"), "currency": get(v, "Payment currency"), "terms": get(v, "Payment terms")}
		if truthy(amount) {
			p["amount"] = importPositive(amount, "Payment Amount")
		}
		if truthy(percent) {
			p["percent"] = importPositive(percent, "Payment request %")
		}
		// One input avoids silently accepting conflicting amount/percentage values.
		need(!(truthy(member(p, "amount")) && truthy(member(p, "percent"))), "Fill either Payment Amount or Payment request %, leaving the other blank")
		return p
	}
	if kindIs(kind, "payments") {
		o := importFind(filter(s.Orders, func(o *Order) bool { return o.Deleted == nil }), get(v, "Main request number"), "main request")
		data := map[string]any{"orderId": dynString(o.ID)}
		for k, x := range payment() {
			data[k] = x
		}
		return map[string]any{"type": "request.create", "data": data}
	}
	if kindIs(kind, "paymentUpdates") {
		return paymentUpdate(s, v)
	}
	var company *Company
	var project *Project
	if kindIs(kind, "projects", "budgets", "orders") {
		company = importFind(s.Companies, get(v, "Company"), "company")
	}
	if kindIs(kind, "budgets", "orders") {
		project = importFind(filter(s.Projects, func(p *Project) bool { return sameStr(p.CompanyID, company.ID) }), get(v, "Project"), "project")
	}
	if kindIs(kind, "orders") {
		budget := importFind(filter(s.Budgets, func(b *Budget) bool {
			return sameStr(b.ProjectID, project.ID) && sameStr(b.CompanyID, company.ID)
		}), get(v, "Approved budget"), "approved budget")
		// Supporting PDFs are optional; a blank cell attaches none.
		listed := jsTrim(toString(coalesce(get(v, "Supporting PDFs"), "")))
		var names []string
		if listed != "" {
			for _, n := range strings.Split(listed, "|") {
				names = append(names, jsTrim(n))
			}
		}
		need(!slices.Contains(names, ""), "Separate supporting PDF names with |")
		data := map[string]any{"companyId": dynString(company.ID), "projectId": dynString(project.ID), "budgetId": dynString(budget.ID)}
		data["supplierId"] = field(importFind(s.Suppliers, get(v, "Supplier"), "supplier"), "id")
		data["po"], data["invoice"] = get(v, "PO number"), get(v, "Invoice number")
		data["currency"] = upperOf(get(v, "Currency"), "v.Currency")
		data["total"] = importPositive(get(v, "Full order amount"), "Full order amount")
		data["description"] = get(v, "Description")
		var allocations []any
		for _, c := range importCategories(get(v, "Budget category allocations")) {
			category := importFind(budget.Categories, c.name, "budget category")
			allocations = append(allocations, map[string]any{"categoryId": field(category, "id"), "amount": c.amount})
		}
		data["allocations"] = allocations
		attached := []any{}
		for _, name := range names {
			var matches []any
			for _, f := range files.([]any) {
				if strictEqual(get(f, "name"), name) {
					matches = append(matches, f)
				}
			}
			need(len(matches) == 1, "Attach exactly one PDF named "+name)
			attached = append(attached, matches[0])
		}
		data["files"] = attached
		data["payment"] = payment()
		return map[string]any{"type": "order.create", "data": data}
	}
	record := map[string]any{"name": get(v, "Name")}
	if company != nil {
		record["companyId"] = dynString(company.ID)
	}
	if project != nil {
		record["projectId"] = dynString(project.ID)
	}
	if kindIs(kind, "companies", "projects") {
		record["code"] = get(v, "Short code")
	}
	if kindIs(kind, "suppliers") {
		email := get(v, "Email")
		need(!truthy(email) || validEmail(toString(email)), "Enter a valid supplier email")
		record["email"] = email
	}
	if kindIs(kind, "currencies") {
		record["id"] = upperOf(get(v, "Currency code"), "v.Currency code")
		id := importNorm(record["id"])
		need(!slices.ContainsFunc(s.Currencies, func(c *Currency) bool { return importNorm(dynString(c.ID)) == id }),
			"Currency already exists; edit it using Master Data")
		record["rate"] = importPositive(get(v, "Currency units per USD 1"), "Currency rate")
	}
	if kindIs(kind, "budgets") {
		name := importNorm(record["name"])
		need(!slices.ContainsFunc(s.Budgets, func(b *Budget) bool { return sameStr(b.ProjectID, project.ID) && importNorm(dynString(b.Name)) == name }),
			"Budget already exists; revise it using Master Data")
		record["currency"] = upperOf(get(v, "Budget currency"), "v.Budget currency")
		var categories []any
		for _, c := range importCategories(get(v, "Categories")) {
			categories = append(categories, map[string]any{"name": c.name, "amount": c.amount, "id": r.randomID()})
		}
		record["categories"] = categories
	}
	if kindIs(kind, "projects") {
		name := importNorm(record["name"])
		need(!slices.ContainsFunc(s.Projects, func(p *Project) bool {
			return sameStr(p.CompanyID, company.ID) && importNorm(dynString(p.Name)) == name
		}),
			"Project name already exists in this company")
	}
	return map[string]any{"type": "master.save", "data": map[string]any{"kind": kind, "record": record}}
}

// importRecords is import.preview and import.create.
func (r *Rules) importRecords(s *State, u *User, a any, typ string, now int64) {
	data := or(get(a, "data"), map[string]any{})
	kind, rows, files := get(data, "kind"), get(data, "rows"), get(data, "files")
	if isUndefined(files) {
		files = []any{}
	}
	need(u != nil && activeUser(u), "Active user required")
	need(importTypeOf(kind).found, "Invalid import type")
	allowed := is(roleOf(u), "Admin")
	if kindIs(kind, "orders", "payments") {
		allowed = canCreateRequests(u)
	} else if kindIs(kind, "suppliers", "paymentUpdates") {
		allowed = isFinanceAdmin(u)
	}
	need(allowed, "Your role cannot import these records")
	list, ok := rows.([]any)
	need(ok && len(list) > 0 && len(list) <= 100, "Import between 1 and 100 records")
	_, ok = files.([]any)
	need(ok && utf16Len(string(Marshal(files))) <= 2800000, "Combined supporting PDFs must not exceed 2 MB")
	next := clone(s)
	var errs []string
	for index, row := range list {
		err := capture(func() {
			cmd := r.importCommand(next, u, kind, get(row, "values"), files)
			// Payment creation keeps the ordinary lock contract of its parent, and a payment
			// update that of its payment request: the row locks the record, then restores
			// whoever had it.
			var lockID any = Undefined
			steps := []any{cmd}
			switch cmd["type"] {
			case "request.create":
				lockID = get(cmd["data"], "orderId")
			case "import.update":
				lockID, steps = cmd["id"], cmd["steps"].([]any)
			}
			locked := truthy(lockID)
			var previous *Lock
			if locked {
				if next.Locks != nil {
					previous = next.Locks[lockKey(lockID)]
				}
				r.apply(next, u, map[string]any{"type": "lock", "id": lockID}, now)
			}
			// A payment update is one or more ordinary request actions, each checked and audited.
			for _, step := range steps {
				r.apply(next, u, step, now)
			}
			if locked {
				if previous != nil {
					next.Locks[lockKey(lockID)] = previous
				} else {
					r.apply(next, u, map[string]any{"type": "unlock", "id": lockID}, now)
				}
			}
		})
		if err != nil {
			line := get(row, "line")
			label := numberToString(float64(index + 2))
			if truthy(line) {
				label = toString(line)
			}
			errs = append(errs, "Row "+label+": "+message(err))
		}
	}
	need(len(errs) == 0, strings.Join(errs, "\n"))
	if typ == "import.create" {
		r.audit(next, u, "import.create", kind, Undefined, numberToString(float64(len(list)))+" records imported", now)
		*s = *next
	}
}

func message(err error) string {
	if e, ok := err.(*Error); ok {
		return e.Message
	}
	return err.Error()
}
