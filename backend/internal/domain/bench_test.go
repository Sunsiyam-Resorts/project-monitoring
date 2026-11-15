package domain

import (
	"fmt"
	"strings"
	"testing"
)

// A workspace with 300 orders, 900 payment requests and 15 MB of supporting PDFs: one
// request's work is decode, migrate, visibleState and encode of the whole workspace.
func largeWorkspace(b *testing.B) []byte {
	s := EmptyState()
	s.Companies = append(s.Companies, &Company{ID: ptr("c1"), Name: ptr("Fictional Resort"), Code: ptr("FR")})
	s.Projects = append(s.Projects, &Project{ID: ptr("p1"), CompanyID: ptr("c1"), Name: ptr("Fictional Villas"), Code: ptr("FV")})
	pdf := "JVBERi0" + strings.Repeat("QUJD", 12500) // 50 KB
	for i := 0; i < 300; i++ {
		id := fmt.Sprintf("o%d", i)
		s.Orders = append(s.Orders, &Order{ID: &id, Number: ptr(fmt.Sprintf("FR-FV-REQ-%06d", i)), CompanyID: ptr("c1"), ProjectID: ptr("p1"),
			Currency: ptr("USD"), Rate: ptr(1.0), Total: ptr(1000.0), PO: ptr(fmt.Sprintf("PO-%d", i)), Description: ptr("Fictional works"),
			Allocations: []*Allocation{{CategoryID: ptr("k1"), Amount: ptr(1000.0)}}, Files: []*File{{Name: ptr("q.pdf"), Type: ptr("application/pdf"), Data: &pdf}}})
		for j := 0; j < 3; j++ {
			s.Requests = append(s.Requests, &Request{ID: ptr(fmt.Sprintf("r%d-%d", i, j)), OrderID: &id, CompanyID: ptr("c1"), Number: ptr(fmt.Sprintf("FR-FV-PAY-%06d", i*3+j)),
				Status: ptr("Finance"), Currency: ptr("USD"), Rate: ptr(1.0), Amount: ptr(250.0), OrderAmount: ptr(250.0), OrderRate: ptr(1.0),
				Approvals: []*Approval{}, History: []*HistoryEntry{}, Remarks: []*Remark{}, Files: []*File{}})
		}
	}
	return EncodeState(s)
}

func BenchmarkRequestOnLargeWorkspace(b *testing.B) {
	data := largeWorkspace(b)
	b.SetBytes(int64(len(data)))
	rules := NewRules()
	admin := &User{ID: ptr("a"), Role: ptr("Admin"), GroupAccess: ptr(true)}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s, err := DecodeState(data)
		if err != nil {
			b.Fatal(err)
		}
		if err := rules.MigrateState(s, 0); err != nil {
			b.Fatal(err)
		}
		if _, err := rules.VisibleState(s, admin); err != nil {
			b.Fatal(err)
		}
		EncodeState(s)
	}
}
