package auth

import (
	"encoding/base64"
	"strings"

	qrcode "github.com/skip2/go-qrcode"
)

// Enrollment returns the otpauth URI that adds the account to an authenticator app and
// the same URI as a QR code (PNG data URL). The QR code is generated here; no external
// service ever receives the key.
func Enrollment(username, key string) (uri, qrCode string, err error) {
	uri = "otpauth://totp/Sun%20Siyam:" + EncodeURIComponent(username) + "?" + formEncode(
		"secret", key, "issuer", "Sun Siyam", "algorithm", "SHA1", "digits", "6", "period", "30")
	q, err := qrcode.New(uri, qrcode.Medium)
	if err != nil {
		return "", "", err
	}
	png, err := q.PNG(280)
	if err != nil {
		return "", "", err
	}
	return uri, "data:image/png;base64," + base64.StdEncoding.EncodeToString(png), nil
}

const upperHex = "0123456789ABCDEF"

func percentEncode(s string, keep func(byte) bool, space string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case keep(c):
			b.WriteByte(c)
		case c == ' ' && space != "":
			b.WriteString(space)
		default:
			b.WriteByte('%')
			b.WriteByte(upperHex[c>>4])
			b.WriteByte(upperHex[c&15])
		}
	}
	return b.String()
}

func alnum(c byte) bool { return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' }

// EncodeURIComponent is JavaScript's encodeURIComponent.
func EncodeURIComponent(s string) string {
	return percentEncode(s, func(c byte) bool { return alnum(c) || strings.IndexByte("-_.!~*'()", c) >= 0 }, "")
}

// formEncode serialises name/value pairs like URLSearchParams.toString().
func formEncode(pairs ...string) string {
	keep := func(c byte) bool { return alnum(c) || strings.IndexByte("*-._", c) >= 0 }
	parts := make([]string, 0, len(pairs)/2)
	for i := 0; i+1 < len(pairs); i += 2 {
		parts = append(parts, percentEncode(pairs[i], keep, "+")+"="+percentEncode(pairs[i+1], keep, "+"))
	}
	return strings.Join(parts, "&")
}
