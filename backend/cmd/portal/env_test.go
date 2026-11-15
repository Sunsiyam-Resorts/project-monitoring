package main

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestParseEnv(t *testing.T) {
	content := "# Fictional values only\r\n" +
		"POSTGRES_PASSWORD=\n" +
		"PORTAL_PORT=3080\n" +
		"export HOST=0.0.0.0\n" +
		"ADMIN_PASSWORD='p@ss $word # kept'\n" +
		"MAIL_FROM=\"Project Portal <portal@example.test>\"\n" +
		"MULTI=\"line one\\nline two\"\n" +
		"SPACED =  value with spaces   # comment\n" +
		"BACKTICK=`quoted`\n" +
		"\n" +
		"UNCLOSED=\"open\n" +
		"LAST=end"
	want := [][2]string{
		{"POSTGRES_PASSWORD", ""},
		{"PORTAL_PORT", "3080"},
		{"HOST", "0.0.0.0"},
		{"ADMIN_PASSWORD", "p@ss $word # kept"},
		{"MAIL_FROM", "Project Portal <portal@example.test>"},
		{"MULTI", "line one\nline two"},
		{"SPACED", "value with spaces"},
		{"BACKTICK", "quoted"},
		{"UNCLOSED", "\"open"},
		{"LAST", "end"},
	}
	if got := parseEnv(content); !reflect.DeepEqual(got, want) {
		t.Fatalf("parseEnv:\n got %q\nwant %q", got, want)
	}
}

func TestLoadEnvFileKeepsExistingVariables(t *testing.T) {
	dir := t.TempDir()
	child := filepath.Join(dir, "backend")
	os.Mkdir(child, 0o755)
	os.WriteFile(filepath.Join(dir, ".env"), []byte("PORTAL_TEST_A=from-file\nPORTAL_TEST_B=from-file\n"), 0o600)
	wd, _ := os.Getwd()
	defer os.Chdir(wd)
	os.Chdir(child)
	t.Setenv("PORTAL_TEST_A", "from-environment")
	os.Unsetenv("PORTAL_TEST_B")
	defer os.Unsetenv("PORTAL_TEST_B")
	name, err := loadEnvFile()
	if err != nil || name != "../.env" {
		t.Fatalf("loadEnvFile = %q, %v", name, err)
	}
	if os.Getenv("PORTAL_TEST_A") != "from-environment" || os.Getenv("PORTAL_TEST_B") != "from-file" {
		t.Fatalf("A=%q B=%q", os.Getenv("PORTAL_TEST_A"), os.Getenv("PORTAL_TEST_B"))
	}
}
