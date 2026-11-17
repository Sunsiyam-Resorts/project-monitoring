package main

import (
	"errors"
	"io/fs"
	"os"
	"strings"
)

// loadEnvFile reads .env from the working directory, or else ../.env, for local
// development, like node --env-file-if-exists=.env. Variables already set in the
// environment win. It returns the file used ("" when there is none); values are never
// logged.
func loadEnvFile() (string, error) {
	for _, name := range []string{".env", "../.env"} {
		data, err := os.ReadFile(name)
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		if err != nil {
			return "", err
		}
		for _, kv := range parseEnv(string(data)) {
			if _, set := os.LookupEnv(kv[0]); !set {
				os.Setenv(kv[0], kv[1])
			}
		}
		return name, nil
	}
	return "", nil
}

func trimSpaces(s string) string { return strings.Trim(s, " \t") }

// parseEnv parses KEY=VALUE lines as Node.js does: # comments, an optional "export "
// prefix, values in single, double or back quotes (double quotes expand \n and may span
// lines), and unquoted values ending at a #.
func parseEnv(content string) [][2]string {
	var out [][2]string
	content = strings.TrimSpace(strings.ReplaceAll(content, "\r", ""))
	for content != "" {
		if content[0] == '\n' || content[0] == '#' {
			if i := strings.IndexByte(content, '\n'); i >= 0 {
				content = content[i+1:]
				continue
			}
			break
		}
		eq := strings.IndexByte(content, '=')
		if eq < 0 {
			break
		}
		key := trimSpaces(content[:eq])
		content = content[eq+1:]
		if nl := strings.IndexByte(key, '\n'); nl >= 0 { // a line without "=" before this one
			key = trimSpaces(key[nl+1:])
		}
		key = strings.TrimPrefix(key, "export ")
		rest := strings.TrimLeft(content, " \t")
		if key == "" {
			if i := strings.IndexByte(content, '\n'); i >= 0 {
				content = content[i+1:]
				continue
			}
			break
		}
		if rest == "" || rest[0] == '\n' {
			out = append(out, [2]string{key, ""})
			content = rest
			continue
		}
		if q := rest[0]; q == '"' || q == '\'' || q == '`' {
			if end := strings.IndexByte(rest[1:], q); end >= 0 {
				value := rest[1 : end+1]
				if q == '"' {
					value = strings.ReplaceAll(value, `\n`, "\n")
				}
				out = append(out, [2]string{key, value})
				after := rest[end+2:]
				if i := strings.IndexByte(after, '\n'); i >= 0 {
					content = after[i+1:]
				} else {
					content = ""
				}
				continue
			}
		}
		line := rest
		if i := strings.IndexByte(rest, '\n'); i >= 0 {
			line, content = rest[:i], rest[i:]
		} else {
			content = ""
		}
		if q := line[0]; q != '"' && q != '\'' && q != '`' {
			if i := strings.IndexByte(line, '#'); i >= 0 {
				line = line[:i]
			}
		}
		out = append(out, [2]string{key, trimSpaces(line)})
	}
	return out
}
