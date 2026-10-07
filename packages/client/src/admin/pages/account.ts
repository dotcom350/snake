import { api, ApiError } from '../api';
import { h, card, field, toast } from '../ui';
import { t, getLang } from '../i18n';
import { loadSettings, saveSettings } from '../state';

interface AuditRow {
  action: string;
  resource: string;
  ip: string | null;
  at: string;
  email: string | null;
}

const COMMON_ZONES = [
  'UTC',
  'America/Mexico_City',
  'America/Bogota',
  'America/Lima',
  'America/Caracas',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/Havana',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/Madrid',
  'Europe/London',
];

export async function render(root: HTMLElement): Promise<void> {
  const lang = getLang();
  const [{ settings }, audit] = await Promise.all([loadSettings(), api<AuditRow[]>('GET', '/api/admin/audit')]);

  const current = h('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
  const next = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', minlength: 10 });
  const pwBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, t('changePassword'));
  const pwForm = h('form', null, field(t('currentPassword'), current), field(t('newPassword'), next), pwBtn);
  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (next.value.length < 10) return toast(t('passwordShort'), 'error');
    pwBtn.disabled = true;
    try {
      await api('POST', '/api/admin/password', { current: current.value, next: next.value });
      current.value = next.value = '';
      toast(t('passwordChanged'));
    } catch (err) {
      toast(err instanceof ApiError && err.status === 403 ? t('passwordWrong') : t('saveError'), 'error');
    } finally {
      pwBtn.disabled = false;
    }
  });

  const zones = new Set(COMMON_ZONES);
  zones.add(settings.general.timeZone);
  try {
    zones.add(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    // ignore
  }
  const tz = h('select', { class: 'input' }, ...Array.from(zones).map((z) => h('option', { value: z }, z)));
  tz.value = settings.general.timeZone;
  const tzBtn = h('button', { type: 'button', class: 'btn btn-primary' }, t('save'));
  tzBtn.addEventListener('click', async () => {
    try {
      await saveSettings('general', { timeZone: tz.value });
      toast(t('saved'));
    } catch {
      toast(t('saveError'), 'error');
    }
  });

  root.replaceChildren(
    h('header', { class: 'page-head' }, h('h1', null, t('accountTitle'))),
    h('div', { class: 'grid2' }, card(t('changePassword'), pwForm), card(t('generalTitle'), field(t('timeZone'), tz), tzBtn)),
    card(
      t('auditTitle'),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'table' },
          h('thead', null, h('tr', null, ...[t('when'), t('email'), t('action'), t('ip')].map((x) => h('th', null, x)))),
          h(
            'tbody',
            null,
            ...audit.map((r) =>
              h(
                'tr',
                null,
                h('td', { class: 'small' }, new Date(Number(r.at)).toLocaleString(lang)),
                h('td', null, r.email ?? '—'),
                h('td', null, `${r.action} · ${r.resource}`),
                h('td', { class: 'mono small' }, r.ip ?? '')
              )
            )
          )
        )
      )
    )
  );
}
