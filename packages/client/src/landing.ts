import './landing.css';
import { isValidNickname, normalizeNickname } from '@snake/shared/protocol';
import { storage } from './storage';
import { siteConfig } from './site';
import { loadPrefs, savePrefs } from './prefs';
import { isTelegram, loadTelegram, loadMonetag } from './telegram';

type Locale = 'en' | 'es';

const locale: Locale = document.documentElement.lang === 'es' ? 'es' : 'en';

const stored = storage.get('lang');
if (!stored && locale === 'en' && location.pathname === '/' && !location.search.includes('lang=en')) {
  const prefersSpanish = (navigator.languages ?? [navigator.language]).some((l) => /^es\b/i.test(l));
  // Keep the hash: Telegram passes the Mini App launch data there.
  if (prefersSpanish) location.replace(`/es/${location.search}${location.hash}`);
}

const inTelegram = isTelegram();
if (inTelegram) {
  document.documentElement.classList.add('tg');
  void loadTelegram().then((app) => {
    if (!app) return;
    app.ready();
    app.expand();
    app.setHeaderColor?.('#070a14');
    app.setBackgroundColor?.('#070a14');
    app.setBottomBarColor?.('#070a14');
    // Stops the "swipe down to close" gesture from fighting with the joystick.
    app.disableVerticalSwipes?.();
    const ads = siteConfig().ads;
    if (ads.tgZone) {
      void loadMonetag(ads.tgZone).then((show) => {
        // Monetag In-App Interstitial: the SDK schedules these ads by itself.
        if (show && ads.tgInApp) show({ type: 'inApp', inAppSettings: ads.tgInApp }).catch(() => undefined);
      });
    }
    const user = app.initDataUnsafe.user;
    if (!storage.get('lang') && locale === 'en' && location.pathname === '/' && /^es/i.test(user?.language_code ?? '')) {
      location.replace(`/es/${location.search}${location.hash}`);
      return;
    }
    const input = document.getElementById('nickname') as HTMLInputElement | null;
    if (input && !input.value) {
      const name = normalizeNickname((user?.first_name || user?.username || '').replace(/[^\p{L}\p{N} _.-]/gu, ''));
      if (isValidNickname(name)) input.value = name;
    }
  });
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
  const carousel = picker.querySelector<HTMLDivElement>('.carousel')!;
  const cards = Array.from(picker.querySelectorAll<HTMLDivElement>('.cv-card'));
  const canvases = cards.map((c) => c.querySelector('canvas')!);
  const name = picker.querySelector<HTMLSpanElement>('.skin-name')!;
  const counter = picker.querySelector<HTMLSpanElement>('.skin-dots');
  const prefs = loadPrefs();
  const n = choices.length;
  const wrap = (k: number) => ((k % n) + n) % n;

  // `pos` is continuous: it follows the finger while dragging and eases to an integer afterwards.
  let pos = Math.max(0, choices.findIndex((c) => c.i === prefs.skin));
  let target = pos;
  let selected = -1;

  const commit = () => {
    const idx = wrap(Math.round(target));
    if (idx === selected) return;
    selected = idx;
    name.textContent = choices[idx].s.name;
    if (counter) counter.textContent = `${idx + 1} / ${n}`;
    prefs.skin = choices[idx].i;
    savePrefs(prefs);
  };
  commit();
  picker.hidden = false;

  let dragging = false;
  let startX = 0;
  let startPos = 0;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0;
  let moved = 0;

  const cardWidth = () => carousel.clientWidth * 0.42;

  carousel.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = 0;
    startX = lastX = e.clientX;
    lastT = performance.now();
    startPos = pos;
    velocity = 0;
    carousel.setPointerCapture(e.pointerId);
    carousel.classList.add('dragging');
  });
  carousel.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const now = performance.now();
    const dx = e.clientX - startX;
    moved = Math.max(moved, Math.abs(dx));
    pos = startPos - dx / cardWidth();
    target = pos;
    velocity = (-(e.clientX - lastX) / cardWidth()) / Math.max(1, now - lastT);
    lastX = e.clientX;
    lastT = now;
    commit();
  });
  const release = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    carousel.classList.remove('dragging');
    if (moved < 6) {
      // A tap on a side card brings it to the centre.
      const rect = carousel.getBoundingClientRect();
      const rel = (e.clientX - rect.left) / rect.width - 0.5;
      target = Math.round(pos) + (rel > 0.22 ? 1 : rel < -0.22 ? -1 : 0);
    } else {
      target = Math.round(pos + Math.max(-3, Math.min(3, velocity * 220)));
    }
    commit();
  };
  carousel.addEventListener('pointerup', release);
  carousel.addEventListener('pointercancel', release);
  carousel.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      target = Math.round(target) + (e.key === 'ArrowRight' ? 1 : -1);
      commit();
    }
  });
  carousel.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
      e.preventDefault();
      target = Math.round(target + Math.sign(e.deltaX));
      commit();
    },
    { passive: false }
  );

  let frame = 0;
  let last = performance.now();
  const animate = (time: number) => {
    requestAnimationFrame(animate);
    if (document.hidden || document.body.classList.contains('in-game')) return;
    const dt = Math.min(0.05, (time - last) / 1000);
    last = time;
    if (!dragging) pos += (target - pos) * Math.min(1, dt * 10);

    const base = Math.round(pos);
    cards.forEach((card, i) => {
      const slot = i - 2;
      const d = base + slot - pos;
      const a = Math.abs(d);
      const bob = slot === 0 ? Math.sin(time / 520) * 5 * Math.max(0, 1 - a * 2) : 0;
      card.style.transform = `translateX(${d * 62}%) translateY(${bob}px) translateZ(${-a * 140}px) rotateY(${-d * 32}deg) scale(${1 - Math.min(a, 2) * 0.12})`;
      card.style.opacity = String(Math.max(0, 1 - a * 0.38));
      card.style.zIndex = String(10 - Math.round(a * 2));
      card.classList.toggle('center', a < 0.5);
      // Centre card every frame, the others every other frame.
      if (a < 0.5 || frame % 2 === 0) drawSkinPreview(canvases[i], choices[wrap(base + slot)].s, time);
    });
    frame++;
  };
  requestAnimationFrame(animate);
}

void initSkinPicker();

// ?adtest=1 marks the landing ad space so the admin can see where it appears.
if (/[?&]adtest=1/.test(location.search) && !document.querySelector('.ad-landing')) {
  const label = locale === 'es' ? 'Publicidad' : 'Advertisement';
  const band = document.createElement('section');
  band.className = 'ad-band';
  const slot = document.createElement('div');
  slot.className = 'ad-slot ad-landing';
  slot.dataset.label = label;
  const preview = document.createElement('div');
  preview.className = 'ad-preview';
  preview.textContent = `${label} · landing · 728×90`;
  slot.append(preview);
  band.append(slot);
  document.querySelector('.hero')?.after(band);
}

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
