package api

// URL and JSON details the Node.js server got from WHATWG URL and JSON.stringify.

import (
	"errors"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/Sunsiyam-Resorts/project-monitoring/backend/internal/domain"
)

// query is URLSearchParams: application/x-www-form-urlencoded pairs in order.
type query [][2]string

func parseQuery(raw string) query {
	var q query
	for _, part := range strings.Split(raw, "&") {
		if part == "" {
			continue
		}
		k, v, _ := strings.Cut(part, "=")
		q = append(q, [2]string{formDecode(k), formDecode(v)})
	}
	return q
}

// formDecode replaces "+" by a space and decodes valid percent escapes, leaving any
// other "%" as it is.
func formDecode(s string) string {
	s = strings.ReplaceAll(s, "+", " ")
	if !strings.Contains(s, "%") {
		return s
	}
	b := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		if s[i] == '%' && i+2 < len(s) && isHex(s[i+1]) && isHex(s[i+2]) {
			n, _ := strconv.ParseUint(s[i+1:i+3], 16, 8)
			b = append(b, byte(n))
			i += 2
			continue
		}
		b = append(b, s[i])
	}
	return strings.ToValidUTF8(string(b), "�")
}

func isHex(c byte) bool { return c >= '0' && c <= '9' || c >= 'a' && c <= 'f' || c >= 'A' && c <= 'F' }

// get is searchParams.get(name): the first value, or null (domain nil) when absent.
func (q query) get(name string) any {
	for _, p := range q {
		if p[0] == name {
			return p[1]
		}
	}
	return nil
}

// orDefault is searchParams.get(name) || fallback.
func (q query) orDefault(name string, fallback any) any {
	if v := q.get(name); v != nil && v != "" {
		return v
	}
	return fallback
}

// pathname is new URL(req.url, "http://localhost").pathname: backslashes are path
// separators and dot segments (also percent-encoded ones) are resolved.
func pathname(r *http.Request) string {
	uri := r.RequestURI
	if i := strings.IndexAny(uri, "?#"); i >= 0 {
		uri = uri[:i]
	}
	if !strings.HasPrefix(uri, "/") {
		if u, err := url.Parse(uri); err == nil && u.Scheme != "" {
			uri = u.EscapedPath()
		} else {
			uri = "/" + uri
		}
	}
	uri = strings.ReplaceAll(uri, "\\", "/")
	segments := strings.Split(uri, "/")[1:]
	out := []string{}
	for i, seg := range segments {
		last := i == len(segments)-1
		switch strings.ToLower(seg) {
		case ".", "%2e":
			if last {
				out = append(out, "")
			}
		case "..", ".%2e", "%2e.", "%2e%2e":
			if len(out) > 0 {
				out = out[:len(out)-1]
			}
			if last {
				out = append(out, "")
			}
		default:
			out = append(out, seg)
		}
	}
	return "/" + strings.Join(out, "/")
}

// decodeURIComponent fails, like JavaScript, on malformed escapes and invalid UTF-8.
func decodeURIComponent(s string) (string, error) {
	d, err := url.PathUnescape(s)
	if err != nil || !utf8.ValidString(d) {
		return "", errors.New("URI malformed")
	}
	return d, nil
}

var defaultPorts = map[string]string{"http": "80", "https": "443", "ws": "80", "wss": "443", "ftp": "21"}

// originHost is new URL(origin).host; it fails with "Invalid URL" like Node.js.
func originHost(origin string) (string, error) {
	invalid := errors.New("Invalid URL")
	u, err := url.Parse(origin)
	if err != nil || u.Scheme == "" || (u.Opaque != "" && defaultPorts[strings.ToLower(u.Scheme)] != "") {
		return "", invalid
	}
	scheme := strings.ToLower(u.Scheme)
	if _, special := defaultPorts[scheme]; !special {
		return u.Host, nil
	}
	host := strings.ToLower(u.Hostname())
	if host == "" {
		return "", invalid
	}
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	port := u.Port()
	if port != "" {
		n, err := strconv.ParseUint(port, 10, 16)
		if err != nil {
			return "", invalid
		}
		port = strconv.FormatUint(n, 10)
	}
	if port == "" || port == defaultPorts[scheme] {
		return host, nil
	}
	return host + ":" + port, nil
}

// clientAddress is the address used for sign-in throttling: Cloudflare's
// CF-Connecting-IP, else X-Forwarded-For, else the connection's address.
func clientAddress(r *http.Request) string {
	for _, h := range []string{"Cf-Connecting-Ip", "X-Forwarded-For"} {
		if v := strings.Join(r.Header.Values(h), ", "); v != "" {
			return v
		}
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil && host != "" {
		return host
	}
	if r.RemoteAddr != "" {
		return r.RemoteAddr
	}
	return "unknown"
}

// sessionCookie finds /(?:^|;\s*)portal_session=([a-f0-9]{64})(?:;|$)/ in the
// Cookie header(s).
func sessionCookie(r *http.Request) string {
	header := strings.Join(r.Header.Values("Cookie"), "; ")
	const name = "portal_session="
	for from := 0; ; {
		i := strings.Index(header[from:], name)
		if i < 0 {
			return ""
		}
		i += from
		from = i + 1
		before := strings.TrimRightFunc(header[:i], domain.IsJSSpace)
		if i != 0 && !strings.HasSuffix(before, ";") {
			continue
		}
		v := header[i+len(name):]
		if len(v) < 64 || !lowerHex(v[:64]) || (len(v) > 64 && v[64] != ';') {
			continue
		}
		return v[:64]
	}
}

func lowerHex(s string) bool {
	for i := 0; i < len(s); i++ {
		if !(s[i] >= '0' && s[i] <= '9' || s[i] >= 'a' && s[i] <= 'f') {
			return false
		}
	}
	return true
}

// object is a JSON object with ordered members, written like JSON.stringify writes an
// object literal (members whose value is undefined are left out).
type object []member

type member struct {
	key   string
	value any
}

func (o object) json() []byte {
	b := []byte{'{'}
	first := true
	for _, m := range o {
		if m.value == domain.Undefined {
			continue
		}
		if !first {
			b = append(b, ',')
		}
		first = false
		b = append(b, domain.Marshal(m.key)...)
		b = append(b, ':')
		if inner, ok := m.value.(object); ok {
			b = append(b, inner.json()...)
		} else {
			b = append(b, domain.Marshal(m.value)...)
		}
	}
	return append(b, '}')
}
