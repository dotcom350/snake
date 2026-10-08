import { h, fmtNumber } from './ui';

const SVG = 'http://www.w3.org/2000/svg';
let gradientId = 0;

function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export interface Series {
  name: string;
  color: string;
  values: number[];
  kind?: 'line' | 'bar';
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Smooth path through points using midpoint quadratic curves. */
function smoothPath(pts: Array<[number, number]>): string {
  if (pts.length === 0) return '';
  if (pts.length < 3) return `M${pts.map((p) => p.join(',')).join(' L')}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${pts[i][0]},${pts[i][1]} ${mx},${my}`;
  }
  const last = pts[pts.length - 1];
  d += ` T${last[0]},${last[1]}`;
  return d;
}

export function chart(labels: string[], series: Series[], lang: string, height = 230): HTMLElement {
  const W = 640;
  const H = height;
  const pad = { l: 46, r: 10, t: 14, b: 26 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(0, ...series.flatMap((x) => x.values)));
  const n = Math.max(1, labels.length);
  const step = iw / n;
  const x = (i: number) => pad.l + step * i + step / 2;
  const y = (v: number) => pad.t + ih - (v / max) * ih;

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' });
  const defs = s('defs', {});
  svg.append(defs);

  for (let g = 0; g <= 4; g++) {
    const v = (max / 4) * g;
    svg.append(s('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'grid' }));
    const tx = s('text', { x: pad.l - 8, y: y(v) + 4, class: 'axis', 'text-anchor': 'end' });
    tx.textContent = fmtNumber(v, lang, max < 2 ? 2 : max < 10 ? 1 : 0);
    svg.append(tx);
  }
  const every = Math.ceil(n / 8);
  labels.forEach((l, i) => {
    const last = i === n - 1;
    if (!last && (i % every !== 0 || n - 1 - i < every * 0.6)) return;
    const tx = s('text', { x: x(i), y: H - 8, class: 'axis', 'text-anchor': 'middle' });
    tx.textContent = l;
    svg.append(tx);
  });

  const bars = series.filter((x) => x.kind === 'bar');
  const bw = Math.max(2, (step * 0.68) / Math.max(1, bars.length));
  bars.forEach((ser, si) => {
    const id = `g${++gradientId}`;
    const grad = s('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.append(s('stop', { offset: '0%', 'stop-color': ser.color, 'stop-opacity': 0.95 }), s('stop', { offset: '100%', 'stop-color': ser.color, 'stop-opacity': 0.35 }));
    defs.append(grad);
    ser.values.forEach((v, i) => {
      const bx = x(i) - (bw * bars.length) / 2 + bw * si;
      const rect = s('rect', { x: bx, y: y(v), width: Math.max(1, bw - 1.5), height: Math.max(0, pad.t + ih - y(v)), fill: `url(#${id})`, rx: Math.min(4, bw / 3) });
      const title = s('title', {});
      title.textContent = `${labels[i]} · ${ser.name}: ${fmtNumber(v, lang, 2)}`;
      rect.append(title);
      svg.append(rect);
    });
  });

  for (const ser of series.filter((x) => x.kind !== 'bar')) {
    const pts = ser.values.map((v, i) => [x(i), y(v)] as [number, number]);
    const path = smoothPath(pts);
    if (pts.length > 1) {
      const id = `g${++gradientId}`;
      const grad = s('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
      grad.append(s('stop', { offset: '0%', 'stop-color': ser.color, 'stop-opacity': 0.32 }), s('stop', { offset: '100%', 'stop-color': ser.color, 'stop-opacity': 0 }));
      defs.append(grad);
      svg.append(s('path', { d: `${path} L${pts[pts.length - 1][0]},${pad.t + ih} L${pts[0][0]},${pad.t + ih} Z`, fill: `url(#${id})` }));
    }
    svg.append(s('path', { d: path, fill: 'none', stroke: ser.color, 'stroke-width': 2.5, 'stroke-linecap': 'round', class: 'line-glow' }));
    ser.values.forEach((v, i) => {
      const c = s('circle', { cx: x(i), cy: y(v), r: n > 40 ? 1.6 : 3.2, fill: '#0b1020', stroke: ser.color, 'stroke-width': 2 });
      const title = s('title', {});
      title.textContent = `${labels[i]} · ${ser.name}: ${fmtNumber(v, lang, 2)}`;
      c.append(title);
      svg.append(c);
    });
  }

  const legend = h('div', { class: 'legend' }, ...series.map((ser) => h('span', null, h('i', { style: `background:${ser.color}` }), ser.name)));
  return h('div', { class: 'chart-wrap' }, svg, legend);
}

/** Tiny trend line for KPI cards. */
export function sparkline(values: number[], color: string): SVGSVGElement {
  const W = 120;
  const H = 34;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [values.length > 1 ? (i / (values.length - 1)) * W : W / 2, H - 3 - (v / max) * (H - 6)] as [number, number]);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'spark', preserveAspectRatio: 'none' });
  if (pts.length > 1) {
    const id = `g${++gradientId}`;
    const defs = s('defs', {});
    const grad = s('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.append(s('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.35 }), s('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }));
    defs.append(grad);
    svg.append(defs);
    const path = smoothPath(pts);
    svg.append(s('path', { d: `${path} L${W},${H} L0,${H} Z`, fill: `url(#${id})` }));
    svg.append(s('path', { d: path, fill: 'none', stroke: color, 'stroke-width': 2 }));
  }
  return svg;
}

/** 7 × 24 grid (weekday × hour). */
export function heatmap(cells: Array<{ dow: number; hour: number; n: number }>, weekdays: string[], lang: string): HTMLElement {
  const grid = new Array(7 * 24).fill(0);
  for (const c of cells) grid[(c.dow - 1) * 24 + c.hour] = c.n;
  const max = Math.max(1, ...grid);
  const wrap = h('div', { class: 'heat' });
  wrap.append(h('span'));
  for (let hour = 0; hour < 24; hour++) wrap.append(h('span', { class: 'heat-h' }, hour % 3 === 0 ? String(hour) : ''));
  for (let d = 0; d < 7; d++) {
    wrap.append(h('span', { class: 'heat-d' }, weekdays[d] ?? ''));
    for (let hour = 0; hour < 24; hour++) {
      const v = grid[d * 24 + hour];
      const k = v / max;
      wrap.append(
        h('span', {
          class: 'heat-c',
          style: `background:rgba(63,224,255,${(0.06 + k * 0.9).toFixed(2)})`,
          title: `${weekdays[d]} ${hour}:00 · ${fmtNumber(v, lang)}`,
        })
      );
    }
  }
  return wrap;
}

export function breakdown(rows: Array<{ label: string; value: number }>, lang: string, emptyText: string, color = 'var(--accent)'): HTMLElement {
  const total = rows.reduce((a, r) => a + r.value, 0);
  if (!rows.length || total === 0) return h('p', { class: 'muted' }, emptyText);
  const max = Math.max(...rows.map((r) => r.value));
  return h(
    'div',
    { class: 'bars' },
    ...rows.map((r) =>
      h(
        'div',
        { class: 'bar-row' },
        h('span', { class: 'bar-label', title: r.label }, r.label),
        h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: `width:${(r.value / max) * 100}%;background:${color}` })),
        h('span', { class: 'bar-value' }, `${fmtNumber(r.value, lang)} · ${fmtNumber((r.value / total) * 100, lang, 0)}%`)
      )
    )
  );
}
