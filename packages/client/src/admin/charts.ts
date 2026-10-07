import { h, fmtNumber } from './ui';

const SVG = 'http://www.w3.org/2000/svg';

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

export function chart(labels: string[], series: Series[], lang: string): HTMLElement {
  const W = 640;
  const H = 220;
  const pad = { l: 44, r: 10, t: 12, b: 26 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(0, ...series.flatMap((x) => x.values)));
  const n = Math.max(1, labels.length);
  const step = iw / n;
  const x = (i: number) => pad.l + step * i + step / 2;
  const y = (v: number) => pad.t + ih - (v / max) * ih;

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' });
  for (let g = 0; g <= 4; g++) {
    const v = (max / 4) * g;
    svg.append(s('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'grid' }));
    const tx = s('text', { x: pad.l - 6, y: y(v) + 4, class: 'axis', 'text-anchor': 'end' });
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
  const bw = Math.max(2, (step * 0.7) / Math.max(1, bars.length));
  bars.forEach((ser, si) => {
    ser.values.forEach((v, i) => {
      const bx = x(i) - (bw * bars.length) / 2 + bw * si;
      const rect = s('rect', { x: bx, y: y(v), width: bw - 1, height: Math.max(0, pad.t + ih - y(v)), fill: ser.color, rx: 2 });
      const title = s('title', {});
      title.textContent = `${labels[i]} · ${ser.name}: ${fmtNumber(v, lang, 1)}`;
      rect.append(title);
      svg.append(rect);
    });
  });

  for (const ser of series.filter((x) => x.kind !== 'bar')) {
    const pts = ser.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    if (ser.values.length > 1) {
      svg.append(s('polygon', { points: `${x(0)},${y(0)} ${pts} ${x(ser.values.length - 1)},${y(0)}`, fill: ser.color, opacity: 0.12 }));
    }
    svg.append(s('polyline', { points: pts, fill: 'none', stroke: ser.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    ser.values.forEach((v, i) => {
      const c = s('circle', { cx: x(i), cy: y(v), r: n > 40 ? 1.5 : 3, fill: ser.color });
      const title = s('title', {});
      title.textContent = `${labels[i]} · ${ser.name}: ${fmtNumber(v, lang, 1)}`;
      c.append(title);
      svg.append(c);
    });
  }

  const legend = h('div', { class: 'legend' }, ...series.map((ser) => h('span', null, h('i', { style: `background:${ser.color}` }), ser.name)));
  return h('div', { class: 'chart-wrap' }, svg, legend);
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
