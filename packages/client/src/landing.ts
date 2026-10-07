import './landing.css';
import { isValidNickname, normalizeNickname } from '@snake/shared/protocol';
import { storage } from './storage';

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

const whenIdle = (cb: () => void) =>
  'requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 3000 }) : setTimeout(cb, 1500);

window.addEventListener('load', () => {
  whenIdle(() => {
    loadGame();
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const canvas = document.querySelector<HTMLCanvasElement>('.hero-bg');
    if (canvas && !reduceMotion && !saveData) void import('./hero-bg').then((m) => m.startHeroBackground(canvas));
  });
});
