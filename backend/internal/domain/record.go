package domain

// Stored records are typed Go structs. Each record struct has an Extra field that keeps
// every member this package does not model, and any modelled member whose stored JSON
// type differs from the modelled one, so decoding and re-encoding never loses or
// reshapes stored data. Modelled members are pointers, slices or maps: nil means the
// member is absent, exactly like a missing key in JavaScript.

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"reflect"
	"sort"
	"strconv"
	"sync"
	"unicode/utf8"
)

// Extra holds the unmodelled members of a record as generic JSON values.
type Extra map[string]any

type recordField struct {
	name  string
	index int
}

type recordInfo struct {
	fields []recordField
	byName map[string]int // JSON name → struct field index
	extra  int
}

var recordInfos sync.Map // reflect.Type → *recordInfo

var extraType = reflect.TypeOf(Extra(nil))

func isRecordType(t reflect.Type) bool {
	if t.Kind() != reflect.Struct {
		return false
	}
	f, ok := t.FieldByName("Extra")
	return ok && f.Type == extraType
}

func infoOf(t reflect.Type) *recordInfo {
	if v, ok := recordInfos.Load(t); ok {
		return v.(*recordInfo)
	}
	info := &recordInfo{byName: map[string]int{}, extra: -1}
	for i := 0; i < t.NumField(); i++ {
		f := t.Field(i)
		if f.Type == extraType {
			info.extra = i
			continue
		}
		name := f.Tag.Get("json")
		if name == "" || name == "-" {
			panic("domain: record field without JSON name: " + t.Name() + "." + f.Name)
		}
		info.fields = append(info.fields, recordField{name, i})
		info.byName[name] = i
	}
	recordInfos.Store(t, info)
	return info
}

// ---- decoding: generic JSON value → typed ----

// fill stores the generic JSON value v in dst. It reports false, leaving dst unchanged,
// when v does not have the JSON type that dst models.
func fill(dst reflect.Value, v any) bool {
	t := dst.Type()
	switch t.Kind() {
	case reflect.Pointer:
		et := t.Elem()
		p := reflect.New(et)
		if isRecordType(et) {
			m, ok := v.(map[string]any)
			if !ok {
				return false
			}
			fillRecord(p.Elem(), m)
		} else if !fill(p.Elem(), v) {
			return false
		}
		dst.Set(p)
	case reflect.Slice:
		arr, ok := v.([]any)
		if !ok {
			return false
		}
		s := reflect.MakeSlice(t, len(arr), len(arr))
		for i, x := range arr {
			if (x == nil || isUndefined(x)) && t.Elem().Kind() == reflect.Pointer {
				continue // null (or undefined, which JSON.stringify writes as null)
			}
			if !fill(s.Index(i), x) {
				return false
			}
		}
		dst.Set(s)
	case reflect.Map:
		m, ok := v.(map[string]any)
		if !ok {
			return false
		}
		out := reflect.MakeMapWithSize(t, len(m))
		for k, x := range m {
			ev := reflect.New(t.Elem()).Elem()
			if !(x == nil && t.Elem().Kind() == reflect.Pointer) && !fill(ev, x) {
				return false
			}
			out.SetMapIndex(reflect.ValueOf(k), ev)
		}
		dst.Set(out)
	case reflect.String:
		s, ok := v.(string)
		if !ok {
			return false
		}
		dst.SetString(s)
	case reflect.Float64:
		f, ok := v.(float64)
		if !ok {
			return false
		}
		dst.SetFloat(f)
	case reflect.Bool:
		b, ok := v.(bool)
		if !ok {
			return false
		}
		dst.SetBool(b)
	default:
		panic("domain: unsupported field type " + t.String())
	}
	return true
}

func fillRecord(rv reflect.Value, m map[string]any) {
	info := infoOf(rv.Type())
	var extra Extra
	for k, x := range m {
		if isUndefined(x) {
			continue // JSON.stringify leaves undefined members out
		}
		if i, ok := info.byName[k]; ok && x != nil && fill(rv.Field(i), x) {
			continue
		}
		if extra == nil {
			extra = Extra{}
		}
		extra[k] = x
	}
	rv.Field(info.extra).Set(reflect.ValueOf(extra))
}

// decodeRecord converts a generic JSON object into a new record of type T.
func decodeRecord[T any](m map[string]any) *T {
	p := new(T)
	fillRecord(reflect.ValueOf(p).Elem(), m)
	return p
}

// fromDyn converts a dynamic value from a command into a record of type T. Values that
// are not objects give nil.
func fromDyn[T any](v any) *T {
	m, ok := v.(map[string]any)
	if !ok {
		return nil
	}
	return decodeRecord[T](cloneDyn(m).(map[string]any))
}

// ParseJSON parses JSON text like JSON.parse: numbers become float64, and numbers
// beyond the float64 range become ±Infinity instead of failing.
func ParseJSON(data []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, err
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, errors.New("unexpected data after JSON value")
	}
	return numbers(v), nil
}

func numbers(v any) any {
	switch x := v.(type) {
	case json.Number:
		f, _ := strconv.ParseFloat(string(x), 64) // ±Inf on overflow, like JSON.parse
		return f
	case map[string]any:
		for k, e := range x {
			x[k] = numbers(e)
		}
	case []any:
		for i, e := range x {
			x[i] = numbers(e)
		}
	}
	return v
}

func unmarshalRecord(data []byte, dst any) error {
	v, err := ParseJSON(data)
	if err != nil {
		return err
	}
	m, ok := v.(map[string]any)
	if !ok {
		return fmt.Errorf("domain: %s is not a JSON object", reflect.TypeOf(dst).Elem().Name())
	}
	fillRecord(reflect.ValueOf(dst).Elem(), m)
	return nil
}

// ---- encoding: typed → JSON text, formatted like JSON.stringify ----

func unset(v reflect.Value) bool {
	switch v.Kind() {
	case reflect.Pointer, reflect.Slice, reflect.Map, reflect.Interface:
		return v.IsNil()
	}
	return false
}

type encoder struct{ buf []byte }

func (e *encoder) value(v reflect.Value) {
	switch v.Kind() {
	case reflect.Pointer, reflect.Interface:
		if v.IsNil() {
			e.buf = append(e.buf, "null"...)
			return
		}
		if v.Kind() == reflect.Interface {
			e.dyn(v.Interface())
			return
		}
		e.value(v.Elem())
	case reflect.Struct:
		e.record(v)
	case reflect.Slice:
		if v.IsNil() {
			e.buf = append(e.buf, "null"...)
			return
		}
		e.buf = append(e.buf, '[')
		for i := 0; i < v.Len(); i++ {
			if i > 0 {
				e.buf = append(e.buf, ',')
			}
			e.value(v.Index(i))
		}
		e.buf = append(e.buf, ']')
	case reflect.Map:
		if v.IsNil() {
			e.buf = append(e.buf, "null"...)
			return
		}
		keys := make([]string, 0, v.Len())
		for _, k := range v.MapKeys() {
			keys = append(keys, k.String())
		}
		sort.Strings(keys)
		e.buf = append(e.buf, '{')
		for i, k := range keys {
			if i > 0 {
				e.buf = append(e.buf, ',')
			}
			e.str(k)
			e.buf = append(e.buf, ':')
			e.value(v.MapIndex(reflect.ValueOf(k)))
		}
		e.buf = append(e.buf, '}')
	case reflect.String:
		e.str(v.String())
	case reflect.Float64:
		e.num(v.Float())
	case reflect.Bool:
		e.buf = strconv.AppendBool(e.buf, v.Bool())
	default:
		panic("domain: cannot encode " + v.Type().String())
	}
}

func (e *encoder) record(rv reflect.Value) {
	info := infoOf(rv.Type())
	e.buf = append(e.buf, '{')
	first := true
	for _, f := range info.fields {
		fv := rv.Field(f.index)
		if unset(fv) {
			continue
		}
		if !first {
			e.buf = append(e.buf, ',')
		}
		first = false
		e.str(f.name)
		e.buf = append(e.buf, ':')
		e.value(fv)
	}
	extra := rv.Field(info.extra).Interface().(Extra)
	for _, k := range sortedKeys(extra) {
		if i, ok := info.byName[k]; ok && !unset(rv.Field(i)) {
			continue // the modelled value replaces the stored one
		}
		if !first {
			e.buf = append(e.buf, ',')
		}
		first = false
		e.str(k)
		e.buf = append(e.buf, ':')
		e.dyn(extra[k])
	}
	e.buf = append(e.buf, '}')
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func (e *encoder) dyn(v any) {
	switch x := v.(type) {
	case nil, undefinedType:
		e.buf = append(e.buf, "null"...)
	case bool:
		e.buf = strconv.AppendBool(e.buf, x)
	case float64:
		e.num(x)
	case string:
		e.str(x)
	case []any:
		e.buf = append(e.buf, '[')
		for i, el := range x {
			if i > 0 {
				e.buf = append(e.buf, ',')
			}
			e.dyn(el)
		}
		e.buf = append(e.buf, ']')
	case map[string]any:
		e.buf = append(e.buf, '{')
		first := true
		for _, k := range sortedKeys(x) {
			if isUndefined(x[k]) {
				continue
			}
			if !first {
				e.buf = append(e.buf, ',')
			}
			first = false
			e.str(k)
			e.buf = append(e.buf, ':')
			e.dyn(x[k])
		}
		e.buf = append(e.buf, '}')
	default:
		e.value(reflect.ValueOf(v))
	}
}

func (e *encoder) num(f float64) {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		e.buf = append(e.buf, "null"...) // JSON.stringify(NaN)
		return
	}
	e.buf = append(e.buf, numberToString(f)...)
}

const hexDigits = "0123456789abcdef"

// str writes s as a JSON string, escaping exactly what JSON.stringify escapes.
func (e *encoder) str(s string) {
	e.buf = append(e.buf, '"')
	start := 0
	for i := 0; i < len(s); {
		c := s[i]
		if c >= utf8.RuneSelf {
			r, size := utf8.DecodeRuneInString(s[i:])
			if r == utf8.RuneError && size == 1 {
				e.buf = append(e.buf, s[start:i]...)
				e.buf = append(e.buf, "�"...)
				i++
				start = i
				continue
			}
			i += size
			continue
		}
		if c >= 0x20 && c != '"' && c != '\\' {
			i++
			continue
		}
		e.buf = append(e.buf, s[start:i]...)
		switch c {
		case '"', '\\':
			e.buf = append(e.buf, '\\', c)
		case '\b':
			e.buf = append(e.buf, '\\', 'b')
		case '\f':
			e.buf = append(e.buf, '\\', 'f')
		case '\n':
			e.buf = append(e.buf, '\\', 'n')
		case '\r':
			e.buf = append(e.buf, '\\', 'r')
		case '\t':
			e.buf = append(e.buf, '\\', 't')
		default:
			e.buf = append(e.buf, '\\', 'u', '0', '0', hexDigits[c>>4], hexDigits[c&0xF])
		}
		i++
		start = i
	}
	e.buf = append(e.buf, s[start:]...)
	e.buf = append(e.buf, '"')
}

// Marshal encodes a record, a slice or map of records, or a generic JSON value the way
// JSON.stringify would (members whose value is absent are left out).
func Marshal(v any) []byte {
	e := &encoder{}
	e.dyn(v)
	return e.buf
}

// ---- generic operations on records ----

// toDyn converts a typed value into its generic JSON form (Undefined when absent).
func toDyn(v reflect.Value) any {
	switch v.Kind() {
	case reflect.Pointer, reflect.Interface:
		if v.IsNil() {
			return Undefined
		}
		if v.Kind() == reflect.Interface {
			return cloneDyn(v.Interface())
		}
		return toDyn(v.Elem())
	case reflect.Struct:
		info := infoOf(v.Type())
		extra := v.Field(info.extra).Interface().(Extra)
		m := make(map[string]any, len(info.fields)+len(extra))
		for k, x := range extra {
			m[k] = cloneDyn(x)
		}
		for _, f := range info.fields {
			if fv := v.Field(f.index); !unset(fv) {
				m[f.name] = toDyn(fv)
			}
		}
		return m
	case reflect.Slice:
		if v.IsNil() {
			return Undefined
		}
		a := make([]any, v.Len())
		for i := range a {
			x := toDyn(v.Index(i))
			if isUndefined(x) {
				x = nil
			}
			a[i] = x
		}
		return a
	case reflect.Map:
		if v.IsNil() {
			return Undefined
		}
		m := make(map[string]any, v.Len())
		for _, k := range v.MapKeys() {
			x := toDyn(v.MapIndex(k))
			if isUndefined(x) {
				x = nil
			}
			m[k.String()] = x
		}
		return m
	case reflect.String:
		return v.String()
	case reflect.Float64:
		return v.Float()
	case reflect.Bool:
		return v.Bool()
	}
	panic("domain: cannot convert " + v.Type().String())
}

// dynOf returns the generic JSON form of a record (a map) or Undefined for nil.
func dynOf(rec any) any { return toDyn(reflect.ValueOf(rec)) }

func reflectValue(v any) reflect.Value { return reflect.ValueOf(v) }

// stripRecord removes the PDF contents from a record (see strip).
func stripRecord(rec any) { strip(reflect.ValueOf(rec)) }

// deepCopy is structuredClone for typed values. Strings are immutable and shared.
func deepCopy(v reflect.Value) reflect.Value {
	switch v.Kind() {
	case reflect.Pointer:
		if v.IsNil() {
			return v
		}
		p := reflect.New(v.Type().Elem())
		p.Elem().Set(deepCopy(v.Elem()))
		return p
	case reflect.Struct:
		out := reflect.New(v.Type()).Elem()
		for i := 0; i < v.NumField(); i++ {
			out.Field(i).Set(deepCopy(v.Field(i)))
		}
		return out
	case reflect.Slice:
		if v.IsNil() {
			return v
		}
		s := reflect.MakeSlice(v.Type(), v.Len(), v.Len())
		for i := 0; i < v.Len(); i++ {
			s.Index(i).Set(deepCopy(v.Index(i)))
		}
		return s
	case reflect.Map:
		if v.IsNil() {
			return v
		}
		m := reflect.MakeMapWithSize(v.Type(), v.Len())
		for _, k := range v.MapKeys() {
			x := v.MapIndex(k)
			if v.Type() == extraType {
				m.SetMapIndex(k, reflect.ValueOf(cloneDyn(x.Interface())))
				continue
			}
			m.SetMapIndex(k, deepCopy(x))
		}
		return m
	}
	return v
}

// clone is structuredClone for a record pointer.
func clone[T any](p *T) *T {
	if p == nil {
		return nil
	}
	return deepCopy(reflect.ValueOf(p)).Interface().(*T)
}

// shallow is {...p}: a new record with the same members (values shared).
func shallow[T any](p *T) *T {
	if p == nil {
		return new(T)
	}
	c := *p
	rv := reflect.ValueOf(&c).Elem()
	info := infoOf(rv.Type())
	if extra := rv.Field(info.extra).Interface().(Extra); extra != nil {
		cp := make(Extra, len(extra))
		for k, x := range extra {
			cp[k] = x
		}
		rv.Field(info.extra).Set(reflect.ValueOf(cp))
	}
	return &c
}

func recordValue(rec any) (reflect.Value, *recordInfo) {
	rv := reflect.ValueOf(rec).Elem()
	return rv, infoOf(rv.Type())
}

// field returns rec[key] as a dynamic value, whether modelled or kept in Extra.
func field(rec any, key string) any {
	if reflect.ValueOf(rec).IsNil() {
		throw("Cannot read properties of undefined (reading '" + key + "')")
	}
	rv, info := recordValue(rec)
	if i, ok := info.byName[key]; ok && !unset(rv.Field(i)) {
		return toDyn(rv.Field(i))
	}
	if x, ok := rv.Field(info.extra).Interface().(Extra)[key]; ok {
		return x
	}
	return Undefined
}

// setField is rec[key] = v for a dynamic value v: a value of the modelled type is stored
// in the typed field, any other value verbatim in Extra, and undefined removes the member.
func setField(rec any, key string, v any) {
	rv, info := recordValue(rec)
	extra := rv.Field(info.extra).Interface().(Extra)
	delete(extra, key)
	i, modelled := info.byName[key]
	if modelled {
		rv.Field(i).Set(reflect.Zero(rv.Field(i).Type()))
	}
	if isUndefined(v) {
		return
	}
	if modelled && v != nil && fill(rv.Field(i), cloneDyn(v)) {
		return
	}
	if extra == nil {
		extra = Extra{}
		rv.Field(info.extra).Set(reflect.ValueOf(extra))
	}
	extra[key] = cloneDyn(v)
}

// deleteField is delete rec[key].
func deleteField(rec any, key string) { setField(rec, key, Undefined) }

// assign is Object.assign(dst, src) for two records of the same type.
func assign(dst, src any) {
	dv, info := recordValue(dst)
	sv := reflect.ValueOf(src).Elem()
	for _, f := range info.fields {
		if fv := sv.Field(f.index); !unset(fv) {
			dv.Field(f.index).Set(fv)
			delete(dv.Field(info.extra).Interface().(Extra), f.name)
		}
	}
	for k, x := range sv.Field(info.extra).Interface().(Extra) {
		setField(dst, k, x)
	}
}

// pick returns a new record with only the given members of src ({a, b} = src; ({a, b})).
func pick[T any](src *T, keys ...string) *T {
	out := new(T)
	for _, k := range keys {
		if x := field(src, k); !isUndefined(x) {
			setField(out, k, x)
		}
	}
	return out
}

// strip removes every member named "data" whose value is a string, at any depth: the
// supporting PDF contents that general state responses leave out.
func strip(v reflect.Value) {
	switch v.Kind() {
	case reflect.Pointer:
		if !v.IsNil() {
			strip(v.Elem())
		}
	case reflect.Struct:
		info := infoOf(v.Type())
		for _, f := range info.fields {
			fv := v.Field(f.index)
			if f.name == "data" && fv.Type().Kind() == reflect.Pointer && fv.Type().Elem().Kind() == reflect.String {
				fv.Set(reflect.Zero(fv.Type()))
				continue
			}
			strip(fv)
		}
		extra := v.Field(info.extra).Interface().(Extra)
		for k, x := range extra {
			if _, ok := x.(string); ok && k == "data" {
				delete(extra, k)
				continue
			}
			stripDyn(x)
		}
	case reflect.Slice:
		for i := 0; i < v.Len(); i++ {
			strip(v.Index(i))
		}
	case reflect.Map:
		for _, k := range v.MapKeys() {
			strip(v.MapIndex(k))
		}
	}
}

func stripDyn(v any) {
	switch x := v.(type) {
	case map[string]any:
		for k, e := range x {
			if _, ok := e.(string); ok && k == "data" {
				delete(x, k)
				continue
			}
			stripDyn(e)
		}
	case []any:
		for _, e := range x {
			stripDyn(e)
		}
	}
}
