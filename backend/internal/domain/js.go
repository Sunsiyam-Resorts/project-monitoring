package domain

// JavaScript semantics that the workflow rules depend on. The rules were written in
// JavaScript (frontend/src/domain/domain.js, which still runs the browser demo); these
// helpers reproduce the exact language behaviour the Go port needs, so that both copies
// give the same results, messages and stored values.

import (
	"math"
	"math/big"
	"strconv"
	"strings"
	"time"
	_ "time/tzdata" // Indian/Maldives must resolve in a minimal container.
	"unicode/utf16"
	"unicode/utf8"

	"golang.org/x/text/cases"
	"golang.org/x/text/language"
)

// isJSSpace reports whether r is JavaScript white space or a line terminator: the
// characters removed by String.prototype.trim and matched by the regular expression \s.
func isJSSpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0xA0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF:
		return true
	}
	return r >= 0x2000 && r <= 0x200A
}

// jsTrim is String.prototype.trim.
func jsTrim(s string) string { return strings.TrimFunc(s, isJSSpace) }

// collapseSpace is s.replace(/\s+/g, " ").
func collapseSpace(s string) string {
	if !strings.ContainsFunc(s, isJSSpace) {
		return s
	}
	var b strings.Builder
	space := false
	for _, r := range s {
		if isJSSpace(r) {
			if !space {
				b.WriteByte(' ')
			}
			space = true
			continue
		}
		space = false
		b.WriteRune(r)
	}
	return b.String()
}

func isASCII(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] >= utf8.RuneSelf {
			return false
		}
	}
	return true
}

// upper is String.prototype.toUpperCase: full Unicode case mapping ("ß" becomes "SS").
func upper(s string) string {
	if isASCII(s) {
		return strings.ToUpper(s)
	}
	return cases.Upper(language.Und).String(s)
}

// lower is String.prototype.toLowerCase, including the final-sigma rule.
func lower(s string) string {
	if isASCII(s) {
		return strings.ToLower(s)
	}
	return cases.Lower(language.Und).String(s)
}

// utf16Len is the JavaScript length of s (UTF-16 code units).
func utf16Len(s string) int {
	if isASCII(s) {
		return len(s)
	}
	n := 0
	for _, r := range s {
		if r >= 0x10000 {
			n += 2
		} else {
			n++
		}
	}
	return n
}

// utf16Slice is s.slice(0, n) for n >= 0. A surrogate pair cut in half becomes U+FFFD,
// the closest a Go string can come to JavaScript's lone surrogate.
func utf16Slice(s string, n int) string {
	if utf16Len(s) <= n {
		return s
	}
	units := utf16.Encode([]rune(s))[:n]
	return string(utf16.Decode(units))
}

// utf16Less compares strings the way JavaScript's < does: by UTF-16 code units.
func utf16Less(a, b string) bool {
	if isASCII(a) && isASCII(b) {
		return a < b
	}
	x, y := utf16.Encode([]rune(a)), utf16.Encode([]rune(b))
	for i := 0; i < len(x) && i < len(y); i++ {
		if x[i] != y[i] {
			return x[i] < y[i]
		}
	}
	return len(x) < len(y)
}

// numberToString is Number.prototype.toString() for base 10.
func numberToString(f float64) string {
	switch {
	case math.IsNaN(f):
		return "NaN"
	case f == 0:
		return "0"
	case math.IsInf(f, 1):
		return "Infinity"
	case math.IsInf(f, -1):
		return "-Infinity"
	case f < 0:
		return "-" + numberToString(-f)
	}
	// Shortest digits that round-trip, as in ECMAScript Number::toString.
	e := strconv.FormatFloat(f, 'e', -1, 64)
	mant, exp, _ := strings.Cut(e, "e")
	digits := strings.Replace(mant, ".", "", 1)
	x, _ := strconv.Atoi(exp)
	k, n := len(digits), x+1
	switch {
	case k <= n && n <= 21:
		return digits + strings.Repeat("0", n-k)
	case 0 < n && n <= 21:
		return digits[:n] + "." + digits[n:]
	case -6 < n && n <= 0:
		return "0." + strings.Repeat("0", -n) + digits
	}
	sign := "+"
	if n-1 < 0 {
		sign = "-"
	}
	m := digits[:1]
	if k > 1 {
		m += "." + digits[1:]
	}
	return m + "e" + sign + strconv.Itoa(abs(n-1))
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

// stringToNumber is the ToNumber conversion of a string (Number("...")).
func stringToNumber(s string) float64 {
	s = jsTrim(s)
	if s == "" {
		return 0
	}
	if len(s) > 2 && s[0] == '0' {
		base := 0
		switch s[1] {
		case 'x', 'X':
			base = 16
		case 'o', 'O':
			base = 8
		case 'b', 'B':
			base = 2
		}
		if base != 0 {
			n, ok := new(big.Int).SetString(s[2:], base)
			if !ok || strings.ContainsAny(s[2:], "_+-") {
				return math.NaN()
			}
			f, _ := new(big.Float).SetInt(n).Float64()
			return f
		}
	}
	body := s
	if body[0] == '+' || body[0] == '-' {
		body = body[1:]
	}
	if body == "Infinity" {
		if s[0] == '-' {
			return math.Inf(-1)
		}
		return math.Inf(1)
	}
	if !decimalLiteral(body) {
		return math.NaN()
	}
	f, _ := strconv.ParseFloat(s, 64)
	return f
}

// decimalLiteral reports whether s is an unsigned StrUnsignedDecimalLiteral without
// Infinity: digits [. digits] [e [+-] digits], or . digits [exponent].
func decimalLiteral(s string) bool {
	i, intDigits, fracDigits := 0, 0, 0
	for i < len(s) && isDigit(s[i]) {
		i++
		intDigits++
	}
	if i < len(s) && s[i] == '.' {
		i++
		for i < len(s) && isDigit(s[i]) {
			i++
			fracDigits++
		}
	}
	if intDigits+fracDigits == 0 {
		return false
	}
	if i < len(s) && (s[i] == 'e' || s[i] == 'E') {
		i++
		if i < len(s) && (s[i] == '+' || s[i] == '-') {
			i++
		}
		expDigits := 0
		for i < len(s) && isDigit(s[i]) {
			i++
			expDigits++
		}
		if expDigits == 0 {
			return false
		}
	}
	return i == len(s)
}

func isDigit(c byte) bool { return c >= '0' && c <= '9' }

// round is Math.round: halves round toward +Infinity.
func round(x float64) float64 {
	if math.IsNaN(x) || math.IsInf(x, 0) || x == math.Trunc(x) {
		return x
	}
	r := math.Floor(x)
	if x-r >= 0.5 {
		r++
	}
	if r == 0 && x < 0 {
		return math.Copysign(0, -1)
	}
	return r
}

// money is the rules' money(): Math.round((Number(n) + Number.EPSILON) * 100) / 100.
func money(n float64) float64 { return round((n+epsilon)*100) / 100 }

const epsilon = 2.220446049250313e-16 // Number.EPSILON

// toFixed is Number.prototype.toFixed(digits): exact decimal value, ties away from zero.
func toFixed(x float64, digits int) string {
	if math.IsNaN(x) {
		return "NaN"
	}
	if math.Abs(x) >= 1e21 || math.IsInf(x, 0) {
		return numberToString(x)
	}
	sign := ""
	if x < 0 {
		sign, x = "-", -x
	}
	r := new(big.Rat).SetFloat64(x)
	scale := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(digits)), nil)
	r.Mul(r, new(big.Rat).SetInt(scale))
	r.Add(r, big.NewRat(1, 2))
	n := new(big.Int).Quo(r.Num(), r.Denom()) // floor for positive values
	s := n.String()
	if digits == 0 {
		return sign + s
	}
	if len(s) <= digits {
		s = strings.Repeat("0", digits-len(s)+1) + s
	}
	return sign + s[:len(s)-digits] + "." + s[len(s)-digits:]
}

// isInteger is Number.isInteger.
func isInteger(f float64) bool { return !math.IsInf(f, 0) && !math.IsNaN(f) && f == math.Trunc(f) }

// positive is the rules' positive(): Number.isFinite(Number(n)) && Number(n) > 0.
func positive(f float64) bool { return !math.IsInf(f, 0) && !math.IsNaN(f) && f > 0 }

// isoString is new Date(ms).toISOString().
func isoString(ms int64) string {
	t := time.UnixMilli(ms).UTC()
	if y := t.Year(); y < 0 || y > 9999 {
		sign := "+"
		if y < 0 {
			sign, y = "-", -y
		}
		return sign + leftPad(strconv.Itoa(y), 6) + t.Format("-01-02T15:04:05.000Z")
	}
	return t.Format("2006-01-02T15:04:05.000Z")
}

func leftPad(s string, n int) string {
	if len(s) >= n {
		return s
	}
	return strings.Repeat("0", n-len(s)) + s
}

var maldives = func() *time.Location {
	loc, err := time.LoadLocation("Indian/Maldives")
	if err != nil {
		panic(err)
	}
	return loc
}()

// today is the rules' today(): the calendar date in the Maldives as YYYY-MM-DD
// (Intl.DateTimeFormat("en-CA", {timeZone: "Indian/Maldives"})).
func today(ms int64) string { return time.UnixMilli(ms).In(maldives).Format("2006-01-02") }

// utcYear is new Date(ms).getUTCFullYear().
func utcYear(ms int64) int { return time.UnixMilli(ms).UTC().Year() }

// dateShape is /^\d{4}-\d{2}-\d{2}$/.test(s).
func dateShape(s string) bool {
	if len(s) != 10 || s[4] != '-' || s[7] != '-' {
		return false
	}
	for _, i := range []int{0, 1, 2, 3, 5, 6, 8, 9} {
		if !isDigit(s[i]) {
			return false
		}
	}
	return true
}

// isoDateValid is !Number.isNaN(Date.parse(s)) for a string of dateShape: V8 accepts any
// month 01-12 and day 01-31 (it does not check the length of the month).
func isoDateValid(s string) bool {
	m, _ := strconv.Atoi(s[5:7])
	d, _ := strconv.Atoi(s[8:10])
	return m >= 1 && m <= 12 && d >= 1 && d <= 31
}

// validDate is /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)).
func validDate(s string) bool { return dateShape(s) && isoDateValid(s) }

// parsableAroundDate is !Number.isNaN(Date.parse(raw)) for a string whose trimmed form
// has dateShape. V8's fallback parser accepts surrounding white space, except the line
// and paragraph separators, and then applies the same month and day limits.
func parsableAroundDate(raw string) bool {
	if strings.ContainsRune(raw, 0x2028) || strings.ContainsRune(raw, 0x2029) {
		return false
	}
	return isoDateValid(jsTrim(raw))
}

// jsReplaceAll is String.prototype.replaceAll with a string pattern, including the
// replacement patterns $$, $&, $` and $'.
func jsReplaceAll(s, pattern, replacement string) string {
	if pattern == "" || !strings.Contains(s, pattern) {
		return s
	}
	var b strings.Builder
	pos := 0
	for {
		i := strings.Index(s[pos:], pattern)
		if i < 0 {
			break
		}
		at := pos + i
		b.WriteString(s[pos:at])
		b.WriteString(substitution(s, pattern, at, replacement))
		pos = at + len(pattern)
	}
	b.WriteString(s[pos:])
	return b.String()
}

func substitution(s, matched string, at int, r string) string {
	if !strings.Contains(r, "$") {
		return r
	}
	var b strings.Builder
	for i := 0; i < len(r); i++ {
		if r[i] != '$' || i+1 == len(r) {
			b.WriteByte(r[i])
			continue
		}
		switch r[i+1] {
		case '$':
			b.WriteByte('$')
		case '&':
			b.WriteString(matched)
		case '`':
			b.WriteString(s[:at])
		case '\'':
			b.WriteString(s[at+len(matched):])
		default:
			b.WriteByte('$')
			continue
		}
		i++
	}
	return b.String()
}

// validEmail is /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s).
func validEmail(s string) bool {
	if strings.ContainsFunc(s, isJSSpace) || strings.Count(s, "@") != 1 {
		return false
	}
	local, domain, _ := strings.Cut(s, "@")
	if local == "" {
		return false
	}
	for i := 1; i < len(domain)-1; i++ {
		if domain[i] == '.' {
			return true
		}
	}
	return false
}

// trailingDigits is s.match(/(\d+)$/)?.[1] ("" when there is no match).
func trailingDigits(s string) string {
	i := len(s)
	for i > 0 && isDigit(s[i-1]) {
		i--
	}
	return s[i:]
}

// allMatch reports whether every byte of s satisfies ok and len(s) is within [min, max].
func allMatch(s string, min, max int, ok func(byte) bool) bool {
	if len(s) < min || len(s) > max {
		return false
	}
	for i := 0; i < len(s); i++ {
		if !ok(s[i]) {
			return false
		}
	}
	return true
}

func isUpperASCII(c byte) bool { return c >= 'A' && c <= 'Z' }
