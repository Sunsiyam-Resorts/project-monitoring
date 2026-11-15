package domain

// Command payloads arrive as untyped JSON and the JavaScript rules read them with
// JavaScript coercions. Dynamic values here are the generic JSON values produced by
// encoding/json (map[string]any, []any, string, float64, bool, nil for null) plus
// Undefined for a missing member.

import (
	"math"
	"strings"
)

type undefinedType struct{}

// Undefined is JavaScript's undefined: a member that is not present.
var Undefined any = undefinedType{}

func isUndefined(v any) bool { _, ok := v.(undefinedType); return ok }

// nullish reports v === null || v === undefined.
func nullish(v any) bool { return v == nil || isUndefined(v) }

// Error is an error thrown by the workflow rules. Its message is shown to users.
type Error struct{ Message string }

func (e *Error) Error() string { return e.Message }

// throw aborts the current rule with message, like JavaScript's throw Error(message).
func throw(message string) { panic(&Error{message}) }

func need(ok bool, message string) {
	if !ok {
		throw(message)
	}
}

func nullName(v any) string {
	if v == nil {
		return "null"
	}
	return "undefined"
}

// get is the property access v.key, with V8's TypeError for null and undefined.
func get(v any, key string) any {
	switch o := v.(type) {
	case map[string]any:
		if x, ok := o[key]; ok {
			return x
		}
	case nil, undefinedType:
		throw("Cannot read properties of " + nullName(v) + " (reading '" + key + "')")
	}
	return Undefined
}

// opt is the optional property access v?.key.
func opt(v any, key string) any {
	if nullish(v) {
		return Undefined
	}
	return get(v, key)
}

// or is a || b for dynamic values.
func or(a, b any) any {
	if truthy(a) {
		return a
	}
	return b
}

// coalesce is a ?? b.
func coalesce(a, b any) any {
	if nullish(a) {
		return b
	}
	return a
}

func truthy(v any) bool {
	switch x := v.(type) {
	case nil, undefinedType:
		return false
	case bool:
		return x
	case float64:
		return x != 0 && !math.IsNaN(x)
	case string:
		return x != ""
	}
	return true
}

// toNumber is Number(v).
func toNumber(v any) float64 {
	switch x := v.(type) {
	case nil:
		return 0
	case undefinedType:
		return math.NaN()
	case bool:
		if x {
			return 1
		}
		return 0
	case float64:
		return x
	case string:
		return stringToNumber(x)
	case []any:
		return stringToNumber(toString(x))
	}
	return math.NaN()
}

// toString is String(v).
func toString(v any) string {
	switch x := v.(type) {
	case nil:
		return "null"
	case undefinedType:
		return "undefined"
	case bool:
		if x {
			return "true"
		}
		return "false"
	case float64:
		return numberToString(x)
	case string:
		return x
	case []any:
		parts := make([]string, len(x))
		for i, e := range x {
			if !nullish(e) {
				parts[i] = toString(e)
			}
		}
		return strings.Join(parts, ",")
	}
	return "[object Object]"
}

// text is the rules' text(): String(v ?? "").trim().
func text(v any) string {
	if nullish(v) {
		return ""
	}
	return jsTrim(toString(v))
}

// norm is the rules' norm(): text(v).toUpperCase().replace(/\s+/g, " ").
func norm(v any) string { return collapseSpace(upper(text(v))) }

// strictEqual is a === b. Objects and arrays are compared by identity in JavaScript;
// two decoded JSON objects are always distinct, so they never compare equal here.
func strictEqual(a, b any) bool {
	switch x := a.(type) {
	case undefinedType:
		return isUndefined(b)
	case nil:
		return b == nil
	case string:
		y, ok := b.(string)
		return ok && x == y
	case float64:
		y, ok := b.(float64)
		return ok && x == y
	case bool:
		y, ok := b.(bool)
		return ok && x == y
	}
	return false
}

// sameValueZeroKey returns a key that identifies v for Set and Array.prototype.includes
// (SameValueZero), and false when v is an object, which is only ever equal to itself.
func sameValueZeroKey(v any) (string, bool) {
	switch x := v.(type) {
	case undefinedType:
		return "u", true
	case nil:
		return "n", true
	case bool:
		return "b" + toString(x), true
	case float64:
		if x == 0 {
			x = 0
		}
		return "f" + numberToString(x), true
	case string:
		return "s" + x, true
	}
	return "", false
}

func isArray(v any) bool { _, ok := v.([]any); return ok }

// dynString returns the dynamic form of an optional string field.
func dynString(p *string) any {
	if p == nil {
		return Undefined
	}
	return *p
}

// dynNumber returns the dynamic form of an optional number field.
func dynNumber(p *float64) any {
	if p == nil {
		return Undefined
	}
	return *p
}

// cloneDyn is structuredClone for dynamic values.
func cloneDyn(v any) any {
	switch x := v.(type) {
	case map[string]any:
		m := make(map[string]any, len(x))
		for k, e := range x {
			m[k] = cloneDyn(e)
		}
		return m
	case []any:
		a := make([]any, len(x))
		for i, e := range x {
			a[i] = cloneDyn(e)
		}
		return a
	}
	return v
}

// keysOf is Object.keys(v); it throws for null and undefined like JavaScript.
func keysOf(v any) []string {
	switch x := v.(type) {
	case nil, undefinedType:
		throw("Cannot convert undefined or null to object")
	case map[string]any:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		return keys
	case []any:
		return indexKeys(len(x))
	case string:
		return indexKeys(utf16Len(x))
	}
	return nil
}

func indexKeys(n int) []string {
	keys := make([]string, n)
	for i := range keys {
		keys[i] = numberToString(float64(i))
	}
	return keys
}
