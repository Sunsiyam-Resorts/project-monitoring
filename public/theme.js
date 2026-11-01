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
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#111814' : '#f5f5f0');
    document.querySelectorAll('[data-theme-picker]').forEach(picker => { picker.value = preference; });
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const label = resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
      button.setAttribute('aria-label', label);
      button.title = label;
    });
  }
  applyTheme();
  system.addEventListener('change', () => { if (preference === 'system') applyTheme(); });
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-theme-toggle]')) return;
    preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(key, preference); } catch {}
    applyTheme();
  });
  document.addEventListener('change', event => {
    if (!event.target.matches('[data-theme-picker]') || !valid(event.target.value)) return;
    preference = event.target.value;
    try { localStorage.setItem(key, preference); } catch {}
    applyTheme();
  });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    preference = valid(event.newValue) ? event.newValue : 'system';
    applyTheme();
  });
})();
