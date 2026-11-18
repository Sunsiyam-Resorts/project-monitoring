import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
const source = await readFile(new URL('../public/theme.js', import.meta.url), 'utf8');
function themeWindow(saved, dark = false) {
  const w = new Window({ url: 'http://localhost:3000', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  const media = new w.EventTarget(); media.matches = dark;
  w.matchMedia = () => media;
  w.document.head.innerHTML = '<meta name="theme-color" content="#eef1ec">';
  if (saved !== undefined) w.localStorage.setItem('ss-project-monitoring-appearance', saved);
  w.eval(source);
  return { w, media };
}
// The app changes the preference through window.portalAppearance (its controls are React components).
const choose = (w, value) => w.portalAppearance.set(value);
test('System appearance follows OS changes; explicit preference overrides them and survives reload', () => {
  const { w, media } = themeWindow(undefined, true);
  try {
    assert.equal(w.document.documentElement.dataset.theme, 'dark');
    assert.equal(w.document.querySelector('meta').content, '#0b0b0b');
    choose(w, 'light');
    media.matches = true; media.dispatchEvent(new w.Event('change'));
    assert.equal(w.document.documentElement.dataset.theme, 'light');
    const reload = themeWindow(w.localStorage.getItem('ss-project-monitoring-appearance'), true);
    assert.equal(reload.w.document.documentElement.dataset.theme, 'light'); reload.w.close();
    choose(w, 'system');
    assert.equal(w.document.documentElement.dataset.theme, 'dark');
    media.matches = false; media.dispatchEvent(new w.Event('change'));
    assert.equal(w.document.documentElement.dataset.theme, 'light');
    w.dispatchEvent(new w.StorageEvent('storage', { key: 'ss-project-monitoring-appearance', newValue: 'dark' }));
    assert.equal(w.document.documentElement.dataset.theme, 'dark');
    assert.equal(w.document.documentElement.dataset.themePreference, 'dark');
  } finally { w.close(); }
});
test('Invalid preferences default to system and unavailable storage does not break switching', () => {
  const { w } = themeWindow('unexpected', true);
  try {
    assert.equal(w.document.documentElement.dataset.themePreference, 'system');
    Object.defineProperty(w, 'localStorage', { get() { throw Error('Storage disabled'); } });
    choose(w, 'light');
    assert.equal(w.document.documentElement.dataset.theme, 'light');
    w.eval(source);
    assert.equal(w.document.documentElement.dataset.theme, 'dark');
  } finally { w.close(); }
});
test('Dark theme foreground and status token pairs maintain AA text contrast', async () => {
  const css = await readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8');
  const block = (selector) => Object.fromEntries([...css.slice(css.indexOf(selector + ' {')).split('}')[0].matchAll(/--([a-z0-9-]+):\s*(#[a-fA-F0-9]{6})\b/g)].map((m) => [m[1], m[2]]));
  const tokens = { ...block(':root'), ...block('[data-theme="dark"]') };
  const luminance = hex => hex.slice(1).match(/../g).map(v => parseInt(v,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4).reduce((a,v,i) => a+v*[.2126,.7152,.0722][i],0);
  const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  for (const [foreground, background] of [['foreground','background'],['foreground','card'],['muted-foreground','card'],['muted-foreground','muted'],['link','soft'],['success','success-soft'],['info','info-soft'],['warning','warning-soft'],['danger','danger-soft']])
    assert.ok(contrast(tokens[foreground],tokens[background])>=4.5, `${foreground} on ${background}`);
  assert.ok(contrast(tokens['primary-foreground'],tokens.primary)>=4.5, 'Primary action text');
  assert.ok(contrast(tokens.ring,tokens.card)>=3, 'Keyboard focus ring');
});
