// npm run traces: runs the Vitest suite with the recorder on and writes
// ../backend/internal/domain/testdata/traces.json.gz for the Go parity test.
// Run it after changing src/domain/*.js, then make the same change in backend/internal/domain.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { combine } from './combine.mjs';

const dir = mkdtempSync(join(tmpdir(), 'portal-traces-'));
// Vitest's module cache does not know about TRACE_DIR; clear it so the recorder is compiled in (and out again).
const cache = new URL('../../node_modules/.vitest-cache', import.meta.url);
rmSync(cache, { recursive: true, force: true });
try {
  const run = spawnSync('npx', ['vitest', 'run'], { stdio: 'inherit', shell: true, env: { ...process.env, TRACE_DIR: dir } });
  if (run.status !== 0) throw Error('Tests failed; traces not written');
  const out = new URL('../../../backend/internal/domain/testdata/', import.meta.url);
  mkdirSync(out, { recursive: true });
  const data = combine(dir);
  writeFileSync(new URL('traces.json.gz', out), gzipSync(JSON.stringify(data), { level: 9 }));
  console.log(`Wrote ${data.calls.length} calls and ${Object.keys(data.states).length} states.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(cache, { recursive: true, force: true });
}
