// Records calls into the workflow rules while the Vitest suite runs, so the Go backend can replay them
// (backend/internal/domain/parity_test.go). Active only when TRACE_DIR is set; see record.mjs.
import { fileURLToPath } from 'node:url';

const slashes = (p) => p.split(String.fromCharCode(92)).join('/');
const RUNTIME = slashes(fileURLToPath(new URL('./runtime.mjs', import.meta.url)));
export const WRAPPED = ['apply', 'visibleState', 'supportingFile', 'migrateState'];

export function instrument(id, code) {
  const file = slashes(id.split('?')[0]);
  const imp = `\nimport * as __trace from ${JSON.stringify(RUNTIME)};\n`;
  if (file.endsWith('/src/domain/ids.js')) {
    if (!code.includes('export function randomId(')) throw Error('traces: randomId not found');
    return code.replace('export function randomId(', 'function __orig_randomId(') + imp +
      'export function randomId(...a) { const v = __orig_randomId(...a); __trace.id(v); return v; }\n';
  }
  if (file.endsWith('/src/domain/domain.js')) {
    for (const f of WRAPPED) {
      if (!code.includes(`export function ${f}(`)) throw Error(`traces: ${f} not found`);
      code = code.replace(`export function ${f}(`, `function __orig_${f}(`);
    }
    return code + imp + WRAPPED.map(f => `export function ${f}(...args) { return __trace.call(${JSON.stringify(f)}, __orig_${f}, args); }`).join('\n') + '\n';
  }
  return null;
}

export function tracePlugin() {
  return {
    name: 'portal-domain-traces',
    enforce: 'pre',
    transform(code, id) {
      if (!process.env.TRACE_DIR) return null;
      const out = instrument(id, code);
      return out && { code: out, map: null };
    },
  };
}
