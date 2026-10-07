import './admin.css';
import { api, auth, ApiError } from './api';
import { h } from './ui';
import { t, getLang, setLang, type Key } from './i18n';
import { loadSettings } from './state';

type PageModule = { render(root: HTMLElement): Promise<(() => void) | void> };

const ROUTES: Array<{ path: string; label: Key; icon: string; load: () => Promise<PageModule> }> = [
  { path: 'dashboard', label: 'navDashboard', icon: '◉', load: () => import('./pages/dashboard') },
  { path: 'stats', label: 'navStats', icon: '▤', load: () => import('./pages/stats') },
  { path: 'ads', label: 'navAds', icon: '$', load: () => import('./pages/ads') },
  { path: 'appearance', label: 'navAppearance', icon: '◐', load: () => import('./pages/appearance') },
  { path: 'skins', label: 'navSkins', icon: '∿', load: () => import('./pages/skins') },
  { path: 'game', label: 'navGame', icon: '⚙', load: () => import('./pages/game') },
  { path: 'sound', label: 'navSound', icon: '♪', load: () => import('./pages/sound') },
  { path: 'account', label: 'navAccount', icon: '☺', load: () => import('./pages/account') },
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
    ...ROUTES.map((r) => h('a', { href: `#/${r.path}`, 'data-path': r.path }, h('span', { class: 'nav-icon', 'aria-hidden': 'true' }, r.icon), t(r.label)))
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
