// Package domain is the authoritative server copy of the workflow rules. It is a port of
// frontend/src/domain/domain.js (which still runs the browser-only demo) and must stay
// behaviourally identical to it: parity_test.go replays calls recorded from the
// JavaScript rules and compares every result, error message and stored value.
//
// The rules signal failures the way the JavaScript throws: a panic carrying *Error,
// recovered at the exported entry points (Apply, MigrateState, VisibleState,
// SupportingFile), which return it as an error.
package domain

import (
	"crypto/rand"
	"fmt"
	"math"
	"runtime/debug"
	"slices"
	"strings"
	"time"
)

var nan = math.NaN()

// Roles: one role per user. Finance raises requests and reviews and pays every payment
// request (never one they raised themselves); Planning works on project tasks only.
var Roles = []string{"Finance", "Planning", "Viewer", "Admin"}

// Retired approval stages and roles, kept only so migration recognises older data.
var (
	retiredStages = []string{"Reviewer", "Approval 1", "Approval 2"}
	retiredRoles  = []string{"Reviewer", "Approver"}
	taskStatuses  = []string{"To do", "In progress", "Done"}
)

// mergedRoles: roles combined into another role; their users keep working under the new one.
var mergedRoles = map[string]string{"Requester": "Finance"}

// Rules evaluates the workflow rules. NewID is randomId() and Clock is Date.now() where
// the JavaScript rules read the clock themselves rather than the now argument.
type Rules struct {
	NewID func() string
	Clock func() int64
}

// NewRules returns rules using random UUIDs and the system clock.
func NewRules() *Rules {
	return &Rules{NewID: RandomID, Clock: func() int64 { return time.Now().UnixMilli() }}
}

// RandomID returns a random version 4 UUID, like crypto.randomUUID().
func RandomID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func (r *Rules) randomID() string { return r.NewID() }

// InternalError is a failure that the JavaScript rules would not have produced: a bug in
// this port or data it cannot handle. Its message is not meant for users.
type InternalError struct {
	Value any
	Stack []byte
}

func (e *InternalError) Error() string { return fmt.Sprintf("internal error: %v", e.Value) }

// capture runs fn and returns what it throws.
func capture(fn func()) (err error) {
	defer func() {
		if p := recover(); p != nil {
			if e, ok := p.(*Error); ok {
				err = e
				return
			}
			err = &InternalError{Value: p, Stack: debug.Stack()}
		}
	}()
	fn()
	return nil
}

// Apply applies a command (the untyped JSON sent by the client) for user u at time now
// (epoch milliseconds). It mutates s; on error s may be partly changed and must be
// discarded, as the server's transaction rollback does.
func (r *Rules) Apply(s *State, u *User, command any, now int64) error {
	return capture(func() { r.apply(s, u, command, now) })
}

// MigrateState performs the additive data migrations in place.
func (r *Rules) MigrateState(s *State, now int64) error {
	return capture(func() { r.migrate(s, now) })
}

// VisibleState returns the copy of s that user u may see: company scope, no secrets, no
// PDF contents, deleted records only for Admin.
func (r *Rules) VisibleState(s *State, u *User) (out *State, err error) {
	err = capture(func() { out = r.visibleState(s, u) })
	return out, err
}

// FileQuery selects a supporting document (the file endpoint's query). Members are
// dynamic values; Undefined selects the JavaScript defaults (index 0, side "data").
type FileQuery struct {
	ID, Kind, Index, Version, Side any
}

// SupportingFile returns a supporting PDF for a user holding the record's lock.
func (r *Rules) SupportingFile(s *State, u *User, q FileQuery, now int64) (f *File, err error) {
	err = capture(func() { f = r.supportingFile(s, u, q, now) })
	return f, err
}

// EmptyState is a new workspace.
func EmptyState() *State {
	return &State{
		Version:   ptr(3.0),
		Companies: []*Company{}, Projects: []*Project{}, Tasks: []*Task{}, Budgets: []*Budget{},
		Suppliers: []*Supplier{},
		Currencies: []*Currency{
			{ID: ptr("USD"), Name: ptr("US Dollar"), Rate: ptr(1.0)},
			{ID: ptr("MVR"), Name: ptr("Maldivian Rufiyaa"), Rate: ptr(15.42)},
		},
		Users: []*User{}, Orders: []*Order{}, Requests: []*Request{}, Audit: []*AuditEntry{},
		Locks: map[string]*Lock{},
		Settings: &Settings{
			OrderFormat:  ptr("{COMPANY}-{PROJECT}-REQ-{SEQ}"),
			NumberFormat: ptr("{COMPANY}-{PROJECT}-PAY-{SEQ}"),
			LockMinutes:  ptr(10.0),
		},
		Counters: map[string]float64{},
		Sequence: ptr(0.0),
	}
}

// ---- roles and access ----

func activeUser(u *User) bool { return u.Active == nil || *u.Active } // u.active !== false

func roleOf(u *User) *string {
	if u == nil {
		throw("Cannot read properties of undefined (reading 'role')")
	}
	return u.Role
}

func hasCompany(u *User, c string) bool { return slices.Contains(u.Companies, c) }

// access: full group access or explicit access to company c.
func access(u *User, c *string) bool {
	return u != nil && (isTrue(u.GroupAccess) || (c != nil && hasCompany(u, *c)))
}

// accessDyn is access() for a company id taken from a command.
func accessDyn(u *User, c any) bool {
	s, ok := c.(string)
	return u != nil && (isTrue(u.GroupAccess) || (ok && hasCompany(u, s)))
}

// isFinanceAdmin: Finance and Admin have full operational access.
func isFinanceAdmin(u *User) bool {
	return u != nil && activeUser(u) && strIn(u.Role, "Finance", "Admin")
}

func canCreateRequests(u *User) bool {
	return u != nil && activeUser(u) && strIn(u.Role, "Finance", "Admin")
}

func canManageRequest(u *User, companyID, requestedBy *string) bool {
	return canCreateRequests(u) && access(u, companyID) && (isFinanceAdmin(u) || sameStr(u.ID, requestedBy))
}

// financeActor: Finance or Admin with company access, never on their own record.
func financeActor(u *User, companyID, requestedBy *string) bool {
	return isFinanceAdmin(u) && access(u, companyID) && !sameStr(u.ID, requestedBy)
}

// canEditTasks: project tasks are Planning's work (Admin may also change them); Finance
// only reads them.
func canEditTasks(u *User, companyID *string) bool {
	return u != nil && activeUser(u) && strIn(u.Role, "Planning", "Admin") && access(u, companyID)
}

func stageActor(u *User, r *Request) bool {
	return strIn(r.Status, "Finance", "On Hold") && financeActor(u, r.CompanyID, r.RequestedBy)
}

func canReject(u *User, r *Request) bool {
	return !is(r.Status, "Paid") && !is(r.Status, "Rejected") &&
		((is(roleOf(u), "Admin") && access(u, r.CompanyID)) || stageActor(u, r))
}

// ---- records ----

func truthyStr(p *string) bool { return p != nil && *p != "" }

func liveRequests(s *State) []*Request {
	out := make([]*Request, 0, len(s.Requests))
	for _, r := range s.Requests {
		if r.Deleted == nil {
			out = append(out, r)
		}
	}
	return out
}

func liveOrders(s *State) []*Order {
	out := make([]*Order, 0, len(s.Orders))
	for _, o := range s.Orders {
		if o.Deleted == nil {
			out = append(out, o)
		}
	}
	return out
}

// parentAmount: the request's amount in its order's currency.
func parentAmount(r *Request) float64 {
	if r.OrderAmount != nil {
		return *r.OrderAmount
	}
	return num(r.Amount)
}

// reservation: what the order's non-rejected live requests reserve (exclude is a request id).
func reservation(s *State, o *Order, exclude any) float64 {
	total := 0.0
	for _, r := range s.Requests {
		if r.Deleted == nil && sameStr(r.OrderID, o.ID) && !strictEqual(dynString(r.ID), exclude) && !is(r.Status, "Rejected") {
			total += parentAmount(r)
		}
	}
	return money(total)
}

// amendmentLimit: the order total, or the lower pending amendment total.
func amendmentLimit(o *Order) float64 {
	if o.Amendment != nil && !is(o.Amendment.Status, "Rejected") {
		if o.Amendment.Data == nil {
			throw("Cannot read properties of undefined (reading 'total')")
		}
		return math.Min(num(o.Total), num(o.Amendment.Data.Total))
	}
	return num(o.Total)
}

func (r *Rules) audit(s *State, u *User, action string, entity, companyID, detail any, now int64) {
	if isUndefined(detail) {
		detail = "" // default parameter
	}
	e := &AuditEntry{ID: ptr(r.randomID()), At: ptr(isoString(now)), UserID: u.ID, User: u.Name, Action: ptr(action)}
	setField(e, "entity", entity)
	setField(e, "companyId", companyID)
	setField(e, "detail", detail)
	if s.Audit == nil {
		throw("Cannot read properties of undefined (reading 'push')")
	}
	s.Audit = append(s.Audit, e)
}

// issue allocates the next permanent number of kind ("order" or "payment").
func (r *Rules) issue(s *State, o *Order, kind string, now int64) string {
	key := tpl(o.CompanyID) + ":" + tpl(o.ProjectID) + ":" + kind
	if s.Counters == nil {
		throw("Cannot read properties of undefined (reading '" + key + "')")
	}
	n := s.Counters[key]
	if !truthy(n) {
		n = 0
	}
	n++
	if s.Settings == nil {
		throw("Cannot read properties of undefined (reading 'orderFormat')")
	}
	format := s.Settings.NumberFormat
	if kind == "order" {
		format = s.Settings.OrderFormat
	}
	if format == nil {
		throw("Cannot read properties of undefined (reading 'replaceAll')")
	}
	var company *Company
	for _, c := range s.Companies {
		if sameStr(c.ID, o.CompanyID) {
			company = c
			break
		}
	}
	if company == nil {
		throw("Cannot read properties of undefined (reading 'code')")
	}
	number := jsReplaceAll(*format, "{COMPANY}", toString(field(company, "code")))
	var project *Project
	for _, p := range s.Projects {
		if sameStr(p.ID, o.ProjectID) {
			project = p
			break
		}
	}
	if project == nil {
		throw("Cannot read properties of undefined (reading 'code')")
	}
	number = jsReplaceAll(number, "{PROJECT}", toString(field(project, "code")))
	number = jsReplaceAll(number, "{YYYY}", numberToString(float64(utcYear(now))))
	number = jsReplaceAll(number, "{SEQ}", leftPad(numberToString(n), 6))
	duplicate := false
	for _, x := range s.Orders {
		duplicate = duplicate || is(x.Number, number)
	}
	for _, x := range s.Requests {
		duplicate = duplicate || is(x.Number, number)
	}
	need(!duplicate, "Number format would create a duplicate; change the format in Settings")
	s.Counters[key] = n
	return number
}

var systemUser = &User{ID: ptr("system"), Name: ptr("System")}

// mergeRoles moves users of a role combined into another (Requester into Finance) on every
// load, whatever the data version, so no stored user keeps a role that no longer exists.
func (r *Rules) mergeRoles(s *State, now int64) {
	for _, u := range s.Users {
		if u.Role == nil {
			continue
		}
		to, ok := mergedRoles[*u.Role]
		if !ok {
			continue
		}
		from := *u.Role
		u.Role = ptr(to)
		r.audit(s, systemUser, "user.migrated", dynString(u.ID), Undefined,
			tpl(u.Username)+": "+from+" role combined into "+to, now)
	}
}

func (r *Rules) migrate(s *State, now int64) {
	r.mergeRoles(s, now)
	if s.Version != nil && *s.Version >= 3 && s.Tasks != nil && s.Counters != nil {
		if s.Orders == nil {
			throw("Cannot read properties of undefined (reading 'every')")
		}
		numbered := true
		for _, o := range s.Orders {
			numbered = numbered && truthyStr(o.Number)
		}
		if numbered {
			if s.Requests == nil {
				throw("Cannot read properties of undefined (reading 'every')")
			}
			currencies := true
			for _, q := range s.Requests {
				currencies = currencies && truthyStr(q.Currency)
			}
			if currencies {
				return
			}
		}
	}
	if s.Counters == nil {
		s.Counters = map[string]float64{}
	}
	if s.Settings == nil {
		throw("Cannot read properties of undefined (reading 'orderFormat')")
	}
	if !truthyStr(s.Settings.OrderFormat) {
		s.Settings.OrderFormat = ptr("{COMPANY}-{PROJECT}-REQ-{SEQ}")
	}
	s.Settings.NumberFormat = ptr("{COMPANY}-{PROJECT}-PAY-{SEQ}")
	// Short codes from initials, unique among companies and within a company's projects.
	type coded struct {
		name, code, company **string
	}
	codeLists := [][]coded{}
	var companies, projects []coded
	for _, c := range s.Companies {
		companies = append(companies, coded{&c.Name, &c.Code, nil})
	}
	for _, p := range s.Projects {
		projects = append(projects, coded{&p.Name, &p.Code, &p.CompanyID})
	}
	codeLists = append(codeLists, companies, projects)
	for li, list := range codeLists {
		for xi, x := range list {
			if truthyStr(*x.code) {
				continue
			}
			if *x.name == nil {
				throw("Cannot read properties of undefined (reading 'split')")
			}
			base := initials(**x.name)
			code := base
			for i := 1; ; i++ {
				taken := false
				for yi, y := range list {
					if yi != xi && is(*y.code, code) && (li == 0 || sameStr(*y.company, *x.company)) {
						taken = true
						break
					}
				}
				if !taken {
					break
				}
				code = base + numberToString(float64(i))
			}
			*x.code = ptr(code)
		}
	}
	for _, b := range s.Budgets {
		if !truthyStr(b.Currency) {
			b.Currency = ptr("USD")
		}
		if b.Rate == nil || !truthy(*b.Rate) {
			b.Rate = ptr(1.0)
		}
	}
	for _, o := range s.Orders {
		if !truthyStr(o.Number) {
			o.Number = ptr(r.issue(s, o, "order", now))
		}
		if o.Files == nil {
			o.Files = []*File{}
		}
	}
	for _, q := range s.Requests {
		var o *Order
		for _, x := range s.Orders {
			if sameStr(x.ID, q.OrderID) {
				o = x
				break
			}
		}
		orderField := func(name string) *Order {
			if o == nil {
				throw("Cannot read properties of undefined (reading '" + name + "')")
			}
			return o
		}
		if !truthyStr(q.Currency) {
			q.Currency = orderField("currency").Currency
		}
		if q.Rate == nil || !truthy(*q.Rate) {
			q.Rate = orderField("rate").Rate
		}
		if q.OrderAmount == nil {
			q.OrderAmount = q.Amount
		}
		if q.OrderRate == nil || !truthy(*q.OrderRate) {
			q.OrderRate = orderField("rate").Rate
		}
		if q.Files == nil {
			q.Files = []*File{}
		}
		if q.Payment != nil {
			if q.Payment.Files == nil {
				if q.Payment.File != nil {
					q.Payment.Files = []*File{q.Payment.File}
				} else {
					q.Payment.Files = []*File{}
				}
			}
			deleteField(q.Payment, "file")
		}
		// Approval stages are retired: anything waiting for an approver now waits for Finance.
		if strIn(q.Status, retiredStages...) {
			from := *q.Status
			q.Status = ptr("Finance")
			if !truthyStr(q.FinalApprovedAt) {
				q.FinalApprovedAt = ptr(isoString(now))
			}
			if o != nil && !truthyStr(o.CommittedAt) {
				o.CommittedAt = q.FinalApprovedAt
				o.CommitmentRequestID = q.ID
			}
			r.audit(s, systemUser, "workflow.migrated", dynString(q.ID), dynString(q.CompanyID),
				"Approval workflow removed; moved from "+from+" to Finance", now)
		}
		key := tpl(q.CompanyID) + ":" + tpl(orderField("projectId").ProjectID) + ":payment"
		seq := 0.0
		if q.Number != nil {
			if d := trailingDigits(*q.Number); d != "" {
				seq = stringToNumber(d)
			}
		} else if f := field(q, "number"); !nullish(f) {
			throw("r.number?.match is not a function")
		}
		if !truthy(seq) {
			seq = 0
		}
		current := s.Counters[key]
		if !truthy(current) {
			current = 0
		}
		s.Counters[key] = math.Max(current, seq)
	}
	for _, o := range s.Orders {
		if o.Amendment != nil && strIn(o.Amendment.Status, retiredStages...) {
			from := *o.Amendment.Status
			o.Amendment.Status = ptr("Finance")
			r.audit(s, systemUser, "workflow.migrated", dynString(o.ID), dynString(o.CompanyID),
				"Approval workflow removed; amendment moved from "+from+" to Finance", now)
		}
	}
	for _, u := range s.Users {
		if strIn(u.Role, retiredRoles...) {
			from := *u.Role
			u.Role = ptr("Viewer")
			r.audit(s, systemUser, "user.migrated", dynString(u.ID), Undefined,
				tpl(u.Username)+": "+from+" role retired; now Viewer", now)
		}
		deleteField(u, "team")
		deleteField(u, "approvalLevel")
	}
	if s.Tasks == nil {
		s.Tasks = []*Task{}
	}
	s.Version = ptr(3.0)
}

// initials is the migration's code base: name.split(/\s+/).map(w => w[0]).join("")
// .replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8) || "CODE".
func initials(name string) string {
	var b strings.Builder
	for _, w := range strings.FieldsFunc(name, isJSSpace) {
		c := w[0]
		if isDigit(c) || (c|0x20 >= 'a' && c|0x20 <= 'z') {
			b.WriteByte(c)
		}
	}
	code := strings.ToUpper(b.String())
	if len(code) > 8 {
		code = code[:8]
	}
	if code == "" {
		return "CODE"
	}
	return code
}

func (r *Rules) visibleState(s *State, u *User) *State {
	out := clone(s)
	if out.Tasks == nil {
		out.Tasks = []*Task{}
	}
	if out.Companies == nil || out.Projects == nil || out.Budgets == nil || out.Orders == nil || out.Requests == nil || out.Audit == nil || out.Users == nil {
		throw("Cannot read properties of undefined (reading 'filter')")
	}
	out.Companies = filter(out.Companies, func(c *Company) bool { return access(u, c.ID) })
	out.Projects = filter(out.Projects, func(c *Project) bool { return access(u, c.CompanyID) })
	out.Tasks = filter(out.Tasks, func(c *Task) bool { return access(u, c.CompanyID) })
	out.Budgets = filter(out.Budgets, func(c *Budget) bool { return access(u, c.CompanyID) })
	out.Orders = filter(out.Orders, func(c *Order) bool { return access(u, c.CompanyID) })
	out.Requests = filter(out.Requests, func(c *Request) bool { return access(u, c.CompanyID) })
	out.Audit = filter(out.Audit, func(c *AuditEntry) bool {
		company := field(c, "companyId")
		return (!truthy(company) || accessDyn(u, company)) && (isFinanceAdmin(u) || truthy(company))
	})
	// Planning sees projects and their tasks only: no budgets, requests, suppliers, locks or
	// financial history.
	if is(roleOf(u), "Planning") {
		out.Budgets = []*Budget{}
		out.Orders = []*Order{}
		out.Requests = []*Request{}
		out.Suppliers = []*Supplier{}
		out.Locks = map[string]*Lock{}
		out.Audit = filter(out.Audit, func(c *AuditEntry) bool {
			action, ok := field(c, "action").(string)
			return ok && strings.HasPrefix(action, "task.")
		})
	}
	admin := is(roleOf(u), "Admin")
	keys := []string{"id", "name", "username", "role", "companies", "groupAccess", "active"}
	if admin {
		keys = []string{"id", "name", "username", "email", "role", "companies", "groupAccess", "active"}
	}
	for i, x := range out.Users {
		out.Users[i] = pick(x, keys...)
	}
	if !admin {
		out.Users = filter(out.Users, func(x *User) bool {
			if sameStr(x.ID, u.ID) || isTrue(x.GroupAccess) {
				return true
			}
			for _, c := range x.Companies {
				if access(u, &c) {
					return true
				}
			}
			return false
		})
	}
	deleteField(out, "sequence")
	deleteField(out, "counters")
	// Deleted records leave every working list; only Admin receives them, for the Deleted page.
	deletedOrders := filter(out.Orders, func(o *Order) bool { return o.Deleted != nil })
	deletedRequests := filter(out.Requests, func(r *Request) bool { return r.Deleted != nil })
	out.Orders = filter(out.Orders, func(o *Order) bool { return o.Deleted == nil })
	out.Requests = filter(out.Requests, func(r *Request) bool { return r.Deleted == nil })
	if admin {
		out.DeletedOrders = deletedOrders
		out.DeletedRequests = deletedRequests
	}
	for _, list := range []any{out.Orders, out.Requests, out.DeletedOrders, out.DeletedRequests} {
		stripAll(list)
	}
	return out
}

func filter[T any](list []*T, keep func(*T) bool) []*T {
	out := make([]*T, 0, len(list))
	for _, x := range list {
		if keep(x) {
			out = append(out, x)
		}
	}
	return out
}

func stripAll(list any) {
	switch l := list.(type) {
	case []*Order:
		for _, x := range l {
			stripRecord(x)
		}
	case []*Request:
		for _, x := range l {
			stripRecord(x)
		}
	}
}

// ---- documents ----

func documentCheck(f any) {
	need(truthy(f) && strictEqual(get(f, "type"), "application/pdf") &&
		strings.HasSuffix(lower(text(get(f, "name"))), ".pdf"), "Upload a PDF document")
	data, ok := get(f, "data").(string)
	need(ok && strings.HasPrefix(data, "JVBERi0") && utf16Len(data) <= 2800000, "PDF must be valid and at most 2 MB")
}

// documents validates supporting PDFs; they are required only when Finance has asked
// for additional documents.
func documents(files any, required bool) []*File {
	list, ok := files.([]any)
	need(ok && (!required || len(list) > 0), "Attach supporting PDFs")
	total := 0
	for _, f := range list {
		documentCheck(f)
	}
	for _, f := range list {
		total += utf16Len(get(f, "data").(string))
	}
	need(total <= 2800000, "Combined uploads must be at most 2 MB")
	out := make([]*File, len(list))
	for i, f := range list {
		out[i] = fromDyn[File](f)
	}
	return out
}

func findOrder(s *State, id any, u *User, deleted bool) *Order {
	var o *Order
	for _, x := range s.Orders {
		if strictEqual(dynString(x.ID), id) {
			o = x
			break
		}
	}
	need(o != nil && access(u, o.CompanyID), "Order not available")
	need(deleted || o.Deleted == nil, "This request has been deleted")
	return o
}

func findRequest(s *State, id any, u *User, deleted bool) *Request {
	var r *Request
	for _, x := range s.Requests {
		if strictEqual(dynString(x.ID), id) {
			r = x
			break
		}
	}
	need(r != nil && access(u, r.CompanyID), "Request not available")
	need(deleted || r.Deleted == nil, "This payment request has been deleted")
	return r
}

func restoreRecord(deleted **Deletion, history *[]*Deletion, u *User, at string) {
	if *history == nil {
		*history = []*Deletion{}
	}
	d := shallow(*deleted)
	d.RestoredAt, d.RestoredBy, d.RestoredByID = ptr(at), u.Name, u.ID
	*history = append(*history, d)
	*deleted = nil
}

// checkLock: another user's active lock blocks; required also needs the caller's own lock.
func checkLock(s *State, u *User, id string, now int64, required bool) {
	if s.Locks == nil {
		throw("Cannot read properties of undefined (reading '" + id + "')")
	}
	l := s.Locks[id]
	t := float64(now)
	need(l == nil || num(l.Expires) <= t || sameStr(l.UserID, u.ID), "This record is opened by another user")
	if required {
		need(l != nil && sameStr(l.UserID, u.ID) && num(l.Expires) > t, "Open this record again to obtain a lock")
	}
}

func (r *Rules) supportingFile(s *State, u *User, q FileQuery, now int64) *File {
	need(u != nil && activeUser(u), "Active user required")
	need(!is(u.Role, "Planning"), "Record not available") // Planning has no financial records
	index, side := q.Index, q.Side
	if isUndefined(index) {
		index = 0.0
	}
	if isUndefined(side) {
		side = "data"
	}
	i := toNumber(index)
	need(isInteger(i) && i >= 0, "Invalid file index")
	kind, _ := q.Kind.(string)
	if !isString(q.Kind) {
		kind = "\x00" // matches no document type
	}
	parent := slices.Contains([]string{"order", "amendment", "amendment-history", "amendment-attempt"}, kind)
	need(parent || kind == "request" || kind == "payment", "Invalid document type")
	// Admin reviews the documents of deleted records on the Deleted page.
	review := is(u.Role, "Admin")
	var files []*File
	if parent {
		o := findOrder(s, q.ID, u, review)
		checkLock(s, u, toString(q.ID), now, true)
		switch kind {
		case "order":
			files = o.Files
		case "amendment":
			if o.Amendment != nil {
				if o.Amendment.Data == nil {
					throw("Cannot read properties of undefined (reading 'files')")
				}
				files = o.Amendment.Data.Files
			}
		default:
			need(strictEqual(side, "data") || strictEqual(side, "previous"), "Invalid document version")
			versions := o.AmendmentAttempts
			if kind == "amendment-history" {
				versions = o.Amendments
			}
			for _, m := range versions {
				if strictEqual(dynString(m.ID), q.Version) {
					v := m.Data
					if side == "previous" {
						v = m.Previous
					}
					if v != nil {
						files = v.Files
					}
					break
				}
			}
		}
	} else {
		rq := findRequest(s, q.ID, u, review)
		checkLock(s, u, toString(q.ID), now, true)
		if kind == "request" {
			files = rq.Files
		} else if rq.Payment != nil {
			files = rq.Payment.Files
		}
	}
	var file *File
	if i < float64(len(files)) {
		file = files[int(i)]
	}
	need(file != nil, "File not available")
	return file
}

func isString(v any) bool { _, ok := v.(string); return ok }

// ---- orders and payment requests ----

func (r *Rules) validateOrder(s *State, u *User, d any, exclude any) *Order {
	need(canCreateRequests(u), "Finance or Admin role required")
	need(accessDyn(u, get(d, "companyId")), "Company access required")
	companyID, projectID, budgetID := get(d, "companyId"), get(d, "projectId"), get(d, "budgetId")
	need(slices.ContainsFunc(s.Projects, func(p *Project) bool {
		return strictEqual(dynString(p.ID), projectID) && strictEqual(dynString(p.CompanyID), companyID)
	}), "Select a valid project")
	var b *Budget
	for _, x := range s.Budgets {
		if strictEqual(dynString(x.ID), budgetID) && strictEqual(dynString(x.ProjectID), projectID) && strictEqual(dynString(x.CompanyID), companyID) {
			b = x
			break
		}
	}
	need(b != nil, "Select an approved budget")
	supplierID := get(d, "supplierId")
	need(slices.ContainsFunc(s.Suppliers, func(x *Supplier) bool { return strictEqual(dynString(x.ID), supplierID) }), "Select a supplier")
	currency := get(d, "currency")
	var c *Currency
	for _, x := range s.Currencies {
		if strictEqual(dynString(x.ID), currency) {
			c = x
			break
		}
	}
	need(c != nil && positive(num(c.Rate)), "Currency rate not configured")
	need(positive(toNumber(get(d, "total"))), "Total amount must be positive")
	need(text(get(d, "po")) != "" && text(get(d, "description")) != "", "PO and description are required")
	allocations, ok := get(d, "allocations").([]any)
	need(ok && len(allocations) > 0, "Allocate the order to budget categories")
	seen, unique := map[string]bool{}, 0
	for _, a := range allocations {
		if k, ok := sameValueZeroKey(get(a, "categoryId")); ok {
			if !seen[k] {
				seen[k] = true
				unique++
			}
		} else {
			unique++
		}
	}
	need(unique == len(allocations), "Each category can appear once")
	for _, a := range allocations {
		categoryID := get(a, "categoryId")
		if b.Categories == nil {
			throw("Cannot read properties of undefined (reading 'some')")
		}
		need(slices.ContainsFunc(b.Categories, func(c *Category) bool { return strictEqual(dynString(c.ID), categoryID) }) &&
			positive(toNumber(get(a, "amount"))), "Enter a positive amount for every selected category")
	}
	sum := 0.0
	for _, a := range allocations {
		sum += toNumber(get(a, "amount"))
	}
	need(math.Abs(money(sum)-money(toNumber(get(d, "total")))) < 0.005, "Category amounts must equal the full order amount")
	po := norm(get(d, "po"))
	need(!slices.ContainsFunc(liveOrders(s), func(o *Order) bool {
		return !strictEqual(dynString(o.ID), exclude) && strictEqual(dynString(o.CompanyID), companyID) && norm(dynString(o.PO)) == po
	}), "Duplicate PO number in this company")
	if text(get(d, "invoice")) != "" {
		invoice := norm(get(d, "invoice"))
		need(!slices.ContainsFunc(liveOrders(s), func(o *Order) bool {
			return !strictEqual(dynString(o.ID), exclude) && strictEqual(dynString(o.SupplierID), supplierID) && norm(dynString(o.Invoice)) == invoice
		}), "Duplicate invoice number for this supplier")
	}
	files := documents(coalesce(get(d, "files"), []any{}), false)
	o := &Order{
		Rate:        c.Rate,
		Total:       ptr(money(toNumber(get(d, "total")))),
		PO:          ptr(text(get(d, "po"))),
		Invoice:     ptr(text(get(d, "invoice"))),
		Description: ptr(text(get(d, "description"))),
		Files:       files,
	}
	setField(o, "companyId", companyID)
	setField(o, "projectId", projectID)
	setField(o, "budgetId", budgetID)
	setField(o, "supplierId", supplierID)
	setField(o, "currency", currency)
	o.Allocations = make([]*Allocation, len(allocations))
	for i, a := range allocations {
		x := &Allocation{Amount: ptr(money(toNumber(get(a, "amount"))))}
		setField(x, "categoryId", get(a, "categoryId"))
		o.Allocations[i] = x
	}
	return o
}

// paymentFields are the members paymentData() returns.
type paymentFields struct {
	currency                                      *string
	rate, amount, orderAmount, orderRate, percent *float64
	date, terms                                   string
}

func (r *Rules) paymentData(s *State, o *Order, d any, exclude any) paymentFields {
	currency := or(get(d, "currency"), dynString(o.Currency))
	var c *Currency
	for _, x := range s.Currencies {
		if strictEqual(dynString(x.ID), currency) {
			c = x
			break
		}
	}
	need(c != nil && positive(num(c.Rate)), "Select a payment currency")
	var existing *Request
	for _, x := range s.Requests {
		if strictEqual(dynString(x.ID), exclude) {
			existing = x
			break
		}
	}
	var rate *float64
	switch {
	case existing != nil && strictEqual(dynString(existing.Currency), currency):
		rate = existing.Rate
	case strictEqual(currency, dynString(o.Currency)):
		rate = o.Rate
	default:
		rate = c.Rate
	}
	var amount float64
	if a := get(d, "amount"); !isUndefined(a) && !strictEqual(a, "") {
		amount = money(toNumber(a))
	} else {
		amount = money(num(o.Total) * toNumber(get(d, "percent")) / 100 / num(o.Rate) * num(rate))
	}
	orderAmount := money(amount / num(rate) * num(o.Rate))
	percent := stringToNumber(toFixed(orderAmount/num(o.Total)*100, 6))
	need(positive(amount) && percent <= 100.000001, "Payment percentage must be between 0 and 100")
	need(orderAmount+reservation(s, o, exclude) <= amendmentLimit(o)+0.005, "Payment requests exceed the remaining order balance")
	date := text(get(d, "date"))
	if date == "" {
		date = today(r.Clock())
	}
	need(validDate(date), "Enter a valid request date")
	terms := text(get(d, "terms"))
	if terms == "" {
		terms = "Payment against order"
	}
	return paymentFields{
		currency: c.ID, rate: rate, amount: ptr(amount), orderAmount: ptr(orderAmount),
		orderRate: o.Rate, percent: ptr(percent), date: date, terms: terms,
	}
}

// assignTo is Object.assign(r, paymentData(...)).
func (p paymentFields) assignTo(r *Request) {
	r.Currency, r.Rate, r.Amount, r.OrderAmount = p.currency, p.rate, p.amount, p.orderAmount
	r.OrderRate, r.Percent, r.Date, r.Terms = p.orderRate, p.percent, ptr(p.date), ptr(p.terms)
}

// createPayment: a new payment request goes straight to Finance (Revision 4); there is no
// separate submit step. Only a request Finance returns becomes a Draft, which is corrected and
// submitted again.
func (r *Rules) createPayment(s *State, u *User, o *Order, d any, now int64) *Request {
	need(!truthyStr(o.RejectedAt), "This request was rejected")
	at := isoString(now)
	req := &Request{}
	r.paymentData(s, o, d, Undefined).assignTo(req)
	req.ID = ptr(r.randomID())
	req.OrderID, req.CompanyID = o.ID, o.CompanyID
	req.Number = ptr(r.issue(s, o, "payment", now))
	req.Status = ptr("Finance")
	req.RequestedBy, req.CreatedBy, req.CreatedAt = o.RequestedBy, u.ID, ptr(at)
	req.FinalApprovedAt = ptr(at)
	req.Approvals, req.History, req.Remarks, req.Files = []*Approval{}, []*HistoryEntry{}, []*Remark{}, []*File{}
	s.Requests = append(s.Requests, req)
	// The first payment request of an order commits the order to its budget.
	if !truthyStr(o.CommittedAt) {
		o.CommittedAt, o.CommitmentRequestID = ptr(at), req.ID
	}
	return req
}

// orderSnapshot: a copy of the order's details without its amendments.
func orderSnapshot(o *Order) *Order {
	c := shallow(o)
	c.Amendment, c.Amendments, c.AmendmentAttempts = nil, nil, nil
	for _, k := range []string{"amendment", "amendments", "amendmentAttempts"} {
		delete(c.Extra, k)
	}
	return clone(c)
}

func lockKey(id any) string { return toString(id) }

// tplNum is a number field inside a template literal.
func tplNum(p *float64) string {
	if p == nil {
		return "undefined"
	}
	return numberToString(*p)
}

func (r *Rules) apply(s *State, u *User, a any, now int64) {
	typ := get(a, "type")
	if strictEqual(typ, "import.create") || strictEqual(typ, "import.preview") {
		r.importRecords(s, u, a, typ.(string), now)
		return
	}
	r.migrate(s, now)
	need(u == nil || activeUser(u), "User is inactive")
	d := or(get(a, "data"), map[string]any{})
	var company any = Undefined
	entity := or(get(a, "id"), "")
	var detail any = ""
	at := isoString(now)
	t, _ := typ.(string)
	isType := func(names ...string) bool { return isString(typ) && slices.Contains(names, t) }
	reason := func() string { return text(get(d, "reason")) }

	switch {
	case isType("lock", "unlock"):
		id := get(a, "id")
		var companyID *string
		var deleted, found bool
		for _, x := range s.Requests {
			if strictEqual(dynString(x.ID), id) {
				companyID, deleted, found = x.CompanyID, x.Deleted != nil, true
				break
			}
		}
		if !found {
			for _, x := range s.Orders {
				if strictEqual(dynString(x.ID), id) {
					companyID, deleted, found = x.CompanyID, x.Deleted != nil, true
					break
				}
			}
		}
		// Planning never opens requests (no financial records), so it cannot lock them either.
		need(found && access(u, companyID) && !is(roleOf(u), "Planning"), "Record not available")
		// Only Admin opens deleted records (to review them); anyone may let go of a lock.
		need(t == "unlock" || !deleted || is(roleOf(u), "Admin"), "Record not available")
		key := lockKey(id)
		if s.Locks == nil {
			throw("Cannot read properties of undefined (reading '" + key + "')")
		}
		l := s.Locks[key]
		if t == "lock" {
			checkLock(s, u, key, now, false)
			s.Locks[key] = &Lock{UserID: u.ID, Name: u.Name, Expires: ptr(float64(now) + num(s.Settings.LockMinutes)*60000)}
		} else {
			need(l == nil || sameStr(l.UserID, u.ID) || isFinanceAdmin(u), "Only Finance or Admin can release another user’s lock")
			delete(s.Locks, key)
			if l != nil && !sameStr(l.UserID, u.ID) {
				r.audit(s, u, "Admin unlocked", id, dynString(companyID), field(l, "name"), now)
			}
		}
		return

	case isType("order.create"):
		o := r.validateOrder(s, u, d, Undefined)
		o.ID = ptr(r.randomID())
		o.RequestedBy, o.CreatedBy, o.CreatedAt = u.ID, u.ID, ptr(at)
		o.Number = ptr(r.issue(s, o, "order", now))
		payment := get(d, "payment")
		if truthy(payment) {
			r.paymentData(s, o, payment, Undefined)
		}
		s.Orders = append(s.Orders, o)
		if truthy(payment) {
			req := r.createPayment(s, u, o, payment, now)
			r.audit(s, u, "request.create", dynString(req.ID), dynString(o.CompanyID), *req.Number, now)
		}
		entity, company = dynString(o.ID), dynString(o.CompanyID)
		detail = *o.Number + "; PO " + *o.PO + "; " + tpl(o.Currency) + " " + numberToString(*o.Total)

	case isType("order.edit", "order.amend"):
		o := findOrder(s, get(a, "id"), u, false)
		checkLock(s, u, lockKey(dynString(o.ID)), now, true)
		need(!truthyStr(o.RejectedAt) && canManageRequest(u, o.CompanyID, o.RequestedBy),
			"Only the original requester, Finance or Admin can amend this request")
		need(o.Amendment == nil || strIn(o.Amendment.Status, "Rejected", "Draft"), "An amendment is already in progress")
		next := r.validateOrder(s, u, d, dynString(o.ID))
		need(sameStr(next.CompanyID, o.CompanyID) && sameStr(next.ProjectID, o.ProjectID) && sameStr(next.Currency, o.Currency),
			"Company, project and order currency cannot change after numbering")
		next.Rate = o.Rate
		need(*next.Total+0.005 >= reservation(s, o, Undefined), "Reject conflicting payment requests before reducing the order total")
		need(reason() != "", "Amendment reason required")
		if o.Amendment != nil {
			if o.AmendmentAttempts == nil {
				o.AmendmentAttempts = []*Amendment{}
			}
			o.AmendmentAttempts = append(o.AmendmentAttempts, o.Amendment)
		}
		o.Amendment = &Amendment{
			ID: ptr(r.randomID()), Previous: orderSnapshot(o), Data: next, Reason: ptr(reason()),
			Status: ptr("Finance"), CompanyID: o.CompanyID, RequestedBy: u.ID,
			Approvals: []*Approval{}, History: []*HistoryEntry{}, CreatedAt: ptr(at),
		}
		company, detail = dynString(o.CompanyID), get(d, "reason")

	case isString(typ) && strings.HasPrefix(t, "amendment."):
		o := findOrder(s, get(a, "id"), u, false)
		m := o.Amendment
		checkLock(s, u, lockKey(dynString(o.ID)), now, true)
		need(m != nil && !truthyStr(o.RejectedAt), "No pending amendment")
		action := strings.Split(t, ".")[1]
		need(action == "approve" || action == "return" || action == "reject", "Unknown amendment action")
		need((is(m.Status, "Finance") && financeActor(u, m.CompanyID, m.RequestedBy)) ||
			(action == "reject" && is(roleOf(u), "Admin") && is(m.Status, "Finance")), "You cannot review this amendment")
		need(action == "approve" || reason() != "", "Reason is required")
		m.History = append(m.History, &HistoryEntry{Stage: m.Status, Action: ptr(action), By: u.Name, UserID: u.ID, At: ptr(at), Reason: ptr(reason())})
		switch action {
		case "approve":
			need(financeActor(u, m.CompanyID, m.RequestedBy), "You cannot approve this amendment")
			m.Approvals = append(m.Approvals, &Approval{Stage: m.Status, By: u.Name, UserID: u.ID, At: ptr(at)})
			if m.Data == nil {
				throw("Cannot read properties of undefined (reading 'total')")
			}
			need(num(m.Data.Total)+0.005 >= reservation(s, o, Undefined), "Reject conflicting payment requests before reducing the order total")
			var requester *User
			for _, x := range s.Users {
				if sameStr(x.ID, o.RequestedBy) {
					requester = x
					break
				}
			}
			r.validateOrder(s, requester, dynOf(m.Data), dynString(o.ID))
			if o.Amendments == nil {
				o.Amendments = []*Amendment{}
			}
			approved := shallow(m)
			approved.Previous, approved.ApprovedAt = orderSnapshot(o), ptr(at)
			o.Amendments = append(o.Amendments, approved)
			assign(o, m.Data)
			deleteField(o, "amendment")
		case "return":
			m.Status, m.Approvals = ptr("Draft"), []*Approval{}
		default:
			m.Status = ptr("Rejected")
		}
		company, detail = dynString(o.CompanyID), reason()

	case isType("order.reject"):
		o := findOrder(s, get(a, "id"), u, false)
		checkLock(s, u, lockKey(dynString(o.ID)), now, true)
		need(isFinanceAdmin(u), "Finance or Admin required")
		need(!truthyStr(o.RejectedAt), "Request already rejected")
		need(reason() != "", "Reason is required")
		need(!slices.ContainsFunc(liveRequests(s), func(q *Request) bool { return sameStr(q.OrderID, o.ID) && !is(q.Status, "Rejected") }),
			"Reject all child payment requests first; paid requests require Admin payment deletion first")
		o.RejectedAt, o.RejectedBy, o.RejectionReason = ptr(at), u.ID, ptr(reason())
		company, detail = dynString(o.CompanyID), get(d, "reason")

	case isType("order.delete"):
		// A request goes only when nothing has been processed under it: its draft payment
		// requests are deleted with it; any other payment request must be deleted first.
		need(is(roleOf(u), "Admin"), "Only Admin can delete a request")
		o := findOrder(s, get(a, "id"), u, false)
		checkLock(s, u, lockKey(dynString(o.ID)), now, true)
		need(reason() != "", "Reason is required")
		children := filter(liveRequests(s), func(q *Request) bool { return sameStr(q.OrderID, o.ID) })
		var processed []string
		for _, q := range children {
			if !is(q.Status, "Draft") {
				processed = append(processed, str(q.Number))
			}
		}
		need(len(processed) == 0, "Delete its processed payment requests first: "+strings.Join(processed, ", "))
		for _, q := range children {
			checkLock(s, u, lockKey(dynString(q.ID)), now, false)
		}
		mark := &Deletion{ID: ptr(r.randomID()), At: ptr(at), By: u.Name, UserID: u.ID, Reason: ptr(reason())}
		o.Deleted = mark
		for _, q := range children {
			c := shallow(mark)
			c.WithOrder = o.ID
			q.Deleted = c
			delete(s.Locks, lockKey(dynString(q.ID)))
		}
		delete(s.Locks, lockKey(dynString(o.ID)))
		entity, company = dynString(o.ID), dynString(o.CompanyID)
		detail = tpl(o.Number) + draftsNote(len(children)) + ": " + reason()

	case isType("request.delete"):
		// Any payment request, whatever its status; its payment and history are kept for review.
		need(is(roleOf(u), "Admin"), "Only Admin can delete a payment request")
		q := findRequest(s, get(a, "id"), u, false)
		checkLock(s, u, lockKey(dynString(q.ID)), now, true)
		need(reason() != "", "Reason is required")
		q.Deleted = &Deletion{ID: ptr(r.randomID()), At: ptr(at), By: u.Name, UserID: u.ID, Reason: ptr(reason())}
		delete(s.Locks, lockKey(dynString(q.ID)))
		entity, company = dynString(q.ID), dynString(q.CompanyID)
		detail = tpl(q.Number) + " (" + tpl(q.Status) + "): " + reason()

	case isType("order.restore"):
		need(is(roleOf(u), "Admin"), "Only Admin can restore a request")
		o := findOrder(s, get(a, "id"), u, true)
		need(o.Deleted != nil, "This request is not deleted")
		checkLock(s, u, lockKey(dynString(o.ID)), now, false)
		// References reused while it was deleted would otherwise become duplicates.
		po := norm(dynString(o.PO))
		need(!slices.ContainsFunc(liveOrders(s), func(x *Order) bool { return sameStr(x.CompanyID, o.CompanyID) && norm(dynString(x.PO)) == po }),
			"Another request in this company now uses PO "+tpl(o.PO))
		if text(dynString(o.Invoice)) != "" {
			invoice := norm(dynString(o.Invoice))
			need(!slices.ContainsFunc(liveOrders(s), func(x *Order) bool {
				return sameStr(x.SupplierID, o.SupplierID) && norm(dynString(x.Invoice)) == invoice
			}), "Another request from this supplier now uses invoice "+tpl(o.Invoice))
		}
		children := filter(s.Requests, func(q *Request) bool {
			var deletedID any = Undefined
			if q.Deleted != nil {
				deletedID = dynString(q.Deleted.ID)
			}
			return sameStr(q.OrderID, o.ID) && strictEqual(deletedID, dynString(o.Deleted.ID))
		})
		restoreRecord(&o.Deleted, &o.DeletionHistory, u, at)
		for _, q := range children {
			restoreRecord(&q.Deleted, &q.DeletionHistory, u, at)
		}
		entity, company = dynString(o.ID), dynString(o.CompanyID)
		detail = tpl(o.Number) + draftsNote(len(children))

	case isType("request.restore"):
		need(is(roleOf(u), "Admin"), "Only Admin can restore a payment request")
		q := findRequest(s, get(a, "id"), u, true)
		need(q.Deleted != nil, "This payment request is not deleted")
		var o *Order
		for _, x := range s.Orders {
			if sameStr(x.ID, q.OrderID) {
				o = x
				break
			}
		}
		need(o != nil && o.Deleted == nil, "Restore its main request first")
		checkLock(s, u, lockKey(dynString(q.ID)), now, false)
		if !is(q.Status, "Rejected") {
			need(!truthyStr(o.RejectedAt), "Its main request was rejected after this payment request was deleted")
			need(parentAmount(q)+reservation(s, o, Undefined) <= amendmentLimit(o)+0.005,
				"Restoring it would exceed the request's remaining balance; reject or delete the payment requests raised since")
		}
		restoreRecord(&q.Deleted, &q.DeletionHistory, u, at)
		entity, company = dynString(q.ID), dynString(q.CompanyID)
		detail = tpl(q.Number) + " (" + tpl(q.Status) + ")"

	case isType("request.create"):
		o := findOrder(s, get(d, "orderId"), u, false)
		need(canManageRequest(u, o.CompanyID, o.RequestedBy), "Only the order requester, Finance or Admin can create a payment request")
		checkLock(s, u, lockKey(dynString(o.ID)), now, true)
		q := r.createPayment(s, u, o, d, now)
		entity, company, detail = dynString(q.ID), dynString(o.CompanyID), *q.Number

	case isString(typ) && strings.HasPrefix(t, "request."):
		q := findRequest(s, get(a, "id"), u, false)
		o := findOrder(s, dynString(q.OrderID), u, false)
		checkLock(s, u, lockKey(dynString(q.ID)), now, true)
		company = dynString(q.CompanyID)
		action := strings.Split(t, ".")[1]
		need(!truthyStr(o.RejectedAt), "Parent request is rejected")
		switch action {
		case "edit", "submit":
			need(is(q.Status, "Draft") && canManageRequest(u, q.CompanyID, q.RequestedBy),
				"Only the requester, Finance or Admin can edit or submit a draft")
			if action == "edit" {
				r.paymentData(s, o, d, dynString(q.ID)).assignTo(q)
			} else {
				need(reservation(s, o, Undefined) <= num(o.Total)+0.005, "Payment requests exceed order balance")
				// Submitted requests go straight to Finance. The first submitted request of an
				// order commits the order to its budget.
				q.Status, q.Approvals, q.FinalApprovedAt = ptr("Finance"), []*Approval{}, ptr(at)
				if !truthyStr(o.CommittedAt) {
					o.CommittedAt, o.CommitmentRequestID = ptr(at), q.ID
				}
			}
		case "return", "reject":
			allowed := stageActor(u, q)
			if action == "reject" {
				allowed = canReject(u, q)
			}
			need(allowed, "You cannot review this stage")
			need(reason() != "", "Reason is required")
			q.History = append(q.History, &HistoryEntry{Stage: q.Status, Action: ptr(action), By: u.Name, UserID: u.ID, At: ptr(at), Reason: ptr(reason())})
			if action == "return" {
				q.Status = ptr("Draft")
			} else {
				q.Status = ptr("Rejected")
			}
			q.Approvals = []*Approval{}
			deleteField(q, "finalApprovedAt")
			deleteField(q, "documentRequest")
			detail = reason()
		case "documents":
			need(financeActor(u, q.CompanyID, q.RequestedBy) && strIn(q.Status, "Finance", "On Hold"), "Finance role and submitted request required")
			need(reason() != "", "Specify the additional documents required")
			q.DocumentRequest = &DocumentRequest{Description: ptr(reason()), By: u.Name, At: ptr(at), ReturnStatus: q.Status}
			q.Status = ptr("Documents Required")
			detail = get(d, "reason")
		case "support":
			need(is(q.Status, "Documents Required") && canManageRequest(u, q.CompanyID, q.RequestedBy),
				"Only the original requester or Admin can supply these documents")
			files := get(d, "files")
			if isUndefined(files) {
				files = []any{} // default parameter
			}
			q.Files = append(q.Files, documents(files, true)...)
			if q.DocumentRequest == nil {
				throw("Cannot read properties of undefined (reading 'description')")
			}
			q.History = append(q.History, &HistoryEntry{Stage: q.Status, Action: ptr("Documents supplied"), By: u.Name, UserID: u.ID, At: ptr(at), Reason: q.DocumentRequest.Description})
			q.Status = q.DocumentRequest.ReturnStatus
			deleteField(q, "documentRequest")
		case "deletePayment":
			need(isFinanceAdmin(u), "Only Finance or Admin can delete a payment")
			need(is(q.Status, "Paid") && q.Payment != nil, "Paid request required")
			need(reason() != "", "Reason is required")
			deleteField(q, "payment")
			q.Status = ptr("Finance")
			q.History = append(q.History, &HistoryEntry{Stage: ptr("Paid"), Action: ptr("Payment deleted"), By: u.Name, UserID: u.ID, At: ptr(at), Reason: ptr(reason())})
			detail = reason()
		case "remark", "hold", "resume", "pay":
			need(financeActor(u, q.CompanyID, q.RequestedBy) && strIn(q.Status, "Finance", "On Hold"), "Finance role and submitted request required")
			if action == "remark" || action == "hold" {
				need(reason() != "", "Reason or remark required")
				q.Remarks = append(q.Remarks, &Remark{By: u.Name, At: ptr(at), Text: ptr(reason())})
				detail = reason()
			}
			switch action {
			case "hold":
				q.Status = ptr("On Hold")
			case "resume":
				q.Status = ptr("Finance")
			case "pay":
				r.pay(q, u, d, at, now)
				detail = tplNum(q.Amount) + " " + tpl(q.Currency) + ", " + toString(get(d, "paymentType")) + ", " + toString(get(d, "paymentDate"))
			}
		default:
			throw("Unknown request action")
		}

	case isType("master.save"):
		entity, company, detail = r.saveMaster(s, u, d, now)

	case isType("user.save"):
		entity, detail = r.saveUser(s, u, d)

	case isType("task.save"):
		entity, company, detail = r.saveTask(s, u, d, at)

	case isType("task.delete"):
		var task *Task
		for _, x := range s.Tasks {
			if strictEqual(dynString(x.ID), get(a, "id")) {
				task = x
				break
			}
		}
		need(task != nil, "Task not found")
		need(canEditTasks(u, task.CompanyID), "Only Planning or Admin can change project tasks")
		s.Tasks = slices.DeleteFunc(s.Tasks, func(x *Task) bool { return x == task })
		company = dynString(task.CompanyID)
		projectName := "Project"
		for _, p := range s.Projects {
			if sameStr(p.ID, task.ProjectID) {
				if n := field(p, "name"); truthy(n) {
					projectName = toString(n)
				}
				break
			}
		}
		detail = projectName + ": " + tpl(task.Name)

	case isType("settings.save"):
		need(is(roleOf(u), "Admin"), "Admin required")
		for _, key := range []string{"orderFormat", "numberFormat"} {
			f := text(get(d, key))
			need(utf16Len(f) <= 100 && strings.Contains(f, "{COMPANY}") && strings.Contains(f, "{PROJECT}") &&
				strings.Contains(f, "{SEQ}") && onlyKnownPlaceholders(f),
				"Formats must contain {COMPANY}, {PROJECT} and {SEQ}; optional {YYYY}")
		}
		need(!strictEqual(get(d, "orderFormat"), get(d, "numberFormat")), "Use distinct parent and payment formats")
		need(toNumber(get(d, "lockMinutes")) == 10, "Lock duration is 10 minutes")
		s.Settings = &Settings{OrderFormat: ptr(text(get(d, "orderFormat"))), NumberFormat: ptr(text(get(d, "numberFormat"))), LockMinutes: ptr(10.0)}
		detail = "Numbering formats updated; existing references and counters retained"

	case !isString(typ):
		// a.type.startsWith(...) on a non-string.
		if nullish(typ) {
			throw("Cannot read properties of " + nullName(typ) + " (reading 'startsWith')")
		}
		throw("a.type.startsWith is not a function")

	default:
		throw("Unknown action")
	}
	action := t
	if t == "request.deletePayment" {
		action = "Payment deleted"
	}
	r.audit(s, u, action, entity, company, detail, now)
}

func draftsNote(n int) string {
	switch n {
	case 0:
		return ""
	case 1:
		return " and 1 draft payment request"
	}
	return " and " + numberToString(float64(n)) + " draft payment requests"
}

// onlyKnownPlaceholders is !/\{(?!COMPANY\}|PROJECT\}|SEQ\}|YYYY\})/.test(f).
func onlyKnownPlaceholders(f string) bool {
	for i := 0; i < len(f); i++ {
		if f[i] != '{' {
			continue
		}
		rest := f[i+1:]
		if !(strings.HasPrefix(rest, "COMPANY}") || strings.HasPrefix(rest, "PROJECT}") ||
			strings.HasPrefix(rest, "SEQ}") || strings.HasPrefix(rest, "YYYY}")) {
			return false
		}
	}
	return true
}

func (r *Rules) pay(q *Request, u *User, d any, at string, now int64) {
	need(is(q.Status, "Finance"), "Release the hold before payment")
	paymentType := get(d, "paymentType")
	need(strictEqual(paymentType, "Cheque") || strictEqual(paymentType, "Transfer") || strictEqual(paymentType, "TT"), "Select a payment type")
	paymentDate := get(d, "paymentDate")
	date := toString(paymentDate)
	need(dateShape(text(paymentDate)) && !nullish(paymentDate) && parsableAroundDate(date) && !utf16Less(today(now), date),
		"Enter a valid payment date no later than today")
	files := get(d, "files")
	if !truthy(files) {
		if f := get(d, "file"); truthy(f) {
			files = []any{f}
		} else {
			files = []any{}
		}
	}
	q.Payment = &Payment{
		Amount: q.Amount, Currency: q.Currency, Type: ptr(paymentType.(string)),
		Files: documents(files, false), By: u.Name, UserID: u.ID, At: ptr(at),
	}
	setField(q.Payment, "date", paymentDate)
	q.Status = ptr("Paid")
}
