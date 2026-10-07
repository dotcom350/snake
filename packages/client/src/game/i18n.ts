const en = {
  length: 'Length',
  rank: 'Rank {r} of {n}',
  leaderboard: 'Leaderboard',
  died: 'You died',
  killedBy: 'You crashed into {name}',
  hitWall: 'You hit the wall',
  yourLength: 'Final length',
  best: 'Best',
  newBest: 'New best!',
  playAgain: 'Play again',
  menu: 'Menu',
  connecting: 'Connecting…',
  lost: 'Connection lost',
  retry: 'Reconnect',
  boost: 'Boost',
  hintTouch: 'Drag to steer · hold ⚡ to boost',
  hintMouse: 'Move the mouse to steer · hold click or Space to boost',
};

const es: typeof en = {
  length: 'Longitud',
  rank: 'Puesto {r} de {n}',
  leaderboard: 'Clasificación',
  died: 'Has muerto',
  killedBy: 'Chocaste contra {name}',
  hitWall: 'Chocaste contra el muro',
  yourLength: 'Longitud final',
  best: 'Récord',
  newBest: '¡Nuevo récord!',
  playAgain: 'Jugar otra vez',
  menu: 'Menú',
  connecting: 'Conectando…',
  lost: 'Se perdió la conexión',
  retry: 'Reconectar',
  boost: 'Acelerar',
  hintTouch: 'Arrastra para girar · mantén ⚡ para acelerar',
  hintMouse: 'Mueve el ratón para girar · mantén clic o Espacio para acelerar',
};

export type GameStringKey = keyof typeof en;

export function translator(locale: 'en' | 'es') {
  const dict = locale === 'es' ? es : en;
  const fmt = new Intl.NumberFormat(locale);
  return {
    t(key: GameStringKey, params?: Record<string, string | number>): string {
      let s = dict[key];
      if (params) {
        for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, typeof v === 'number' ? fmt.format(v) : v);
      }
      return s;
    },
    num: (n: number) => fmt.format(n),
  };
}
