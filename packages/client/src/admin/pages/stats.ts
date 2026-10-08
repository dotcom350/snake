import { api } from '../api';
import { h, card, fmtNumber, fmtDuration, kpi, ratio } from '../ui';
import { t, getLang, type Key } from '../i18n';
import { chart, breakdown, sparkline, heatmap } from '../charts';
import { loadSettings } from '../state';
import { daySeries, breakdownOf, type StatsResponse } from './stats-data';

const RANGES: Array<[number, Key]> = [
  [7, 'days7'],
  [30, 'days30'],
  [90, 'days90'],
  [365, 'days365'],
];

let currentDays = 30;

export async function render(root: HTMLElement): Promise<void> {
  const lang = getLang();
  const body = h('div', { class: 'stack' });
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
  root.replaceChildren(h('header', { class: 'page-head' }, h('h1', null, t('navStats')), tabs), body);
  body.append(h('p', { class: 'muted' }, t('loading')));

  const [s, wide, { settings }] = await Promise.all([
    api<StatsResponse>('GET', `/api/admin/stats?days=${currentDays}`),
    api<StatsResponse>('GET', `/api/admin/stats?days=${Math.min(730, currentDays * 2)}`),
    loadSettings(),
  ]);
  const d = daySeries(s);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const skins = settings.appearance.skins;

  // Previous period of the same length, for the ▲▼ comparisons.
  const w = daySeries(wide);
  const prev = (arr: number[]) => sum(arr.slice(0, Math.max(0, arr.length - currentDays)));
  const delta = (cur: number[], all: number[]) => ratio(sum(cur), prev(all));

  const rows = (metric: string, map?: (k: string) => string, limit = 12) =>
    breakdownOf(s, metric)
      .slice(0, limit)
      .map((r) => ({ label: map ? map(r.key) : r.key || '—', value: r.value }));

  const deviceName = (k: string) => (k === 'm' ? t('mobile') : k === 'd' ? t('desktop') : k);
  const langName = (k: string) => (k === 'es' ? t('spanish') : k === 'en' ? t('english') : k);
  const causeName = (k: string) => (k === 'snake' ? t('causeSnake') : k === 'wall' ? t('causeWall') : k === 'quit' ? t('causeQuit') : k);

  const topTable = (list: StatsResponse['topAll']) =>
    list.length
      ? h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            { class: 'table' },
            h('thead', null, h('tr', null, ...['#', t('player'), t('score'), t('kills'), t('navSkins'), t('when')].map((x) => h('th', null, x)))),
            h(
              'tbody',
              null,
              ...list.map((g, i) =>
                h(
                  'tr',
                  null,
                  h('td', null, i + 1),
                  h('td', null, g.nickname, g.device === 'm' ? ' 📱' : ''),
                  h('td', null, fmtNumber(g.score, lang)),
                  h('td', null, g.kills),
                  h('td', null, skins[g.skin]?.name ?? `#${g.skin}`),
                  h('td', { class: 'small' }, new Date(g.ended_at).toLocaleString(lang, { timeZone: s.timeZone, dateStyle: 'short', timeStyle: 'short' }))
                )
              )
            )
          )
        )
      : h('p', { class: 'muted' }, t('noData'));

  body.replaceChildren(
    card(
      t('totals'),
      h(
        'div',
        { class: 'kpis' },
        kpi(t('visitors'), fmtNumber(sum(d.visitors), lang), { tone: 'cyan', delta: delta(d.visitors, w.visitors), spark: sparkline(d.visitors, '#3fe0ff') }),
        kpi(t('pageviews'), fmtNumber(sum(d.pageviews), lang), { tone: 'violet', delta: delta(d.pageviews, w.pageviews), spark: sparkline(d.pageviews, '#8c7bff') }),
        kpi(t('games'), fmtNumber(Number(s.games.n), lang), { tone: 'green', delta: delta(d.games, w.games), spark: sparkline(d.games, '#5ee06a') }),
        kpi(t('uniquePlayers'), fmtNumber(s.returning?.players ?? 0, lang), { tone: 'gold', spark: sparkline(d.players, '#ffd166') }),
        kpi(t('playtime'), fmtDuration(sum(d.playtimeSec), lang), { tone: 'blue', delta: delta(d.playtimeSec, w.playtimeSec) }),
        kpi(t('avgGame'), fmtDuration(Number(s.games.avg_sec), lang), { tone: 'cyan' }),
        kpi(t('conversion'), `${fmtNumber(sum(d.visitors) ? (Math.min(sum(d.players), sum(d.visitors)) / sum(d.visitors)) * 100 : 0, lang, 1)}%`, { tone: 'green' }),
        kpi(t('gamesPerPlayer'), fmtNumber(s.returning?.players ? Number(s.games.n) / s.returning.players : 0, lang, 1), { tone: 'violet' }),
        kpi(t('avgScore'), fmtNumber(Number(s.games.avg_score), lang), { tone: 'gold' }),
        kpi(t('bestScore'), fmtNumber(Number(s.games.max_score), lang), { tone: 'pink' }),
        kpi(t('kills'), fmtNumber(sum(d.kills), lang), { tone: 'pink', delta: delta(d.kills, w.kills) }),
        kpi(t('revives'), fmtNumber(sum(d.revives), lang), { tone: 'gold', delta: delta(d.revives, w.revives) }),
        kpi(t('peakPlayers'), fmtNumber(Math.max(0, ...d.peak), lang), { tone: 'blue' }),
        kpi(t('adImpressions'), fmtNumber(sum(d.ads), lang), { tone: 'gold', delta: delta(d.ads, w.ads), spark: sparkline(d.ads, '#ffd166') })
      ),
      h('p', { class: 'muted small' }, t('timezoneNote', { tz: s.timeZone }))
    ),
    h(
      'div',
      { class: 'grid2' },
      card(t('heatTitle'), heatmap(s.heat ?? [], t('weekdays').split(','), lang)),
      card(
        t('returningTitle'),
        h(
          'div',
          { class: 'big-stat' },
          h('strong', null, `${fmtNumber(s.returning?.players ? (s.returning.returning / s.returning.players) * 100 : 0, lang, 1)}%`),
          h('span', { class: 'muted' }, t('returningHelp', { r: fmtNumber(s.returning?.returning ?? 0, lang), n: fmtNumber(s.returning?.players ?? 0, lang) }))
        ),
        h('h3', { class: 'sub' }, t('scoresTitle')),
        breakdown(
          ['0-24', '25-49', '50-99', '100-249', '250-499', '500-999', '1000+'].map((b) => ({ label: b, value: s.scores?.find((x) => x.bucket === b)?.n ?? 0 })).filter((r) => r.value > 0),
          lang,
          t('noData'),
          '#8c7bff'
        )
      )
    ),
    card(
      t('trafficChart'),
      chart(
        d.labels,
        [
          { name: t('pageviews'), color: '#8c7bff', values: d.pageviews, kind: 'bar' },
          { name: t('visitors'), color: '#4ecdc4', values: d.visitors },
        ],
        lang
      )
    ),
    card(
      t('gamesChart'),
      chart(
        d.labels,
        [
          { name: t('games'), color: '#5ee06a', values: d.games, kind: 'bar' },
          { name: t('uniquePlayers'), color: '#ffd166', values: d.players },
        ],
        lang
      )
    ),
    h(
      'div',
      { class: 'grid2' },
      card(t('playtimeChart'), chart(d.labels, [{ name: t('playtime'), color: '#3fa7ff', values: d.playtimeMin, kind: 'bar' }], lang)),
      card(t('peakChart'), chart(d.labels, [{ name: t('peakPlayers'), color: '#ff5d73', values: d.peak }], lang))
    ),
    h(
      'div',
      { class: 'grid2' },
      card(t('devices'), breakdown(rows('game_start', deviceName), lang, t('noData'))),
      card(t('deviceVisits'), breakdown(rows('device_visit', deviceName), lang, t('noData'), '#8c7bff')),
      card(t('languages'), breakdown(rows('game_lang', langName), lang, t('noData'), '#ffd166')),
      card(t('deathCauses'), breakdown(rows('death', causeName), lang, t('noData'), '#ff5d73')),
      card(t('skinsUsed'), breakdown(rows('skin', (k) => skins[Number(k)]?.name ?? `#${k}`), lang, t('noData'), '#5ee06a')),
      card(t('adsBySlot'), breakdown(rows('ad_impression'), lang, t('noData'), '#ffd166')),
      card(t('referrers'), breakdown(rows('referrer', (k) => (k === '(direct)' ? t('direct') : k), 15), lang, t('noData'), '#3fa7ff')),
      card(t('crawlers'), breakdown(rows('crawler', undefined, 15), lang, t('noData'), '#9aa6c7')),
      card(t('platform'), breakdown(rows('platform', (k) => (k === 'tg' ? 'Telegram' : 'Web')), lang, t('noData'), '#3fa7ff'))
    ),
    h('div', { class: 'grid2' }, card(t('topToday'), topTable(s.topToday)), card(t('topAll'), topTable(s.topAll)))
  );
}
