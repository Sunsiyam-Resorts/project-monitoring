package api

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/Sunsiyam-Resorts/project-monitoring/backend/internal/auth"
	"github.com/Sunsiyam-Resorts/project-monitoring/backend/internal/domain"
)

// All names, emails, passwords and keys below are fictional.
const (
	adminPassword = "Fictional-Admin-Pass-1"
	encryptionKey = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"
	ssoSecret     = "fictional-erp-sso-secret-for-tests-0001"
	origin        = "http://example.com" // httptest's default host
	pdf           = "JVBERi0xLjQKJcfsj6IKZmljdGlvbmFs"
)

type fixture struct {
	t      *testing.T
	srv    *Server
	store  *memStore
	env    map[string]string
	now    time.Time
	mail   []string
	mailOK bool
}

func newFixture(t *testing.T) *fixture {
	f := &fixture{t: t, now: time.Date(2026, 11, 15, 8, 0, 0, 0, time.UTC), mailOK: true,
		env: map[string]string{"AUTH_ENCRYPTION_KEY": encryptionKey, "ERP_SSO_SECRET": ssoSecret}}
	s := domain.EmptyState()
	hash, err := auth.PasswordHash(adminPassword)
	if err != nil {
		t.Fatal(err)
	}
	s.Users = append(s.Users, &domain.User{
		ID: domain.Ptr("initial-admin"), Name: domain.Ptr("Administrator"), Username: domain.Ptr("fictional.admin"),
		Email: domain.Ptr("admin@example.test"), Role: domain.Ptr("Admin"), Companies: []string{},
		GroupAccess: domain.Ptr(true), Active: domain.Ptr(true), PasswordHash: &hash, Extra: domain.Extra{"team": ""},
	})
	rules := &domain.Rules{NewID: domain.RandomID, Clock: func() int64 { return f.now.UnixMilli() }}
	f.store = newMemStore(rules, func() time.Time { return f.now }, s)
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "assets"), 0o755)
	os.MkdirAll(filepath.Join(dir, "fonts"), 0o755)
	os.WriteFile(filepath.Join(dir, "index.html"), []byte("<!doctype html><title>Portal</title>"), 0o644)
	os.WriteFile(filepath.Join(dir, "assets", "index-abc123.js"), []byte("console.log(1)"), 0o644)
	os.WriteFile(filepath.Join(dir, "fonts", "Inter.woff2"), []byte("font"), 0o644)
	os.WriteFile(filepath.Join(dir, "icon.svg"), []byte("<svg/>"), 0o644)
	f.srv, err = NewServer(Config{
		Store: f.store, Rules: rules, Getenv: func(k string) string { return f.env[k] },
		Now: func() time.Time { return f.now }, Log: log.New(io.Discard, "", 0),
		Mail: func(ctx context.Context, key string, message []byte) (bool, error) {
			f.mail = append(f.mail, string(message))
			return f.mailOK, nil
		},
	}, dir)
	if err != nil {
		t.Fatal(err)
	}
	return f
}

func (f *fixture) request(method, target, body string, header map[string]string) *httptest.ResponseRecorder {
	var r io.Reader
	if body != "" {
		r = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, target, r)
	for k, v := range header {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	f.srv.ServeHTTP(rec, req)
	return rec
}

func (f *fixture) post(action, body, cookie string) *httptest.ResponseRecorder {
	h := map[string]string{"Origin": origin}
	if cookie != "" {
		h["Cookie"] = "portal_session=" + cookie
	}
	return f.request("POST", "/api/index?action="+action, body, h)
}

func (f *fixture) get(action, cookie string) *httptest.ResponseRecorder {
	h := map[string]string{}
	if cookie != "" {
		h["Cookie"] = "theme=dark; portal_session=" + cookie
	}
	return f.request("GET", "/api/index?action="+action, "", h)
}

func body(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var v map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("response %d is not a JSON object: %q", rec.Code, rec.Body.String())
	}
	return v
}

func expect(t *testing.T, rec *httptest.ResponseRecorder, status int, error string) {
	t.Helper()
	if rec.Code != status {
		t.Fatalf("status %d, want %d: %s", rec.Code, status, rec.Body.String())
	}
	if error != "" {
		if got := body(t, rec)["error"]; got != error {
			t.Fatalf("error %q, want %q", got, error)
		}
	}
}

var cookiePattern = regexp.MustCompile(`^portal_session=([a-f0-9]{64}); HttpOnly; SameSite=Strict; Path=/; Max-Age=28800$`)

// signIn signs in with password and authenticator, enrolling on first use.
func (f *fixture) signIn(username, password string, secret *string) string {
	t := f.t
	t.Helper()
	rec := f.post("login", `{"username":"`+username+`","password":"`+password+`"}`, "")
	expect(t, rec, 200, "")
	login := body(t, rec)
	if login["enroll"] == true {
		*secret = login["secret"].(string)
	}
	f.now = f.now.Add(30 * time.Second) // a fresh code each time
	rec = f.post("verify", `{"challenge":"`+login["challenge"].(string)+`","code":"`+auth.TOTP(*secret, f.now.UnixMilli())+`"}`, "")
	expect(t, rec, 200, "")
	m := cookiePattern.FindStringSubmatch(rec.Header().Get("Set-Cookie"))
	if m == nil {
		t.Fatalf("session cookie %q", rec.Header().Get("Set-Cookie"))
	}
	return m[1]
}

func TestConfigAndHeaders(t *testing.T) {
	f := newFixture(t)
	rec := f.request("GET", "/api/index?action=config", "", nil)
	if rec.Code != 200 || rec.Body.String() != `{"configured":true,"demo":false,"emailReset":false}` {
		t.Fatalf("config: %d %s", rec.Code, rec.Body.String())
	}
	want := map[string]string{
		"Cache-Control": "no-store", "Content-Type": "application/json", "X-Content-Type-Options": "nosniff",
		"X-Frame-Options": "DENY", "Referrer-Policy": "same-origin",
		"Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
	}
	for k, v := range want {
		if got := rec.Header().Get(k); got != v {
			t.Errorf("%s: %q, want %q", k, got, v)
		}
	}
	f.env["RESEND_API_KEY"] = "re_fictional"
	if rec := f.request("POST", "/api/index?action=config", "", nil); !strings.Contains(rec.Body.String(), `"emailReset":true`) {
		t.Fatalf("config with email: %s", rec.Body.String())
	}
}

func TestNotConfigured(t *testing.T) {
	srv, _ := NewServer(Config{Store: &unconfigured{}, Rules: domain.NewRules(), Getenv: func(string) string { return "" }}, t.TempDir())
	for action, want := range map[string]string{
		"config": `{"configured":false,"demo":true,"emailReset":false}`,
		"state":  `{"error":"Database not connected. Use the labelled demo for testing."}`,
	} {
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, httptest.NewRequest("GET", "/api/index?action="+action, nil))
		if rec.Body.String() != want {
			t.Fatalf("%s: %d %s", action, rec.Code, rec.Body.String())
		}
	}
}

type unconfigured struct{ memStore }

func (*unconfigured) Configured() bool { return false }

func TestMethodsOriginAndBody(t *testing.T) {
	f := newFixture(t)
	expect(t, f.request("PUT", "/api/index?action=state", "", nil), 405, "Method not allowed")
	expect(t, f.request("GET", "/api/index?action=command", "", nil), 405, "POST required")
	expect(t, f.request("POST", "/api/index?action=login", "{}", nil), 403, "Same-origin request required")
	expect(t, f.request("POST", "/api/index?action=login", "{}", map[string]string{"Origin": "https://attacker.test"}), 403, "Same-origin request required")
	expect(t, f.request("POST", "/api/index?action=login", "{}", map[string]string{"Origin": "null"}), 400, "Invalid URL")
	expect(t, f.request("POST", "/api/index?action=login", "{}", map[string]string{"Origin": "http://EXAMPLE.com:80"}), 400, "Invalid username or password")
	rec := f.request("POST", "/api/index?action=login", "{bad", map[string]string{"Origin": origin})
	if rec.Code != 400 || rec.Body.String() != `{"error":"Invalid request body"}` || rec.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("invalid JSON: %d %q %v", rec.Code, rec.Body.String(), rec.Header())
	}
	rec = f.request("POST", "/api/index?action=command", strings.Repeat(" ", MaxBody+1), map[string]string{"Origin": origin})
	if rec.Code != 413 || rec.Body.String() != "Upload too large" || rec.Header().Get("Content-Type") != "" {
		t.Fatalf("large body: %d %q %q", rec.Code, rec.Body.String(), rec.Header().Get("Content-Type"))
	}
	// Exactly the limit is accepted (white space around an empty object).
	expect(t, f.request("POST", "/api/index?action=state", "{}"+strings.Repeat(" ", MaxBody-2), map[string]string{"Origin": origin}), 401, "Sign in required")
	expect(t, f.get("state", ""), 401, "Sign in required")
	expect(t, f.get("state", strings.Repeat("a", 64)), 401, "Sign in required")
}

func TestSignInStateCommandsFilesAndLogout(t *testing.T) {
	f := newFixture(t)
	expect(t, f.post("login", `{"username":"fictional.admin","password":"wrong-password"}`, ""), 400, "Invalid username or password")

	rec := f.post("login", `{"username":"FICTIONAL.ADMIN","password":"`+adminPassword+`"}`, "")
	expect(t, rec, 200, "")
	if !regexp.MustCompile(`^\{"challenge":"[a-f0-9]{64}","enroll":true,"secret":"[A-Z2-7]{32}","uri":"otpauth://totp/Sun%20Siyam:fictional.admin\?secret=[A-Z2-7]{32}&issuer=Sun\+Siyam&algorithm=SHA1&digits=6&period=30","qrCode":"data:image/png;base64,[^"]+"\}$`).MatchString(rec.Body.String()) {
		t.Fatalf("enrollment response: %.300s", rec.Body.String())
	}
	login := body(t, rec)
	secret := login["secret"].(string)
	expect(t, f.post("verify", `{"challenge":"`+login["challenge"].(string)+`","code":"000000"}`, ""), 400, "Invalid authenticator code")
	code := auth.TOTP(secret, f.now.UnixMilli())
	rec = f.post("verify", `{"challenge":"`+login["challenge"].(string)+`","code":"`+code+`"}`, "")
	expect(t, rec, 200, "")
	cookie := cookiePattern.FindStringSubmatch(rec.Header().Get("Set-Cookie"))[1]
	verified := body(t, rec)
	if verified["user"].(map[string]any)["team"] != "" || verified["state"].(map[string]any)["counters"] != nil {
		t.Fatalf("verify response: %v", verified["user"])
	}
	if strings.Contains(rec.Body.String(), "passwordHash") || strings.Contains(rec.Body.String(), "totpSecret") {
		t.Fatal("secrets in the state response")
	}
	stored := f.store.load().Users[0]
	if stored.TOTPSecret == nil || *stored.LastTOTP != code {
		t.Fatal("enrolment not stored")
	}
	if got, _ := auth.Decrypt(encryptionKey, *stored.TOTPSecret); got != secret {
		t.Fatal("stored key is not the encrypted enrolment key")
	}
	// The challenge is single use, and a code is accepted once.
	expect(t, f.post("verify", `{"challenge":"`+login["challenge"].(string)+`","code":"`+code+`"}`, ""), 400, "Sign-in challenge expired")
	rec = f.post("login", `{"username":"fictional.admin","password":"`+adminPassword+`"}`, "")
	if !regexp.MustCompile(`^\{"challenge":"[a-f0-9]{64}"\}$`).MatchString(rec.Body.String()) {
		t.Fatalf("second login: %s", rec.Body.String())
	}
	expect(t, f.post("verify", `{"challenge":"`+body(t, rec)["challenge"].(string)+`","code":"`+code+`"}`, ""), 400, "Code already used. Wait for a new code.")

	expect(t, f.get("state", cookie), 200, "")
	expect(t, f.post("unknown", "{}", cookie), 400, "Unknown endpoint")
	commands := []string{
		`{"type":"master.save","data":{"kind":"companies","record":{"name":"Fictional Resort","code":"fr"}}}`,
		`{"type":"master.save","data":{"kind":"suppliers","record":{"name":"Fictional Supplies","email":"supplies@example.test"}}}`,
	}
	for _, c := range commands {
		expect(t, f.post("command", c, cookie), 200, "")
	}
	s := f.store.load()
	company := *s.Companies[0].ID
	expect(t, f.post("command", `{"type":"master.save","data":{"kind":"projects","record":{"name":"Fictional Villas","code":"FV","companyId":"`+company+`"}}}`, cookie), 200, "")
	project := *f.store.load().Projects[0].ID
	expect(t, f.post("command", `{"type":"master.save","data":{"kind":"budgets","record":{"name":"Fictional budget","companyId":"`+company+`","projectId":"`+project+`","currency":"USD","categories":[{"id":"cat-1","name":"Civil","amount":1000}]}}}`, cookie), 200, "")
	expect(t, f.post("command", `{"type":"master.save","data":{"kind":"companies","record":{"name":"Other","code":"x"}}}`, cookie), 400, "Short code must contain 2–12 letters or digits")
	s = f.store.load()
	order := `{"type":"order.create","data":{"companyId":"` + company + `","projectId":"` + project + `","budgetId":"` + *s.Budgets[0].ID +
		`","supplierId":"` + *s.Suppliers[0].ID + `","currency":"USD","total":"400","po":"PO-1","description":"Fictional works","allocations":[{"categoryId":"cat-1","amount":400}],` +
		`"files":[{"name":"quote.pdf","type":"application/pdf","data":"` + pdf + `","size":24}]}}`
	rec = f.post("command", order, cookie)
	expect(t, rec, 200, "")
	if strings.Contains(rec.Body.String(), pdf) || !strings.Contains(rec.Body.String(), `"size":24`) {
		t.Fatal("state responses must leave out PDF contents and keep other file members")
	}
	orderID := *f.store.load().Orders[0].ID
	expect(t, f.get("file&kind=order&id="+orderID, cookie), 400, "Open this record again to obtain a lock")
	expect(t, f.post("command", `{"type":"lock","id":"`+orderID+`"}`, cookie), 200, "")
	rec = f.get("file&kind=order&id="+orderID+"&index=", cookie)
	expect(t, rec, 200, "")
	if rec.Body.String() != `{"file":{"name":"quote.pdf","type":"application/pdf","data":"`+pdf+`","size":24}}` {
		t.Fatalf("file: %s", rec.Body.String())
	}
	expect(t, f.get("file&kind=order&id="+orderID+"&index=1", cookie), 400, "File not available")
	expect(t, f.get("file&kind=secret&id="+orderID, cookie), 400, "Invalid document type")

	// Users: Admin only; a new user needs an initial password, which is hashed.
	user := `{"id":"fictional-finance","name":"Fictional Finance","username":"finance","email":"Finance@Example.test","role":"Finance","groupAccess":true}`
	expect(t, f.post("command", `{"type":"user.save","data":{"record":`+user+`}}`, cookie), 400, "Initial password required")
	expect(t, f.post("command", `{"type":"user.save","data":{"record":`+user+`,"password":"short"}}`, cookie), 503,
		"Portal setup incomplete. Check database and environment configuration.")
	expect(t, f.post("command", `{"type":"user.save","data":{"record":`+user+`,"password":"Fictional-Finance-1"}}`, cookie), 200, "")
	finance := f.store.load().Users[1]
	if *finance.Email != "finance@example.test" || !auth.PasswordOK("Fictional-Finance-1", finance.PasswordHash) {
		t.Fatalf("saved user: %s", domain.Marshal(finance))
	}
	var financeSecret string
	financeCookie := f.signIn("finance", "Fictional-Finance-1", &financeSecret)
	expect(t, f.post("command", `{"type":"user.save","data":{"record":`+user+`}}`, financeCookie), 400, "Admin required")
	// An Admin change to the user ends that user's sessions.
	expect(t, f.post("command", `{"type":"user.save","data":{"record":`+strings.Replace(user, "Fictional Finance", "Fictional Finance Officer", 1)+`}}`, cookie), 200, "")
	expect(t, f.get("state", financeCookie), 401, "Sign in required")

	rec = f.post("logout", "{}", cookie)
	expect(t, rec, 200, "")
	if rec.Body.String() != `{"ok":true}` || rec.Header().Get("Set-Cookie") != "portal_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" {
		t.Fatalf("logout: %s %q", rec.Body.String(), rec.Header().Get("Set-Cookie"))
	}
	expect(t, f.get("state", cookie), 401, "Sign in required")

	f.env["NODE_ENV"] = "production"
	rec = f.post("login", `{"username":"fictional.admin","password":"`+adminPassword+`"}`, "")
	f.now = f.now.Add(30 * time.Second)
	rec = f.post("verify", `{"challenge":"`+body(t, rec)["challenge"].(string)+`","code":"`+auth.TOTP(secret, f.now.UnixMilli())+`"}`, "")
	if !strings.HasSuffix(rec.Header().Get("Set-Cookie"), "; Max-Age=28800; Secure") {
		t.Fatalf("production cookie: %q", rec.Header().Get("Set-Cookie"))
	}
}

func TestMissingEncryptionKeyIsASetupError(t *testing.T) {
	f := newFixture(t)
	delete(f.env, "AUTH_ENCRYPTION_KEY")
	expect(t, f.post("login", `{"username":"fictional.admin","password":"`+adminPassword+`"}`, ""), 503,
		"Portal setup incomplete. Check database and environment configuration.")
}

func TestThrottle(t *testing.T) {
	f := newFixture(t)
	for i := 0; i < 15; i++ {
		expect(t, f.post("login", `{"username":"nobody","password":"x"}`, ""), 400, "Invalid username or password")
	}
	expect(t, f.post("login", `{"username":"nobody","password":"x"}`, ""), 400, "Too many attempts. Try again in 15 minutes.")
	// Counted per action and per visitor address (Cloudflare's header first).
	expect(t, f.post("verify", `{}`, ""), 400, "Sign-in challenge expired")
	h := map[string]string{"Origin": origin, "CF-Connecting-IP": "203.0.113.7"}
	expect(t, f.request("POST", "/api/index?action=login", `{"username":"nobody"}`, h), 400, "Invalid username or password")
	if f.store.attempts["login:203.0.113.7"] != 1 || f.store.attempts["login:192.0.2.1"] != 16 {
		t.Fatalf("throttle keys: %v", f.store.attempts)
	}
}

func TestPasswordReset(t *testing.T) {
	f := newFixture(t)
	expect(t, f.post("reset-start", `{"email":"admin@example.test"}`, ""), 503, "Portal setup incomplete. Check database and environment configuration.")
	f.env["RESEND_API_KEY"], f.env["MAIL_FROM"] = "re_fictional", "Portal <portal@example.test>"
	rec := f.post("reset-start", `{"email":"nobody@example.test"}`, "")
	expect(t, rec, 200, "")
	if body(t, rec)["message"] != "If the email matches an active account, an OTP has been sent." || len(f.mail) != 0 {
		t.Fatal("unknown email must look the same and send nothing")
	}
	rec = f.post("reset-start", `{"email":"ADMIN@example.test"}`, "")
	expect(t, rec, 200, "")
	challenge := body(t, rec)["challenge"].(string)
	if len(f.mail) != 1 {
		t.Fatal("no email sent")
	}
	otp := regexp.MustCompile(`OTP is (\d{6})\.`).FindStringSubmatch(f.mail[0])[1]
	if !strings.HasPrefix(f.mail[0], `{"from":"Portal <portal@example.test>","to":["admin@example.test"],"subject":"Sun Siyam portal password reset","text":"Your password reset OTP is `) {
		t.Fatalf("email: %s", f.mail[0])
	}
	expect(t, f.post("reset-finish", `{"challenge":"`+challenge+`","code":"000000","password":"Fictional-New-Pass-1"}`, ""), 400, "Invalid or expired OTP")
	expect(t, f.post("reset-finish", `{"challenge":"`+challenge+`","code":"`+otp+`","password":"short"}`, ""), 503,
		"Portal setup incomplete. Check database and environment configuration.")
	rec = f.post("reset-finish", `{"challenge":"`+challenge+`","code":"`+otp+`","password":"Fictional-New-Pass-1"}`, "")
	if rec.Code != 200 || rec.Body.String() != `{"ok":true}` {
		t.Fatalf("reset-finish: %d %s", rec.Code, rec.Body.String())
	}
	s := f.store.load()
	if !auth.PasswordOK("Fictional-New-Pass-1", s.Users[0].PasswordHash) || *s.Audit[len(s.Audit)-1].Action != "Password reset" {
		t.Fatal("password not reset or not audited")
	}
	expect(t, f.post("reset-finish", `{"challenge":"`+challenge+`","code":"`+otp+`","password":"Fictional-New-Pass-2"}`, ""), 400, "Invalid or expired OTP")
	f.mailOK = false
	expect(t, f.post("reset-start", `{"email":"admin@example.test"}`, ""), 400, "Unable to send reset email")
}

func ssoLink(email, jti string, now time.Time) string {
	claims, _ := json.Marshal(map[string]any{"aud": "project-monitoring", "email": email, "iat": now.Unix(), "exp": now.Unix() + 60, "jti": jti})
	p := base64.RawURLEncoding.EncodeToString(claims)
	mac := hmac.New(sha256.New, []byte(ssoSecret))
	mac.Write([]byte(p))
	return "/api/index?action=sso&token=" + p + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func TestERPSingleSignOn(t *testing.T) {
	f := newFixture(t)
	link := ssoLink("Admin@Example.test", "fictional-jti-1", f.now)
	rec := f.request("GET", link, "", nil)
	if rec.Code != 303 || rec.Header().Get("Location") != "/" || rec.Body.Len() != 0 {
		t.Fatalf("sso: %d %q %q", rec.Code, rec.Header().Get("Location"), rec.Body.String())
	}
	cookie := cookiePattern.FindStringSubmatch(rec.Header().Get("Set-Cookie"))
	if cookie == nil {
		t.Fatalf("sso cookie %q", rec.Header().Get("Set-Cookie"))
	}
	expect(t, f.get("state", cookie[1]), 200, "")
	last := f.store.load().Audit[0]
	if len(*last.ID) != 64 || *last.Action != "Signed in via ERP" || *last.Entity != "initial-admin" ||
		*last.Detail != "ERP single sign-on" || last.CompanyID != nil {
		t.Fatalf("audit: %s", domain.Marshal(last))
	}
	for name, l := range map[string]string{
		"reused link":   link,
		"unknown email": ssoLink("nobody@example.test", "fictional-jti-2", f.now),
		"expired":       ssoLink("admin@example.test", "fictional-jti-3", f.now.Add(-2*time.Minute)),
		"no token":      "/api/index?action=sso",
	} {
		rec := f.request("GET", l, "", nil)
		if rec.Code != 303 || rec.Header().Get("Location") != "/?sso=failed" {
			t.Errorf("%s: %d %q", name, rec.Code, rec.Header().Get("Location"))
		}
	}
	delete(f.env, "ERP_SSO_SECRET")
	if rec := f.request("GET", ssoLink("admin@example.test", "fictional-jti-4", f.now), "", nil); rec.Header().Get("Location") != "/?sso=failed" {
		t.Fatal("SSO must be disabled without a secret")
	}
}

func TestStaticFiles(t *testing.T) {
	f := newFixture(t)
	cases := []struct {
		path, status, contentType, cache string
	}{
		{"/", "200", "text/html; charset=utf-8", "no-cache"},
		{"/index.html?v=1", "200", "text/html; charset=utf-8", "no-cache"},
		{"/assets/index-abc123.js", "200", "text/javascript", "public, max-age=31536000, immutable"},
		{"/fonts/Inter.woff2", "200", "font/woff2", "public, max-age=604800"},
		{"/icon.svg", "200", "image/svg+xml", "no-cache"},
		{"/a/../icon.svg", "200", "image/svg+xml", "no-cache"},
		{"/%69con.svg", "200", "image/svg+xml", "no-cache"},
		{"/missing.js", "404", "", ""},
		{"/assets/", "404", "", ""},
		{"/%E0%A4", "404", "", ""},
		{"/..%2f..%2fetc%2fpasswd", "403", "", ""},
		{"/api/index/", "404", "", ""},
	}
	for _, c := range cases {
		rec := f.request("GET", c.path, "", nil)
		if got := strings.TrimSpace(http.StatusText(rec.Code)); rec.Code != map[string]int{"200": 200, "403": 403, "404": 404}[c.status] {
			t.Errorf("%s: %d %s", c.path, rec.Code, got)
			continue
		}
		if rec.Header().Get("Content-Type") != c.contentType || rec.Header().Get("Cache-Control") != c.cache {
			t.Errorf("%s: content type %q cache %q", c.path, rec.Header().Get("Content-Type"), rec.Header().Get("Cache-Control"))
		}
		if rec.Header().Get("X-Frame-Options") != "DENY" {
			t.Errorf("%s: security headers missing", c.path)
		}
		if c.status == "404" && rec.Body.String() != "Not found" {
			t.Errorf("%s: body %q", c.path, rec.Body.String())
		}
	}
}

func TestCookieAndQueryParsing(t *testing.T) {
	hex := strings.Repeat("ab", 32)
	for header, want := range map[string]string{
		"portal_session=" + hex:                     hex,
		"a=1;  portal_session=" + hex + "; b=2":     hex,
		"xportal_session=" + hex:                    "",
		" portal_session=" + hex:                    "",
		"portal_session=" + hex + "0":               "",
		"portal_session=bad; portal_session=" + hex: hex,
		"portal_session=" + strings.ToUpper(hex):    "",
		"theme=dark; portal_session=" + hex + ";":   hex,
	} {
		r := httptest.NewRequest("GET", "/", nil)
		r.Header.Set("Cookie", header)
		if got := sessionCookie(r); got != want {
			t.Errorf("Cookie %q: %q, want %q", header, got, want)
		}
	}
	q := parseQuery("action=st%61te&x=a+b&bad=%zz&action=second&empty")
	if q.get("action") != "state" || q.get("x") != "a b" || q.get("bad") != "%zz" || q.get("empty") != "" || q.get("none") != nil {
		t.Fatalf("query: %v", q)
	}
	for o, want := range map[string]string{
		"https://Project.SSRSYS.com": "project.ssrsys.com", "http://localhost:3000": "localhost:3000",
		"https://x.test:443": "x.test", "http://[::1]:3080": "[::1]:3080", "http://x.test:0080": "x.test",
	} {
		if got, err := originHost(o); err != nil || got != want {
			t.Errorf("originHost(%q) = %q, %v", o, got, err)
		}
	}
	for _, o := range []string{"null", "", "http://", "https://exa mple.com"} {
		if _, err := originHost(o); err == nil {
			t.Errorf("originHost(%q) should fail", o)
		}
	}
}
