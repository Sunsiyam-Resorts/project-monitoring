package store_test

// Integration test against a real PostgreSQL database. It runs only when
// TEST_DATABASE_URL is set, and it drops and recreates the portal tables there, so the
// database name must contain "test". Example (throwaway container, fictional password):
//
//	docker network create portal-test
//	docker run -d --rm --name portal-test-db --network portal-test -e POSTGRES_PASSWORD=fictional -e POSTGRES_DB=portal_test postgres:17-alpine
//	docker run --rm --network portal-test -v ./backend:/src -w /src -e TEST_DATABASE_URL=postgres://postgres:fictional@portal-test-db:5432/portal_test golang:1.25-alpine go test ./internal/store/

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/Sunsiyam-Resorts/project-monitoring/backend/internal/api"
	"github.com/Sunsiyam-Resorts/project-monitoring/backend/internal/auth"
	"github.com/Sunsiyam-Resorts/project-monitoring/backend/internal/domain"
	"github.com/Sunsiyam-Resorts/project-monitoring/backend/internal/store"
)

const (
	adminPassword = "Fictional-Admin-Pass-1"
	encryptionKey = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"
	ssoSecret     = "fictional-erp-sso-secret-for-tests-0001"
	pdf           = "JVBERi0xLjQKJcfsj6IKZmljdGlvbmFs"
)

type portal struct {
	t     *testing.T
	srv   *api.Server
	store *store.Store
	mail  []string
	mu    sync.Mutex
}

func newPortal(t *testing.T, url string, env map[string]string) *portal {
	p := &portal{t: t}
	rules := domain.NewRules()
	getenv := func(k string) string { return env[k] }
	p.store = store.New(url, getenv, rules)
	t.Cleanup(p.store.Close)
	var err error
	p.srv, err = api.NewServer(api.Config{
		Store: p.store, Rules: rules, Getenv: getenv, Log: log.New(io.Discard, "", 0),
		Mail: func(ctx context.Context, key string, message []byte) (bool, error) {
			p.mu.Lock()
			defer p.mu.Unlock()
			p.mail = append(p.mail, string(message))
			return true, nil
		},
	}, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return p
}

type response struct {
	code   int
	body   string
	header map[string][]string
}

func (r response) json(t *testing.T) map[string]any {
	t.Helper()
	var v map[string]any
	if err := json.Unmarshal([]byte(r.body), &v); err != nil {
		t.Fatalf("%d %q is not JSON", r.code, r.body)
	}
	return v
}

func (p *portal) call(method, query, body, cookie string, header ...string) response {
	var rd io.Reader
	if body != "" {
		rd = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, "/api/index?"+query, rd)
	if method == "POST" {
		req.Header.Set("Origin", "http://example.com")
	}
	if cookie != "" {
		req.Header.Set("Cookie", "portal_session="+cookie)
	}
	for i := 0; i+1 < len(header); i += 2 {
		req.Header.Set(header[i], header[i+1])
	}
	rec := httptest.NewRecorder()
	p.srv.ServeHTTP(rec, req)
	return response{rec.Code, rec.Body.String(), rec.Header()}
}

func (p *portal) want(r response, code int, errorMessage string) response {
	p.t.Helper()
	if r.code != code {
		p.t.Fatalf("status %d, want %d: %s", r.code, code, r.body)
	}
	if errorMessage != "" && r.json(p.t)["error"] != errorMessage {
		p.t.Fatalf("error %s, want %q", r.body, errorMessage)
	}
	return r
}

var sessionCookie = regexp.MustCompile(`^portal_session=([a-f0-9]{64}); HttpOnly; SameSite=Strict; Path=/; Max-Age=28800$`)

func (p *portal) command(cookie, cmd string) response {
	p.t.Helper()
	return p.want(p.call("POST", "action=command", cmd, cookie), 200, "")
}

func TestPostgreSQLIntegration(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	cfg, err := pgx.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(cfg.Database, "test") {
		t.Fatalf("refusing to reset database %q: its name must contain \"test\"", cfg.Database)
	}
	ctx := context.Background()
	db, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close(ctx)
	if _, err := db.Exec(ctx, "DROP TABLE IF EXISTS portal_state, portal_sessions, portal_challenges, portal_throttle"); err != nil {
		t.Fatal(err)
	}

	// Without the initial Admin variables the portal reports incomplete setup.
	bare := newPortal(t, url, map[string]string{})
	bare.want(bare.call("GET", "action=state", "", ""), 503, "Portal setup incomplete. Check database and environment configuration.")
	short := newPortal(t, url, map[string]string{"ADMIN_EMAIL": "admin@example.test", "ADMIN_PASSWORD": "short"})
	short.want(short.call("GET", "action=state", "", ""), 503, "Portal setup incomplete. Check database and environment configuration.")

	env := map[string]string{
		"ADMIN_USERNAME": "fictional.admin", "ADMIN_EMAIL": "Admin@Example.test", "ADMIN_PASSWORD": adminPassword,
		"AUTH_ENCRYPTION_KEY": encryptionKey, "ERP_SSO_SECRET": ssoSecret,
		"RESEND_API_KEY": "re_fictional", "MAIL_FROM": "Portal <portal@example.test>",
	}
	p := newPortal(t, url, env)
	if r := p.call("GET", "action=config", "", ""); r.body != `{"configured":true,"demo":false,"emailReset":true}` {
		t.Fatalf("config: %s", r.body)
	}

	// Bootstrap: tables and the initial workspace with the configured Admin.
	p.want(p.call("GET", "action=state", "", ""), 401, "Sign in required")
	var raw []byte
	if err := db.QueryRow(ctx, "SELECT data FROM portal_state WHERE id=1").Scan(&raw); err != nil {
		t.Fatal(err)
	}
	s, err := domain.DecodeState(raw)
	if err != nil {
		t.Fatal(err)
	}
	admin := s.Users[0]
	if *admin.ID != "initial-admin" || *admin.Username != "fictional.admin" || *admin.Email != "Admin@Example.test" ||
		admin.Extra["team"] != "" || !auth.PasswordOK(adminPassword, admin.PasswordHash) || *s.Version != 3 || len(s.Currencies) != 2 {
		t.Fatalf("initial workspace: %s", raw)
	}

	// Password sign-in enrols the authenticator, then requires it.
	p.want(p.call("POST", "action=login", `{"username":"fictional.admin","password":"wrong"}`, ""), 400, "Invalid username or password")
	login := p.want(p.call("POST", "action=login", `{"username":"Fictional.Admin","password":"`+adminPassword+`"}`, ""), 200, "").json(t)
	if login["enroll"] != true || !strings.HasPrefix(login["qrCode"].(string), "data:image/png;base64,") {
		t.Fatalf("login: %v", login)
	}
	secret := login["secret"].(string)
	code := auth.TOTP(secret, time.Now().UnixMilli())
	r := p.want(p.call("POST", "action=verify", `{"challenge":"`+login["challenge"].(string)+`","code":"`+code+`"}`, ""), 200, "")
	m := sessionCookie.FindStringSubmatch(r.header["Set-Cookie"][0])
	if m == nil {
		t.Fatalf("cookie: %v", r.header["Set-Cookie"])
	}
	cookie := m[1]
	var sessions, challenges int
	db.QueryRow(ctx, "SELECT count(*) FROM portal_sessions WHERE token=$1 AND user_id='initial-admin' AND expires > now() + interval '7 hours 59 minutes'", auth.Hash(cookie)).Scan(&sessions)
	db.QueryRow(ctx, "SELECT count(*) FROM portal_challenges").Scan(&challenges)
	if sessions != 1 || challenges != 0 {
		t.Fatalf("after verify: %d sessions, %d challenges", sessions, challenges)
	}
	db.QueryRow(ctx, "SELECT data FROM portal_state WHERE id=1").Scan(&raw)
	s, _ = domain.DecodeState(raw)
	if got, err := auth.Decrypt(encryptionKey, *s.Users[0].TOTPSecret); err != nil || got != secret || *s.Users[0].LastTOTP != code {
		t.Fatal("authenticator not stored encrypted")
	}

	// State, master data, an order with a supporting PDF, and the file download.
	p.want(p.call("GET", "action=state", "", cookie), 200, "")
	p.command(cookie, `{"type":"master.save","data":{"kind":"companies","record":{"name":"Fictional Resort","code":"FR"}}}`)
	p.command(cookie, `{"type":"master.save","data":{"kind":"suppliers","record":{"name":"Fictional Supplies"}}}`)
	state := func() *domain.State {
		db.QueryRow(ctx, "SELECT data FROM portal_state WHERE id=1").Scan(&raw)
		s, _ := domain.DecodeState(raw)
		return s
	}
	company := *state().Companies[0].ID
	p.command(cookie, `{"type":"master.save","data":{"kind":"projects","record":{"name":"Fictional Villas","code":"FV","companyId":"`+company+`"}}}`)
	project := *state().Projects[0].ID
	p.command(cookie, `{"type":"master.save","data":{"kind":"budgets","record":{"name":"Fictional budget","companyId":"`+company+`","projectId":"`+project+`","currency":"USD","categories":[{"id":"cat-1","name":"Civil","amount":100000}]}}}`)
	s = state()
	order := func(po string) string {
		return `{"type":"order.create","data":{"companyId":"` + company + `","projectId":"` + project + `","budgetId":"` + *s.Budgets[0].ID +
			`","supplierId":"` + *s.Suppliers[0].ID + `","currency":"USD","total":100,"po":"` + po + `","description":"Fictional works","allocations":[{"categoryId":"cat-1","amount":100}],` +
			`"files":[{"name":"quote.pdf","type":"application/pdf","data":"` + pdf + `"}],"payment":{"percent":"50"}}}`
	}
	r = p.command(cookie, order("PO-1"))
	if strings.Contains(r.body, pdf) {
		t.Fatal("PDF contents in the state response")
	}
	// A failing command changes nothing (duplicate PO).
	state()
	before := append([]byte(nil), raw...)
	p.want(p.call("POST", "action=command", order("po-1"), cookie), 400, "Duplicate PO number in this company")
	if s := state(); string(domain.EncodeState(s)) != string(domain.EncodeState(mustDecode(t, before))) {
		t.Fatal("a failed command changed the stored workspace")
	}
	// Concurrent commands are serialised by the workspace row lock: unique numbers.
	var wg sync.WaitGroup
	for i := 2; i <= 7; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if r := p.call("POST", "action=command", order(fmt.Sprintf("PO-%d", i)), cookie); r.code != 200 {
				t.Errorf("concurrent order %d: %s", i, r.body)
			}
		}(i)
	}
	wg.Wait()
	s = state()
	numbers := map[string]bool{}
	for _, o := range s.Orders {
		numbers[*o.Number] = true
	}
	for _, q := range s.Requests {
		numbers[*q.Number] = true
	}
	if len(s.Orders) != 7 || len(s.Requests) != 7 || len(numbers) != 14 || !numbers["FR-FV-REQ-000007"] || !numbers["FR-FV-PAY-000007"] {
		t.Fatalf("orders %d, requests %d, numbers %v", len(s.Orders), len(s.Requests), numbers)
	}
	orderID := *s.Orders[0].ID
	p.want(p.call("GET", "action=file&kind=order&id="+orderID, "", cookie), 400, "Open this record again to obtain a lock")
	p.command(cookie, `{"type":"lock","id":"`+orderID+`"}`)
	r = p.want(p.call("GET", "action=file&kind=order&id="+orderID+"&index=0", "", cookie), 200, "")
	if r.body != `{"file":{"name":"quote.pdf","type":"application/pdf","data":"`+pdf+`"}}` {
		t.Fatalf("file: %s", r.body)
	}

	// Logout ends the session.
	r = p.want(p.call("POST", "action=logout", "{}", cookie), 200, "")
	if r.header["Set-Cookie"][0] != "portal_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" {
		t.Fatalf("logout cookie: %v", r.header["Set-Cookie"])
	}
	p.want(p.call("GET", "action=state", "", cookie), 401, "Sign in required")

	// Email OTP reset: new password, sessions revoked, audited; the authenticator stays.
	sso := ssoToken("admin@example.test", "fictional-jti-1")
	r = p.want(p.call("GET", "action=sso&token="+sso, "", ""), 303, "")
	if r.header["Location"][0] != "/" {
		t.Fatalf("sso: %v", r.header)
	}
	ssoCookie := sessionCookie.FindStringSubmatch(r.header["Set-Cookie"][0])[1]
	p.want(p.call("GET", "action=state", "", ssoCookie), 200, "")
	if r := p.call("GET", "action=sso&token="+sso, "", ""); r.header["Location"][0] != "/?sso=failed" {
		t.Fatal("an ERP sign-in link must work once")
	}
	if r := p.call("GET", "action=sso&token="+ssoToken("nobody@example.test", "fictional-jti-2"), "", ""); r.header["Location"][0] != "/?sso=failed" {
		t.Fatal("ERP sign-in for an unknown email must fail")
	}
	reset := p.want(p.call("POST", "action=reset-start", `{"email":"ADMIN@example.test"}`, ""), 200, "").json(t)
	otp := regexp.MustCompile(`OTP is (\d{6})\.`).FindStringSubmatch(p.mail[0])[1]
	p.want(p.call("POST", "action=reset-finish", `{"challenge":"`+reset["challenge"].(string)+`","code":"`+otp+`","password":"Fictional-New-Pass-2"}`, ""), 200, "")
	p.want(p.call("GET", "action=state", "", ssoCookie), 401, "Sign in required")
	s = state()
	last := s.Audit[len(s.Audit)-1]
	if *last.Action != "Password reset" || s.Users[0].TOTPSecret == nil || !auth.PasswordOK("Fictional-New-Pass-2", s.Users[0].PasswordHash) {
		t.Fatalf("after reset: %s", domain.Marshal(last))
	}
	login = p.want(p.call("POST", "action=login", `{"username":"fictional.admin","password":"Fictional-New-Pass-2"}`, ""), 200, "").json(t)
	if login["enroll"] != nil {
		t.Fatal("reset must keep the authenticator")
	}
	next := auth.TOTP(secret, time.Now().UnixMilli()+30000) // the adjacent interval is accepted
	p.want(p.call("POST", "action=verify", `{"challenge":"`+login["challenge"].(string)+`","code":"`+next+`"}`, ""), 200, "")

	// Throttling: 15 attempts per action and address within 15 minutes.
	for i := 0; i < 12; i++ { // 3 login attempts above came from the same address
		p.call("POST", "action=login", `{"username":"nobody","password":"x"}`, "")
	}
	p.want(p.call("POST", "action=login", `{"username":"nobody","password":"x"}`, ""), 400, "Too many attempts. Try again in 15 minutes.")
	p.want(p.call("POST", "action=login", `{"username":"nobody","password":"x"}`, "", "CF-Connecting-IP", "203.0.113.9"), 400, "Invalid username or password")
	var attempts int
	db.QueryRow(ctx, "SELECT attempts FROM portal_throttle WHERE key='login:192.0.2.1'").Scan(&attempts)
	if attempts != 16 {
		t.Fatalf("throttle attempts %d", attempts)
	}
	db.Exec(ctx, "UPDATE portal_throttle SET expires=now()-interval '1 second'")
	p.want(p.call("POST", "action=login", `{"username":"nobody","password":"x"}`, ""), 400, "Invalid username or password")

	// Every stored workspace round-trips through the typed records.
	db.QueryRow(ctx, "SELECT data FROM portal_state WHERE id=1").Scan(&raw)
	var a, b any
	json.Unmarshal(raw, &a)
	json.Unmarshal(domain.EncodeState(mustDecode(t, raw)), &b)
	if fmt.Sprint(a) != fmt.Sprint(b) {
		t.Fatal("stored workspace does not round-trip")
	}
}

func mustDecode(t *testing.T, raw []byte) *domain.State {
	s, err := domain.DecodeState(raw)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func ssoToken(email, jti string) string {
	now := time.Now().Unix()
	claims, _ := json.Marshal(map[string]any{"aud": "project-monitoring", "email": email, "iat": now, "exp": now + 60, "jti": jti})
	payload := base64.RawURLEncoding.EncodeToString(claims)
	mac := hmac.New(sha256.New, []byte(ssoSecret))
	mac.Write([]byte(payload))
	return payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
