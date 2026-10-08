import { pageNonce } from './site';

/** The small part of Telegram.WebApp this game uses. */
export interface TelegramWebApp {
  version: string;
  platform: string;
  initData: string;
  initDataUnsafe: { user?: { first_name?: string; username?: string; language_code?: string } };
  ready(): void;
  expand(): void;
  isVersionAtLeast(v: string): boolean;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  disableVerticalSwipes?(): void;
  enableVerticalSwipes?(): void;
  enableClosingConfirmation?(): void;
  disableClosingConfirmation?(): void;
  requestFullscreen?(): void;
  exitFullscreen?(): void;
  isFullscreen?: boolean;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
    TelegramWebviewProxy?: unknown;
  }
}

/** True when the page was opened as a Telegram Mini App (checked without loading Telegram's script). */
export function isTelegram(): boolean {
  try {
    if (/tgWebApp(Data|Version|Platform)=/.test(location.hash)) return true;
    if (sessionStorage.getItem('__telegram__initParams')) return true;
  } catch {
    // Storage blocked: fall through.
  }
  return !!window.TelegramWebviewProxy || !!window.Telegram?.WebApp?.initData;
}

function loadScript(src: string, attrs: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    const nonce = pageNonce();
    if (nonce) s.nonce = nonce;
    s.src = src;
    s.async = true;
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.append(s);
  });
}

let telegramLoad: Promise<TelegramWebApp | null> | null = null;

/** Loads telegram-web-app.js only inside Telegram, so normal visitors don't pay for it. */
export function loadTelegram(): Promise<TelegramWebApp | null> {
  if (!isTelegram()) return Promise.resolve(null);
  telegramLoad ??= loadScript('https://telegram.org/js/telegram-web-app.js')
    .then(() => window.Telegram?.WebApp ?? null)
    .catch(() => null);
  return telegramLoad;
}

/** Synchronous access once loadTelegram() has resolved. */
export function telegram(): TelegramWebApp | null {
  return isTelegram() ? (window.Telegram?.WebApp ?? null) : null;
}

export function tgAtLeast(app: TelegramWebApp, version: string): boolean {
  try {
    return app.isVersionAtLeast(version);
  } catch {
    return false;
  }
}

/** Waits for a promise but gives up after `ms`; Monetag's SDK may never settle when it has no ad. */
export function settle(p: Promise<unknown>, ms: number): Promise<'ok' | 'error' | 'timeout'> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), ms);
    p.then(
      () => {
        clearTimeout(timer);
        resolve('ok');
      },
      () => {
        clearTimeout(timer);
        resolve('error');
      }
    );
  });
}

/** Monetag's Telegram SDK exposes a global show_<zone>() that resolves once the ad has been watched. */
export type MonetagShow = (options?: Record<string, unknown> | string) => Promise<unknown>;

let monetagLoad: Promise<MonetagShow | null> | null = null;

export function loadMonetag(zone: string): Promise<MonetagShow | null> {
  if (!zone || !/^\d+$/.test(zone)) return Promise.resolve(null);
  const fn = `show_${zone}`;
  monetagLoad ??= loadScript('https://libtl.com/sdk.js', { 'data-zone': zone, 'data-sdk': fn })
    .then(() => {
      const show = (window as unknown as Record<string, unknown>)[fn];
      return typeof show === 'function' ? (show as MonetagShow) : null;
    })
    .catch(() => null);
  return monetagLoad;
}
