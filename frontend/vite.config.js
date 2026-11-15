import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tracePlugin } from './scripts/traces/plugin.mjs';

// `npm run dev` serves the UI on http://127.0.0.1:5173 and forwards /api to the Go backend
// (default http://127.0.0.1:3000; set PORTAL_API to change it).
export default defineConfig({
  plugins: [react(), tracePlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: process.env.PORTAL_API || 'http://127.0.0.1:3000', changeOrigin: false } },
  },
  // The stylesheets are shipped as written: the CSS minifier rejects valid customizable-select
  // selectors such as ::picker(select):popover-open, and dropping them would change the look.
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1200, cssMinify: false },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,jsx}'],
    testTimeout: 20000,
  },
});
