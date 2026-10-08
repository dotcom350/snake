import './game.css';
import { snakeRadius, type DecodedState, type ServerMessage } from '@snake/shared/protocol';
import { Net } from './net';
import { Controls } from './input';
import { Renderer, type RenderSnake } from './render';
import { translator } from './i18n';
import { Sound } from './audio';
import { createSettingsPanel } from './settings-panel';
import { storage, sessionId } from '../storage';
import { siteConfig, injectHtml } from '../site';
import { loadPrefs, savePrefs } from '../prefs';

export type ExitReason = 'menu' | 'connect' | 'full' | 'nickname';

export interface StartOptions {
  nickname: string;
  locale: 'en' | 'es';
  onExit(reason: ExitReason): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function startGame(opts: StartOptions): void {
  const { t, num } = translator(opts.locale);
  const cfg = siteConfig();
  const prefs = loadPrefs();
  const isTouch = matchMedia('(pointer: coarse)').matches;

  const sound = new Sound(cfg.sound, prefs.musicVolume, prefs.sfxVolume, prefs.muted);
  sound.start();

  const root = el('div', 'game');
  const canvas = el('canvas', 'game-canvas');
  canvas.setAttribute('aria-label', 'Snake Arena');

  const hud = el('div', 'hud');
  const scoreBox = el('div', 'hud-score');
  const scoreValue = el('strong', 'hud-value', '0');
  const rankLine = el('span', 'hud-rank');
  const killsLine = el('span', 'hud-kills');
  scoreBox.append(el('span', 'hud-label', t('length')), scoreValue, rankLine, killsLine);

  const board = el('div', 'hud-board');
  const boardList = el('ol', 'hud-board-list');
  board.append(el('div', 'hud-board-title', t('leaderboard')), boardList);

  const iconButton = (className: string, text: string, label: string) => {
    const b = el('button', `hud-icon ${className}`, text);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    return b;
  };
  const exitBtn = iconButton('hud-exit', '✕', t('menu'));
  const gearBtn = iconButton('hud-gear', '⚙', t('settings'));
  const muteBtn = iconButton('hud-mute', prefs.muted ? '🔇' : '🔊', t('muteAll'));

  const boostBtn = el('button', 'boost-btn', '⚡');
  boostBtn.type = 'button';
  boostBtn.setAttribute('aria-label', t('boost'));
  if (!isTouch) boostBtn.hidden = true;

  const hint = el('div', 'hud-hint');
  const toast = el('div', 'toast');
  const status = el('div', 'status', t('connecting'));

  const backdrop = el('div', 'backdrop');
  backdrop.hidden = true;

  const revive = el('div', 'revive');
  revive.hidden = true;
  const reviveTitle = el('h2', 'revive-title', t('reviving'));
  const reviveRing = el('div', 'revive-ring');
  const reviveCount = el('strong', 'revive-count', '0');
  reviveRing.append(reviveCount);
  const reviveText = el('p', 'revive-text');
  const reviveAd = el('div', 'revive-ad');
  const reviveCancel = el('button', 'btn btn-ghost', t('cancel'));
  reviveCancel.type = 'button';
  revive.append(reviveTitle, reviveRing, reviveText, reviveAd, reviveCancel);

  const panel = el('div', 'panel');
  panel.hidden = true;
  const panelTitle = el('h2', 'panel-title');
  const panelText = el('p', 'panel-text');
  const panelStats = el('div', 'panel-stats');
  const panelAd = el('div', 'panel-ad');
  const panelActions = el('div', 'panel-actions');
  const reviveBtn = el('button', 'btn btn-revive');
  reviveBtn.type = 'button';
  reviveBtn.hidden = true;
  const primaryBtn = el('button', 'btn btn-primary');
  primaryBtn.type = 'button';
  const menuBtn = el('button', 'btn btn-ghost', t('menu'));
  menuBtn.type = 'button';
  panelActions.append(reviveBtn, primaryBtn, menuBtn);
  panel.append(panelTitle, panelText, panelStats, panelAd, panelActions);

  const renderer = new Renderer(canvas, cfg.appearance, prefs);
  const controls = new Controls(canvas, boostBtn);

  const applyPrefs = () => {
    savePrefs(prefs);
    sound.setVolumes(prefs.musicVolume, prefs.sfxVolume, prefs.muted);
    muteBtn.textContent = prefs.muted ? '🔇' : '🔊';
    controls.mode = prefs.controlMode;
    root.classList.toggle('boost-left', prefs.boostSide === 'left');
    renderer.setOptions(prefs);
    syncLayout();
    hint.textContent = isTouch ? (prefs.controlMode === 'follow' ? t('hintFollow') : t('hintTouch')) : t('hintMouse');
  };
  const syncLayout = () => {
    root.style.setProperty('--mm', `${renderer.minimapRadius * 2}px`);
    root.classList.toggle('no-minimap', !prefs.showMinimap);
  };
  const settingsPanel = createSettingsPanel(t, prefs, isTouch, applyPrefs);

  const icons = el('div', 'hud-icons');
  icons.append(exitBtn, gearBtn, muteBtn);
  hud.append(icons, scoreBox, board, hint, toast);
  root.append(canvas, hud, boostBtn, backdrop, status, panel, revive, settingsPanel.element);
  document.body.append(root);
  document.body.classList.add('in-game');
  applyPrefs();

  if (isTouch && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
  }

  const sid = sessionId();
  const names = new Map<number, string>();

  let prev: DecodedState | null = null;
  let cur: DecodedState | null = null;
  let curAt = 0;
  let tickMs = 1000 / 20;
  let arenaW = 2400;
  let arenaH = 2400;
  let alive = false;
  let camX = arenaW / 2;
  let camY = arenaH / 2;
  let zoom = 1;
  let lastHudAt = 0;
  let raf = 0;
  let closed = false;
  let hintTimer = 0;
  let toastTimer = 0;
  let deaths = 0;
  let kills = 0;
  let lastMass = 0;
  let wasBoosting = false;
  let shakeUntil = 0;
  let foodMap = '';
  let leader: [number, number] | null = null;
  const vibrate = (ms: number) => {
    if (isTouch) navigator.vibrate?.(ms);
  };

  const syncBackdrop = () => {
    backdrop.hidden = panel.hidden && status.hidden && revive.hidden;
  };

  const showStatus = (text: string | null) => {
    status.textContent = text ?? '';
    status.hidden = text === null;
    syncBackdrop();
  };

  const showToast = (text: string) => {
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1800);
  };

  const hidePanel = () => {
    panel.hidden = true;
    reviveBtn.hidden = true;
    panelAd.replaceChildren();
    syncBackdrop();
  };

  const showPanel = (title: string, text: string, primary: string, onPrimary: () => void, stats?: HTMLElement[]) => {
    panelTitle.textContent = title;
    panelText.textContent = text;
    panelStats.replaceChildren(...(stats ?? []));
    primaryBtn.textContent = primary;
    primaryBtn.onclick = () => {
      sound.click();
      onPrimary();
    };
    panel.hidden = false;
    syncBackdrop();
    primaryBtn.focus({ preventScroll: true });
  };

  let reviveTimer = 0;
  let reviveWatchdog = 0;
  let lastDeath: { title: string; text: string; stats: HTMLElement[] } | null = null;

  const closeRevive = () => {
    clearInterval(reviveTimer);
    clearTimeout(reviveWatchdog);
    revive.hidden = true;
    reviveAd.replaceChildren();
    syncBackdrop();
  };

  /** Shows the revive ad with a countdown, then asks the server to bring the snake back. */
  const startRevive = () => {
    const ads = cfg.ads;
    hidePanel();
    revive.hidden = false;
    syncBackdrop();
    reviveText.textContent = t('reviveHint', { p: Math.round(ads.revivePercent) });
    const reviveBox = adBox(ads.reviveCode, 'revive', '300×250');
    if (reviveBox) reviveAd.replaceChildren(reviveBox);
    const total = Math.max(0, ads.reviveSeconds);
    const endsAt = performance.now() + total * 1000;
    const tickRevive = () => {
      const left = Math.max(0, Math.ceil((endsAt - performance.now()) / 1000));
      reviveCount.textContent = String(left);
      reviveRing.style.setProperty('--p', String(total ? 1 - left / total : 1));
      reviveText.textContent = left > 0 ? t('reviveIn', { s: left }) : t('reviveHint', { p: Math.round(ads.revivePercent) });
      if (left <= 0) {
        clearInterval(reviveTimer);
        net.revive();
        reviveWatchdog = window.setTimeout(() => {
          closeRevive();
          if (lastDeath) showPanel(lastDeath.title, t('reviveFailed'), t('playAgain'), playAgain, lastDeath.stats);
        }, 4000);
      }
    };
    tickRevive();
    reviveTimer = window.setInterval(tickRevive, 250);
  };
  const cancelRevive = () => {
    closeRevive();
    if (lastDeath) showPanel(lastDeath.title, lastDeath.text, t('playAgain'), playAgain, lastDeath.stats);
  };
  reviveCancel.onclick = cancelRevive;

  const adTest = /[?&]adtest=1\b/.test(location.search);

  /** Builds a labelled ad box; in test mode (?adtest=1) empty slots show a placeholder. */
  const adBox = (code: string, slotName: 'death' | 'revive' | 'play', size: string): HTMLElement | null => {
    if (!code && !adTest) return null;
    const box = el('div', `ad-box ad-${slotName}`);
    box.append(el('span', 'ad-label', t('ad')));
    const slot = el('div', 'ad-content');
    box.append(slot);
    if (code) {
      injectHtml(slot, code);
      navigator.sendBeacon?.('/api/event', JSON.stringify({ t: 'ad', s: slotName === 'play' ? 'landing' : slotName }));
    } else {
      slot.append(el('div', 'ad-preview', `${t('adPreview', { slot: slotName })} · ${size}`));
    }
    return box;
  };

  const showDeathAd = () => {
    const ads = cfg.ads;
    if (!adTest && (!ads.enabled || !ads.deathCode)) return;
    if (deaths % Math.max(1, ads.deathEvery) !== 0) return;
    const box = adBox(ads.deathCode, 'death', '300×250');
    if (box) panelAd.replaceChildren(box);
  };

  const stat = (label: string, value: string, highlight = false) => {
    const box = el('div', highlight ? 'stat stat-hi' : 'stat');
    box.append(el('span', 'stat-label', label), el('strong', 'stat-value', value));
    return box;
  };

  const teardown = (reason: ExitReason) => {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    clearTimeout(hintTimer);
    clearTimeout(toastTimer);
    clearInterval(reviveTimer);
    clearTimeout(reviveWatchdog);
    controls.destroy();
    net.close();
    sound.stop();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKey);
    root.remove();
    document.body.classList.remove('in-game');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    opts.onExit(reason);
  };

  /** Optional skippable ad before a game, every N games. Calls `go` when the player can start. */
  const preroll = (go: () => void) => {
    const ads = cfg.ads;
    const plays = Number(storage.get('plays') ?? 0);
    storage.set('plays', String(plays + 1));
    const active = (ads.enabled && ads.playCode) || adTest;
    if (!active || plays % Math.max(1, ads.playEvery) !== 0) return go();
    const box = adBox(ads.playCode, 'play', '728×90 / 300×250');
    if (!box) return go();
    hidePanel();
    revive.hidden = false;
    syncBackdrop();
    reviveTitle.textContent = t('ad');
    reviveRing.hidden = true;
    reviveAd.replaceChildren(box);
    reviveCancel.className = 'btn btn-primary';
    const skipAt = performance.now() + ads.playSkipSeconds * 1000;
    const tickSkip = () => {
      const left = Math.max(0, Math.ceil((skipAt - performance.now()) / 1000));
      reviveCancel.disabled = left > 0;
      reviveCancel.textContent = left > 0 ? t('adSkipIn', { s: left }) : t('adPlay');
      reviveText.textContent = '';
      if (left <= 0) clearInterval(reviveTimer);
    };
    tickSkip();
    reviveTimer = window.setInterval(tickSkip, 250);
    reviveCancel.onclick = () => {
      closeRevive();
      reviveRing.hidden = false;
      reviveTitle.textContent = t('reviving');
      reviveCancel.className = 'btn btn-ghost';
      reviveCancel.textContent = t('cancel');
      reviveCancel.disabled = false;
      reviveCancel.onclick = cancelRevive;
      go();
    };
  };

  const join = () => {
    hidePanel();
    prev = cur = null;
    kills = 0;
    killsLine.textContent = '';
    net.join(opts.nickname, sid, prefs.skin, isTouch ? 'm' : 'd', opts.locale);
  };

  const playAgain = () => preroll(join);

  const onMessage = (msg: ServerMessage) => {
    switch (msg.type) {
      case 'joined':
        closeRevive();
        hidePanel();
        alive = true;
        lastMass = 0;
        arenaW = msg.arena.w;
        arenaH = msg.arena.h;
        tickMs = 1000 / msg.tickHz;
        controls.hasInput = false;
        showStatus(null);
        sound.spawn();
        hint.classList.add('show');
        clearTimeout(hintTimer);
        hintTimer = window.setTimeout(() => hint.classList.remove('show'), 5000);
        break;
      case 'meta': {
        foodMap = msg.fm ?? foodMap;
        leader = msg.lead ?? null;
        names.clear();
        for (const [id, name] of msg.players) names.set(id, name);
        rankLine.textContent = msg.rank ? t('rank', { r: msg.rank, n: msg.count }) : '';
        boardList.replaceChildren(
          ...msg.top.map(([name, score, me]) => {
            const li = el('li', me ? 'me' : undefined);
            li.append(el('span', 'name', name), el('span', 'pts', num(score)));
            return li;
          })
        );
        break;
      }
      case 'kill':
        kills++;
        killsLine.textContent = `${t('kills')}: ${num(kills)}`;
        sound.kill();
        vibrate(30);
        showToast(t('youAte', { name: msg.name }));
        break;
      case 'died': {
        alive = false;
        deaths++;
        sound.death();
        vibrate(120);
        shakeUntil = performance.now() + 350;
        const best = Number(storage.get('best') ?? 0);
        const isBest = msg.score > best;
        if (isBest) storage.set('best', String(msg.score));
        const reason = msg.reason === 'wall' ? t('hitWall') : t('killedBy', { name: msg.killer ?? '?' });
        window.setTimeout(() => {
          if (closed) return;
          const stats = [stat(t('yourLength'), num(msg.score), isBest), stat(isBest ? t('newBest') : t('best'), num(Math.max(best, msg.score)))];
          if (kills > 0) stats.push(stat(t('kills'), num(kills)));
          lastDeath = { title: t('died'), text: reason, stats };
          showPanel(t('died'), reason, t('playAgain'), playAgain, stats);
          if (msg.revive && cfg.ads.reviveEnabled) {
            reviveBtn.hidden = false;
            reviveBtn.textContent = `▶ ${t('revive', { p: Math.round(cfg.ads.revivePercent) })}`;
            reviveBtn.onclick = () => {
              sound.click();
              startRevive();
            };
          }
          showDeathAd();
        }, 700);
        break;
      }
      case 'error':
        if (msg.code === 'NICKNAME_INVALID') teardown('nickname');
        else if (msg.code === 'SERVER_FULL' || msg.code === 'ROOM_FULL') teardown('full');
        break;
    }
  };

  const net = new Net({
    onState(state, at) {
      prev = cur;
      cur = state;
      curAt = at;
      if (prev) detectEffects(prev, state);
    },
    onMessage,
    onClose() {
      if (closed) return;
      alive = false;
      showStatus(null);
      showPanel(t('lost'), '', t('retry'), reconnect);
    },
  });

  async function reconnect() {
    hidePanel();
    showStatus(t('connecting'));
    try {
      await net.connect();
      join();
    } catch {
      showStatus(null);
      showPanel(t('lost'), '', t('retry'), reconnect);
    }
  }

  menuBtn.onclick = () => teardown('menu');
  exitBtn.onclick = () => teardown('menu');
  gearBtn.onclick = () => {
    sound.click();
    settingsPanel.open();
  };
  muteBtn.onclick = () => {
    prefs.muted = !prefs.muted;
    applyPrefs();
  };

  const onResize = () => {
    renderer.resize();
    syncLayout();
  };
  window.addEventListener('resize', onResize);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (settingsPanel.isOpen) settingsPanel.close();
      else settingsPanel.open();
    } else if (e.key === 'm' || e.key === 'M') {
      prefs.muted = !prefs.muted;
      applyPrefs();
    }
  };
  window.addEventListener('keydown', onKey);

  /** Spawns eat/death effects by comparing two consecutive server states. Purely visual. */
  const detectEffects = (a: DecodedState, b: DecodedState) => {
    const halfW = renderer.width / 2 / zoom;
    const halfH = renderer.height / 2 / zoom;
    const inner = (x: number, y: number, margin: number) => Math.abs(x - camX) < halfW - margin && Math.abs(y - camY) < halfH - margin;

    const heads = b.snakes.map((s) => ({ x: s.points[0], y: s.points[1], r: snakeRadius(s.mass) + 45 }));
    const present = new Set<number>();
    for (let i = 0; i < b.food.length; i += 4) present.add(b.food[i] * 32768 + b.food[i + 1]);
    let collected = 0;
    for (let i = 0; i < a.food.length && collected < 10; i += 4) {
      const x = a.food[i], y = a.food[i + 1];
      if (present.has(x * 32768 + y) || !inner(x, y, 0)) continue;
      const head = heads.find((hd) => (hd.x - x) ** 2 + (hd.y - y) ** 2 < hd.r * hd.r);
      if (!head) continue;
      renderer.effects.collect(x, y, renderer.foodColor(a.food[i + 3]), head.x, head.y);
      collected++;
    }

    const alive = new Set(b.snakes.map((s) => s.id));
    for (const s of a.snakes) {
      if (alive.has(s.id) || s.points.length < 2) continue;
      const x = s.points[0], y = s.points[1];
      if (!inner(x, y, 120)) continue;
      renderer.effects.burst(x, y, renderer.skinColor(s.skin), Math.min(3, Math.max(0.6, s.mass / 120)));
    }
  };

  const buildSnakes = (now: number): RenderSnake[] => {
    if (!cur) return [];
    const alpha = Math.min(1, Math.max(0, (now - curAt) / tickMs));
    const prevById = new Map<number, Float32Array>();
    if (prev) for (const s of prev.snakes) prevById.set(s.id, s.points);

    const out: RenderSnake[] = [];
    let self: RenderSnake | null = null;
    for (const s of cur.snakes) {
      let points = s.points;
      const before = prevById.get(s.id);
      if (before && before.length >= 2 && points.length >= 2) {
        points = points.slice();
        points[0] = before[0] + (s.points[0] - before[0]) * alpha;
        points[1] = before[1] + (s.points[1] - before[1]) * alpha;
      }
      const rs: RenderSnake = {
        id: s.id,
        skin: s.skin,
        boosting: s.boosting,
        protected: s.protected,
        mass: s.mass,
        points,
        name: names.get(s.id) ?? '',
        isSelf: s.id === cur.selfId && s.id !== 0,
      };
      if (rs.isSelf) self = rs;
      else out.push(rs);
    }
    if (self) out.push(self);
    return out;
  };

  let lastFrame = performance.now();
  let trailToggle = false;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    const snakes = buildSnakes(now);
    trailToggle = !trailToggle;
    if (trailToggle) {
      for (const sn of snakes) {
        if (!sn.boosting || sn.points.length < 4) continue;
        const n = sn.points.length;
        renderer.effects.trail(sn.points[n - 2], sn.points[n - 1], renderer.skinColor(sn.skin));
      }
    }
    const self = snakes.length && snakes[snakes.length - 1].isSelf ? snakes[snakes.length - 1] : null;

    if (self) {
      camX = self.points[0];
      camY = self.points[1];
      const viewSize = Math.max(renderer.width, renderer.height);
      // Phones get a closer camera so snakes stay readable on small screens.
      const base = Math.max(820, Math.min(1100, viewSize * 1.05));
      const targetZoom = viewSize / (base + snakeRadius(self.mass) * 14);
      zoom += (targetZoom - zoom) * 0.05;
      if (lastMass && self.mass > lastMass) sound.eat();
      lastMass = self.mass;
      if (self.boosting && !wasBoosting) sound.boost();
      wasBoosting = self.boosting;
      if (now - lastHudAt > 150) {
        lastHudAt = now;
        scoreValue.textContent = num(Math.floor(self.mass));
      }
    } else if (zoom === 1) {
      zoom = Math.max(renderer.width, renderer.height) / 1440;
    }

    if (alive && controls.hasInput) net.input(controls.angle, controls.boost, now);

    let shakeX = 0;
    let shakeY = 0;
    if (now < shakeUntil) {
      const k = (shakeUntil - now) / 350;
      shakeX = (Math.random() - 0.5) * 14 * k;
      shakeY = (Math.random() - 0.5) * 14 * k;
    }

    renderer.draw({
      camX: camX + shakeX,
      camY: camY + shakeY,
      dt,
      scale: zoom,
      arenaW,
      arenaH,
      snakes,
      food: cur?.food ?? new Float32Array(0),
      time: now,
      joystick: controls.joystick,
      selfAlive: !!self,
      foodMap,
      leader,
    });
    renderer.trackFrameTime(now - lastFrame, now);
    lastFrame = now;
  };
  raf = requestAnimationFrame(frame);

  net
    .connect()
    .then(() => {
      showStatus(null);
      preroll(join);
    })
    .catch(() => teardown('connect'));
}
