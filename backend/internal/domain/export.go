package domain

// JavaScript semantics that the HTTP layer needs as well, for reading request bodies
// the way api/index.mjs did.

// Get is the property access v.key (Undefined when absent); it returns Undefined
// instead of throwing for null and undefined, like v?.key.
func Get(v any, key string) any { return opt(v, key) }

// String is JavaScript's String(v).
func String(v any) string { return toString(v) }

// Number is JavaScript's Number(v).
func Number(v any) float64 { return toNumber(v) }

// Truthy reports whether v is truthy in JavaScript.
func Truthy(v any) bool { return truthy(v) }

// Lower is String.prototype.toLowerCase.
func Lower(s string) string { return lower(s) }

// IsJSSpace reports whether r is matched by the regular expression \s.
func IsJSSpace(r rune) bool { return isJSSpace(r) }

// ISOString is new Date(ms).toISOString().
func ISOString(ms int64) string { return isoString(ms) }

// Field returns a record member as a dynamic value, whether modelled or kept in Extra.
func Field(rec any, key string) any { return field(rec, key) }

// SetField sets a record member from a dynamic value (Undefined removes it).
func SetField(rec any, key string, v any) { setField(rec, key, v) }

// StrictEqual is a === b for dynamic values.
func StrictEqual(a, b any) bool { return strictEqual(a, b) }

// DynString is the dynamic form of an optional string field (Undefined when nil).
func DynString(p *string) any { return dynString(p) }

// Ptr returns a pointer to v.
func Ptr[T any](v T) *T { return &v }
