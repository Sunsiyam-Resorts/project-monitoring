// Presentation-only templates. Data access and commands remain in app/domain.
export function createUI({ esc, icon, getThemePreference = () => 'system', getResolvedTheme = () => 'light' }) {
  const themeToggle = () => {
    const label = getResolvedTheme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    return `<button type="button" class="icon-button theme-toggle" data-theme-toggle aria-label="${label}" title="${label}"><span class="theme-moon">${icon('moon')}</span><span class="theme-sun">${icon('sun')}</span></button>`;
  };
  const themePicker = (id) => `<div class="appearance-control"><label for="${id}">Appearance</label><select id="${id}" data-theme-picker>${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([value, label]) => `<option value="${value}" ${getThemePreference() === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>`;
  // Account controls live in the sidebar footer; the drawer copy gets its own picker id.
  const accountControls = (user, drawer) => `<div class="sidebar-account"><details class="profile-menu"><summary aria-label="User menu for ${esc(user.name)}"><span class="avatar" aria-hidden="true">${esc(user.name.slice(0, 1).toUpperCase())}</span><span class="profile-name"><strong>${esc(user.name)}</strong><small>${esc(user.role)}</small></span>${icon('chevron')}</summary><div class="profile-popover"><strong>${esc(user.name)}</strong><small>${esc(user.role)}${user.team ? ' · ' + esc(user.team) : ''}</small>${themePicker(drawer ? 'drawerAppearance' : 'accountAppearance')}<button data-action="logout">${icon('logout')}Sign out</button></div></details>${themeToggle()}</div>`;
  const propertySwitcher = (companies, selected, id = 'company') => `<div class="property-switcher"><label for="${id}">Company</label><select id="${id}"><button type="button" class="select-button"><selectedcontent></selectedcontent></button>${`<option value="">All accessible companies</option>`}${companies.map(c => `<option value="${esc(c.id)}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>`;
  const appSidebar = ({ brand, page, admin, pending, user, scope, actor = null, drawer = false }) => {
    const item = (key, label) => `<button data-page="${key}" class="${page === key ? 'active' : ''}" ${page === key ? 'aria-current="page"' : ''}>${icon(key)}<span>${label}</span>${key === 'requests' && pending ? `<span class="nav-count">${pending}<span class="sr-only"> awaiting your action</span></span>` : ''}</button>`;
    return `<aside class="sidebar ${drawer ? 'drawer-sidebar' : ''}"><div class="sidebar-brand">${brand}${drawer ? `<button data-action="closeNavigation" class="icon-button" aria-label="Close navigation">${icon('close')}</button>` : ''}</div>${scope ? `<div class="sidebar-scope">${scope}</div>` : ''}<nav class="nav" aria-label="${drawer ? 'Mobile' : 'Main'} navigation"><span class="nav-label">Workspace</span>${item('dashboard', 'Dashboard')}${item('requests', 'Requests')}${admin ? `<span class="nav-label nav-group">Administration</span>${item('master', 'Master Data')}${item('users', 'User Manager')}${item('settings', 'Settings')}` : ''}</nav><div class="sidebar-foot">${actor ? `<div class="sidebar-demo"><label for="${actor.id}">Demo user <span>· testing only, not secure login</span></label>${actor.html}</div>` : ''}${accountControls(user, drawer)}</div></aside>`;
  };
  // Pages carry their own titles, so the top bar exists only on phones to open the navigation drawer.
  const appHeader = () => `<header class="topbar"><button class="icon-button menu-toggle" data-action="openNavigation" aria-label="Open navigation" aria-controls="navigationDrawer" aria-expanded="false">${icon('menu')}</button></header>`;
  const appShell = ({ sidebar, drawer, header, banner, content, page = '' }) => `<a class="skip-link" href="#workspace">Skip to workspace</a><div class="shell">${sidebar}<main class="main" id="workspace" tabindex="-1" data-view="${esc(page)}">${header}<div class="content" aria-labelledby="pageTitle">${banner}${content}</div></main></div><dialog id="navigationDrawer" class="navigation-drawer" aria-label="Workspace navigation" aria-modal="true">${drawer}</dialog>`;
  const pageHeader = (eyebrow, title, description, actions = '') => `<div class="page-head"><div><div class="eyebrow">${esc(eyebrow)}</div><h1 id="pageTitle" tabindex="-1">${esc(title)}</h1><p class="sub">${esc(description)}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
  const statCard = (label, formatted, key, level = 2, chart = '') => chart
    ? `<article class="dashboard-kpi has-trend" style="--len:${String(formatted).length}" aria-labelledby="kpi-title-${key}" data-kpi="${key}"><div class="kpi-main"><h${level} id="kpi-title-${key}">${esc(label)}</h${level}><div class="dashboard-kpi-value"><span>USD</span>${esc(formatted)}</div></div>${chart}</article>`
    : `<article class="dashboard-kpi" aria-labelledby="kpi-title-${key}" data-kpi="${key}"><h${level} id="kpi-title-${key}">${esc(label)}</h${level}><div class="dashboard-kpi-value"><span>USD</span>${esc(formatted)}</div></article>`;
  // Minimal year-to-date trend, one mark per month: candles (hollow green = rose, solid red = fell, grey tick = unchanged)
  // or a single ink line. Each candle has a native tooltip; the svg has a summary name.
  const trendChart = (series, { kind = 'candle', label, fmt, periodLabel, caption, width = 120 }) => {
    if (!series?.length) return '';
    const W = width, H = 32, PAD = 3, slot = W / series.length;
    const lows = series.map(c => c.low), highs = series.map(c => c.high);
    const lo = Math.min(...lows), hi = Math.max(...highs), span = hi - lo;
    const y = v => span ? PAD + (hi - v) / span * (H - PAD * 2) : H / 2;
    const first = series[0].open, last = series.at(-1).close;
    const change = last - first;
    const summary = `${label}, ${caption}: USD ${fmt(first)} to USD ${fmt(last)}, ${change > 0 ? 'up' : change < 0 ? 'down' : 'unchanged'}`;
    let marks = '';
    if (kind === 'line') {
      const pts = [[0, y(first)], ...series.map((c, i) => [(i + 1) * slot, y(c.close)])];
      const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
      const [ex, ey] = pts.at(-1);
      marks = `<path class="trend-line" d="${d}"/><circle class="trend-end" cx="${(ex - 2.5).toFixed(1)}" cy="${ey.toFixed(1)}" r="2.5"/>` +
        series.map((c, i) => `<rect class="trend-hit" x="${(i * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}"><title>${esc(periodLabel(c.start))}: USD ${esc(fmt(c.close))}</title></rect>`).join('');
    } else {
      marks = series.map((c, i) => {
        const cx = i * slot + slot / 2, bw = Math.max(3, Math.min(6, slot - 4));
        const tip = `<title>${esc(periodLabel(c.start))}: USD ${esc(fmt(c.open))} → USD ${esc(fmt(c.close))}</title>`;
        if (c.close === c.open && c.high === c.low) return `<g class="candle flat">${tip}<rect x="${(cx - bw / 2).toFixed(1)}" y="${(y(c.close) - 0.75).toFixed(1)}" width="${bw}" height="1.5" rx="0.75"/><rect class="trend-hit" x="${(i * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}"/></g>`;
        const up = c.close >= c.open;
        const top = y(Math.max(c.open, c.close)), bottom = y(Math.min(c.open, c.close));
        const h = Math.max(2, bottom - top);
        return `<g class="candle ${up ? 'up' : 'down'}">${tip}<line x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${y(c.high).toFixed(1)}" y2="${y(c.low).toFixed(1)}"/><rect x="${(cx - bw / 2 + (up ? 0.6 : 0)).toFixed(1)}" y="${(top + (up ? 0.6 : 0)).toFixed(1)}" width="${(bw - (up ? 1.2 : 0)).toFixed(1)}" height="${Math.max(1, h - (up ? 1.2 : 0)).toFixed(1)}" rx="1"/><rect class="trend-hit" x="${(i * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}"/></g>`;
      }).join('');
    }
    return `<figure class="kpi-trend-figure" style="--chart-w:${W}px"><svg class="kpi-trend kpi-trend-${kind}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(summary)}"><title>${esc(summary)}</title>${marks}</svg></figure>`;
  };
  const field = (label, html, wide = false) => `<div class="field ${wide ? 'wide' : ''}"><label>${label}${/\brequired\b/.test(html) ? '<span class="required-mark" aria-hidden="true"> *</span>' : ''}</label>${html}</div>`;
  const badge = status => `<span class="badge ${status.replaceAll(' ', '')}">${esc(status === 'Finance' ? 'Pending Payment' : status)}</span>`;
  const empty = (title, note = '') => `<div class="empty"><div class="empty-icon">${icon('requests')}</div><h3>${esc(title)}</h3>${note ? `<p>${esc(note)}</p>` : ''}</div>`;
  const disclosure = (title, description, body, id) => `<details class="report-disclosure" data-disclosure="${id}"><summary><span><strong>${esc(title)}</strong><small>${esc(description)}</small></span>${icon('chevron')}</summary><div class="report-body">${body}</div></details>`;
  const loadingSkeleton = () => `<div class="loading-skeleton" role="status" aria-label="Loading workspace"><div class="skeleton-line"></div><div class="skeleton-line short"></div><div class="skeleton-grid">${'<div></div>'.repeat(3)}</div><span class="sr-only">Loading workspace…</span></div>`;
  return { themePicker, propertySwitcher, appSidebar, appHeader, appShell, pageHeader, statCard, trendChart, field, badge, empty, disclosure, loadingSkeleton };
}
