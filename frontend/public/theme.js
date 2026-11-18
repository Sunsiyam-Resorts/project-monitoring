// Runs before styles load to avoid a light flash. No account or workspace data.
(() => {
  const key = 'ss-project-monitoring-appearance';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const valid = value => ['system', 'light', 'dark'].includes(value);
  let preference = 'system';
  try {
    const saved = localStorage.getItem(key);
    if (valid(saved)) preference = saved;
  } catch { /* Appearance still works when browser storage is unavailable. */ }
  function applyTheme() {
    const resolved = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = preference;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0b0b0b' : '#eef1ec');
  }
  applyTheme();
  // The app sets the preference through this API (its theme button, the login Select and the
  // account menu); React re-renders those controls when <html> changes.
  window.portalAppearance = {
    get: () => preference,
    set(value) {
      if (!valid(value)) return;
      preference = value;
      try { localStorage.setItem(key, preference); } catch {}
      applyTheme();
    },
  };
  system.addEventListener('change', () => { if (preference === 'system') applyTheme(); });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    preference = valid(event.newValue) ? event.newValue : 'system';
    applyTheme();
  });
})();
