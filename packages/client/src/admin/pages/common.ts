import type { AllSettings, SettingsSection } from '@snake/shared/site-config';
import { h, toast } from '../ui';
import { t } from '../i18n';
import { ApiError } from '../api';
import { loadSettings, saveSettings } from '../state';

/** Loads one settings section, renders an editable form and Save / Restore buttons. */
export async function settingsPage<K extends SettingsSection>(
  root: HTMLElement,
  section: K,
  title: string,
  build: (draft: AllSettings[K], ctx: { changed: () => void; redraw: () => void; all: AllSettings }) => Node | Node[]
): Promise<void> {
  root.replaceChildren(h('p', { class: 'muted' }, t('loading')));
  const { settings, defaults } = await loadSettings();
  let draft = structuredClone(settings[section]);
  const status = h('span', { class: 'save-status' });
  const body = h('div', { class: 'settings-body' });

  const render = (): void => {
    const content = build(draft, { changed: () => (status.textContent = '•'), redraw: render, all: settings });
    body.replaceChildren(...(Array.isArray(content) ? content : [content]));
  };

  const saveBtn = h('button', { class: 'btn btn-primary', type: 'button' }, t('save'));
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      const next = await saveSettings(section, draft);
      draft = structuredClone(next[section]);
      status.textContent = '';
      toast(t('saved'));
      render();
    } catch (err) {
      const issues = err instanceof ApiError && err.issues.length ? `: ${err.issues.slice(0, 3).join(' · ')}` : '';
      toast(`${t('saveError')}${issues}`, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });
  const resetBtn = h('button', { class: 'btn btn-ghost', type: 'button' }, t('reset'));
  resetBtn.addEventListener('click', () => {
    if (!confirm(t('confirmReset'))) return;
    draft = structuredClone(defaults[section]);
    status.textContent = '•';
    render();
  });

  render();
  root.replaceChildren(
    h('header', { class: 'page-head' }, h('h1', null, title), h('div', { class: 'page-actions' }, status, resetBtn, saveBtn)),
    body
  );
}
