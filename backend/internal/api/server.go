package api

import (
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Sunsiyam-Resorts/project-monitoring/backend/internal/domain"
)

// MaxBody is the largest accepted request body (bytes).
const MaxBody = 3500000

var securityHeaders = [][2]string{
	{"X-Content-Type-Options", "nosniff"},
	{"X-Frame-Options", "DENY"},
	{"Referrer-Policy", "same-origin"},
	{"Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"},
}

var contentTypes = map[string]string{
	".html":  "text/html; charset=utf-8",
	".js":    "text/javascript",
	".css":   "text/css",
	".svg":   "image/svg+xml",
	".png":   "image/png",
	".woff2": "font/woff2",
	".txt":   "text/plain; charset=utf-8",
	".md":    "text/plain; charset=utf-8",
	".json":  "application/json",
	".ico":   "image/x-icon",
}

// Server serves the API at /api/index and the built browser app from PublicDir.
type Server struct {
	api  *handler
	root string
}

// NewServer returns the portal's HTTP handler. publicDir is the built React app
// (frontend/dist); cfg.Mail, cfg.Now and cfg.Log get defaults when nil.
func NewServer(cfg Config, publicDir string) (*Server, error) {
	root, err := filepath.Abs(publicDir)
	if err != nil {
		return nil, err
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	if cfg.Log == nil {
		cfg.Log = log.Default()
	}
	if cfg.Mail == nil {
		cfg.Mail = ResendMailer(&http.Client{Timeout: 30 * time.Second})
	}
	if cfg.Getenv == nil {
		cfg.Getenv = os.Getenv
	}
	return &Server{api: &handler{cfg}, root: root}, nil
}

// plain writes a body without a Content-Type, as Node.js does for res.end(text).
func plain(w http.ResponseWriter, status int, body string) {
	w.Header()["Content-Type"] = nil
	w.WriteHeader(status)
	io.WriteString(w, body)
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	for _, h := range securityHeaders {
		w.Header().Set(h[0], h[1])
	}
	path := pathname(r)
	if path == "/api/index" {
		var body any = domain.Undefined
		if r.Method == http.MethodPost {
			data, err := io.ReadAll(io.LimitReader(r.Body, MaxBody+1))
			if err != nil { // the client went away mid-upload
				plain(w, http.StatusNotFound, "Not found")
				return
			}
			if len(data) > MaxBody {
				plain(w, http.StatusRequestEntityTooLarge, "Upload too large")
				return
			}
			if len(data) == 0 {
				data = []byte("{}")
			}
			body, err = domain.ParseJSON(data)
			if err != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusBadRequest)
				io.WriteString(w, `{"error":"Invalid request body"}`)
				return
			}
		}
		s.api.serveAPI(w, r, body)
		return
	}
	s.static(w, path)
}

func (s *Server) static(w http.ResponseWriter, path string) {
	if path == "/" {
		path = "/index.html"
	}
	decoded, err := decodeURIComponent(path)
	if err != nil {
		plain(w, http.StatusNotFound, "Not found")
		return
	}
	sep := string(filepath.Separator)
	file := filepath.Join(s.root, "."+filepath.FromSlash(decoded))
	if !strings.HasPrefix(file, s.root+sep) {
		plain(w, http.StatusForbidden, "")
		return
	}
	data, err := os.ReadFile(file)
	if err != nil {
		plain(w, http.StatusNotFound, "Not found")
		return
	}
	contentType, ok := contentTypes[filepath.Ext(file)]
	if !ok {
		contentType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", contentType)
	switch {
	case strings.HasPrefix(file, filepath.Join(s.root, "fonts")+sep):
		w.Header().Set("Cache-Control", "public, max-age=604800")
	case strings.HasPrefix(file, filepath.Join(s.root, "assets")+sep):
		// Vite's hashed build output never changes under the same name.
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	default:
		// Pages and scripts are revalidated so an update is seen on the next reload.
		w.Header().Set("Cache-Control", "no-cache")
	}
	w.Write(data)
}
