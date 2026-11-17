package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
)

// Ported from tests/auth.test.mjs.

func TestPasswordsUseSaltedScryptAndRejectIncorrectPasswords(t *testing.T) {
	h, err := PasswordHash("TestPassword1234")
	if err != nil {
		t.Fatal(err)
	}
	if !PasswordOK("TestPassword1234", &h) {
		t.Fatal("correct password rejected")
	}
	if PasswordOK("wrong", &h) {
		t.Fatal("wrong password accepted")
	}
	h2, _ := PasswordHash("TestPassword1234")
	if h == h2 {
		t.Fatal("hashes are not salted")
	}
	for _, p := range []any{"short", strings.Repeat("x", 257), nil, 123456789012.0} {
		if _, err := PasswordHash(p); err == nil || err.Error() != "Password must be 12–256 characters" {
			t.Fatalf("PasswordHash(%v) = %v", p, err)
		}
	}
	// JavaScript length counts UTF-16 code units: 6 astral characters are 12 units.
	if _, err := PasswordHash(strings.Repeat("🌴", 6)); err != nil {
		t.Fatal(err)
	}
	if PasswordOK("anything", nil) || PasswordOK("x", ptr("no-colon")) || PasswordOK("x", ptr("salt:zz")) {
		t.Fatal("malformed hashes must not verify")
	}
}

func TestTOTPMatchesRFC6238AndAcceptsAdjacentInterval(t *testing.T) {
	s := "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
	if got := TOTP(s, 59000); got != "287082" {
		t.Fatalf("TOTP = %s", got)
	}
	if !TOTPOK(s, "287082", 89000) {
		t.Fatal("adjacent interval rejected")
	}
	if TOTPOK(s, "000000", 59000) || TOTPOK(s, "123", 59000) || TOTPOK(s, "28708a", 59000) {
		t.Fatal("invalid code accepted")
	}
	if len(Secret()) != 32 || Secret() == Secret() {
		t.Fatal("secrets must be 32 random base32 characters")
	}
}

func TestAuthenticatorKeysUseAuthenticatedEncryption(t *testing.T) {
	key := strings.Repeat("a", 64)
	cipher, err := Encrypt(key, "totp-secret")
	if err != nil {
		t.Fatal(err)
	}
	if got, err := Decrypt(key, cipher); err != nil || got != "totp-secret" {
		t.Fatalf("Decrypt = %q, %v", got, err)
	}
	parts := strings.Split(cipher, ":")
	parts[2] = "ff" + parts[2][2:]
	if _, err := Decrypt(key, strings.Join(parts, ":")); err != ErrAuthentication {
		t.Fatalf("tampered ciphertext: %v", err)
	}
	for _, bad := range []string{"", "short", strings.Repeat("g", 64)} {
		if _, err := Encrypt(bad, "x"); err == nil || err.Error() != "AUTH_ENCRYPTION_KEY must be configured" {
			t.Fatalf("Encrypt with key %q: %v", bad, err)
		}
	}
}

const ssoSecret = "ssssssssssssssssssssssssssssssss"

func ssoToken(claims map[string]any, key string) string {
	b, _ := json.Marshal(claims)
	p := base64.RawURLEncoding.EncodeToString(b)
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(p))
	return p + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func ssoClaims(change map[string]any) map[string]any {
	c := map[string]any{"aud": "project-monitoring", "email": "Finance@example.test", "iat": 1000, "exp": 1060, "jti": "abc"}
	for k, v := range change {
		c[k] = v
	}
	return c
}

func TestERPSignInTokensVerifySignatureAudienceAndExpiry(t *testing.T) {
	email, jti, err := SSOVerify(ssoToken(ssoClaims(nil), ssoSecret), ssoSecret, 1030000)
	if err != nil || email != "Finance@example.test" || jti != "abc" {
		t.Fatalf("valid token: %q %q %v", email, jti, err)
	}
	invalid := map[string]struct {
		token  string
		secret string
		now    int64
	}{
		"other key":      {ssoToken(ssoClaims(nil), strings.Repeat("x", 32)), ssoSecret, 1030000},
		"other audience": {ssoToken(ssoClaims(map[string]any{"aud": "other"}), ssoSecret), ssoSecret, 1030000},
		"expired":        {ssoToken(ssoClaims(nil), ssoSecret), ssoSecret, 1091000},
		"not yet issued": {ssoToken(ssoClaims(nil), ssoSecret), ssoSecret, 969000},
		"not a token":    {"not-a-token", ssoSecret, 1030000},
		"short secret":   {ssoToken(ssoClaims(nil), ssoSecret), "short", 1030000},
		"no jti":         {ssoToken(ssoClaims(map[string]any{"jti": 5}), ssoSecret), ssoSecret, 1030000},
		"null":           {"null", ssoSecret, 1030000},
	}
	_, sig, _ := strings.Cut(ssoToken(ssoClaims(nil), ssoSecret), ".")
	forged, _ := json.Marshal(ssoClaims(map[string]any{"email": "admin@example.test"}))
	invalid["swapped payload"] = struct {
		token  string
		secret string
		now    int64
	}{base64.RawURLEncoding.EncodeToString(forged) + "." + sig, ssoSecret, 1030000}
	for name, c := range invalid {
		if _, _, err := SSOVerify(c.token, c.secret, c.now); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
	if _, _, err := SSOVerify("a.b", "", 0); err != ErrSSONotConfigured {
		t.Fatalf("missing secret: %v", err)
	}
}

// Vectors produced by the Node.js implementation (lib/auth.mjs, lib/enrollment.mjs)
// with fictional values: data written by the Node portal must verify here.

func TestNodeCompatibilityVectors(t *testing.T) {
	hash := "b20ab9c1de5122125976aa1b379de7e2:7acf9b05a8f2ba75e7928fbe685f8744a1f848a87a7f093179bdb8ec59d26f0a5931a12dfabad1e0bf5ef629aa017fbf9cc6a8b5e4e6de5e230120e5c9eb80b1"
	if !PasswordOK("Fictional-Passphrase-2026", &hash) || PasswordOK("Fictional-Passphrase-2027", &hash) {
		t.Fatal("Node scrypt hash does not verify")
	}
	unicode := "3cc3b7b14effe1a1350f3de3e4f2c03b:b6cd9e51d31c6a6f802f630a2ee69890202597e5b1e0ed1f57984c6f4389006836125198f04e29b7b6dc98a5bb3f50c8a13b5ff2b8418dd9d0c298f63872f976"
	if !PasswordOK("Pässwörd–Fictional ✓ 🌴", &unicode) {
		t.Fatal("Node scrypt hash of a non-ASCII password does not verify")
	}
	key := "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0"
	secret := "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"
	got, err := Decrypt(key, "048f4df77ba455c6955c49b6:380fe4ee0b79cfe6114d6d706e0203f4:4fb6a282d6182e13328cd5612c6474475ea65143b0b9fcc769e1eff18cf672d4")
	if err != nil || got != secret {
		t.Fatalf("Node AES-GCM ciphertext: %q, %v", got, err)
	}
	for _, v := range []struct {
		at   int64
		code string
	}{{1767225600000, "452777"}, {1794734400000, "997227"}, {59000, "503347"}, {1111111109000, "088309"}} {
		if c := TOTP(secret, v.at); c != v.code {
			t.Errorf("TOTP at %d = %s, Node %s", v.at, c, v.code)
		}
	}
	// Characters outside the base32 alphabet decode with Node's 32-bit arithmetic.
	if c := TOTP("jbswy3dpehpk3pxp", 1794734400000); c != "781405" {
		t.Errorf("TOTP with lower-case key = %s, Node 781405", c)
	}
	token := "eyJhdWQiOiJwcm9qZWN0LW1vbml0b3JpbmciLCJlbWFpbCI6IkZpbmFuY2UuT2ZmaWNlckBleGFtcGxlLnRlc3QiLCJpYXQiOjE3OTQ3MzQ0MDAsImV4cCI6MTc5NDczNDQ2MCwianRpIjoiZmljdGlvbmFsLWp0aS0wMDAxIn0.r1Zp7TRfvq8aHaiMGgCjFActXQEQFAzuafKPLB0tkKY"
	email, jti, err := SSOVerify(token, "fictional-erp-sso-secret-0123456789abcdef", 1794734430000)
	if err != nil || email != "Finance.Officer@example.test" || jti != "fictional-jti-0001" {
		t.Fatalf("Node-signed ERP token: %q %q %v", email, jti, err)
	}
	// Node's base64url decoder also accepts padding and the standard alphabet.
	if _, _, err := SSOVerify(token+"=", "fictional-erp-sso-secret-0123456789abcdef", 1794734430000); err != nil {
		t.Fatalf("padded signature: %v", err)
	}
	uri, _, err := Enrollment("Fictional user + & / ? é", secret)
	want := "otpauth://totp/Sun%20Siyam:Fictional%20user%20%2B%20%26%20%2F%20%3F%20%C3%A9?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Sun+Siyam&algorithm=SHA1&digits=6&period=30"
	if err != nil || uri != want {
		t.Fatalf("enrollment URI:\n got %s\nwant %s", uri, want)
	}
}

func TestHash(t *testing.T) {
	if Hash("abc") != "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" {
		t.Fatal("Hash is not SHA-256 hex")
	}
}

func ptr(s string) *string { return &s }
