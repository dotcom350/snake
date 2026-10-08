type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

let toastTimer = 0;
export function toast(message: string, kind: 'ok' | 'error' = 'ok'): void {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 3200);
}

export function field(label: string, control: HTMLElement, help?: string): HTMLElement {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, help ? h('small', { class: 'field-help' }, help) : null);
}

export function numberInput(value: number | null, opts: { min?: number; max?: number; step?: number; placeholder?: string } = {}): HTMLInputElement {
  const i = h('input', { type: 'number', class: 'input' });
  if (opts.min !== undefined) i.min = String(opts.min);
  if (opts.max !== undefined) i.max = String(opts.max);
  i.step = String(opts.step ?? 1);
  if (opts.placeholder) i.placeholder = opts.placeholder;
  i.value = value === null ? '' : String(value);
  return i;
}

export function colorInput(value: string, onInput?: (v: string) => void): HTMLInputElement {
  const i = h('input', { type: 'color', class: 'color' });
  i.value = value;
  if (onInput) i.addEventListener('input', () => onInput(i.value));
  return i;
}

export function select<V extends string>(value: V, options: Array<[V, string]>, onChange?: (v: V) => void): HTMLSelectElement {
  const s = h('select', { class: 'input' }, ...options.map(([v, label]) => h('option', { value: v }, label)));
  s.value = value;
  if (onChange) s.addEventListener('change', () => onChange(s.value as V));
  return s;
}

export function toggle(checked: boolean, onChange?: (v: boolean) => void): HTMLInputElement {
  const i = h('input', { type: 'checkbox', class: 'switch' });
  i.checked = checked;
  if (onChange) i.addEventListener('change', () => onChange(i.checked));
  return i;
}

export function card(title: string | null, ...children: Child[]): HTMLElement {
  return h('section', { class: 'card' }, title ? h('h2', { class: 'card-title' }, title) : null, ...children);
}

export function fmtNumber(n: number, lang: string, digits = 0): string {
  return new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(n);
}

export function fmtDuration(sec: number, lang: string): string {
  if (sec < 60) return `${Math.round(sec)} s`;
  if (sec < 3600) return `${fmtNumber(sec / 60, lang, 1)} min`;
  return `${fmtNumber(sec / 3600, lang, 1)} h`;
}

export interface KpiOptions {
  sub?: string;
  /** Change versus the previous period as a ratio (0.12 = +12%). */
  delta?: number | null;
  spark?: Node;
  tone?: 'cyan' | 'green' | 'gold' | 'pink' | 'violet' | 'blue';
}

export function kpi(label: string, value: string, o: KpiOptions = {}): HTMLElement {
  let deltaEl: HTMLElement | null = null;
  if (o.delta !== undefined && o.delta !== null && Number.isFinite(o.delta)) {
    const up = o.delta >= 0;
    deltaEl = h('span', { class: `delta ${up ? 'up' : 'down'}` }, `${up ? '▲' : '▼'} ${Math.abs(Math.round(o.delta * 100))}%`);
  }
  return h(
    'div',
    { class: `kpi tone-${o.tone ?? 'cyan'}` },
    h('span', { class: 'kpi-label' }, label),
    h('div', { class: 'kpi-row' }, h('strong', { class: 'kpi-value' }, value), deltaEl),
    o.sub ? h('span', { class: 'kpi-sub' }, o.sub) : null,
    o.spark ?? null
  );
}

export function ratio(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return (current - previous) / previous;
}
