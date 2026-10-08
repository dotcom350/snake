import './admin.css';
import { api, auth, ApiError } from './api';
import { h } from './ui';
import { t, getLang, setLang, type Key } from './i18n';
import { loadSettings } from './state';

type PageModule = { render(root: HTMLElement): Promise<(() => void) | void> };

const ICONS: Record<string, string> = {
  dashboard: 'M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z',
  stats: 'M4 20V10m6 10V4m6 16v-7m6 7H2',
  earnings: 'M12 2v20m5-16H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  ads: 'M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1zm13-3a5 5 0 0 1 0 8m3-11a9 9 0 0 1 0 14',
  appearance: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-.9-.6-1.4-.6-2.2 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4c0-4.7-4-8.6-9-8.6zM7.5 12a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm3-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm5 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z',
  skins: 'M4 17c3 0 3-4 6-4s3 4 6 4 3-4 4-4M4 11c3 0 3-4 6-4s3 4 6 4 3-4 4-4',
  game: 'M6 12h4m-2-2v4m7-1h.01M18 11h.01M17 6H7a5 5 0 0 0 0 10 4 4 0 0 0 3.5-2h3a4 4 0 0 0 3.5 2 5 5 0 0 0 0-10z',
  sound: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
};

function icon(name: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('nav-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name] ?? '');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

const ROUTES: Array<{ path: string; label: Key; load: () => Promise<PageModule> }> = [
  { path: 'dashboard', label: 'navDashboard', load: () => import('./pages/dashboard') },
  { path: 'stats', label: 'navStats', load: () => import('./pages/stats') },
  { path: 'earnings', label: 'navEarnings', load: () => import('./pages/earnings') },
  { path: 'ads', label: 'navAds', load: () => import('./pages/ads') },
  { path: 'appearance', label: 'navAppearance', load: () => import('./pages/appearance') },
  { path: 'skins', label: 'navSkins', load: () => import('./pages/skins') },
  { path: 'game', label: 'navGame', load: () => import('./pages/game') },
  { path: 'sound', label: 'navSound', load: () => import('./pages/sound') },
  { path: 'account', label: 'navAccount', load: () => import('./pages/account') },
];

const app = document.getElementById('app')!;
document.documentElement.lang = getLang();
let cleanup: (() => void) | void;

function langSwitch(): HTMLElement {
  const btn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, getLang() === 'es' ? 'EN' : 'ES');
  btn.addEventListener('click', () => {
    setLang(getLang() === 'es' ? 'en' : 'es');
    if (auth.token) void showShell();
    else void showLogin();
  });
  return btn;
}

async function showLogin(): Promise<void> {
  cleanup?.();
  const status = await api<{ adminExists: boolean }>('GET', '/api/admin/status').catch(() => ({ adminExists: true }));
  const email = h('input', { class: 'input', type: 'email', autocomplete: 'username', required: true });
  const password = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, t('login'));
  const form = h(
    'form',
    { class: 'login-card' },
    h('div', { class: 'login-brand' }, h('img', { src: '/favicon.svg', width: 40, height: 40, alt: '' }), h('h1', null, t('appTitle'))),
    status.adminExists ? null : h('p', { class: 'notice' }, t('noAdmin')),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('email')), email),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('password')), password),
    error,
    submit,
    h('div', { class: 'login-foot' }, langSwitch())
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true;
    error.textContent = '';
    try {
      const res = await api<{ token: string }>('POST', '/api/admin/login', { email: email.value, password: password.value });
      auth.token = res.token;
      location.hash = '#/dashboard';
      await showShell();
    } catch (err) {
      error.textContent = err instanceof ApiError && err.status === 429 ? t('tooMany') : t('loginFailed');
    } finally {
      submit.disabled = false;
    }
  });
  app.replaceChildren(h('div', { class: 'login-wrap' }, form));
  email.focus();
}

let main: HTMLElement;
let nav: HTMLElement;

async function showShell(): Promise<void> {
  const me = await api<{ email: string }>('GET', '/api/admin/me').catch(() => null);
  if (!me) return showLogin();

  const logout = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, t('logout'));
  logout.addEventListener('click', async () => {
    await api('POST', '/api/admin/logout').catch(() => undefined);
    auth.token = null;
    void showLogin();
  });

  nav = h(
    'nav',
    { class: 'nav' },
    ...ROUTES.map((r) => h('a', { href: `#/${r.path}`, 'data-path': r.path }, icon(r.path), h('span', null, t(r.label))))
  );
  main = h('main', { class: 'main' });
  app.replaceChildren(
    h(
      'div',
      { class: 'shell' },
      h(
        'aside',
        { class: 'side' },
        h('a', { class: 'side-brand', href: '#/dashboard' }, h('img', { src: '/favicon.svg', width: 28, height: 28, alt: '' }), 'Snake Arena'),
        nav,
        h(
          'div',
          { class: 'side-foot' },
          h('span', { class: 'muted small' }, me.email),
          h('div', { class: 'row' }, h('a', { class: 'btn btn-ghost btn-sm', href: '/', target: '_blank', rel: 'noopener' }, t('viewSite')), langSwitch(), logout)
        )
      ),
      main
    )
  );
  await loadSettings(true).catch(() => undefined);
  await route();
}

async function route(): Promise<void> {
  if (!main) return;
  const path = location.hash.replace(/^#\//, '') || 'dashboard';
  const r = ROUTES.find((x) => x.path === path) ?? ROUTES[0];
  for (const a of nav.querySelectorAll('a')) a.classList.toggle('active', a.dataset.path === r.path);
  cleanup?.();
  cleanup = undefined;
  main.replaceChildren(h('p', { class: 'muted' }, t('loading')));
  try {
    const mod = await r.load();
    cleanup = await mod.render(main);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return;
    main.replaceChildren(h('p', { class: 'form-error' }, `${t('error')}: ${err instanceof Error ? err.message : String(err)}`));
  }
  main.scrollTop = 0;
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => void route());
auth.onLogout = () => void showLogin();

if (auth.token) void showShell();
else void showLogin();
