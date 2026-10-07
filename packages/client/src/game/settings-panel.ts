import type { Prefs } from '../prefs';
import type { GameStringKey } from './i18n';

type T = (key: GameStringKey) => string;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createSettingsPanel(t: T, prefs: Prefs, isTouch: boolean, onChange: (p: Prefs) => void) {
  const overlay = el('div', 'settings-overlay');
  overlay.hidden = true;
  const box = el('div', 'settings');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', t('settings'));
  const title = el('h2', 'settings-title', t('settings'));
  overlay.append(box);

  const update = (patch: Partial<Prefs>) => {
    Object.assign(prefs, patch);
    onChange(prefs);
  };

  const section = (name: GameStringKey) => {
    const s = el('section', 'settings-section');
    s.append(el('h3', undefined, t(name)));
    box.append(s);
    return s;
  };

  const slider = (parent: HTMLElement, label: GameStringKey, value: number, onInput: (v: number) => void) => {
    const row = el('label', 'settings-row');
    const input = el('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.value = String(Math.round(value * 100));
    input.addEventListener('input', () => onInput(Number(input.value) / 100));
    row.append(el('span', undefined, t(label)), input);
    parent.append(row);
  };

  const toggle = (parent: HTMLElement, label: GameStringKey, value: boolean, onToggle: (v: boolean) => void) => {
    const row = el('label', 'settings-row');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = value;
    input.addEventListener('change', () => onToggle(input.checked));
    row.append(el('span', undefined, t(label)), input);
    parent.append(row);
  };

  const choice = <V extends string>(parent: HTMLElement, label: GameStringKey, value: V, options: Array<[V, GameStringKey]>, onPick: (v: V) => void) => {
    const row = el('div', 'settings-row');
    const group = el('div', 'segmented');
    for (const [v, text] of options) {
      const b = el('button', v === value ? 'on' : undefined, t(text));
      b.type = 'button';
      b.addEventListener('click', () => {
        for (const other of group.children) other.classList.remove('on');
        b.classList.add('on');
        onPick(v);
      });
      group.append(b);
    }
    row.append(el('span', undefined, t(label)), group);
    parent.append(row);
  };

  box.append(title);

  const sound = section('sound');
  slider(sound, 'music', prefs.musicVolume, (v) => update({ musicVolume: v }));
  slider(sound, 'effects', prefs.sfxVolume, (v) => update({ sfxVolume: v }));
  toggle(sound, 'muteAll', prefs.muted, (v) => update({ muted: v }));

  if (isTouch) {
    const controls = section('controls');
    choice(controls, 'controlMode', prefs.controlMode, [['joystick', 'joystick'], ['follow', 'follow']], (v) => update({ controlMode: v }));
    choice(controls, 'boostSide', prefs.boostSide, [['right', 'right'], ['left', 'left']], (v) => update({ boostSide: v }));
  }

  const gfx = section('graphics');
  choice(gfx, 'quality', prefs.quality, [['high', 'high'], ['low', 'low']], (v) => update({ quality: v }));
  toggle(gfx, 'showNames', prefs.showNames, (v) => update({ showNames: v }));
  toggle(gfx, 'showMinimap', prefs.showMinimap, (v) => update({ showMinimap: v }));

  const close = el('button', 'btn btn-primary', t('close'));
  close.type = 'button';
  box.append(close);

  const hide = () => {
    overlay.hidden = true;
  };
  close.addEventListener('click', hide);
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) hide();
  });

  return {
    element: overlay,
    open() {
      overlay.hidden = false;
      close.focus({ preventScroll: true });
    },
    close: hide,
    get isOpen() {
      return !overlay.hidden;
    },
  };
}
