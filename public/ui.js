// Presentation-only templates. Data access and commands remain in app/domain.
export function createUI({ esc, icon, getThemePreference = () => 'system', getResolvedTheme = () => 'light' }) {
  const themeToggle = () => {
    const label = getResolvedTheme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    return `<button type="button" class="icon-button theme-toggle" data-theme-toggle aria-label="${label}" title="${label}"><span class="theme-moon">${icon('moon')}</span><span class="theme-sun">${icon('sun')}</span></button>`;
  };
  const themePicker = (id) => `<div class="appearance-control"><label for="${id}">Appearance</label><select id="${id}" data-theme-picker>${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([value, label]) => `<option value="${value}" ${getThemePreference() === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>`;
  // Account controls live in the sidebar footer; the drawer copy gets its own picker id.
  const accountControls = (user, drawer) => `<div class="sidebar-account"><details class="profile-menu"><summary aria-label="User menu for ${esc(user.name)}"><span class="avatar" aria-hidden="true">${esc(user.name.slice(0, 1).toUpperCase())}</span><span class="profile-name"><strong>${esc(user.name)}</strong><small>${esc(user.role)}</small></span>${icon('chevron')}</summary><div class="profile-popover"><strong>${esc(user.name)}</strong><small>${esc(user.role)}</small>${themePicker(drawer ? 'drawerAppearance' : 'accountAppearance')}<button data-action="logout">${icon('logout')}Sign out</button></div></details>${themeToggle()}</div>`;
  const propertySwitcher = (companies, selected, id = 'company') => `<div class="property-switcher"><label for="${id}">Company</label><select id="${id}"><button type="button" class="select-button"><selectedcontent></selectedcontent></button>${`<option value="">All accessible companies</option>`}${companies.map(c => `<option value="${esc(c.id)}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>`;
  const appSidebar = ({ brand, page, admin, manage = admin, pending, user, scope, actor = null, drawer = false }) => {
    const item = (key, label) => `<button data-page="${key}" class="${page === key ? 'active' : ''}" ${page === key ? 'aria-current="page"' : ''}>${icon(key)}<span>${label}</span>${key === 'requests' && pending ? `<span class="nav-count">${pending}<span class="sr-only"> awaiting your action</span></span>` : ''}</button>`;
    return `<aside class="sidebar ${drawer ? 'drawer-sidebar' : ''}"><div class="sidebar-brand">${brand}${drawer ? `<button data-action="closeNavigation" class="icon-button" aria-label="Close navigation">${icon('close')}</button>` : ''}</div>${scope ? `<div class="sidebar-scope">${scope}</div>` : ''}<nav class="nav" aria-label="${drawer ? 'Mobile' : 'Main'} navigation"><span class="nav-label">Workspace</span>${item('dashboard', 'Dashboard')}${item('projects', 'Projects')}${item('requests', 'Requests')}${manage ? `<span class="nav-label nav-group">Administration</span>${item('master', 'Master Data')}${admin ? item('users', 'User Manager') : ''}${item('audit', 'Audit Log')}${admin ? item('settings', 'Settings') : ''}` : ''}</nav><div class="sidebar-foot">${actor ? `<div class="sidebar-demo"><label for="${actor.id}">Demo user <span>· testing only, not secure login</span></label>${actor.html}</div>` : ''}${accountControls(user, drawer)}</div></aside>`;
  };
  // Pages carry their own titles, so the top bar exists only on phones to open the navigation drawer.
  const appHeader = () => `<header class="topbar"><button class="icon-button menu-toggle" data-action="openNavigation" aria-label="Open navigation" aria-controls="navigationDrawer" aria-expanded="false">${icon('menu')}</button></header>`;
  const appShell = ({ sidebar, drawer, header, banner, content, page = '' }) => `<a class="skip-link" href="#workspace">Skip to workspace</a><div class="shell">${sidebar}<main class="main" id="workspace" tabindex="-1" data-view="${esc(page)}">${header}<div class="content" aria-labelledby="pageTitle">${banner}${content}</div></main></div><dialog id="navigationDrawer" class="navigation-drawer" aria-label="Workspace navigation" aria-modal="true">${drawer}</dialog>`;
  const pageHeader = (eyebrow, title, description, actions = '') => `<div class="page-head"><div><div class="eyebrow">${esc(eyebrow)}</div><h1 id="pageTitle" tabindex="-1">${esc(title)}</h1><p class="sub">${esc(description)}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
  // Stat figures: the decimals (".00") render at half size; --len counts them at half width.
  const figure = (formatted) => {
    const [whole, dec] = String(formatted).split('.');
    return dec === undefined ? esc(whole) : `${esc(whole)}<span class="kpi-dec">.${esc(dec)}</span>`;
  };
  const figureLength = (formatted) => {
    const [whole, dec] = String(formatted).split('.');
    return whole.length + (dec === undefined ? 0 : (dec.length + 1) * 0.5);
  };
  const statCard = (label, formatted, key, level = 2, chart = '') => chart
    ? `<article class="dashboard-kpi has-trend" style="--len:${figureLength(formatted)}" aria-labelledby="kpi-title-${key}" data-kpi="${key}"><div class="kpi-main"><h${level} id="kpi-title-${key}">${esc(label)}</h${level}><div class="dashboard-kpi-value">${figure(formatted)}</div></div>${chart}</article>`
    : `<article class="dashboard-kpi" aria-labelledby="kpi-title-${key}" data-kpi="${key}"><h${level} id="kpi-title-${key}">${esc(label)}</h${level}><div class="dashboard-kpi-value">${figure(formatted)}</div></article>`;
  // Minimal year-to-date trend, one mark per month: candles (hollow green = rose, solid red = fell, nothing = unchanged)
  // or a single ink line. Each candle has a native tooltip; the svg has a summary name.
  // Main card chart: approved budget (line), utilized (ink line) and available as the
  // band between them, year to date, one point per month end, on a zero-based scale.
  const budgetChart = (trend, { fmt, periodLabel, monthLabel, caption }) => {
    const b = trend?.budget || [], u = trend?.utilized || [], a = trend?.available || [];
    if (!b.length) return '';
    const W = 1000, H = 160, TOP = 8, slot = W / b.length;
    const max = Math.max(...b.map(c => c.high), ...u.map(c => c.high), 1) * 1.04;
    const y = v => TOP + (1 - v / max) * (H - TOP);
    const pts = (s) => [[0, y(s[0].open)], ...s.map((c, i) => [(i + 1) * slot, y(c.close)])];
    const pb = pts(b), pu = pts(u);
    const line = (p) => p.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
    const band = line(pb) + ' ' + [...pu].reverse().map(([px, py]) => `L${px.toFixed(1)} ${py.toFixed(1)}`).join(' ') + ' Z';
    const end = (p, cls) => { const [ex, ey] = p.at(-1); return `<line class="${cls}" x1="${(ex - 1).toFixed(1)}" x2="${(ex - 1).toFixed(1)}" y1="${ey.toFixed(1)}" y2="${ey.toFixed(1)}"/>`; };
    const hits = b.map((c, i) => `<rect class="trend-hit" x="${(i * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}"><title>${esc(periodLabel(c.start))}: approved USD ${esc(fmt(c.close))} · utilized USD ${esc(fmt(u[i].close))} · available USD ${esc(fmt(a[i].close))}</title></rect>`).join('');
    const summary = `Budget overview, ${caption}: approved budget USD ${fmt(b[0].open)} to USD ${fmt(b.at(-1).close)}; utilized USD ${fmt(u[0].open)} to USD ${fmt(u.at(-1).close)}; available USD ${fmt(a[0].open)} to USD ${fmt(a.at(-1).close)}`;
    // The available area is hatched by an HTML layer masked to the band, so the hatching
    // stays a true 45° in screen pixels however the chart stretches.
    const mask = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${band}"/></svg>`)}")`;
    return `<figure class="overview-chart" data-chart="budget-overview">
      <div class="overview-legend" aria-hidden="true"><span class="key-approved">Approved budget</span><span class="key-utilized">Utilized</span><span class="key-available">Available</span></div>
      <div class="overview-plot"><div class="overview-hatch" aria-hidden="true" style="-webkit-mask-image:${esc(mask)};mask-image:${esc(mask)}"></div><svg class="kpi-trend kpi-trend-overview" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(summary)}"><title>${esc(summary)}</title>
        <path class="overview-approved" d="${line(pb)}"/><path class="overview-utilized" d="${line(pu)}"/>${end(pb, 'overview-end-approved')}${end(pu, 'overview-end-utilized')}${hits}
      </svg></div>
      <div class="overview-months" aria-hidden="true">${b.map(c => `<span>${esc(monthLabel(c.start))}</span>`).join('')}</div>
    </figure>`;
  };
  // Payment card chart: Paid, Outstanding, On Hold and Balance as four lines on one zero-based scale.
  const paymentChart = (trend, series, { fmt, periodLabel, monthLabel, caption }) => {
    const first = trend?.[series[0][0]] || [];
    if (!first.length) return '';
    const W = 1000, H = 160, TOP = 8, slot = W / first.length;
    const max = Math.max(...series.flatMap(([key]) => trend[key].map(c => c.high)), 1) * 1.04;
    const y = v => TOP + (1 - v / max) * (H - TOP);
    const lines = series.map(([key]) => {
      const s = trend[key], p = [[0, y(s[0].open)], ...s.map((c, i) => [(i + 1) * slot, y(c.close)])];
      const [ex, ey] = p.at(-1);
      return `<path class="pay-line pay-${key}" d="${p.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ')}"/><line class="pay-end pay-${key}" x1="${(ex - 1).toFixed(1)}" x2="${(ex - 1).toFixed(1)}" y1="${ey.toFixed(1)}" y2="${ey.toFixed(1)}"/>`;
    }).join('');
    const hits = first.map((c, i) => `<rect class="trend-hit" x="${(i * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}"><title>${esc(periodLabel(c.start))}: ${series.map(([key, label]) => `${esc(label)} USD ${esc(fmt(trend[key][i].close))}`).join(' · ')}</title></rect>`).join('');
    const summary = `Payment overview, ${caption}: ${series.map(([key, label]) => `${label} USD ${fmt(trend[key][0].open)} to USD ${fmt(trend[key].at(-1).close)}`).join('; ')}`;
    return `<figure class="overview-chart" data-chart="payment-overview"><div class="overview-plot"><svg class="kpi-trend kpi-trend-payments" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(summary)}"><title>${esc(summary)}</title>${lines}${hits}</svg></div>
      <div class="overview-months" aria-hidden="true">${first.map(c => `<span>${esc(monthLabel(c.start))}</span>`).join('')}</div></figure>`;
  };
  const trendChart = (series, { kind = 'candle', label, fmt, periodLabel, caption }) => {
    if (!series?.length) return '';
    // Drawn in a 240×64 box and stretched to fill the space the tile leaves free.
    const W = 240, H = 64, PAD = 5, slot = W / series.length;
    const lows = series.map(c => c.low), highs = series.map(c => c.high);
    const lo = Math.min(...lows), hi = Math.max(...highs), span = hi - lo;
    const y = v => span ? PAD + (hi - v) / span * (H - PAD * 2) : H / 2;
    const first = series[0].open, last = series.at(-1).close;
    const change = last - first;
    const summary = `${label}, ${caption}: USD ${fmt(first)} to USD ${fmt(last)}, ${change > 0 ? 'up' : change < 0 ? 'down' : 'unchanged'}`;
    const hit = (i, title = '') => `<rect class="trend-hit" x="${(i * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}">${title}</rect>`;
    let marks = '';
    if (kind === 'line') {
      const pts = [[0, y(first)], ...series.map((c, i) => [(i + 1) * slot, y(c.close)])];
      const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
      const [ex, ey] = pts.at(-1);
      marks = `<path class="trend-line" d="${d}"/><line class="trend-end" x1="${(ex - 1).toFixed(1)}" x2="${(ex - 1).toFixed(1)}" y1="${ey.toFixed(1)}" y2="${ey.toFixed(1)}"/>` +
        series.map((c, i) => hit(i, `<title>${esc(periodLabel(c.start))}: USD ${esc(fmt(c.close))}</title>`)).join('');
    } else {
      marks = series.map((c, i) => {
        const cx = i * slot + slot / 2, bw = Math.max(4, slot * 0.46);
        const tip = `<title>${esc(periodLabel(c.start))}: USD ${esc(fmt(c.open))} → USD ${esc(fmt(c.close))}</title>`;
        // Months with no change draw nothing; the hover area still reports the month.
        if (c.close === c.open && c.high === c.low) return `<g class="candle flat">${tip}${hit(i)}</g>`;
        const up = c.close >= c.open;
        const top = y(Math.max(c.open, c.close)), bottom = y(Math.min(c.open, c.close));
        const h = Math.max(3, bottom - top);
        return `<g class="candle ${up ? 'up' : 'down'}">${tip}<line x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${y(c.high).toFixed(1)}" y2="${y(c.low).toFixed(1)}"/><rect x="${(cx - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}"/>${hit(i)}</g>`;
      }).join('');
    }
    return `<figure class="kpi-trend-figure"><svg class="kpi-trend kpi-trend-${kind}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(summary)}"><title>${esc(summary)}</title>${marks}</svg></figure>`;
  };
  const field = (label, html, wide = false) => `<div class="field ${wide ? 'wide' : ''}"><label>${label}${/\brequired\b/.test(html) ? '<span class="required-mark" aria-hidden="true"> *</span>' : ''}</label>${html}</div>`;
  const badge = status => `<span class="badge ${status.replaceAll(' ', '')}">${esc(status === 'Finance' ? 'Pending Payment' : status)}</span>`;
  const empty = (title, note = '') => `<div class="empty"><div class="empty-icon">${icon('requests')}</div><h3>${esc(title)}</h3>${note ? `<p>${esc(note)}</p>` : ''}</div>`;
  // A breakdown row: title and description, a headline figure for the breakdown, then the table on expand.
  const disclosure = (title, description, body, id, figure = '', unit = '') => `<details class="report-disclosure" data-disclosure="${id}"><summary><span class="report-text"><strong>${esc(title)}</strong><small>${esc(description)}</small></span>${figure === '' ? '' : `<span class="report-figure"><b>${esc(figure)}</b><small>${esc(unit)}</small></span>`}${icon('chevron')}</summary><div class="report-body">${body}</div></details>`;
  const loadingSkeleton = () => `<div class="loading-skeleton" role="status" aria-label="Loading workspace"><div class="skeleton-line"></div><div class="skeleton-line short"></div><div class="skeleton-grid">${'<div></div>'.repeat(3)}</div><span class="sr-only">Loading workspace…</span></div>`;
  return { themePicker, propertySwitcher, appSidebar, appHeader, appShell, pageHeader, statCard, trendChart, budgetChart, paymentChart, figureLength, field, badge, empty, disclosure, loadingSkeleton };
}
