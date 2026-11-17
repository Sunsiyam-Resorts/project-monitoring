package domain

// The workspace stored as JSONB in portal_state (see docs/DATABASE.md). Field names are
// the stored JSON member names. A nil field is an absent member; members that are not
// modelled here are kept in Extra and written back unchanged.

// State is the whole workspace.
type State struct {
	Version    *float64           `json:"version"`
	Companies  []*Company         `json:"companies"`
	Projects   []*Project         `json:"projects"`
	Tasks      []*Task            `json:"tasks"`
	Budgets    []*Budget          `json:"budgets"`
	Suppliers  []*Supplier        `json:"suppliers"`
	Currencies []*Currency        `json:"currencies"`
	Users      []*User            `json:"users"`
	Orders     []*Order           `json:"orders"`
	Requests   []*Request         `json:"requests"`
	Audit      []*AuditEntry      `json:"audit"`
	Locks      map[string]*Lock   `json:"locks"`
	Settings   *Settings          `json:"settings"`
	Counters   map[string]float64 `json:"counters"`
	Sequence   *float64           `json:"sequence"` // legacy
	// Only in visibleState responses for Admin: deleted records for the Deleted page.
	DeletedOrders   []*Order   `json:"deletedOrders"`
	DeletedRequests []*Request `json:"deletedRequests"`
	Extra           Extra
}

type Company struct {
	ID    *string `json:"id"`
	Name  *string `json:"name"`
	Code  *string `json:"code"`
	Extra Extra
}

type Project struct {
	ID        *string `json:"id"`
	Name      *string `json:"name"`
	Code      *string `json:"code"`
	CompanyID *string `json:"companyId"`
	Extra     Extra
}

type Task struct {
	ID          *string `json:"id"`
	CompanyID   *string `json:"companyId"`
	ProjectID   *string `json:"projectId"`
	Name        *string `json:"name"`
	Status      *string `json:"status"`
	Due         *string `json:"due"`
	Owner       *string `json:"owner"`
	CreatedAt   *string `json:"createdAt"`
	CreatedBy   *string `json:"createdBy"`
	UpdatedAt   *string `json:"updatedAt"`
	CompletedAt *string `json:"completedAt"`
	Extra       Extra
}

type Budget struct {
	ID         *string     `json:"id"`
	Name       *string     `json:"name"`
	CompanyID  *string     `json:"companyId"`
	ProjectID  *string     `json:"projectId"`
	Currency   *string     `json:"currency"`
	Rate       *float64    `json:"rate"`
	Categories []*Category `json:"categories"`
	Revisions  []*Revision `json:"revisions"`
	Extra      Extra
}

type Category struct {
	ID     *string  `json:"id"`
	Name   *string  `json:"name"`
	Amount *float64 `json:"amount"`
	Extra  Extra
}

// Revision keeps a budget's categories, currency and rate before a revision.
type Revision struct {
	At         *string     `json:"at"`
	By         *string     `json:"by"`
	Reason     *string     `json:"reason"`
	Currency   *string     `json:"currency"`
	Rate       *float64    `json:"rate"`
	Categories []*Category `json:"categories"`
	Extra      Extra
}

type Supplier struct {
	ID    *string `json:"id"`
	Name  *string `json:"name"`
	Email *string `json:"email"`
	Extra Extra
}

// Currency rates are currency units per USD 1.
type Currency struct {
	ID    *string  `json:"id"`
	Name  *string  `json:"name"`
	Rate  *float64 `json:"rate"`
	Extra Extra
}

// User is an application user. Retired members (team, approvalLevel) stay in Extra
// until migration or the next save removes them.
type User struct {
	ID           *string  `json:"id"`
	Name         *string  `json:"name"`
	Username     *string  `json:"username"`
	Email        *string  `json:"email"`
	Role         *string  `json:"role"`
	Companies    []string `json:"companies"`
	GroupAccess  *bool    `json:"groupAccess"`
	Active       *bool    `json:"active"`
	PasswordHash *string  `json:"passwordHash"`
	TOTPSecret   *string  `json:"totpSecret"`
	LastTOTP     *string  `json:"lastTotp"`
	Extra        Extra
}

// Order is a main request: the unapproved parent of payment requests. Amendment
// snapshots (previous, data) use the same type.
type Order struct {
	ID                  *string       `json:"id"`
	Number              *string       `json:"number"`
	CompanyID           *string       `json:"companyId"`
	ProjectID           *string       `json:"projectId"`
	BudgetID            *string       `json:"budgetId"`
	SupplierID          *string       `json:"supplierId"`
	Currency            *string       `json:"currency"`
	Rate                *float64      `json:"rate"`
	Total               *float64      `json:"total"`
	PO                  *string       `json:"po"`
	Invoice             *string       `json:"invoice"`
	Description         *string       `json:"description"`
	Allocations         []*Allocation `json:"allocations"`
	Files               []*File       `json:"files"`
	RequestedBy         *string       `json:"requestedBy"`
	CreatedBy           *string       `json:"createdBy"`
	CreatedAt           *string       `json:"createdAt"`
	CommittedAt         *string       `json:"committedAt"`
	CommitmentRequestID *string       `json:"commitmentRequestId"`
	RejectedAt          *string       `json:"rejectedAt"`
	RejectedBy          *string       `json:"rejectedBy"`
	RejectionReason     *string       `json:"rejectionReason"`
	Amendment           *Amendment    `json:"amendment"`
	Amendments          []*Amendment  `json:"amendments"`
	AmendmentAttempts   []*Amendment  `json:"amendmentAttempts"`
	Deleted             *Deletion     `json:"deleted"`
	DeletionHistory     []*Deletion   `json:"deletionHistory"`
	Extra               Extra
}

type Allocation struct {
	CategoryID *string  `json:"categoryId"`
	Amount     *float64 `json:"amount"`
	Extra      Extra
}

// File is a supporting PDF; Data is base64 and is left out of general state responses.
type File struct {
	Name  *string `json:"name"`
	Type  *string `json:"type"`
	Data  *string `json:"data"`
	Extra Extra
}

type Amendment struct {
	ID          *string         `json:"id"`
	Previous    *Order          `json:"previous"`
	Data        *Order          `json:"data"`
	Reason      *string         `json:"reason"`
	Status      *string         `json:"status"`
	CompanyID   *string         `json:"companyId"`
	RequestedBy *string         `json:"requestedBy"`
	Approvals   []*Approval     `json:"approvals"`
	History     []*HistoryEntry `json:"history"`
	CreatedAt   *string         `json:"createdAt"`
	ApprovedAt  *string         `json:"approvedAt"`
	Extra       Extra
}

type Approval struct {
	Stage  *string `json:"stage"`
	By     *string `json:"by"`
	UserID *string `json:"userId"`
	At     *string `json:"at"`
	Extra  Extra
}

type HistoryEntry struct {
	Stage  *string `json:"stage"`
	Action *string `json:"action"`
	By     *string `json:"by"`
	UserID *string `json:"userId"`
	At     *string `json:"at"`
	Reason *string `json:"reason"`
	Extra  Extra
}

// Deletion marks a deleted record; restoring moves it into deletionHistory.
type Deletion struct {
	ID           *string `json:"id"`
	At           *string `json:"at"`
	By           *string `json:"by"`
	UserID       *string `json:"userId"`
	Reason       *string `json:"reason"`
	WithOrder    *string `json:"withOrder"`
	RestoredAt   *string `json:"restoredAt"`
	RestoredBy   *string `json:"restoredBy"`
	RestoredByID *string `json:"restoredById"`
	Extra        Extra
}

// Request is a payment request: a child of an order with its own status and history.
type Request struct {
	ID              *string          `json:"id"`
	Number          *string          `json:"number"`
	OrderID         *string          `json:"orderId"`
	CompanyID       *string          `json:"companyId"`
	Status          *string          `json:"status"`
	RequestedBy     *string          `json:"requestedBy"`
	CreatedBy       *string          `json:"createdBy"`
	CreatedAt       *string          `json:"createdAt"`
	Currency        *string          `json:"currency"`
	Rate            *float64         `json:"rate"`
	Amount          *float64         `json:"amount"`
	OrderAmount     *float64         `json:"orderAmount"`
	OrderRate       *float64         `json:"orderRate"`
	Percent         *float64         `json:"percent"`
	Date            *string          `json:"date"`
	Terms           *string          `json:"terms"`
	Approvals       []*Approval      `json:"approvals"`
	History         []*HistoryEntry  `json:"history"`
	Remarks         []*Remark        `json:"remarks"`
	Files           []*File          `json:"files"`
	FinalApprovedAt *string          `json:"finalApprovedAt"`
	DocumentRequest *DocumentRequest `json:"documentRequest"`
	Payment         *Payment         `json:"payment"`
	Deleted         *Deletion        `json:"deleted"`
	DeletionHistory []*Deletion      `json:"deletionHistory"`
	Extra           Extra
}

type Remark struct {
	By    *string `json:"by"`
	At    *string `json:"at"`
	Text  *string `json:"text"`
	Extra Extra
}

type DocumentRequest struct {
	Description  *string `json:"description"`
	By           *string `json:"by"`
	At           *string `json:"at"`
	ReturnStatus *string `json:"returnStatus"`
	Extra        Extra
}

// Payment records the payment of a request; File is the legacy single document.
type Payment struct {
	Amount   *float64 `json:"amount"`
	Currency *string  `json:"currency"`
	Date     *string  `json:"date"`
	Type     *string  `json:"type"`
	Files    []*File  `json:"files"`
	File     *File    `json:"file"`
	By       *string  `json:"by"`
	UserID   *string  `json:"userId"`
	At       *string  `json:"at"`
	Extra    Extra
}

type AuditEntry struct {
	ID        *string `json:"id"`
	At        *string `json:"at"`
	UserID    *string `json:"userId"`
	User      *string `json:"user"`
	Action    *string `json:"action"`
	Entity    *string `json:"entity"`
	CompanyID *string `json:"companyId"`
	Detail    *string `json:"detail"`
	Extra     Extra
}

// Lock is a user-facing record lock; Expires is in epoch milliseconds.
type Lock struct {
	UserID  *string  `json:"userId"`
	Name    *string  `json:"name"`
	Expires *float64 `json:"expires"`
	Extra   Extra
}

type Settings struct {
	OrderFormat  *string  `json:"orderFormat"`
	NumberFormat *string  `json:"numberFormat"`
	LockMinutes  *float64 `json:"lockMinutes"`
	Extra        Extra
}

// JSON encoding: every record encodes the way JSON.stringify writes the JavaScript
// object and decodes losslessly (see record.go).

func (x *State) MarshalJSON() ([]byte, error)           { return Marshal(x), nil }
func (x *State) UnmarshalJSON(b []byte) error           { return unmarshalRecord(b, x) }
func (x *Company) MarshalJSON() ([]byte, error)         { return Marshal(x), nil }
func (x *Company) UnmarshalJSON(b []byte) error         { return unmarshalRecord(b, x) }
func (x *Project) MarshalJSON() ([]byte, error)         { return Marshal(x), nil }
func (x *Project) UnmarshalJSON(b []byte) error         { return unmarshalRecord(b, x) }
func (x *Task) MarshalJSON() ([]byte, error)            { return Marshal(x), nil }
func (x *Task) UnmarshalJSON(b []byte) error            { return unmarshalRecord(b, x) }
func (x *Budget) MarshalJSON() ([]byte, error)          { return Marshal(x), nil }
func (x *Budget) UnmarshalJSON(b []byte) error          { return unmarshalRecord(b, x) }
func (x *Category) MarshalJSON() ([]byte, error)        { return Marshal(x), nil }
func (x *Category) UnmarshalJSON(b []byte) error        { return unmarshalRecord(b, x) }
func (x *Revision) MarshalJSON() ([]byte, error)        { return Marshal(x), nil }
func (x *Revision) UnmarshalJSON(b []byte) error        { return unmarshalRecord(b, x) }
func (x *Supplier) MarshalJSON() ([]byte, error)        { return Marshal(x), nil }
func (x *Supplier) UnmarshalJSON(b []byte) error        { return unmarshalRecord(b, x) }
func (x *Currency) MarshalJSON() ([]byte, error)        { return Marshal(x), nil }
func (x *Currency) UnmarshalJSON(b []byte) error        { return unmarshalRecord(b, x) }
func (x *User) MarshalJSON() ([]byte, error)            { return Marshal(x), nil }
func (x *User) UnmarshalJSON(b []byte) error            { return unmarshalRecord(b, x) }
func (x *Order) MarshalJSON() ([]byte, error)           { return Marshal(x), nil }
func (x *Order) UnmarshalJSON(b []byte) error           { return unmarshalRecord(b, x) }
func (x *Allocation) MarshalJSON() ([]byte, error)      { return Marshal(x), nil }
func (x *Allocation) UnmarshalJSON(b []byte) error      { return unmarshalRecord(b, x) }
func (x *File) MarshalJSON() ([]byte, error)            { return Marshal(x), nil }
func (x *File) UnmarshalJSON(b []byte) error            { return unmarshalRecord(b, x) }
func (x *Amendment) MarshalJSON() ([]byte, error)       { return Marshal(x), nil }
func (x *Amendment) UnmarshalJSON(b []byte) error       { return unmarshalRecord(b, x) }
func (x *Approval) MarshalJSON() ([]byte, error)        { return Marshal(x), nil }
func (x *Approval) UnmarshalJSON(b []byte) error        { return unmarshalRecord(b, x) }
func (x *HistoryEntry) MarshalJSON() ([]byte, error)    { return Marshal(x), nil }
func (x *HistoryEntry) UnmarshalJSON(b []byte) error    { return unmarshalRecord(b, x) }
func (x *Deletion) MarshalJSON() ([]byte, error)        { return Marshal(x), nil }
func (x *Deletion) UnmarshalJSON(b []byte) error        { return unmarshalRecord(b, x) }
func (x *Request) MarshalJSON() ([]byte, error)         { return Marshal(x), nil }
func (x *Request) UnmarshalJSON(b []byte) error         { return unmarshalRecord(b, x) }
func (x *Remark) MarshalJSON() ([]byte, error)          { return Marshal(x), nil }
func (x *Remark) UnmarshalJSON(b []byte) error          { return unmarshalRecord(b, x) }
func (x *DocumentRequest) MarshalJSON() ([]byte, error) { return Marshal(x), nil }
func (x *DocumentRequest) UnmarshalJSON(b []byte) error { return unmarshalRecord(b, x) }
func (x *Payment) MarshalJSON() ([]byte, error)         { return Marshal(x), nil }
func (x *Payment) UnmarshalJSON(b []byte) error         { return unmarshalRecord(b, x) }
func (x *AuditEntry) MarshalJSON() ([]byte, error)      { return Marshal(x), nil }
func (x *AuditEntry) UnmarshalJSON(b []byte) error      { return unmarshalRecord(b, x) }
func (x *Lock) MarshalJSON() ([]byte, error)            { return Marshal(x), nil }
func (x *Lock) UnmarshalJSON(b []byte) error            { return unmarshalRecord(b, x) }
func (x *Settings) MarshalJSON() ([]byte, error)        { return Marshal(x), nil }
func (x *Settings) UnmarshalJSON(b []byte) error        { return unmarshalRecord(b, x) }

// DecodeState decodes the stored workspace JSON.
func DecodeState(data []byte) (*State, error) {
	s := new(State)
	if err := unmarshalRecord(data, s); err != nil {
		return nil, err
	}
	return s, nil
}

// EncodeState encodes the workspace for storage, as JSON.stringify would.
func EncodeState(s *State) []byte { return Marshal(s) }

// Small helpers for optional fields.

func ptr[T any](v T) *T { return &v }

// str returns the string or "" when absent.
func str(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// tpl is a string field inside a template literal: absent prints "undefined".
func tpl(p *string) string {
	if p == nil {
		return "undefined"
	}
	return *p
}

// num returns the number or NaN when absent (undefined in arithmetic).
func num(p *float64) float64 {
	if p == nil {
		return nan
	}
	return *p
}

// numOr is a || b for number fields.
func numOr(a, b *float64) *float64 {
	if a != nil && truthy(*a) {
		return a
	}
	return b
}

// strOr is a || b for string fields.
func strOr(a, b *string) *string {
	if a != nil && *a != "" {
		return a
	}
	return b
}

// sameStr is a === b for two optional string fields.
func sameStr(a, b *string) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

// is is field === v for an optional string field and a constant.
func is(p *string, v string) bool { return p != nil && *p == v }

// isTrue is !!flag for an optional boolean field.
func isTrue(p *bool) bool { return p != nil && *p }

func strIn(p *string, values ...string) bool {
	if p == nil {
		return false
	}
	for _, v := range values {
		if *p == v {
			return true
		}
	}
	return false
}
