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

  const panel = el('div', 'panel');
  panel.hidden = true;
  const panelTitle = el('h2', 'panel-title');
  const panelText = el('p', 'panel-text');
  const panelStats = el('div', 'panel-stats');
  const panelAd = el('div', 'panel-ad');
  const panelActions = el('div', 'panel-actions');
  const primaryBtn = el('button', 'btn btn-primary');
  primaryBtn.type = 'button';
  const menuBtn = el('button', 'btn btn-ghost', t('menu'));
  menuBtn.type = 'button';
  panelActions.append(primaryBtn, menuBtn);
  panel.append(panelTitle, panelText, panelStats, panelActions, panelAd);

  const renderer = new Renderer(canvas, cfg.appearance, prefs);
  const controls = new Controls(canvas, boostBtn);

  const applyPrefs = () => {
    savePrefs(prefs);
    sound.setVolumes(prefs.musicVolume, prefs.sfxVolume, prefs.muted);
    muteBtn.textContent = prefs.muted ? '🔇' : '🔊';
    controls.mode = prefs.controlMode;
    root.classList.toggle('boost-left', prefs.boostSide === 'left');
    renderer.setOptions(prefs);
    hint.textContent = isTouch ? (prefs.controlMode === 'follow' ? t('hintFollow') : t('hintTouch')) : t('hintMouse');
  };
  const settingsPanel = createSettingsPanel(t, prefs, isTouch, applyPrefs);

  hud.append(scoreBox, board, exitBtn, gearBtn, muteBtn, hint, toast);
  root.append(canvas, hud, boostBtn, status, panel, settingsPanel.element);
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

  const showStatus = (text: string | null) => {
    status.textContent = text ?? '';
    status.hidden = text === null;
  };

  const showToast = (text: string) => {
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1800);
  };

  const hidePanel = () => {
    panel.hidden = true;
    panelAd.replaceChildren();
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
    primaryBtn.focus({ preventScroll: true });
  };

  const showDeathAd = () => {
    const ads = cfg.ads;
    if (!ads.enabled || !ads.deathCode || deaths % Math.max(1, ads.deathEvery) !== 0) return;
    const box = el('div', 'ad-box');
    box.append(el('span', 'ad-label', t('ad')));
    const slot = el('div', 'ad-content');
    box.append(slot);
    panelAd.replaceChildren(box);
    injectHtml(slot, ads.deathCode);
    navigator.sendBeacon?.('/api/event', JSON.stringify({ t: 'ad', s: 'death' }));
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

  const join = () => {
    hidePanel();
    prev = cur = null;
    kills = 0;
    killsLine.textContent = '';
    net.join(opts.nickname, sid, prefs.skin, isTouch ? 'm' : 'd', opts.locale);
  };

  const onMessage = (msg: ServerMessage) => {
    switch (msg.type) {
      case 'joined':
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
        showToast(t('youAte', { name: msg.name }));
        break;
      case 'died': {
        alive = false;
        deaths++;
        sound.death();
        const best = Number(storage.get('best') ?? 0);
        const isBest = msg.score > best;
        if (isBest) storage.set('best', String(msg.score));
        const reason = msg.reason === 'wall' ? t('hitWall') : t('killedBy', { name: msg.killer ?? '?' });
        window.setTimeout(() => {
          if (closed) return;
          const stats = [stat(t('yourLength'), num(msg.score), isBest), stat(isBest ? t('newBest') : t('best'), num(Math.max(best, msg.score)))];
          if (kills > 0) stats.push(stat(t('kills'), num(kills)));
          showPanel(t('died'), reason, t('playAgain'), join, stats);
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

  const onResize = () => renderer.resize();
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
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const snakes = buildSnakes(now);
    const self = snakes.length && snakes[snakes.length - 1].isSelf ? snakes[snakes.length - 1] : null;

    if (self) {
      camX = self.points[0];
      camY = self.points[1];
      const viewSize = Math.max(renderer.width, renderer.height);
      const targetZoom = viewSize / (1100 + snakeRadius(self.mass) * 14);
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

    renderer.draw({
      camX,
      camY,
      scale: zoom,
      arenaW,
      arenaH,
      snakes,
      food: cur?.food ?? new Float32Array(0),
      time: now,
      joystick: controls.joystick,
      selfAlive: !!self,
    });
    renderer.trackFrameTime(now - lastFrame, now);
    lastFrame = now;
  };
  raf = requestAnimationFrame(frame);

  net
    .connect()
    .then(join)
    .catch(() => teardown('connect'));
}
