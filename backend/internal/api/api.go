// Package api serves the portal: the JSON API at /api/index?action=... (a port of
// api/index.mjs) and the built browser app with the security headers of
// scripts/serve.mjs. Requests, responses, status codes, messages and cookies are those
// of the Node.js portal.
package api

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log"
	"math/big"
	"net/http"
	"regexp"
	"slices"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/Sunsiyam-Resorts/project-monitoring/backend/internal/auth"
	"github.com/Sunsiyam-Resorts/project-monitoring/backend/internal/domain"
	"github.com/Sunsiyam-Resorts/project-monitoring/backend/internal/store"
)

// Store is the storage the API needs (store.Store in production).
type Store interface {
	Configured() bool
	Throttle(ctx context.Context, key string) error
	Transaction(ctx context.Context, fn func(*domain.State, store.Tx) error) error
}

// Mailer sends a password-reset email through Resend and reports whether Resend
// accepted it; an error means the request did not complete.
type Mailer func(ctx context.Context, apiKey string, message []byte) (accepted bool, err error)

// Config wires the API.
type Config struct {
	Store  Store
	Rules  *domain.Rules
	Getenv func(string) string // environment, read on each request like process.env
	Now    func() time.Time
	Mail   Mailer
	Log    *log.Logger
}

type handler struct{ Config }

// apiError is an error whose message the client sees.
type apiError string

func (e apiError) Error() string { return string(e) }

func token() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// safeUser is the user summary returned with every state.
func safeUser(u *domain.User) object {
	o := object{}
	for _, k := range []string{"id", "name", "username", "role", "team", "approvalLevel", "companies", "groupAccess", "active"} {
		o = append(o, member{k, domain.Field(u, k)})
	}
	return o
}

func (h *handler) now() int64 { return h.Now().UnixMilli() }

func (h *handler) challenge(ctx context.Context, tx store.Tx, data object) (string, error) {
	t := token()
	return t, tx.AddChallenge(ctx, auth.Hash(t), data.json())
}

func (h *handler) session(ctx context.Context, tx store.Tx, u *domain.User, w http.ResponseWriter) error {
	t := token()
	if err := tx.AddSession(ctx, auth.Hash(t), domain.DynString(u.ID)); err != nil {
		return err
	}
	secure := ""
	if h.Getenv("NODE_ENV") == "production" {
		secure = "; Secure"
	}
	w.Header().Set("Set-Cookie", "portal_session="+t+"; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800"+secure)
	return nil
}

func (h *handler) authenticate(ctx context.Context, tx store.Tx, s *domain.State, r *http.Request) (*domain.User, error) {
	cookie := sessionCookie(r)
	if cookie == "" {
		return nil, apiError("Sign in required")
	}
	userID, err := tx.SessionUser(ctx, auth.Hash(cookie))
	if err != nil {
		return nil, err
	}
	for _, u := range s.Users {
		if domain.StrictEqual(domain.DynString(u.ID), userID) && domain.Truthy(domain.Field(u, "active")) {
			return u, nil
		}
	}
	return nil, apiError("Sign in required")
}

// lowerField is u[key].toLowerCase(), failing like JavaScript when it is not a string.
func lowerField(u *domain.User, key string) (string, error) {
	v := domain.Field(u, key)
	s, ok := v.(string)
	if !ok {
		if v == nil || v == domain.Undefined {
			return "", apiError("Cannot read properties of " + map[bool]string{true: "null", false: "undefined"}[v == nil] + " (reading 'toLowerCase')")
		}
		return "", apiError("u." + key + ".toLowerCase is not a function")
	}
	return domain.Lower(s), nil
}

// findActive returns the first active user whose key matches value case-insensitively.
func findActive(s *domain.State, key, value string) (*domain.User, error) {
	want := domain.Lower(value)
	for _, u := range s.Users {
		got, err := lowerField(u, key)
		if err != nil {
			return nil, err
		}
		if got == want && domain.Truthy(domain.Field(u, "active")) {
			return u, nil
		}
	}
	return nil, nil
}

// audit appends an entry written by the API itself (sign-in via ERP, password reset).
func audit(s *domain.State, u *domain.User, action, detail string, now int64) {
	s.Audit = append(s.Audit, &domain.AuditEntry{
		ID: domain.Ptr(token()), At: domain.Ptr(domain.ISOString(now)), UserID: u.ID, User: u.Name,
		Action: domain.Ptr(action), Entity: u.ID, Detail: domain.Ptr(detail),
	})
}

var setupError = regexp.MustCompile(`(?i)configured|connect|relation|password must|Initial admin`)

const setupMessage = "Portal setup incomplete. Check database and environment configuration."

// failure maps an error to the status and message the Node.js portal sent.
func (h *handler) failure(err error) (int, string) {
	var msg string
	var de *domain.Error
	var pe *pgconn.PgError
	var ie *domain.InternalError
	var ue *store.UnavailableError
	switch {
	case errors.As(err, &ue):
		h.Log.Printf("database: %v", ue.Err)
		return http.StatusServiceUnavailable, setupMessage
	case errors.As(err, &ie):
		h.Log.Printf("%v\n%s", ie, ie.Stack)
		return http.StatusInternalServerError, "Internal error"
	case errors.As(err, &de):
		msg = de.Message
	case errors.As(err, &pe):
		msg = pe.Message
	default:
		msg = err.Error()
	}
	switch {
	case msg == "Sign in required":
		return http.StatusUnauthorized, msg
	case setupError.MatchString(msg):
		return http.StatusServiceUnavailable, setupMessage
	}
	return http.StatusBadRequest, msg
}

// serveAPI handles /api/index. body is the parsed JSON request body (domain.Undefined
// when the request is not a POST).
func (h *handler) serveAPI(w http.ResponseWriter, r *http.Request, body any) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	q := parseQuery(r.URL.RawQuery)
	action := domain.String(q.orDefault("action", "state"))
	send := func(status int, o object) {
		w.WriteHeader(status)
		w.Write(o.json())
	}
	configured := h.Store.Configured()
	if action == "config" {
		send(http.StatusOK, object{{"configured", configured}, {"demo", !configured}, {"emailReset", h.Getenv("RESEND_API_KEY") != ""}})
		return
	}
	if !configured {
		send(http.StatusServiceUnavailable, object{{"error", "Database not connected. Use the labelled demo for testing."}})
		return
	}
	status, response, err := h.try(w, r, action, q, body)
	if err != nil {
		status, msg := h.failure(err)
		send(status, object{{"error", msg}})
		return
	}
	if response == nil { // redirect
		w.WriteHeader(status)
		return
	}
	send(status, response)
}

func (h *handler) try(w http.ResponseWriter, r *http.Request, action string, q query, body any) (int, object, error) {
	ctx := r.Context()
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		return http.StatusMethodNotAllowed, object{{"error", "Method not allowed"}}, nil
	}
	if r.Method == http.MethodGet && !slices.Contains([]string{"state", "config", "file", "sso"}, action) {
		return http.StatusMethodNotAllowed, object{{"error", "POST required"}}, nil
	}
	if r.Method == http.MethodPost {
		origin := r.Header.Values("Origin")
		if len(origin) == 0 || origin[0] == "" {
			return http.StatusForbidden, object{{"error", "Same-origin request required"}}, nil
		}
		host, err := originHost(origin[0])
		if err != nil {
			return 0, nil, err
		}
		if host != r.Host {
			return http.StatusForbidden, object{{"error", "Same-origin request required"}}, nil
		}
	}
	b := body
	if s, ok := b.(string); ok {
		v, err := domain.ParseJSON([]byte(s))
		if err != nil {
			return 0, nil, apiError("Invalid request body")
		}
		b = v
	}
	if !domain.Truthy(b) {
		b = map[string]any{}
	}
	if slices.Contains([]string{"login", "verify", "reset-start", "reset-finish", "sso"}, action) {
		// Behind the Cloudflare Tunnel, CF-Connecting-IP is the visitor's address set by Cloudflare;
		// X-Forwarded-For there keeps any value the visitor sent, so it would let them dodge the limit.
		if err := h.Store.Throttle(ctx, action+":"+clientAddress(r)); err != nil {
			return 0, nil, err
		}
	}
	switch action {
	case "sso":
		location := "/"
		if err := h.sso(ctx, w, q); err != nil {
			location = "/?sso=failed"
		}
		w.Header().Set("Location", location)
		return http.StatusSeeOther, nil, nil
	case "login":
		return h.login(ctx, b)
	case "verify":
		return h.verify(ctx, w, b)
	case "reset-start":
		return h.resetStart(ctx, b)
	case "reset-finish":
		return h.resetFinish(ctx, b)
	}
	var out object
	err := h.Store.Transaction(ctx, func(s *domain.State, tx store.Tx) error {
		u, err := h.authenticate(ctx, tx, s, r)
		if err != nil {
			return err
		}
		switch action {
		case "logout":
			if err := tx.DeleteSessions(ctx, domain.DynString(u.ID)); err != nil {
				return err
			}
			w.Header().Set("Set-Cookie", "portal_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0")
			out = object{{"ok", true}}
			return nil
		case "file":
			f, err := h.Rules.SupportingFile(s, u, domain.FileQuery{
				ID: q.get("id"), Kind: q.get("kind"), Index: q.orDefault("index", 0.0),
				Version: q.get("version"), Side: q.orDefault("side", "data"),
			}, h.now())
			if err != nil {
				return err
			}
			out = object{{"file", f}}
			return nil
		case "command":
			if err := h.command(ctx, tx, s, u, b); err != nil {
				return err
			}
		case "state":
		default:
			return apiError("Unknown endpoint")
		}
		visible, err := h.Rules.VisibleState(s, u)
		if err != nil {
			return err
		}
		out = object{{"user", safeUser(u)}, {"state", visible}}
		return nil
	})
	if err != nil {
		return 0, nil, err
	}
	return http.StatusOK, out, nil
}

func (h *handler) command(ctx context.Context, tx store.Tx, s *domain.State, u *domain.User, cmd any) error {
	data := domain.Get(cmd, "data")
	userSave := domain.StrictEqual(domain.Get(cmd, "type"), "user.save")
	if userSave {
		if !domain.StrictEqual(domain.DynString(u.Role), "Admin") {
			return apiError("Admin required")
		}
		id := domain.Get(domain.Get(data, "record"), "id")
		exists := slices.ContainsFunc(s.Users, func(x *domain.User) bool { return domain.StrictEqual(domain.DynString(x.ID), id) })
		if !exists && !domain.Truthy(domain.Get(data, "password")) {
			return apiError("Initial password required")
		}
	}
	if err := h.Rules.Apply(s, u, cmd, h.now()); err != nil {
		return err
	}
	if !userSave {
		return nil
	}
	id := domain.Get(domain.Get(data, "record"), "id")
	if !domain.Truthy(id) {
		id = domain.Field(s.Audit[len(s.Audit)-1], "entity")
	}
	var x *domain.User
	for _, y := range s.Users {
		if domain.StrictEqual(domain.DynString(y.ID), id) {
			x = y
			break
		}
	}
	if x == nil {
		return apiError("Cannot read properties of undefined (reading 'id')")
	}
	if password := domain.Get(data, "password"); domain.Truthy(password) {
		hash, err := auth.PasswordHash(password)
		if err != nil {
			return err
		}
		x.PasswordHash = &hash
	}
	// Admin changes to a user end that user's sessions and pending sign-ins.
	if err := tx.DeleteSessions(ctx, domain.DynString(x.ID)); err != nil {
		return err
	}
	return tx.DeleteUserChallenges(ctx, domain.DynString(x.ID))
}

// sso signs in an active user named by a valid ERP token (see docs/SPECIFICATION.md,
// Access and login). Any failure sends the browser to the login page instead.
func (h *handler) sso(ctx context.Context, w http.ResponseWriter, q query) error {
	email, jti, err := auth.SSOVerify(domain.String(q.get("token")), h.Getenv("ERP_SSO_SECRET"), h.now())
	if err != nil {
		return err
	}
	return h.Store.Transaction(ctx, func(s *domain.State, tx store.Tx) error {
		fresh, err := tx.AddChallengeOnce(ctx, auth.Hash("sso:"+jti), object{{"kind", "sso"}}.json())
		if err != nil {
			return err
		}
		if !fresh {
			return apiError("ERP sign-in link already used")
		}
		u, err := findActive(s, "email", email)
		if err != nil {
			return err
		}
		if u == nil {
			return apiError("No active portal user for this email")
		}
		if err := h.session(ctx, tx, u, w); err != nil {
			return err
		}
		audit(s, u, "Signed in via ERP", "ERP single sign-on", h.now())
		return nil
	})
}

func (h *handler) login(ctx context.Context, b any) (int, object, error) {
	var out object
	err := h.Store.Transaction(ctx, func(s *domain.State, tx store.Tx) error {
		u, err := findActive(s, "username", domain.String(domain.Get(b, "username")))
		if err != nil {
			return err
		}
		if u == nil || !auth.PasswordOK(domain.String(domain.Get(b, "password")), u.PasswordHash) {
			return apiError("Invalid username or password")
		}
		if !domain.Truthy(domain.Field(u, "totpSecret")) {
			key := auth.Secret()
			uri, qr, err := auth.Enrollment(domain.String(domain.Field(u, "username")), key)
			if err != nil {
				return err
			}
			sealed, err := auth.Encrypt(h.Getenv("AUTH_ENCRYPTION_KEY"), key)
			if err != nil {
				return err
			}
			t, err := h.challenge(ctx, tx, object{{"userId", domain.DynString(u.ID)}, {"key", sealed}, {"kind", "enroll"}})
			if err != nil {
				return err
			}
			out = object{{"challenge", t}, {"enroll", true}, {"secret", key}, {"uri", uri}, {"qrCode", qr}}
			return nil
		}
		t, err := h.challenge(ctx, tx, object{{"userId", domain.DynString(u.ID)}, {"kind", "login"}})
		out = object{{"challenge", t}}
		return err
	})
	if err != nil {
		return 0, nil, err
	}
	return http.StatusOK, out, nil
}

// challengeUser returns the challenge data and its active user, if any.
func challengeUser(ctx context.Context, tx store.Tx, s *domain.State, hash string) (any, *domain.User, error) {
	ch, err := tx.Challenge(ctx, hash)
	if err != nil {
		return nil, nil, err
	}
	userID := domain.Get(ch, "userId")
	for _, u := range s.Users {
		if domain.StrictEqual(domain.DynString(u.ID), userID) && domain.Truthy(domain.Field(u, "active")) {
			return ch, u, nil
		}
	}
	return ch, nil, nil
}

func (h *handler) verify(ctx context.Context, w http.ResponseWriter, b any) (int, object, error) {
	var out object
	err := h.Store.Transaction(ctx, func(s *domain.State, tx store.Tx) error {
		hash := auth.Hash(domain.String(domain.Get(b, "challenge")))
		ch, u, err := challengeUser(ctx, tx, s, hash)
		if err != nil {
			return err
		}
		kind := domain.Get(ch, "kind")
		enroll := domain.StrictEqual(kind, "enroll")
		if u == nil || !(enroll || domain.StrictEqual(kind, "login")) {
			return apiError("Sign-in challenge expired")
		}
		key := domain.Field(u, "totpSecret")
		if enroll {
			key = domain.Get(ch, "key")
		}
		sealed, ok := key.(string)
		if !ok {
			if key == nil || key == domain.Undefined {
				return apiError("Cannot read properties of " + map[bool]string{true: "null", false: "undefined"}[key == nil] + " (reading 'split')")
			}
			return apiError("v.split is not a function")
		}
		secret, err := auth.Decrypt(h.Getenv("AUTH_ENCRYPTION_KEY"), sealed)
		if err != nil {
			return err
		}
		code := domain.String(domain.Get(b, "code"))
		if !auth.TOTPOK(secret, code, h.now()) {
			return apiError("Invalid authenticator code")
		}
		if domain.StrictEqual(domain.Field(u, "lastTotp"), code) {
			return apiError("Code already used. Wait for a new code.")
		}
		u.LastTOTP = &code
		if enroll {
			u.TOTPSecret = &sealed
		}
		if err := tx.DeleteChallenge(ctx, hash); err != nil {
			return err
		}
		if err := h.session(ctx, tx, u, w); err != nil {
			return err
		}
		visible, err := h.Rules.VisibleState(s, u)
		if err != nil {
			return err
		}
		out = object{{"user", safeUser(u)}, {"state", visible}}
		return nil
	})
	if err != nil {
		return 0, nil, err
	}
	return http.StatusOK, out, nil
}

func (h *handler) resetStart(ctx context.Context, b any) (int, object, error) {
	var challenge, otp, email string
	err := h.Store.Transaction(ctx, func(s *domain.State, tx store.Tx) error {
		u, err := findActive(s, "email", domain.String(domain.Get(b, "email")))
		if err != nil || u == nil {
			return err
		}
		if h.Getenv("RESEND_API_KEY") == "" || h.Getenv("MAIL_FROM") == "" {
			return apiError("Email password reset is not configured")
		}
		n, _ := rand.Int(rand.Reader, big.NewInt(900000))
		otp = domain.String(float64(n.Int64() + 100000))
		email = domain.String(domain.Field(u, "email"))
		challenge, err = h.challenge(ctx, tx, object{{"userId", domain.DynString(u.ID)}, {"kind", "reset"}, {"otp", auth.Hash(otp)}})
		return err
	})
	if err != nil {
		return 0, nil, err
	}
	if challenge != "" {
		message := object{
			{"from", h.Getenv("MAIL_FROM")},
			{"to", []any{email}},
			{"subject", "Sun Siyam portal password reset"},
			{"text", "Your password reset OTP is " + otp + ". It expires in 10 minutes. Your authenticator remains required."},
		}.json()
		accepted, err := h.Mail(ctx, h.Getenv("RESEND_API_KEY"), message)
		if err != nil {
			return 0, nil, apiError("fetch failed")
		}
		if !accepted {
			return 0, nil, apiError("Unable to send reset email")
		}
	} else {
		challenge = token()
	}
	return http.StatusOK, object{{"challenge", challenge}, {"message", "If the email matches an active account, an OTP has been sent."}}, nil
}

func (h *handler) resetFinish(ctx context.Context, b any) (int, object, error) {
	err := h.Store.Transaction(ctx, func(s *domain.State, tx store.Tx) error {
		hash := auth.Hash(domain.String(domain.Get(b, "challenge")))
		ch, u, err := challengeUser(ctx, tx, s, hash)
		if err != nil {
			return err
		}
		if u == nil || !domain.StrictEqual(domain.Get(ch, "kind"), "reset") ||
			!domain.StrictEqual(domain.Get(ch, "otp"), auth.Hash(domain.String(domain.Get(b, "code")))) {
			return apiError("Invalid or expired OTP")
		}
		hashed, err := auth.PasswordHash(domain.Get(b, "password"))
		if err != nil {
			return err
		}
		u.PasswordHash = &hashed
		if err := tx.DeleteSessions(ctx, domain.DynString(u.ID)); err != nil {
			return err
		}
		if err := tx.DeleteChallengeAndUserChallenges(ctx, hash, domain.DynString(u.ID)); err != nil {
			return err
		}
		audit(s, u, "Password reset", "All previous sessions revoked", h.now())
		return nil
	})
	if err != nil {
		return 0, nil, err
	}
	return http.StatusOK, object{{"ok", true}}, nil
}

// ResendMailer posts the message to the Resend email API.
func ResendMailer(client *http.Client) Mailer {
	return func(ctx context.Context, apiKey string, message []byte) (bool, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(message))
		if err != nil {
			return false, err
		}
		req.Header.Set("Authorization", "Bearer "+apiKey)
		req.Header.Set("Content-Type", "application/json")
		res, err := client.Do(req)
		if err != nil {
			return false, err
		}
		res.Body.Close()
		return res.StatusCode >= 200 && res.StatusCode < 300, nil
	}
}
