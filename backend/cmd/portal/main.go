// Command portal runs the Sun Siyam Project Monitoring portal: the JSON API and the
// built browser app (PUBLIC_DIR), backed by PostgreSQL (DATABASE_URL).
//
//	portal              serve on HOST:PORT (default 127.0.0.1:3000)
//	portal healthcheck  exit 0 when the local portal answers /api/index?action=config
package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Sunsiyam-Resorts/project-monitoring/backend/internal/api"
	"github.com/Sunsiyam-Resorts/project-monitoring/backend/internal/domain"
	"github.com/Sunsiyam-Resorts/project-monitoring/backend/internal/store"
)

func env(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck())
	}
	if len(os.Args) > 1 {
		log.Fatalf("unknown command %q (use no arguments to serve, or healthcheck)", os.Args[1])
	}
	if name, err := loadEnvFile(); err != nil {
		log.Fatalf("reading environment file: %v", err)
	} else if name != "" {
		log.Printf("Loaded environment from %s", name)
	}
	host, port := env("HOST", "127.0.0.1"), env("PORT", "3000")
	rules := domain.NewRules()
	st := store.New(os.Getenv("DATABASE_URL"), os.Getenv, rules)
	defer st.Close()
	handler, err := api.NewServer(api.Config{Store: st, Rules: rules}, env("PUBLIC_DIR", "../frontend/dist"))
	if err != nil {
		log.Fatal(err)
	}
	server := &http.Server{
		Addr:              net.JoinHostPort(host, port),
		Handler:           handler,
		ReadHeaderTimeout: 60 * time.Second,
		ReadTimeout:       5 * time.Minute,
		WriteTimeout:      5 * time.Minute,
		IdleTimeout:       2 * time.Minute,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		server.Shutdown(shutdown)
	}()
	log.Printf("Portal: http://%s:%s", host, port)
	if err := server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

// healthcheck is for the container image, which has no shell, wget or curl.
func healthcheck() int {
	client := &http.Client{Timeout: 4 * time.Second}
	res, err := client.Get("http://127.0.0.1:" + env("PORT", "3000") + "/api/index?action=config")
	if err != nil {
		return 1
	}
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}
