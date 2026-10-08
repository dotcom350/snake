export interface StatsResponse {
  today: string;
  from: string;
  days: number;
  timeZone: string;
  series: Array<{ day: string; metric: string; value: string }>;
  uniques: Array<{ day: string; kind: string; n: string }>;
  breakdown: Array<{ metric: string; key: string; value: string }>;
  games: { n: string; avg_sec: string; avg_score: string; max_score: string };
  samples: Array<{ hour: string; avg_players: string; max_players: string; avg_rss: string; avg_tick: string; max_conn: string }>;
  topToday: Array<{ nickname: string; score: number; kills: number; skin: number; device: string; ended_at: string }>;
  topAll: Array<{ nickname: string; score: number; kills: number; skin: number; device: string; ended_at: string }>;
  heat: Array<{ dow: number; hour: number; n: number }>;
  returning: { players: number; returning: number };
  scores: Array<{ bucket: string; n: number }>;
}

export function dayList(from: string, days: number): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function daySeries(s: StatsResponse) {
  const days = dayList(s.from, s.days);
  const index = new Map(days.map((d, i) => [d, i]));
  const zero = () => new Array<number>(days.length).fill(0);
  const metric: Record<string, number[]> = {};
  for (const row of s.series) {
    const i = index.get(row.day);
    if (i === undefined) continue;
    (metric[row.metric] ??= zero())[i] += Number(row.value);
  }
  const uniq: Record<string, number[]> = {};
  for (const row of s.uniques) {
    const i = index.get(row.day);
    if (i === undefined) continue;
    (uniq[row.kind] ??= zero())[i] = Number(row.n);
  }
  const get = (m: string) => metric[m] ?? zero();
  return {
    labels: days.map((d) => d.slice(5)),
    pageviews: get('pageview'),
    games: get('game_start'),
    deaths: get('death'),
    kills: get('kill'),
    playtimeSec: get('playtime_sec'),
    playtimeMin: get('playtime_sec').map((v) => Math.round((v / 60) * 10) / 10),
    peak: get('max_players'),
    ads: get('ad_impression'),
    revives: get('revive'),
    visitors: uniq.visitor ?? zero(),
    players: uniq.player ?? zero(),
  };
}

export function breakdownOf(s: StatsResponse, metric: string): Array<{ key: string; value: number }> {
  return s.breakdown.filter((b) => b.metric === metric).map((b) => ({ key: b.key, value: Number(b.value) }));
}
