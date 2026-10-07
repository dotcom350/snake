import { api } from '../api';
import { h, card, fmtNumber, fmtDuration } from '../ui';
import { t, getLang, type Key } from '../i18n';
import { chart, breakdown } from '../charts';
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

  const [s, { settings }] = await Promise.all([api<StatsResponse>('GET', `/api/admin/stats?days=${currentDays}`), loadSettings()]);
  const d = daySeries(s);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const skins = settings.appearance.skins;

  const kpi = (label: string, value: string) => h('div', { class: 'kpi' }, h('span', { class: 'kpi-label' }, label), h('strong', { class: 'kpi-value' }, value));

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
        kpi(t('visitors'), fmtNumber(sum(d.visitors), lang)),
        kpi(t('pageviews'), fmtNumber(sum(d.pageviews), lang)),
        kpi(t('games'), fmtNumber(Number(s.games.n), lang)),
        kpi(t('playtime'), fmtDuration(sum(d.playtimeSec), lang)),
        kpi(t('avgGame'), fmtDuration(Number(s.games.avg_sec), lang)),
        kpi(t('avgScore'), fmtNumber(Number(s.games.avg_score), lang)),
        kpi(t('bestScore'), fmtNumber(Number(s.games.max_score), lang)),
        kpi(t('kills'), fmtNumber(sum(d.kills), lang)),
        kpi(t('peakPlayers'), fmtNumber(Math.max(0, ...d.peak), lang)),
        kpi(t('adImpressions'), fmtNumber(sum(d.ads), lang))
      ),
      h('p', { class: 'muted small' }, t('timezoneNote', { tz: s.timeZone }))
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
      card(t('crawlers'), breakdown(rows('crawler', undefined, 15), lang, t('noData'), '#9aa6c7'))
    ),
    h('div', { class: 'grid2' }, card(t('topToday'), topTable(s.topToday)), card(t('topAll'), topTable(s.topAll)))
  );
}
