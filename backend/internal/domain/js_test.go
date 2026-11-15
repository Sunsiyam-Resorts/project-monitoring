package domain

import (
	"encoding/json"
	"math"
	"os"
	"strconv"
	"testing"
)

// testdata/js-semantics.json holds results computed by Node.js (V8) for the language
// operations the rules depend on, including cases the recorded traces never reach.
// Non-finite numbers and -0 are written as {"n": "NaN" | "Infinity" | "-Infinity" | "-0"}.
type jsVectors struct {
	Str     [][2]json.RawMessage `json:"str"`
	Round   [][2]json.RawMessage `json:"round"`
	Money   [][2]json.RawMessage `json:"money"`
	Fixed   [][2]json.RawMessage `json:"fixed"`
	Num     [][2]json.RawMessage `json:"num"`
	Upper   [][2]string          `json:"upper"`
	Lower   [][2]string          `json:"lower"`
	ISO     [][2]json.RawMessage `json:"iso"`
	Today   [][2]json.RawMessage `json:"today"`
	Replace [][4]string          `json:"replace"`
	Email   [][2]json.RawMessage `json:"email"`
}

func jsNum(t *testing.T, raw json.RawMessage) float64 {
	var special struct{ N string }
	if json.Unmarshal(raw, &special) == nil && special.N != "" {
		if special.N == "-0" {
			return math.Copysign(0, -1)
		}
		f, _ := strconv.ParseFloat(special.N, 64)
		if special.N == "NaN" {
			return math.NaN()
		}
		return f
	}
	var f float64
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatalf("not a number: %s", raw)
	}
	return f
}

func jsStr(t *testing.T, raw json.RawMessage) string {
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		t.Fatalf("not a string: %s", raw)
	}
	return s
}

func sameNumber(a, b float64) bool {
	return (math.IsNaN(a) && math.IsNaN(b)) || (a == b && math.Signbit(a) == math.Signbit(b))
}

func TestJavaScriptSemantics(t *testing.T) {
	data, err := os.ReadFile("testdata/js-semantics.json")
	if err != nil {
		t.Fatal(err)
	}
	var v jsVectors
	if err := json.Unmarshal(data, &v); err != nil {
		t.Fatal(err)
	}
	for _, c := range v.Str {
		if got := numberToString(jsNum(t, c[0])); got != jsStr(t, c[1]) {
			t.Errorf("String(%s) = %q, V8 %s", c[0], got, c[1])
		}
	}
	for _, c := range v.Round {
		if got, want := round(jsNum(t, c[0])), jsNum(t, c[1]); !sameNumber(got, want) {
			t.Errorf("Math.round(%s) = %v, V8 %v", c[0], got, want)
		}
	}
	for _, c := range v.Money {
		if got, want := money(jsNum(t, c[0])), jsNum(t, c[1]); !sameNumber(got, want) {
			t.Errorf("money(%s) = %v, V8 %v", c[0], got, want)
		}
	}
	for _, c := range v.Fixed {
		if got := toFixed(jsNum(t, c[0]), 6); got != jsStr(t, c[1]) {
			t.Errorf("(%s).toFixed(6) = %q, V8 %s", c[0], got, c[1])
		}
	}
	for _, c := range v.Num {
		if got, want := stringToNumber(jsStr(t, c[0])), jsNum(t, c[1]); !sameNumber(got, want) {
			t.Errorf("Number(%s) = %v, V8 %v", c[0], got, want)
		}
	}
	for _, c := range v.Upper {
		if got := upper(c[0]); got != c[1] {
			t.Errorf("%q.toUpperCase() = %q, V8 %q", c[0], got, c[1])
		}
	}
	for _, c := range v.Lower {
		if got := lower(c[0]); got != c[1] {
			t.Errorf("%q.toLowerCase() = %q, V8 %q", c[0], got, c[1])
		}
	}
	for _, c := range v.ISO {
		if got := isoString(int64(jsNum(t, c[0]))); got != jsStr(t, c[1]) {
			t.Errorf("toISOString(%s) = %q, V8 %s", c[0], got, c[1])
		}
	}
	for _, c := range v.Today {
		if got := today(int64(jsNum(t, c[0]))); got != jsStr(t, c[1]) {
			t.Errorf("today(%s) = %q, V8 %s", c[0], got, c[1])
		}
	}
	for _, c := range v.Replace {
		if got := jsReplaceAll(c[0], c[1], c[2]); got != c[3] {
			t.Errorf("%q.replaceAll(%q, %q) = %q, V8 %q", c[0], c[1], c[2], got, c[3])
		}
	}
	for _, c := range v.Email {
		var want bool
		json.Unmarshal(c[1], &want)
		if got := validEmail(jsStr(t, c[0])); got != want {
			t.Errorf("email %s: %v, V8 %v", c[0], got, want)
		}
	}
}

func TestDynamicCoercions(t *testing.T) {
	for _, c := range []struct {
		v    any
		num  float64
		str  string
		bool bool
	}{
		{Undefined, math.NaN(), "undefined", false},
		{nil, 0, "null", false},
		{true, 1, "true", true},
		{"", 0, "", false},
		{" 12 ", 12, " 12 ", true},
		{[]any{}, 0, "", true},
		{[]any{"5"}, 5, "5", true},
		{[]any{1.0, nil, "a"}, math.NaN(), "1,,a", true},
		{map[string]any{}, math.NaN(), "[object Object]", true},
		{math.NaN(), math.NaN(), "NaN", false},
	} {
		if got := toNumber(c.v); !sameNumber(got, c.num) {
			t.Errorf("Number(%v) = %v, want %v", c.v, got, c.num)
		}
		if got := toString(c.v); got != c.str {
			t.Errorf("String(%v) = %q, want %q", c.v, got, c.str)
		}
		if got := truthy(c.v); got != c.bool {
			t.Errorf("!!%v = %v", c.v, got)
		}
	}
	if text(nil) != "" || text(Undefined) != "" || text("\u00a0 x \ufeff") != "x" || norm(" a\u3000 b\t\nß ") != "A B SS" {
		t.Fatal("text/norm")
	}
	if !onlyKnownPlaceholders("{COMPANY}-{PROJECT}-{YYYY}-{SEQ}") || onlyKnownPlaceholders("{COMPANY}{X}") || onlyKnownPlaceholders("{SEQ") {
		t.Fatal("placeholder check")
	}
	if initials("  fictional lagoon   retreat") != "FLR" || initials("🌴 Palm") != "P" || initials("Ünïcode Örtlich") != "CODE" {
		t.Fatal("initials")
	}
	if !parsableAroundDate(" 2026-02-30\t") || parsableAroundDate("2026-01-01\u2028") || parsableAroundDate(" 2026-13-01") {
		t.Fatal("Date.parse around a date")
	}
}

// Stored members with unexpected JSON types and unknown members survive untouched.
func TestUnexpectedStoredDataIsKept(t *testing.T) {
	raw := `{"version":3,"orders":[{"id":"o1","total":"100","files":"none","extra":{"data":"keep-in-state"},"amendment":null}],
		"requests":[],"users":[{"id":"u","companies":["c1",null],"active":"yes","team":"Planning"}],"locks":{"o1":null},"counters":{"a":1},
		"sampleVersion":7,"settings":{"orderFormat":"A{SEQ}","x":[1,{"y":null}]}}`
	s, err := DecodeState([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if s.Orders[0].Total != nil || s.Orders[0].Extra["total"] != "100" || s.Users[0].Companies != nil {
		t.Fatal("mismatched types must stay out of the typed fields")
	}
	var a, b any
	json.Unmarshal([]byte(raw), &a)
	json.Unmarshal(EncodeState(s), &b)
	if d := diff(b, a, false); len(d) > 0 {
		t.Fatalf("round trip: %v", d)
	}
	vis, err := NewRules().VisibleState(&State{Companies: []*Company{}, Projects: []*Project{}, Budgets: []*Budget{}, Orders: s.Orders,
		Requests: []*Request{}, Audit: []*AuditEntry{}, Users: []*User{}}, &User{Role: ptr("Admin"), GroupAccess: ptr(true)})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := vis.Orders[0].Extra["extra"].(map[string]any)["data"]; ok {
		t.Fatal("visibleState must strip string data members at any depth")
	}
}
