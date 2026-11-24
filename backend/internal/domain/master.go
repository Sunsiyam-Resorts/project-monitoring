package domain

import (
	"slices"
)

var masterKinds = []string{"companies", "projects", "budgets", "suppliers", "currencies"}

// masterList returns s[kind] as records.
func masterList(s *State, kind string) []any {
	var out []any
	add := func(n int, at func(int) any) {
		out = make([]any, n)
		for i := range out {
			out[i] = at(i)
		}
	}
	switch kind {
	case "companies":
		add(len(s.Companies), func(i int) any { return s.Companies[i] })
	case "projects":
		add(len(s.Projects), func(i int) any { return s.Projects[i] })
	case "budgets":
		add(len(s.Budgets), func(i int) any { return s.Budgets[i] })
	case "suppliers":
		add(len(s.Suppliers), func(i int) any { return s.Suppliers[i] })
	case "currencies":
		add(len(s.Currencies), func(i int) any { return s.Currencies[i] })
	}
	return out
}

// putMaster stores rec as s[kind][index], or appends it when index is -1.
func putMaster(s *State, kind string, index int, rec map[string]any) {
	switch kind {
	case "companies":
		s.Companies = put(s.Companies, index, decodeRecord[Company](rec))
	case "projects":
		s.Projects = put(s.Projects, index, decodeRecord[Project](rec))
	case "budgets":
		s.Budgets = put(s.Budgets, index, decodeRecord[Budget](rec))
	case "suppliers":
		s.Suppliers = put(s.Suppliers, index, decodeRecord[Supplier](rec))
	case "currencies":
		s.Currencies = put(s.Currencies, index, decodeRecord[Currency](rec))
	}
}

func put[T any](list []*T, index int, x *T) []*T {
	if index < 0 {
		return append(list, x)
	}
	list[index] = x
	return list
}

func member(m map[string]any, key string) any {
	if x, ok := m[key]; ok {
		return x
	}
	return Undefined
}

func isUpperAlnum(c byte) bool { return isUpperASCII(c) || isDigit(c) }

// saveMaster is master.save: companies, projects, budgets (with revisions), suppliers and
// currencies. The record is stored as sent, apart from the members the rules normalise.
func (r *Rules) saveMaster(s *State, u *User, d any, now int64) (entity, company, detail any) {
	need(isFinanceAdmin(u), "Finance or Admin required")
	kind, _ := get(d, "kind").(string)
	need(isString(get(d, "kind")) && slices.Contains(masterKinds, kind), "Invalid master type")
	need(slices.Contains(masterKindsOf(u), kind), "Finance can change suppliers only; other master data is Admin's")
	record := cloneDyn(get(d, "record"))
	need(text(get(record, "name")) != "", "Name required")
	rec := record.(map[string]any) // only an object can have a name
	list := masterList(s, kind)
	var prev any
	prevIndex := -1
	for i, x := range list {
		if strictEqual(field(x, "id"), member(rec, "id")) {
			prev, prevIndex = x, i
			break
		}
	}
	if kind == "companies" || kind == "projects" {
		code := norm(member(rec, "code"))
		rec["code"] = code
		need(allMatch(code, 2, 12, isUpperAlnum), "Short code must contain 2–12 letters or digits")
		need(!slices.ContainsFunc(list, func(x any) bool {
			return !strictEqual(field(x, "id"), member(rec, "id")) && strictEqual(field(x, "code"), code) &&
				(kind == "companies" || strictEqual(field(x, "companyId"), member(rec, "companyId")))
		}), "Short code already exists")
	}
	if kind == "companies" || kind == "suppliers" {
		name := norm(member(rec, "name"))
		need(!slices.ContainsFunc(list, func(x any) bool {
			return !strictEqual(field(x, "id"), member(rec, "id")) && norm(field(x, "name")) == name
		}), "Duplicate master name")
	}
	if kind == "projects" {
		need(slices.ContainsFunc(s.Companies, func(c *Company) bool { return strictEqual(dynString(c.ID), member(rec, "companyId")) }), "Select company")
	}
	if kind == "budgets" {
		r.checkBudget(s, u, d, rec, prev, now)
	}
	if kind == "currencies" {
		id := norm(member(rec, "id"))
		rec["id"] = id
		need(allMatch(id, 3, 3, isUpperASCII) && positive(toNumber(member(rec, "rate"))), "Currency must have a 3-letter code and positive rate")
		rec["rate"] = toNumber(member(rec, "rate"))
		need(id != "USD" || rec["rate"] == 1.0, "USD base rate must be 1")
	}
	if p, ok := prev.(*Project); ok && kind == "projects" {
		need(strictEqual(dynString(p.CompanyID), member(rec, "companyId")), "Project company cannot change")
	}
	if !truthy(member(rec, "id")) {
		rec["id"] = r.randomID()
	}
	rec["name"] = text(member(rec, "name"))
	putMaster(s, kind, prevIndex, rec)
	detail = kind + ": " + toString(rec["name"])
	if reason := get(d, "reason"); truthy(reason) {
		detail = detail.(string) + " — " + toString(reason)
	}
	return rec["id"], member(rec, "companyId"), detail
}

func (r *Rules) checkBudget(s *State, u *User, d any, rec map[string]any, prevRecord any, now int64) {
	need(slices.ContainsFunc(s.Projects, func(p *Project) bool {
		return strictEqual(dynString(p.ID), member(rec, "projectId")) && strictEqual(dynString(p.CompanyID), member(rec, "companyId"))
	}), "Select project and company")
	categories, ok := member(rec, "categories").([]any)
	need(ok && len(categories) > 0, "Add budget categories")
	names := map[string]bool{}
	for _, c := range categories {
		names[norm(get(c, "name"))] = true
	}
	need(len(names) == len(categories), "Category names must be unique")
	for _, c := range categories {
		need(text(get(c, "name")) != "" && positive(toNumber(get(c, "amount"))), "Category name and approved amount required")
	}
	want := or(member(rec, "currency"), "USD")
	var currency *Currency
	for _, c := range s.Currencies {
		if strictEqual(dynString(c.ID), want) {
			currency = c
			break
		}
	}
	need(currency != nil, "Select budget currency")
	rec["currency"] = dynString(currency.ID)
	prev, _ := prevRecord.(*Budget)
	if prev != nil && strictEqual(dynString(prev.Currency), rec["currency"]) {
		rec["rate"] = dynNumber(prev.Rate)
	} else {
		rec["rate"] = dynNumber(currency.Rate)
	}
	if prev == nil {
		rec["revisions"] = []any{}
		return
	}
	need(text(get(d, "reason")) != "", "Budget revision reason required")
	need(strictEqual(dynString(prev.CompanyID), member(rec, "companyId")) && strictEqual(dynString(prev.ProjectID), member(rec, "projectId")),
		"Budget company/project cannot change")
	if prev.Categories == nil {
		throw("Cannot read properties of undefined (reading 'every')")
	}
	for _, c := range prev.Categories {
		need(slices.ContainsFunc(categories, func(x any) bool { return strictEqual(get(x, "id"), dynString(c.ID)) }),
			"Keep existing categories when revising a budget")
	}
	revisions := []any{}
	if prev.Revisions != nil {
		revisions = toDyn(reflectValue(prev.Revisions)).([]any)
	}
	rec["revisions"] = append(revisions, map[string]any{
		"at":         isoString(now),
		"by":         dynString(u.Name),
		"reason":     text(get(d, "reason")),
		"currency":   dynString(prev.Currency),
		"rate":       dynNumber(prev.Rate),
		"categories": toDyn(reflectValue(prev.Categories)),
	})
}

// saveUser is user.save. The API sets the password hash and revokes sessions afterwards.
func (r *Rules) saveUser(s *State, u *User, d any) (entity, detail any) {
	need(is(roleOf(u), "Admin"), "Admin required")
	x := get(d, "record")
	role, ok := get(x, "role").(string)
	need(ok && slices.Contains(Roles, role) && text(get(x, "name")) != "" && text(get(x, "username")) != "" &&
		validEmail(text(get(x, "email"))), "Name, username, email and single role required")
	id := get(x, "id")
	username, email := norm(get(x, "username")), norm(get(x, "email"))
	need(!slices.ContainsFunc(s.Users, func(y *User) bool {
		return !strictEqual(dynString(y.ID), id) && (norm(dynString(y.Username)) == username || norm(dynString(y.Email)) == email)
	}), "Username or email already exists")
	companies := get(x, "companies")
	list, isList := companies.([]any)
	need(role == "Admin" || truthy(get(x, "groupAccess")) || (isList && len(list) > 0), "Assign company access")
	assigned := or(companies, []any{})
	list, isList = assigned.([]any)
	if !isList {
		throw("(x.companies || []).every is not a function")
	}
	for _, c := range list {
		need(slices.ContainsFunc(s.Companies, func(y *Company) bool { return strictEqual(dynString(y.ID), c) }), "Invalid company access")
	}
	var prev *User
	for _, y := range s.Users {
		if strictEqual(dynString(y.ID), id) {
			prev = y
			break
		}
	}
	user := shallow(prev)
	if !truthy(id) {
		id = r.randomID()
	}
	setField(user, "id", id)
	user.Name = ptr(text(get(x, "name")))
	user.Username = ptr(text(get(x, "username")))
	user.Email = ptr(lower(text(get(x, "email"))))
	user.Role = ptr(role)
	setField(user, "companies", assigned)
	user.GroupAccess = ptr(truthy(get(x, "groupAccess")))
	user.Active = ptr(!strictEqual(get(x, "active"), false))
	if prev != nil && is(prev.Role, "Admin") && (!is(user.Role, "Admin") || !*user.Active) {
		need(slices.ContainsFunc(s.Users, func(y *User) bool {
			return !strictEqual(dynString(y.ID), field(user, "id")) && is(y.Role, "Admin") && isTrue(y.Active)
		}), "Keep at least one active Admin")
	}
	deleteField(user, "team")
	deleteField(user, "approvalLevel")
	if prev != nil {
		deleteField(prev, "team")
		deleteField(prev, "approvalLevel")
		*prev = *user // Object.assign(prev, user): user already holds every member of prev
	} else {
		s.Users = append(s.Users, user)
	}
	return field(user, "id"), tpl(user.Username) + ": " + tpl(user.Role)
}

// saveTask is task.save: Finance and Admin maintain project tasks.
func (r *Rules) saveTask(s *State, u *User, d any, at string) (entity, company, detail any) {
	x := or(get(d, "record"), map[string]any{})
	id := get(x, "id")
	var prev *Task
	prevIndex := -1
	if truthy(id) {
		for i, t := range s.Tasks {
			if strictEqual(dynString(t.ID), id) {
				prev, prevIndex = t, i
				break
			}
		}
	}
	need(!truthy(id) || prev != nil, "Task not found")
	projectID := get(x, "projectId")
	if prev != nil {
		projectID = dynString(prev.ProjectID)
	}
	var p *Project
	for _, y := range s.Projects {
		if strictEqual(dynString(y.ID), projectID) {
			p = y
			break
		}
	}
	need(p != nil, "Select a valid project")
	need(canEditTasks(u, p.CompanyID), "Only Planning or Admin can change project tasks")
	name := text(get(x, "name"))
	need(name != "" && utf16Len(name) <= 120, "Task name required (up to 120 characters)")
	status, ok := get(x, "status").(string)
	need(ok && slices.Contains(taskStatuses, status), "Select a task status")
	due := text(get(x, "due"))
	need(due == "" || validDate(due), "Enter a valid due date")
	owner := utf16Slice(text(get(x, "owner")), 80)
	var task *Task
	if prev != nil {
		task = shallow(prev)
	} else {
		task = &Task{ID: ptr(r.randomID()), CreatedAt: ptr(at), CreatedBy: u.ID}
	}
	task.CompanyID, task.ProjectID, task.Name, task.Status = p.CompanyID, p.ID, ptr(name), ptr(status)
	task.Due, task.Owner, task.UpdatedAt = ptr(due), ptr(owner), ptr(at)
	if status == "Done" {
		if prev != nil && is(prev.Status, "Done") {
			task.CompletedAt = prev.CompletedAt
		} else {
			task.CompletedAt = ptr(at)
		}
	} else {
		deleteField(task, "completedAt")
	}
	s.Tasks = put(s.Tasks, prevIndex, task)
	return dynString(task.ID), dynString(p.CompanyID), tpl(p.Name) + ": " + name + " · " + status
}
