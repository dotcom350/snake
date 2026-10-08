import { api, ApiError } from '../api';
import { h, card, field, kpi, numberInput, toast, fmtNumber } from '../ui';
import { t, getLang, type Key } from '../i18n';
import { chart, sparkline } from '../charts';
import { dayList } from './stats-data';

interface RevenueResponse {
  today: string;
  from: string;
  days: number;
  currency: string;
  estimatedCpm: number;
  entries: Array<{ id: number; day: string; amount: number; source: string; note: string }>;
  impressions: Array<{ day: string; n: number }>;
  players: Array<{ day: string; n: number }>;
  postback: Array<{ day: string; amount: number }>;
  allTime: { total: number };
}

const RANGES: Array<[number, Key]> = [
  [7, 'days7'],
  [30, 'days30'],
  [90, 'days90'],
  [365, 'days365'],
];
let currentDays = 30;

export async function render(root: HTMLElement): Promise<void> {
  const lang = getLang();
  const r = await api<RevenueResponse>('GET', `/api/admin/revenue?days=${currentDays}`);
  const money = (v: number) => new Intl.NumberFormat(lang, { style: 'currency', currency: r.currency, maximumFractionDigits: 2 }).format(v);

  const days = dayList(r.from, r.days);
  const real = new Map<string, number>();
  for (const e of r.entries) real.set(e.day, (real.get(e.day) ?? 0) + e.amount);
  const imp = new Map(r.impressions.map((x) => [x.day, x.n]));
  const players = new Map(r.players.map((x) => [x.day, x.n]));
  const pb = new Map(r.postback.map((x) => [x.day, x.amount]));
  const pbSeries = days.map((d) => (real.has(d) ? 0 : pb.get(d) ?? 0));
  const realSeries = days.map((d) => real.get(d) ?? 0);
  const estSeries = days.map((d) => (real.has(d) || pb.has(d) ? 0 : ((imp.get(d) ?? 0) / 1000) * r.estimatedCpm));
  const impSeries = days.map((d) => imp.get(d) ?? 0);
  const total = realSeries.reduce((a, b) => a + b, 0) + pbSeries.reduce((a, b) => a + b, 0) + estSeries.reduce((a, b) => a + b, 0);
  const totalReal = realSeries.reduce((a, b) => a + b, 0);
  const totalImp = impSeries.reduce((a, b) => a + b, 0);
  const totalPlayers = days.reduce((a, d) => a + (players.get(d) ?? 0), 0);

  const tabs = h(
    'div',
    { class: 'segmented' },
    ...RANGES.map(([d, label]) => {
      const b = h('button', { type: 'button', class: d === currentDays ? 'on' : '' }, t(label));
      b.addEventListener('click', () => {
        currentDays = d;
        void render(root);
      });
      return b;
    })
  );

  // Add / update form
  const dayInput = h('input', { type: 'date', class: 'input' });
  dayInput.value = r.today;
  const amountInput = numberInput(null, { step: 0.01, placeholder: '0.00' });
  const sourceInput = h('input', { class: 'input', value: 'Monetag', maxlength: 40 });
  const noteInput = h('input', { class: 'input', maxlength: 200 });
  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary' }, t('save'));
  saveBtn.addEventListener('click', async () => {
    const amount = Number(amountInput.value);
    if (!dayInput.value || !Number.isFinite(amount)) return toast(t('saveError'), 'error');
    try {
      await api('POST', '/api/admin/revenue', { day: dayInput.value, amount, source: sourceInput.value || 'Monetag', note: noteInput.value });
      toast(t('saved'));
      void render(root);
    } catch {
      toast(t('saveError'), 'error');
    }
  });

  const csv = h('textarea', { class: 'input code', rows: 4, placeholder: '2026-10-07,3.25,Monetag' });
  const csvFile = h('input', { type: 'file', accept: '.csv,text/csv,text/plain', class: 'input' });
  csvFile.addEventListener('change', async () => {
    const f = csvFile.files?.[0];
    if (f) csv.value = await f.text();
  });
  const importBtn = h('button', { type: 'button', class: 'btn btn-ghost' }, t('importCsv'));
  importBtn.addEventListener('click', async () => {
    try {
      const res = await api<{ imported: number }>('POST', '/api/admin/revenue/import', new Blob([csv.value], { type: 'text/csv' }), 'text/csv');
      toast(t('imported', { n: res.imported }));
      void render(root);
    } catch (err) {
      toast(`${t('saveError')} (${err instanceof ApiError ? err.code : 'ERROR'})`, 'error');
    }
  });

  const table = r.entries.length
    ? h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'table' },
          h('thead', null, h('tr', null, ...[t('day'), t('amount'), t('source'), t('note'), ''].map((x) => h('th', null, x)))),
          h(
            'tbody',
            null,
            ...r.entries.map((e) => {
              const del = h('button', { type: 'button', class: 'btn btn-danger btn-sm' }, '×');
              del.addEventListener('click', async () => {
                await api('DELETE', `/api/admin/revenue/${e.id}`);
                void render(root);
              });
              return h('tr', null, h('td', null, e.day), h('td', null, money(e.amount)), h('td', null, e.source), h('td', { class: 'small' }, e.note), h('td', null, del));
            })
          )
        )
      )
    : h('p', { class: 'muted' }, t('noData'));

  root.replaceChildren(
    h('header', { class: 'page-head' }, h('div', null, h('h1', null, t('earningsTitle')), h('p', { class: 'muted small' }, `${r.from} → ${r.today}`)), tabs),
    h('p', { class: 'notice' }, t('earningsNote')),
    h(
      'div',
      { class: 'kpis' },
      kpi(t('revenue'), money(total), { tone: 'green', sub: `${t('realRevenue')}: ${money(totalReal)}`, spark: sparkline(days.map((_, i) => realSeries[i] + pbSeries[i] + estSeries[i]), '#5ee06a') }),
      kpi(t('adImpressions'), fmtNumber(totalImp, lang), { tone: 'gold', spark: sparkline(impSeries, '#ffd166') }),
      kpi(t('rpm'), money(totalImp ? (total / totalImp) * 1000 : 0), { tone: 'cyan' }),
      kpi(t('arpu'), money(totalPlayers ? total / totalPlayers : 0), { tone: 'violet' }),
      kpi(t('allTime'), money(r.allTime.total), { tone: 'pink' })
    ),
    card(
      t('revenueChart'),
      chart(
        days.map((d) => d.slice(5)),
        [
          { name: t('realRevenue'), color: '#5ee06a', values: realSeries, kind: 'bar' },
          { name: t('postbackRevenue'), color: '#3fa7ff', values: pbSeries, kind: 'bar' },
          { name: t('estimated'), color: '#ffd166', values: estSeries, kind: 'bar' },
        ],
        lang
      )
    ),
    h(
      'div',
      { class: 'grid2' },
      card(
        t('addRevenue'),
        h('div', { class: 'row2' }, field(t('day'), dayInput), field(`${t('amount')} (${r.currency})`, amountInput)),
        h('div', { class: 'row2' }, field(t('source'), sourceInput), field(t('note'), noteInput)),
        saveBtn
      ),
      card(t('importCsv'), h('p', { class: 'muted small' }, t('importHelp')), csvFile, csv, h('div', { class: 'row', style: 'margin-top:10px' }, importBtn))
    ),
    card(t('entries'), table)
  );
}
