import './landing.css';
import { isValidNickname, normalizeNickname } from '@snake/shared/protocol';
import { storage } from './storage';
import { siteConfig } from './site';
import { loadPrefs, savePrefs } from './prefs';

type Locale = 'en' | 'es';

const locale: Locale = document.documentElement.lang === 'es' ? 'es' : 'en';

const stored = storage.get('lang');
if (!stored && locale === 'en' && location.pathname === '/' && !location.search.includes('lang=en')) {
  const prefersSpanish = (navigator.languages ?? [navigator.language]).some((l) => /^es\b/i.test(l));
  if (prefersSpanish) location.replace('/es/');
}

for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-lang]')) {
  link.addEventListener('click', () => storage.set('lang', link.dataset.lang ?? 'en'));
}

const form = document.getElementById('play-form') as HTMLFormElement;
const input = document.getElementById('nickname') as HTMLInputElement;
const errorEl = document.getElementById('form-error') as HTMLParagraphElement;
const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;

input.value = storage.get('nickname') ?? '';

let gameModule: Promise<typeof import('./game/main')> | null = null;
const loadGame = () => (gameModule ??= import('./game/main'));

input.addEventListener('focus', loadGame, { once: true });
input.addEventListener('input', () => {
  errorEl.hidden = true;
});

function showError(message: string): void {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const nickname = normalizeNickname(input.value);
  if (!isValidNickname(nickname)) {
    showError(form.dataset.errNickname ?? '');
    input.focus();
    return;
  }
  storage.set('nickname', nickname);
  errorEl.hidden = true;
  button.setAttribute('aria-busy', 'true');

  try {
    const { startGame } = await loadGame();
    startGame({
      nickname,
      locale,
      onExit(reason) {
        button.removeAttribute('aria-busy');
        if (reason === 'connect') showError(form.dataset.errConnect ?? '');
        else if (reason === 'full') showError(form.dataset.errFull ?? '');
        else if (reason === 'nickname') showError(form.dataset.errNickname ?? '');
      },
    });
  } catch {
    button.removeAttribute('aria-busy');
    gameModule = null;
    showError(form.dataset.errConnect ?? '');
  }
});

async function initSkinPicker(): Promise<void> {
  const picker = document.getElementById('skin-picker');
  if (!picker) return;
  const skins = siteConfig().appearance.skins;
  const choices = skins.map((s, i) => ({ s, i })).filter((x) => x.s.enabled);
  if (!choices.length) return;
  const { drawSkinPreview } = await import('./game/skins');
  const stage = picker.querySelector<HTMLDivElement>('.carousel-stage')!;
  const main = picker.querySelector<HTMLCanvasElement>('.c-main')!;
  const prevC = picker.querySelector<HTMLCanvasElement>('.c-prev')!;
  const nextC = picker.querySelector<HTMLCanvasElement>('.c-next')!;
  const name = picker.querySelector<HTMLSpanElement>('.skin-name')!;
  const dots = picker.querySelector<HTMLSpanElement>('.skin-dots');
  const prefs = loadPrefs();
  let pos = Math.max(0, choices.findIndex((c) => c.i === prefs.skin));
  const at = (k: number) => choices[(k + choices.length) % choices.length].s;

  const select = (next: number, dir = 0) => {
    pos = (next + choices.length) % choices.length;
    name.textContent = choices[pos].s.name;
    prefs.skin = choices[pos].i;
    savePrefs(prefs);
    if (dots) dots.textContent = `${pos + 1} / ${choices.length}`;
    if (dir) {
      stage.classList.remove('slide-left', 'slide-right');
      void stage.offsetWidth;
      stage.classList.add(dir > 0 ? 'slide-left' : 'slide-right');
    }
  };
  for (const b of picker.querySelectorAll<HTMLButtonElement>('.skin-nav')) {
    b.addEventListener('click', () => select(pos + Number(b.dataset.dir), Number(b.dataset.dir)));
  }
  prevC.addEventListener('click', () => select(pos - 1, -1));
  nextC.addEventListener('click', () => select(pos + 1, 1));
  let startX = 0;
  stage.addEventListener('pointerdown', (e) => (startX = e.clientX));
  stage.addEventListener('pointerup', (e) => {
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 30) select(pos + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  });
  select(pos);
  picker.hidden = false;

  let frame = 0;
  const animate = (time: number) => {
    requestAnimationFrame(animate);
    if (document.hidden || document.body.classList.contains('in-game')) return;
    drawSkinPreview(main, at(pos), time);
    // Side snakes are smaller and less important: redraw them at half the rate.
    if (frame++ % 2 === 0) {
      drawSkinPreview(prevC, at(pos - 1), time);
      drawSkinPreview(nextC, at(pos + 1), time);
    }
  };
  requestAnimationFrame(animate);
}

void initSkinPicker();

async function showOnlineCount(): Promise<void> {
  const el = document.getElementById('online');
  if (!el) return;
  try {
    const res = await fetch('/api/metrics', { cache: 'no-store' });
    const data = (await res.json()) as { humanPlayers?: number };
    const n = data.humanPlayers ?? 0;
    if (n > 0) {
      el.querySelector('b')!.textContent = (el.dataset.text ?? '{n}').replace('{n}', new Intl.NumberFormat(locale).format(n));
      el.hidden = false;
    }
  } catch {
    // Offline or blocked: just don't show the counter.
  }
}

const whenIdle = (cb: () => void) =>
  'requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 3000 }) : setTimeout(cb, 1500);

window.addEventListener('load', () => {
  whenIdle(() => {
    loadGame();
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const canvas = document.querySelector<HTMLCanvasElement>('.hero-bg');
    if (canvas && !saveData) void import('./hero-bg').then((m) => m.startHeroBackground(canvas, reduceMotion));
    void showOnlineCount();
  });
});
