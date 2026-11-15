package domain

// Replays calls recorded from the JavaScript rules (frontend/scripts/traces) against
// this port and compares every outcome. testdata/traces.json.gz is recorded while the
// frontend test suite runs (npm run traces); testdata/fuzz-traces.json.gz comes from a
// randomised scenario (frontend/scripts/traces/fuzz.mjs) that reaches more branches.

import (
	"compress/gzip"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

type traceFile struct {
	Version int                        `json:"version"`
	States  map[string]json.RawMessage `json:"states"`
	Calls   []traceCall                `json:"calls"`
}

type traceCall struct {
	Fn           string          `json:"fn"`
	State        string          `json:"state"`
	User         json.RawMessage `json:"user"`
	UserInState  bool            `json:"userInState"`
	Action       json.RawMessage `json:"action"`
	Query        json.RawMessage `json:"query"`
	Now          *float64        `json:"now"`
	IDs          []string        `json:"ids"`
	Clock        []float64       `json:"clock"`
	OK           bool            `json:"ok"`
	After        string          `json:"after"`
	ReturnsState *bool           `json:"returnsState"`
	Returned     json.RawMessage `json:"returned"`
	UserAfter    json.RawMessage `json:"userAfter"`
	Out          string          `json:"out"`
	Error        string          `json:"error"`
}

func loadTraces(t *testing.T, name string) *traceFile {
	t.Helper()
	f, err := os.Open(filepath.Join("testdata", name))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	z, err := gzip.NewReader(f)
	if err != nil {
		t.Fatal(err)
	}
	var tf traceFile
	if err := json.NewDecoder(z).Decode(&tf); err != nil {
		t.Fatal(err)
	}
	if tf.Version != 1 {
		t.Fatalf("%s: unsupported trace version %d", name, tf.Version)
	}
	return &tf
}

func generic(t testing.TB, b []byte) any {
	t.Helper()
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	return v
}

// jsonDiff lists the paths where a (Go) and b (JavaScript) differ. With lenient, a
// missing member equals null (JSON.stringify drops undefined; JSONB keeps null).
func jsonDiff(path string, a, b any, lenient bool, out *[]string) {
	if len(*out) >= 25 {
		return
	}
	show := func(v any) string {
		s := string(Marshal(v))
		if len(s) > 160 {
			s = s[:160] + "…"
		}
		return s
	}
	switch x := a.(type) {
	case map[string]any:
		y, ok := b.(map[string]any)
		if !ok {
			*out = append(*out, fmt.Sprintf("%s: go %s, js %s", path, show(a), show(b)))
			return
		}
		keys := map[string]bool{}
		for k := range x {
			keys[k] = true
		}
		for k := range y {
			keys[k] = true
		}
		for _, k := range sortedKeys(keys) {
			xv, xok := x[k]
			yv, yok := y[k]
			p := path + "." + k
			switch {
			case xok && yok:
				jsonDiff(p, xv, yv, lenient, out)
			case lenient && (xv == nil && yv == nil):
			case !yok:
				*out = append(*out, fmt.Sprintf("%s: only in go: %s", p, show(xv)))
			default:
				*out = append(*out, fmt.Sprintf("%s: only in js: %s", p, show(yv)))
			}
		}
	case []any:
		y, ok := b.([]any)
		if !ok || len(x) != len(y) {
			*out = append(*out, fmt.Sprintf("%s: go %s, js %s", path, show(a), show(b)))
			return
		}
		for i := range x {
			jsonDiff(fmt.Sprintf("%s[%d]", path, i), x[i], y[i], lenient, out)
		}
	case float64:
		y, ok := b.(float64)
		if !ok || !(x == y || (math.IsNaN(x) && math.IsNaN(y))) {
			*out = append(*out, fmt.Sprintf("%s: go %s, js %s", path, show(a), show(b)))
		}
	default:
		if a != b {
			*out = append(*out, fmt.Sprintf("%s: go %s, js %s", path, show(a), show(b)))
		}
	}
}

func diff(a, b any, lenient bool) []string {
	var out []string
	jsonDiff("$", a, b, lenient, &out)
	return out
}

// sequence feeds recorded values back and counts what the port asks for.
type sequence[T any] struct {
	values []T
	used   int
	name   string
}

type exhausted struct{ name string }

func (s *sequence[T]) next() T {
	if s.used >= len(s.values) {
		s.used++
		panic(exhausted{s.name})
	}
	s.used++
	return s.values[s.used-1]
}

func replay(t *testing.T, tf *traceFile, c traceCall) (problems []string) {
	state, err := DecodeState(tf.States[c.State])
	if err != nil {
		return []string{"decode state: " + err.Error()}
	}
	var u *User
	if len(c.User) > 0 && string(c.User) != "null" {
		want := generic(t, c.User)
		if c.UserInState {
			for _, x := range state.Users {
				if len(diff(dynOf(x), want, false)) == 0 {
					u = x
					break
				}
			}
			if u == nil {
				return []string{"user marked as part of the state was not found in it"}
			}
		} else {
			u = new(User)
			if err := u.UnmarshalJSON(c.User); err != nil {
				return []string{"decode user: " + err.Error()}
			}
		}
	}
	ids := &sequence[string]{values: c.IDs, name: "randomId()"}
	clock := &sequence[float64]{values: c.Clock, name: "Date.now()"}
	rules := &Rules{NewID: ids.next, Clock: func() int64 { return int64(clock.next()) }}
	var now int64
	if c.Now != nil {
		now = int64(*c.Now)
	}
	var out any
	err = func() (err error) {
		defer func() {
			if p := recover(); p != nil {
				e, ok := p.(exhausted)
				if !ok {
					panic(p)
				}
				err = fmt.Errorf("asked for more %s values than recorded", e.name)
			}
		}()
		switch c.Fn {
		case "apply":
			return rules.Apply(state, u, generic(t, c.Action), now)
		case "migrateState":
			return rules.MigrateState(state, now)
		case "visibleState":
			v, err := rules.VisibleState(state, u)
			out = v
			return err
		case "supportingFile":
			q := generic(t, c.Query).(map[string]any)
			f, err := rules.SupportingFile(state, u, FileQuery{
				ID: member(q, "id"), Kind: member(q, "kind"), Index: member(q, "index"),
				Version: member(q, "version"), Side: member(q, "side"),
			}, now)
			out = f
			return err
		}
		return fmt.Errorf("unknown function %q", c.Fn)
	}()
	// An InternalError would panic through capture in the exhausted case; report it.
	var ie *InternalError
	if errors.As(err, &ie) {
		if e, ok := ie.Value.(exhausted); ok {
			err = fmt.Errorf("asked for more %s values than recorded", e.name)
		}
	}
	if ids.used != len(c.IDs) {
		problems = append(problems, fmt.Sprintf("randomId(): go used %d values, js %d", ids.used, len(c.IDs)))
	}
	if clock.used != len(c.Clock) {
		problems = append(problems, fmt.Sprintf("Date.now(): go used %d values, js %d", clock.used, len(c.Clock)))
	}
	if !c.OK {
		var de *Error
		switch {
		case err == nil:
			problems = append(problems, fmt.Sprintf("go succeeded, js threw %q", c.Error))
		case !errors.As(err, &de) || de.Message != c.Error:
			problems = append(problems, fmt.Sprintf("error: go %q, js %q", err.Error(), c.Error))
		}
		return problems
	}
	if err != nil {
		if errors.As(err, &ie) {
			return append(problems, fmt.Sprintf("go failed: %v\n%s", err, ie.Stack))
		}
		return append(problems, fmt.Sprintf("go failed: %v; js succeeded", err))
	}
	compare := func(what string, got []byte, want json.RawMessage) {
		for _, d := range diff(generic(t, got), generic(t, want), true) {
			problems = append(problems, what+" "+d)
		}
	}
	switch c.Fn {
	case "apply", "migrateState":
		if c.ReturnsState != nil && !*c.ReturnsState {
			problems = append(problems, "js returned something other than the state")
		}
		compare("state", EncodeState(state), tf.States[c.After])
		if c.Fn == "apply" && !c.UserInState && len(c.UserAfter) > 0 {
			compare("user", Marshal(u), c.UserAfter)
		}
	default:
		compare("result", Marshal(out), tf.States[c.Out])
	}
	return problems
}

func runParity(t *testing.T, name string) {
	tf := loadTraces(t, name)
	if tf == nil {
		t.Skipf("testdata/%s not present", name)
	}
	byFn := map[string][2]int{}
	failed := 0
	for i, c := range tf.Calls {
		problems := replay(t, tf, c)
		n := byFn[c.Fn]
		n[1]++
		if len(problems) == 0 {
			n[0]++
		} else {
			failed++
			if failed <= 15 {
				label := c.Fn
				if c.Fn == "apply" {
					var a struct{ Type any }
					json.Unmarshal(c.Action, &a)
					label += fmt.Sprintf(" %v", a.Type)
				}
				t.Errorf("%s call %d (%s):\n  %s", name, i, label, strings.Join(problems, "\n  "))
			}
		}
		byFn[c.Fn] = n
	}
	var summary []string
	for _, fn := range sortedKeys(byFn) {
		summary = append(summary, fmt.Sprintf("%s %d/%d", fn, byFn[fn][0], byFn[fn][1]))
	}
	t.Logf("%s: %d/%d calls match (%s)", name, len(tf.Calls)-failed, len(tf.Calls), strings.Join(summary, ", "))
	if failed > 0 {
		t.Errorf("%s: %d of %d calls differ from the JavaScript rules", name, failed, len(tf.Calls))
	}
}

func TestParityWithJavaScriptRules(t *testing.T) { runParity(t, "traces.json.gz") }

func TestParityFuzz(t *testing.T) { runParity(t, "fuzz-traces.json.gz") }

// Every recorded state, user and result survives decoding and encoding through the
// typed records unchanged: nothing lost, added or reshaped (a missing member and null
// are different here).
func TestRecordedDataRoundTrips(t *testing.T) {
	for _, name := range []string{"traces.json.gz", "fuzz-traces.json.gz"} {
		tf := loadTraces(t, name)
		if tf == nil {
			continue
		}
		kinds := map[string]string{}
		for _, c := range tf.Calls {
			kinds[c.State] = "state"
			if c.After != "" {
				kinds[c.After] = "state"
			}
			if c.Out != "" {
				kinds[c.Out] = map[string]string{"visibleState": "state", "supportingFile": "file"}[c.Fn]
			}
		}
		hashes := sortedKeys(kinds)
		sort.Strings(hashes)
		checked := 0
		for _, h := range hashes {
			raw := tf.States[h]
			var got []byte
			switch kinds[h] {
			case "state":
				s, err := DecodeState(raw)
				if err != nil {
					t.Fatalf("%s %s: %v", name, h, err)
				}
				got = EncodeState(s)
			case "file":
				f := new(File)
				if err := f.UnmarshalJSON(raw); err != nil {
					t.Fatalf("%s %s: %v", name, h, err)
				}
				got = Marshal(f)
			}
			if d := diff(generic(t, got), generic(t, raw), false); len(d) > 0 {
				t.Errorf("%s %s %s does not round-trip:\n  %s", name, kinds[h], h, strings.Join(d, "\n  "))
			}
			checked++
		}
		users := 0
		for _, c := range tf.Calls {
			for _, raw := range []json.RawMessage{c.User, c.UserAfter} {
				if len(raw) == 0 || string(raw) == "null" {
					continue
				}
				u := new(User)
				if err := u.UnmarshalJSON(raw); err != nil {
					t.Fatal(err)
				}
				if d := diff(generic(t, Marshal(u)), generic(t, raw), false); len(d) > 0 {
					t.Errorf("%s user does not round-trip: %s", name, strings.Join(d, "; "))
				}
				users++
			}
		}
		t.Logf("%s: %d states/results and %d users round-trip", name, checked, users)
	}
}
