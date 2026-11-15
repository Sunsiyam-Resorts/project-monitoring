# Sun Siyam Project Monitoring portal: static UI + Node.js API (scripts/serve.mjs).
# Built and run with compose.yaml, which adds PostgreSQL. See docs/DEPLOYMENT.md.
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY api ./api
COPY lib ./lib
COPY public ./public
COPY scripts ./scripts
# Copies the browser ExcelJS bundle into public/vendor at build time, so the running container writes nothing.
RUN node scripts/prepare-vendor.mjs

# Application files stay owned by root; the server runs as the unprivileged node user.
USER node
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO /dev/null "http://127.0.0.1:3000/api/index?action=config" || exit 1

CMD ["node", "scripts/serve.mjs"]
