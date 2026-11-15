package auth

import (
	"bytes"
	"encoding/base64"
	"image/png"
	"net/url"
	"strings"
	"testing"

	qrcode "github.com/skip2/go-qrcode"
)

// Ported from tests/enrollment.test.mjs. The Node test decodes the QR image with jsQR;
// here the image is checked module by module against the QR symbol encoding the URI.
func TestAuthenticatorQRMatchesTheKeyUsedForManualEnrollmentAndVerification(t *testing.T) {
	key := Secret()
	username := "Fictional user + & / ?"
	uri, qrCode, err := Enrollment(username, key)
	if err != nil {
		t.Fatal(err)
	}
	const prefix = "data:image/png;base64,"
	if !strings.HasPrefix(qrCode, prefix) {
		t.Fatalf("not a PNG data URL: %.40s", qrCode)
	}
	raw, err := base64.StdEncoding.DecodeString(qrCode[len(prefix):])
	if err != nil {
		t.Fatal(err)
	}
	img, err := png.Decode(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	size := img.Bounds().Dx()
	if size != 280 || img.Bounds().Dy() != 280 {
		t.Fatalf("image is %v, want 280x280", img.Bounds())
	}
	q, err := qrcode.New(uri, qrcode.Medium)
	if err != nil {
		t.Fatal(err)
	}
	symbol := q.Bitmap() // includes the four-module quiet zone
	n := len(symbol)
	for my := 0; my < n; my++ {
		for mx := 0; mx < n; mx++ {
			x, y := int((float64(mx)+0.5)*float64(size)/float64(n)), int((float64(my)+0.5)*float64(size)/float64(n))
			r, _, _, _ := img.At(x, y).RGBA()
			if dark := r < 0x8000; dark != symbol[my][mx] {
				t.Fatalf("module (%d,%d) differs from the QR symbol for the URI", mx, my)
			}
		}
	}
	for i := 0; i < 4; i++ {
		if symbol[i][n/2] || symbol[n/2][i] {
			t.Fatal("quiet zone missing")
		}
	}

	account, err := url.Parse(uri)
	if err != nil {
		t.Fatal(err)
	}
	if account.Scheme != "otpauth" || account.Host != "totp" {
		t.Fatalf("scheme %q host %q", account.Scheme, account.Host)
	}
	if account.Path != "/Sun Siyam:"+username {
		t.Fatalf("account %q", account.Path)
	}
	params := account.Query()
	want := map[string]string{"secret": key, "issuer": "Sun Siyam", "algorithm": "SHA1", "digits": "6", "period": "30"}
	for k, v := range want {
		if params.Get(k) != v {
			t.Errorf("%s = %q, want %q", k, params.Get(k), v)
		}
	}
	if !TOTPOK(params.Get("secret"), TOTP(key, 59000), 59000) {
		t.Fatal("the key in the URI does not verify codes for the enrolled key")
	}
}
