import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
const source = await readFile(new URL('../public/theme.js', import.meta.url), 'utf8');
function themeWindow(saved, dark = false) {
  const w = new Window({ url: 'http://localhost:3000', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  const media = new w.EventTarget(); media.matches = dark;
  w.matchMedia = () => media;
  w.document.head.innerHTML = '<meta name="theme-color" content="#f5f5f0">';
  w.document.body.innerHTML = '<select data-theme-picker><option>system</option><option>light</option><option>dark</option></select>';
  if (saved !== undefined) w.localStorage.setItem('ss-project-monitoring-appearance', saved);
  w.eval(source);
  return { w, media };
}
const choose = (w, value) => {
  const picker = w.document.querySelector('select'); picker.value = value;
  picker.dispatchEvent(new w.Event('change', { bubbles: true }));
};
test('System appearance follows OS changes; explicit preference overrides them and survives reload', () => {
  const { w, media } = themeWindow(undefined, true);
  try {
    assert.equal(w.document.documentElement.dataset.theme, 'dark');
    assert.equal(w.document.querySelector('meta').content, '#111814');
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
    assert.equal(w.document.querySelector('select').value, 'dark');
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
  const css = await readFile(new URL('../public/dark.css', import.meta.url), 'utf8');
  const color = name => css.match(new RegExp('--' + name + ': (#[a-fA-F0-9]{6});'))[1];
  const luminance = hex => hex.slice(1).match(/../g).map(v => parseInt(v,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4).reduce((a,v,i) => a+v*[.2126,.7152,.0722][i],0);
  const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  for (const [foreground, background] of [['ink','canvas'],['ink','surface'],['secondary','surface'],['muted','surface'],['muted','surface-soft'],['accent','accent-soft'],['success','success-soft'],['info','info-soft'],['warning','warning-soft'],['danger','danger-soft']])
    assert.ok(contrast(color(foreground),color(background))>=4.5, `${foreground} on ${background}`);
  assert.ok(contrast(color('accent'),'#152319')>=4.5, 'Primary action text');
  assert.ok(contrast(color('focus-ring'),color('surface'))>=3, 'Keyboard focus ring');
});
