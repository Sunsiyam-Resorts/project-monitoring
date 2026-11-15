import { readdirSync, readFileSync } from 'node:fs';
// Merges the per-worker files written by runtime.mjs: { version, states: {sha1: state}, calls: [...] }.
export function combine(dir) {
  const states = {}, calls = [];
  for (const f of readdirSync(dir).sort()) {
    for (const line of readFileSync(`${dir}/${f}`, 'utf8').split('\n')) {
      if (!line) continue;
      const x = JSON.parse(line);
      if (f.startsWith('states-')) states[x.h] = JSON.parse(x.json);
      else calls.push(x);
    }
  }
  return { version: 1, states, calls };
}
