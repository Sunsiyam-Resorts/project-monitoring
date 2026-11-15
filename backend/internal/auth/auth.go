// Package auth holds the authentication primitives: salted scrypt password hashes,
// authenticator (TOTP) codes, AES-256-GCM encryption of authenticator secrets, and
// verification of ERP single sign-on tokens. It is a port of lib/auth.mjs; values
// produced by the Node.js version (stored hashes, encrypted secrets, ERP tokens)
// verify here unchanged.
package auth

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"unicode/utf16"

	"golang.org/x/crypto/scrypt"

	"github.com/Sunsiyam-Resorts/project-monitoring/backend/internal/domain"
)

// Hash is the SHA-256 hex digest used for session, challenge and OTP tokens.
func Hash(v string) string {
	sum := sha256.Sum256([]byte(v))
	return hex.EncodeToString(sum[:])
}

// ErrPasswordLength is the message the portal shows for an unacceptable password.
var ErrPasswordLength = errors.New("Password must be 12–256 characters")

func jsLength(s string) int { return len(utf16.Encode([]rune(s))) }

// scrypt parameters of Node's crypto.scryptSync defaults (N=16384, r=8, p=1), 64 bytes.
func derive(password, salt string) []byte {
	key, err := scrypt.Key([]byte(password), []byte(salt), 16384, 8, 1, 64)
	if err != nil {
		panic(err)
	}
	return key
}

// PasswordHash returns "salt:hash" with a random 16-byte hex salt. password must be a
// string of 12–256 characters (JavaScript length), as in the Node version.
func PasswordHash(password any) (string, error) {
	p, ok := password.(string)
	if !ok || jsLength(p) < 12 || jsLength(p) > 256 {
		return "", ErrPasswordLength
	}
	salt := make([]byte, 16)
	rand.Read(salt)
	s := hex.EncodeToString(salt)
	return s + ":" + hex.EncodeToString(derive(p, s)), nil
}

// PasswordOK checks password against an encoded "salt:hash".
func PasswordOK(password string, encoded *string) bool {
	if encoded == nil {
		return false
	}
	parts := strings.Split(*encoded, ":")
	if len(parts) < 2 {
		return false
	}
	want := nodeHex(parts[1])
	got := derive(password, parts[0])
	return len(want) == len(got) && subtle.ConstantTimeCompare(got, want) == 1
}

// nodeHex decodes like Buffer.from(s, "hex"): pairs up to the first invalid one.
func nodeHex(s string) []byte {
	var out []byte
	for i := 0; i+1 < len(s); i += 2 {
		b, err := hex.DecodeString(s[i : i+2])
		if err != nil {
			break
		}
		out = append(out, b[0])
	}
	return out
}

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

// Secret returns a new random authenticator key: 20 bytes in base32 (32 characters).
func Secret() string {
	b := make([]byte, 20)
	rand.Read(b)
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b)
}

// decodeSecret is the Node version's base32 decoder, including its 32-bit arithmetic
// for characters outside the alphabet.
func decodeSecret(s string) []byte {
	var value int32
	bits := 0
	var out []byte
	for _, c := range s {
		value = value<<5 | int32(strings.IndexRune(alphabet, c))
		bits += 5
		if bits >= 8 {
			out = append(out, byte(uint32(value)>>(bits-8)))
			bits -= 8
		}
	}
	return out
}

// TOTP returns the six-digit RFC 6238 (SHA-1, 30 s) code for key at timeMs.
func TOTP(key string, timeMs int64) string {
	var counter [8]byte
	binary.BigEndian.PutUint64(counter[:], uint64(math.Floor(float64(timeMs)/30000)))
	mac := hmac.New(sha1.New, decodeSecret(key))
	mac.Write(counter[:])
	h := mac.Sum(nil)
	off := h[19] & 15
	return fmt.Sprintf("%06d", (binary.BigEndian.Uint32(h[off:])&0x7fffffff)%1000000)
}

// TOTPOK accepts the code for the current or an adjacent 30-second interval.
func TOTPOK(key, code string, timeMs int64) bool {
	if len(code) != 6 || strings.Trim(code, "0123456789") != "" {
		return false
	}
	ok := false
	for _, d := range []int64{-30000, 0, 30000} {
		ok = subtle.ConstantTimeCompare([]byte(TOTP(key, timeMs+d)), []byte(code)) == 1 || ok
	}
	return ok
}

// ErrKeyMissing is returned when AUTH_ENCRYPTION_KEY is not 64 hexadecimal characters.
var ErrKeyMissing = errors.New("AUTH_ENCRYPTION_KEY must be configured")

// ErrAuthentication is Node's message when decryption fails authentication.
var ErrAuthentication = errors.New("Unsupported state or unable to authenticate data")

func encryptionKey(k string) ([]byte, error) {
	if len(k) != 64 {
		return nil, ErrKeyMissing
	}
	b, err := hex.DecodeString(k)
	if err != nil {
		return nil, ErrKeyMissing
	}
	return b, nil
}

// Encrypt seals v with AES-256-GCM under the hex key: "iv:tag:ciphertext" in hex.
func Encrypt(key, v string) (string, error) {
	k, err := encryptionKey(key)
	if err != nil {
		return "", err
	}
	block, _ := aes.NewCipher(k)
	gcm, _ := cipher.NewGCM(block)
	iv := make([]byte, 12)
	rand.Read(iv)
	sealed := gcm.Seal(nil, iv, []byte(v), nil)
	data, tag := sealed[:len(sealed)-16], sealed[len(sealed)-16:]
	return hex.EncodeToString(iv) + ":" + hex.EncodeToString(tag) + ":" + hex.EncodeToString(data), nil
}

// Decrypt opens a value produced by Encrypt (or by the Node version).
func Decrypt(key, v string) (string, error) {
	k, err := encryptionKey(key)
	if err != nil {
		return "", err
	}
	parts := strings.Split(v, ":")
	if len(parts) < 3 {
		return "", ErrAuthentication
	}
	iv, tag, data := nodeHex(parts[0]), nodeHex(parts[1]), nodeHex(parts[2])
	block, _ := aes.NewCipher(k)
	var gcm cipher.AEAD
	switch {
	case len(iv) == 12 && len(tag) >= 12 && len(tag) <= 16:
		gcm, err = cipher.NewGCMWithTagSize(block, len(tag))
	case len(iv) > 0 && len(tag) == 16:
		gcm, err = cipher.NewGCMWithNonceSize(block, len(iv))
	default:
		return "", ErrAuthentication
	}
	if err != nil {
		return "", ErrAuthentication
	}
	plain, err := gcm.Open(nil, iv, append(data, tag...), nil)
	if err != nil {
		return "", ErrAuthentication
	}
	return string(plain), nil
}

// ErrSSONotConfigured is returned when ERP_SSO_SECRET is missing or shorter than 32 bytes.
var ErrSSONotConfigured = errors.New("ERP sign-in is not configured")

// ErrSSOInvalid is returned for any token that is not a valid, current ERP sign-in.
var ErrSSOInvalid = errors.New("Invalid ERP sign-in")

// SSOVerify checks an ERP sign-in token "payload.signature" (base64url JSON and its
// HMAC-SHA256 under secret) and returns its email and single-use id. The token must be
// for audience "project-monitoring" and current at nowMs, allowing 30 s of clock skew.
func SSOVerify(token, secret string, nowMs int64) (email, jti string, err error) {
	if secret == "" || len(secret) < 32 {
		return "", "", ErrSSONotConfigured
	}
	parts := strings.Split(token, ".")
	if len(parts) < 2 || parts[0] == "" || parts[1] == "" {
		return "", "", ErrSSOInvalid
	}
	p, sig := parts[0], parts[1]
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(p))
	expect := mac.Sum(nil)
	got := nodeBase64(sig)
	if len(got) != len(expect) || subtle.ConstantTimeCompare(got, expect) != 1 {
		return "", "", ErrSSOInvalid
	}
	var claims map[string]any
	if json.Unmarshal(nodeBase64(p), &claims) != nil || claims == nil {
		return "", "", ErrSSOInvalid
	}
	email, okEmail := claims["email"].(string)
	jti, okJTI := claims["jti"].(string)
	now := float64(nowMs)
	if claims["aud"] != "project-monitoring" || !okEmail || !okJTI ||
		!(domain.Number(claims["exp"])*1000+30000 > now) || !(domain.Number(claims["iat"])*1000-30000 < now) {
		return "", "", ErrSSOInvalid
	}
	return email, jti, nil
}

// nodeBase64 decodes like Buffer.from(s, "base64url"): both alphabets, characters
// outside them skipped, decoding stops at "=".
func nodeBase64(s string) []byte {
	var vals []byte
	for i := 0; i < len(s) && s[i] != '='; i++ {
		c := s[i]
		switch {
		case c >= 'A' && c <= 'Z':
			vals = append(vals, c-'A')
		case c >= 'a' && c <= 'z':
			vals = append(vals, c-'a'+26)
		case c >= '0' && c <= '9':
			vals = append(vals, c-'0'+52)
		case c == '+' || c == '-':
			vals = append(vals, 62)
		case c == '/' || c == '_':
			vals = append(vals, 63)
		}
	}
	out := make([]byte, 0, len(vals)*3/4)
	for i := 0; i+1 < len(vals); i += 4 {
		n := len(vals) - i
		out = append(out, vals[i]<<2|vals[i+1]>>4)
		if n > 2 {
			out = append(out, vals[i+1]<<4|vals[i+2]>>2)
		}
		if n > 3 {
			out = append(out, vals[i+2]<<6|vals[i+3])
		}
	}
	return out
}
