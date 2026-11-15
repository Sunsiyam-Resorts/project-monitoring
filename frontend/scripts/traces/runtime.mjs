// Trace recorder runtime (see plugin.mjs). Writes one JSON line per outermost call.
import { appendFileSync, mkdirSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { threadId } from 'node:worker_threads';

const dir = process.env.TRACE_DIR;
const tag = `${process.pid}-${threadId}-${randomBytes(3).toString('hex')}`;
if (dir) mkdirSync(dir, { recursive: true });
const seen = new Set();
let depth = 0, ids = null;

export function id(v) { if (depth > 0 && ids) ids.push(v); }
function put(json) {
  const h = createHash('sha1').update(json).digest('hex');
  if (!seen.has(h)) { seen.add(h); appendFileSync(`${dir}/states-${tag}.jsonl`, JSON.stringify({ h, json }) + '\n'); }
  return h;
}
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const NOW_ARG = { apply: 3, supportingFile: 3, migrateState: 1 };

export function call(fn, orig, args) {
  if (!dir || depth > 0) return orig(...args);
  const [s, u] = args;
  // Resolve a defaulted `now` here so the replay uses the same instant.
  const at = NOW_ARG[fn];
  if (at !== undefined && args[at] === undefined) { args = [...args]; args[at] = Date.now(); }
  const rec = { fn, state: put(JSON.stringify(s)) };
  if (fn !== 'migrateState') { rec.user = clone(u); rec.userInState = Array.isArray(s?.users) && s.users.includes(u); }
  if (fn === 'apply') rec.action = clone(args[2]);
  if (fn === 'supportingFile') rec.query = clone(args[2]);
  if (at !== undefined) rec.now = args[at];
  ids = [];
  const clock = [], dateNow = Date.now;
  Date.now = () => { const v = dateNow(); clock.push(v); return v; };
  depth++;
  try {
    const out = orig(...args);
    rec.ok = true;
    if (fn === 'apply' || fn === 'migrateState') {
      rec.after = put(JSON.stringify(s));
      rec.returnsState = out === s;
      if (out !== s) rec.returned = clone(out);
      if (fn === 'apply' && !rec.userInState) rec.userAfter = clone(u);
    } else rec.out = put(JSON.stringify(out));
    return out;
  } catch (e) {
    rec.ok = false;
    rec.error = e.message;
    throw e;
  } finally {
    depth--;
    Date.now = dateNow;
    rec.ids = ids; rec.clock = clock; ids = null;
    appendFileSync(`${dir}/calls-${tag}.jsonl`, JSON.stringify(rec) + '\n');
  }
}
