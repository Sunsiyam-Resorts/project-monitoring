package api

import (
	"context"
	"sync"
	"time"

	"github.com/Sunsiyam-Resorts/project-monitoring/backend/internal/domain"
	"github.com/Sunsiyam-Resorts/project-monitoring/backend/internal/store"
)

// memStore is an in-memory Store with the same transaction semantics as the
// PostgreSQL store: everything a failed transaction did is discarded.
type memStore struct {
	mu         sync.Mutex
	rules      *domain.Rules
	now        func() time.Time
	state      []byte
	sessions   map[string]memSession
	challenges map[string]memChallenge
	attempts   map[string]int
}

type memSession struct {
	userID  any
	expires time.Time
}

type memChallenge struct {
	data    []byte
	expires time.Time
}

func newMemStore(rules *domain.Rules, now func() time.Time, s *domain.State) *memStore {
	return &memStore{rules: rules, now: now, state: domain.EncodeState(s),
		sessions: map[string]memSession{}, challenges: map[string]memChallenge{}, attempts: map[string]int{}}
}

func (m *memStore) Configured() bool { return true }

func (m *memStore) Throttle(ctx context.Context, key string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.attempts[key]++
	if m.attempts[key] > 15 {
		return store.ErrTooManyAttempts
	}
	return nil
}

func (m *memStore) Transaction(ctx context.Context, fn func(*domain.State, store.Tx) error) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, err := domain.DecodeState(m.state)
	if err != nil {
		return err
	}
	if err := m.rules.MigrateState(s, m.now().UnixMilli()); err != nil {
		return err
	}
	tx := &memTx{m: m, sessions: map[string]memSession{}, challenges: map[string]memChallenge{}}
	for k, v := range m.sessions {
		tx.sessions[k] = v
	}
	for k, v := range m.challenges {
		tx.challenges[k] = v
	}
	if err := fn(s, tx); err != nil {
		return err
	}
	m.state, m.sessions, m.challenges = domain.EncodeState(s), tx.sessions, tx.challenges
	return nil
}

func (m *memStore) load() *domain.State {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, _ := domain.DecodeState(m.state)
	return s
}

type memTx struct {
	m          *memStore
	sessions   map[string]memSession
	challenges map[string]memChallenge
}

func (t *memTx) AddChallenge(ctx context.Context, h string, data []byte) error {
	t.challenges[h] = memChallenge{data, t.m.now().Add(10 * time.Minute)}
	return nil
}

func (t *memTx) AddChallengeOnce(ctx context.Context, h string, data []byte) (bool, error) {
	if _, ok := t.challenges[h]; ok {
		return false, nil
	}
	return true, t.AddChallenge(ctx, h, data)
}

func (t *memTx) Challenge(ctx context.Context, h string) (any, error) {
	c, ok := t.challenges[h]
	if !ok || !c.expires.After(t.m.now()) {
		return domain.Undefined, nil
	}
	return domain.ParseJSON(c.data)
}

func (t *memTx) DeleteChallenge(ctx context.Context, h string) error {
	delete(t.challenges, h)
	return nil
}

func (t *memTx) challengeUser(h string) any {
	v, _ := domain.ParseJSON(t.challenges[h].data)
	return domain.Get(v, "userId")
}

func (t *memTx) DeleteUserChallenges(ctx context.Context, userID any) error {
	for h := range t.challenges {
		if domain.StrictEqual(t.challengeUser(h), userID) {
			delete(t.challenges, h)
		}
	}
	return nil
}

func (t *memTx) DeleteChallengeAndUserChallenges(ctx context.Context, h string, userID any) error {
	delete(t.challenges, h)
	return t.DeleteUserChallenges(ctx, userID)
}

func (t *memTx) AddSession(ctx context.Context, h string, userID any) error {
	t.sessions[h] = memSession{userID, t.m.now().Add(store.SessionIdleMinutes * time.Minute)}
	return nil
}

func (t *memTx) SessionUser(ctx context.Context, h string, touch bool) (any, error) {
	s, ok := t.sessions[h]
	if !ok || !s.expires.After(t.m.now()) {
		return domain.Undefined, nil
	}
	if touch {
		t.sessions[h] = memSession{s.userID, t.m.now().Add(store.SessionIdleMinutes * time.Minute)}
	}
	return s.userID, nil
}

func (t *memTx) DeleteSession(ctx context.Context, h string) error {
	delete(t.sessions, h)
	return nil
}

func (t *memTx) DeleteSessions(ctx context.Context, userID any) error {
	for h, s := range t.sessions {
		if domain.StrictEqual(s.userID, userID) {
			delete(t.sessions, h)
		}
	}
	return nil
}
