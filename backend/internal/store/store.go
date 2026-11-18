// Package store keeps the portal's data in PostgreSQL (see docs/DATABASE.md). It is a
// port of lib/store.mjs with the same tables, statements and transaction pattern: every
// change locks the single workspace row (SELECT ... FOR UPDATE), migrates and changes
// the workspace, and writes it back in the same transaction.
package store

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Sunsiyam-Resorts/project-monitoring/backend/internal/auth"
	"github.com/Sunsiyam-Resorts/project-monitoring/backend/internal/domain"
)

// Tx is what a transaction offers besides the workspace: the session, challenge and
// throttle tables, with the same statements the Node.js portal used.
type Tx interface {
	// AddChallenge stores a ten-minute challenge (JSON data) under the hash of its token.
	AddChallenge(ctx context.Context, tokenHash string, data []byte) error
	// AddChallengeOnce is AddChallenge that reports false when the hash already exists.
	AddChallengeOnce(ctx context.Context, tokenHash string, data []byte) (bool, error)
	// Challenge returns the data of an unexpired challenge, locked for update, or
	// domain.Undefined when there is none.
	Challenge(ctx context.Context, tokenHash string) (any, error)
	DeleteChallenge(ctx context.Context, tokenHash string) error
	// DeleteUserChallenges deletes every challenge of the user.
	DeleteUserChallenges(ctx context.Context, userID any) error
	// DeleteChallengeAndUserChallenges deletes the challenge and every challenge of the user.
	DeleteChallengeAndUserChallenges(ctx context.Context, tokenHash string, userID any) error
	// AddSession stores a session under the hash of its token. It expires after
	// SessionIdleMinutes without activity.
	AddSession(ctx context.Context, tokenHash string, userID any) error
	// SessionUser returns the user id of an unexpired session, or domain.Undefined. With
	// touch (a request the user made), the session's idle period starts again.
	SessionUser(ctx context.Context, tokenHash string, touch bool) (any, error)
	// DeleteSession ends one session (this browser).
	DeleteSession(ctx context.Context, tokenHash string) error
	// DeleteSessions ends every session of the user.
	DeleteSessions(ctx context.Context, userID any) error
}

// SessionIdleMinutes is how long a session lasts without activity: a user is signed out
// after 15 minutes of inactivity, and never while active.
const SessionIdleMinutes = 15

// UnavailableError is a failure to reach or use the database, other than an error
// reported by PostgreSQL itself.
type UnavailableError struct{ Err error }

func (e *UnavailableError) Error() string { return "database unavailable: " + e.Err.Error() }
func (e *UnavailableError) Unwrap() error { return e.Err }

func dbErr(err error) error {
	var pe *pgconn.PgError
	if err == nil || errors.As(err, &pe) {
		return err
	}
	var de *domain.Error
	if errors.As(err, &de) {
		return err
	}
	return &UnavailableError{err}
}

// ErrTooManyAttempts is returned by Throttle after 15 attempts within 15 minutes.
var ErrTooManyAttempts = errors.New("Too many attempts. Try again in 15 minutes.")

// ErrAdminNotConfigured is returned when the initial Admin variables are missing.
var ErrAdminNotConfigured = errors.New("Initial admin email and password must be configured")

// Store is the PostgreSQL storage. It creates its tables and the initial workspace on
// first use.
type Store struct {
	url    string
	getenv func(string) string
	rules  *domain.Rules
	now    func() time.Time

	mu    sync.Mutex
	pool  *pgxpool.Pool
	ready bool
}

// New returns a store for databaseURL. getenv supplies the initial Admin variables
// (ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD).
func New(databaseURL string, getenv func(string) string, rules *domain.Rules) *Store {
	return &Store{url: databaseURL, getenv: getenv, rules: rules, now: time.Now}
}

// Configured reports whether a database is configured (DATABASE_URL is set).
func (s *Store) Configured() bool { return s.url != "" }

// Close releases the connections.
func (s *Store) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.pool != nil {
		s.pool.Close()
	}
}

func (s *Store) getPool() (*pgxpool.Pool, error) {
	if s.pool != nil {
		return s.pool, nil
	}
	cfg, err := pgxpool.ParseConfig(s.url)
	if err != nil {
		return nil, &UnavailableError{err}
	}
	cfg.MaxConns = 3
	cfg.MaxConnIdleTime = 10 * time.Second
	cfg.ConnConfig.ConnectTimeout = 10 * time.Second
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		return nil, &UnavailableError{err}
	}
	s.pool = pool
	return pool, nil
}

const schema = `CREATE TABLE IF NOT EXISTS portal_state (id integer PRIMARY KEY CHECK(id=1), data jsonb NOT NULL); CREATE TABLE IF NOT EXISTS portal_sessions (token text PRIMARY KEY, user_id text NOT NULL, expires timestamptz NOT NULL); CREATE TABLE IF NOT EXISTS portal_challenges (token text PRIMARY KEY, data jsonb NOT NULL, expires timestamptz NOT NULL); CREATE TABLE IF NOT EXISTS portal_throttle (key text PRIMARY KEY, attempts integer NOT NULL, expires timestamptz NOT NULL);`

// init creates the tables and, when there is no workspace yet, the initial workspace
// with the configured Admin. A failed attempt is retried by the next request.
func (s *Store) init(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.ready {
		return nil
	}
	pool, err := s.getPool()
	if err != nil {
		return err
	}
	if _, err := pool.Exec(ctx, schema); err != nil {
		return dbErr(err)
	}
	state := domain.EmptyState()
	email, password := s.getenv("ADMIN_EMAIL"), s.getenv("ADMIN_PASSWORD")
	if email == "" || password == "" {
		return ErrAdminNotConfigured
	}
	username := s.getenv("ADMIN_USERNAME")
	if username == "" {
		username = "abuney"
	}
	hash, err := auth.PasswordHash(password)
	if err != nil {
		return err
	}
	admin := &domain.User{
		ID: domain.Ptr("initial-admin"), Name: domain.Ptr("Administrator"), Username: &username, Email: &email,
		Role: domain.Ptr("Admin"), Companies: []string{}, GroupAccess: domain.Ptr(true), Active: domain.Ptr(true),
		PasswordHash: &hash, Extra: domain.Extra{"team": ""},
	}
	state.Users = append(state.Users, admin)
	if _, err := pool.Exec(ctx, "INSERT INTO portal_state(id,data) VALUES(1,$1) ON CONFLICT DO NOTHING", domain.EncodeState(state)); err != nil {
		return dbErr(err)
	}
	s.ready = true
	return nil
}

// Transaction locks the workspace, migrates it, runs fn and stores the result in one
// database transaction. Any error rolls everything back.
func (s *Store) Transaction(ctx context.Context, fn func(*domain.State, Tx) error) error {
	if err := s.init(ctx); err != nil {
		return err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return dbErr(err)
	}
	defer tx.Rollback(context.Background())
	var data []byte
	err = tx.QueryRow(ctx, "SELECT data FROM portal_state WHERE id=1 FOR UPDATE").Scan(&data)
	if errors.Is(err, pgx.ErrNoRows) {
		return &domain.Error{Message: "Cannot read properties of undefined (reading 'data')"}
	}
	if err != nil {
		return dbErr(err)
	}
	if string(data) == "null" {
		return &domain.Error{Message: "Cannot read properties of null (reading 'version')"}
	}
	state, err := domain.DecodeState(data)
	if err != nil {
		return &UnavailableError{err}
	}
	if err := s.rules.MigrateState(state, s.now().UnixMilli()); err != nil {
		return err
	}
	if err := fn(state, pgTx{tx}); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "UPDATE portal_state SET data=$1 WHERE id=1", domain.EncodeState(state)); err != nil {
		return dbErr(err)
	}
	return dbErr(tx.Commit(ctx))
}

// Throttle counts an authentication attempt for key and fails after 15 within 15 minutes.
func (s *Store) Throttle(ctx context.Context, key string) error {
	if err := s.init(ctx); err != nil {
		return err
	}
	var attempts int
	err := s.pool.QueryRow(ctx, `INSERT INTO portal_throttle(key,attempts,expires) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN portal_throttle.expires<now() THEN 1 ELSE portal_throttle.attempts+1 END, expires=CASE WHEN portal_throttle.expires<now() THEN now()+interval '15 minutes' ELSE portal_throttle.expires END RETURNING attempts`, key).Scan(&attempts)
	if err != nil {
		return dbErr(err)
	}
	if attempts > 15 {
		return ErrTooManyAttempts
	}
	return nil
}

type pgTx struct{ tx pgx.Tx }

// param is a dynamic value as node-postgres sends it: undefined and null as NULL,
// anything else as text.
func param(v any) any {
	if v == nil || v == domain.Undefined {
		return nil
	}
	return domain.String(v)
}

func (t pgTx) AddChallenge(ctx context.Context, tokenHash string, data []byte) error {
	_, err := t.tx.Exec(ctx, "INSERT INTO portal_challenges(token,data,expires) VALUES($1,$2,now()+interval '10 minutes')", tokenHash, data)
	return dbErr(err)
}

func (t pgTx) AddChallengeOnce(ctx context.Context, tokenHash string, data []byte) (bool, error) {
	tag, err := t.tx.Exec(ctx, "INSERT INTO portal_challenges(token,data,expires) VALUES($1,$2,now()+interval '10 minutes') ON CONFLICT DO NOTHING", tokenHash, data)
	return tag.RowsAffected() > 0, dbErr(err)
}

func (t pgTx) Challenge(ctx context.Context, tokenHash string) (any, error) {
	var data []byte
	err := t.tx.QueryRow(ctx, "SELECT data FROM portal_challenges WHERE token=$1 AND expires>now() FOR UPDATE", tokenHash).Scan(&data)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Undefined, nil
	}
	if err != nil {
		return nil, dbErr(err)
	}
	return domain.ParseJSON(data)
}

func (t pgTx) DeleteChallenge(ctx context.Context, tokenHash string) error {
	_, err := t.tx.Exec(ctx, "DELETE FROM portal_challenges WHERE token=$1", tokenHash)
	return dbErr(err)
}

func (t pgTx) DeleteUserChallenges(ctx context.Context, userID any) error {
	_, err := t.tx.Exec(ctx, "DELETE FROM portal_challenges WHERE data->>'userId'=$1", param(userID))
	return dbErr(err)
}

func (t pgTx) DeleteChallengeAndUserChallenges(ctx context.Context, tokenHash string, userID any) error {
	_, err := t.tx.Exec(ctx, "DELETE FROM portal_challenges WHERE token=$1 OR data->>'userId'=$2", tokenHash, param(userID))
	return dbErr(err)
}

func (t pgTx) AddSession(ctx context.Context, tokenHash string, userID any) error {
	_, err := t.tx.Exec(ctx, "INSERT INTO portal_sessions(token,user_id,expires) VALUES($1,$2,now()+make_interval(mins => $3::int))", tokenHash, param(userID), SessionIdleMinutes)
	return dbErr(err)
}

func (t pgTx) SessionUser(ctx context.Context, tokenHash string, touch bool) (any, error) {
	var userID string
	query, args := "SELECT user_id FROM portal_sessions WHERE token=$1 AND expires>now()", []any{tokenHash}
	if touch {
		query, args = "UPDATE portal_sessions SET expires=now()+make_interval(mins => $2::int) WHERE token=$1 AND expires>now() RETURNING user_id", []any{tokenHash, SessionIdleMinutes}
	}
	err := t.tx.QueryRow(ctx, query, args...).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Undefined, nil
	}
	if err != nil {
		return nil, dbErr(err)
	}
	return userID, nil
}

func (t pgTx) DeleteSession(ctx context.Context, tokenHash string) error {
	_, err := t.tx.Exec(ctx, "DELETE FROM portal_sessions WHERE token=$1", tokenHash)
	return dbErr(err)
}

func (t pgTx) DeleteSessions(ctx context.Context, userID any) error {
	_, err := t.tx.Exec(ctx, "DELETE FROM portal_sessions WHERE user_id=$1", param(userID))
	return dbErr(err)
}
