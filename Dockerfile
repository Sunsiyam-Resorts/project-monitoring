# Sun Siyam Project Monitoring portal: one image with the Go backend (backend/), which serves the
# API and the built React frontend (frontend/). Run with PostgreSQL through compose.yaml; see docs/DEPLOYMENT.md.

# 1. Build the React frontend into static files.
FROM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# 2. Build the Go backend as a static binary.
FROM golang:1.25-alpine AS backend
# Build with the image's Go 1.25 (no toolchain download) into a static binary.
ENV GOTOOLCHAIN=local CGO_ENABLED=0
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN go build -trimpath -buildvcs=false -ldflags="-s -w" -o /out/portal ./cmd/portal

# 3. Minimal runtime: the binary, the static files, CA certificates (for the email service) and nothing else.
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=backend /out/portal /app/portal
COPY --from=frontend /src/frontend/dist /app/public
ENV HOST=0.0.0.0 PORT=3000 PUBLIC_DIR=/app/public
EXPOSE 3000
# Application files stay owned by root; the server runs as the unprivileged nonroot user.
USER nonroot:nonroot

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["/app/portal", "healthcheck"]

ENTRYPOINT ["/app/portal"]
