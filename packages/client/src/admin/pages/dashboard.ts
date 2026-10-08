import { api } from '../api';
import { h, card, fmtNumber, fmtDuration, kpi, ratio } from '../ui';
import { t, getLang } from '../i18n';
import { chart } from '../charts';
import { daySeries, type StatsResponse } from './stats-data';

interface Live {
  uptimeSec: number;
  connections: number;
  humanPlayers: number;
  bots: number;
  totalRooms: number;
  avgTickMs: number;
  memory: { rssMB: number; heapMB: number };
  profile: string;
  limits: { tickHz: number };
  rooms: Array<{ id: string; humans: number; bots: number; food: number; size: number; ageSec: number; top: Array<{ name: string; score: number; bot: boolean }> }>;
}


export async function render(root: HTMLElement): Promise<() => void> {
  const lang = getLang();
  const liveBox = h('div', { class: 'kpis' });
  const roomsBox = h('div');
  const todayBox = h('div', { class: 'kpis' });
  const chartBox = h('div');

  root.replaceChildren(
    h('header', { class: 'page-head' }, h('h1', null, t('navDashboard')), h('span', { class: 'pill live' }, '● ', t('live'))),
    card(null, liveBox),
    card(t('today'), todayBox),
    card(t('last48h'), chartBox),
    card(t('roomsTable'), roomsBox)
  );

  const refreshLive = async () => {
    const d = await api<Live>('GET', '/api/admin/live');
    liveBox.replaceChildren(
      kpi(t('playersOnline'), fmtNumber(d.humanPlayers, lang), { tone: 'green' }),
      kpi(t('bots'), fmtNumber(d.bots, lang), { tone: 'violet' }),
      kpi(t('rooms'), fmtNumber(d.totalRooms, lang), { tone: 'cyan' }),
      kpi(t('connections'), fmtNumber(d.connections, lang), { tone: 'blue' }),
      kpi(t('memory'), `${d.memory.rssMB} MB`, { sub: `heap ${d.memory.heapMB} MB`, tone: 'gold' }),
      kpi(t('tickTime'), `${fmtNumber(d.avgTickMs, lang, 2)} ms`, { sub: `${d.limits.tickHz} Hz`, tone: 'pink' }),
      kpi(t('uptime'), fmtDuration(d.uptimeSec, lang), { tone: 'cyan' }),
      kpi(t('profile'), d.profile, { tone: 'violet' })
    );
    roomsBox.replaceChildren(
      d.rooms.length
        ? h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              { class: 'table' },
              h('thead', null, h('tr', null, ...[t('room'), t('humans'), t('bots'), t('food'), t('size'), t('age'), t('leader')].map((x) => h('th', null, x)))),
              h(
                'tbody',
                null,
                ...d.rooms.map((r) =>
                  h(
                    'tr',
                    null,
                    h('td', { class: 'mono' }, r.id),
                    h('td', null, r.humans),
                    h('td', null, r.bots),
                    h('td', null, r.food),
                    h('td', null, `${r.size}²`),
                    h('td', null, fmtDuration(r.ageSec, lang)),
                    h('td', null, r.top[0] ? `${r.top[0].name} (${r.top[0].score})${r.top[0].bot ? ' 🤖' : ''}` : '—')
                  )
                )
              )
            )
          )
        : h('p', { class: 'muted' }, t('noRooms'))
    );
  };

  const refreshStats = async () => {
    const s = await api<StatsResponse>('GET', '/api/admin/stats?days=2');
    const d = daySeries(s);
    const i = d.labels.length - 1;
    const cmp = (arr: number[]) => ({
      sub: i > 0 ? `${t('yesterday')}: ${fmtNumber(arr[i - 1], lang)}` : undefined,
      delta: i > 0 ? ratio(arr[i] ?? 0, arr[i - 1] ?? 0) : null,
    });
    todayBox.replaceChildren(
      kpi(t('visitors'), fmtNumber(d.visitors[i] ?? 0, lang), { ...cmp(d.visitors), tone: 'cyan' }),
      kpi(t('pageviews'), fmtNumber(d.pageviews[i] ?? 0, lang), { ...cmp(d.pageviews), tone: 'violet' }),
      kpi(t('games'), fmtNumber(d.games[i] ?? 0, lang), { ...cmp(d.games), tone: 'green' }),
      kpi(t('uniquePlayers'), fmtNumber(d.players[i] ?? 0, lang), { ...cmp(d.players), tone: 'gold' }),
      kpi(t('playtime'), fmtDuration(d.playtimeSec[i] ?? 0, lang), { ...cmp(d.playtimeSec), tone: 'blue' }),
      kpi(t('peakPlayers'), fmtNumber(d.peak[i] ?? 0, lang), { ...cmp(d.peak), tone: 'pink' }),
      kpi(t('revives'), fmtNumber(d.revives[i] ?? 0, lang), { ...cmp(d.revives), tone: 'gold' }),
      kpi(t('adImpressions'), fmtNumber(d.ads[i] ?? 0, lang), { ...cmp(d.ads), tone: 'green' })
    );
    const labels = s.samples.map((x) => x.hour.slice(11) + 'h');
    chartBox.replaceChildren(
      s.samples.length
        ? chart(
            labels,
            [
              { name: t('peakPlayers'), color: '#4ecdc4', values: s.samples.map((x) => Number(x.max_players)) },
              { name: t('connections'), color: '#8c7bff', values: s.samples.map((x) => Number(x.max_conn)) },
            ],
            lang
          )
        : h('p', { class: 'muted' }, t('noData'))
    );
  };

  await Promise.all([refreshLive(), refreshStats()]);
  const live = setInterval(() => void refreshLive().catch(() => undefined), 5000);
  const slow = setInterval(() => void refreshStats().catch(() => undefined), 60_000);
  return () => {
    clearInterval(live);
    clearInterval(slow);
  };
}
