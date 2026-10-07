import './game.css';
import { snakeRadius, type DecodedState, type ServerMessage } from '@snake/shared/protocol';
import { Net } from './net';
import { Controls } from './input';
import { Renderer, type RenderSnake } from './render';
import { translator } from './i18n';
import { storage, sessionId } from '../storage';

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
  const isTouch = matchMedia('(pointer: coarse)').matches;

  const root = el('div', 'game');
  const canvas = el('canvas', 'game-canvas');
  canvas.setAttribute('aria-label', 'Snake Arena');

  const hud = el('div', 'hud');
  const scoreBox = el('div', 'hud-score');
  const scoreLabel = el('span', 'hud-label', t('length'));
  const scoreValue = el('strong', 'hud-value', '0');
  const rankLine = el('span', 'hud-rank');
  scoreBox.append(scoreLabel, scoreValue, rankLine);

  const board = el('div', 'hud-board');
  const boardTitle = el('div', 'hud-board-title', t('leaderboard'));
  const boardList = el('ol', 'hud-board-list');
  board.append(boardTitle, boardList);

  const exitBtn = el('button', 'hud-exit', '✕');
  exitBtn.type = 'button';
  exitBtn.setAttribute('aria-label', t('menu'));

  const boostBtn = el('button', 'boost-btn', '⚡');
  boostBtn.type = 'button';
  boostBtn.setAttribute('aria-label', t('boost'));
  if (!isTouch) boostBtn.hidden = true;

  const hint = el('div', 'hud-hint', isTouch ? t('hintTouch') : t('hintMouse'));

  const status = el('div', 'status', t('connecting'));

  const panel = el('div', 'panel');
  panel.hidden = true;
  const panelTitle = el('h2', 'panel-title');
  const panelText = el('p', 'panel-text');
  const panelStats = el('div', 'panel-stats');
  const panelActions = el('div', 'panel-actions');
  const primaryBtn = el('button', 'btn btn-primary');
  primaryBtn.type = 'button';
  const menuBtn = el('button', 'btn btn-ghost', t('menu'));
  menuBtn.type = 'button';
  panelActions.append(primaryBtn, menuBtn);
  panel.append(panelTitle, panelText, panelStats, panelActions);

  hud.append(scoreBox, board, exitBtn, hint);
  root.append(canvas, hud, boostBtn, status, panel);
  document.body.append(root);
  document.body.classList.add('in-game');

  if (isTouch && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
  }

  const renderer = new Renderer(canvas);
  const controls = new Controls(canvas, boostBtn);
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

  const showStatus = (text: string | null) => {
    status.textContent = text ?? '';
    status.hidden = text === null;
  };

  const hidePanel = () => {
    panel.hidden = true;
  };

  const showPanel = (title: string, text: string, primary: string, onPrimary: () => void, stats?: HTMLElement[]) => {
    panelTitle.textContent = title;
    panelText.textContent = text;
    panelStats.replaceChildren(...(stats ?? []));
    primaryBtn.textContent = primary;
    primaryBtn.onclick = onPrimary;
    panel.hidden = false;
    primaryBtn.focus({ preventScroll: true });
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
    controls.destroy();
    net.close();
    window.removeEventListener('resize', onResize);
    root.remove();
    document.body.classList.remove('in-game');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    opts.onExit(reason);
  };

  const join = () => {
    hidePanel();
    prev = cur = null;
    net.join(opts.nickname, sid);
  };

  const onMessage = (msg: ServerMessage) => {
    switch (msg.type) {
      case 'joined':
        alive = true;
        arenaW = msg.arena.w;
        arenaH = msg.arena.h;
        tickMs = 1000 / msg.tickHz;
        controls.hasInput = false;
        showStatus(null);
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
      case 'died': {
        alive = false;
        const best = Number(storage.get('best') ?? 0);
        const isBest = msg.score > best;
        if (isBest) storage.set('best', String(msg.score));
        const reason = msg.reason === 'wall' ? t('hitWall') : t('killedBy', { name: msg.killer ?? '?' });
        window.setTimeout(() => {
          if (closed) return;
          showPanel(t('died'), reason, t('playAgain'), join, [
            stat(t('yourLength'), num(msg.score), isBest),
            stat(isBest ? t('newBest') : t('best'), num(Math.max(best, msg.score))),
          ]);
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

  const onResize = () => renderer.resize();
  window.addEventListener('resize', onResize);

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
        color: s.color,
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
