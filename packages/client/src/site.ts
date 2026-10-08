import { DEFAULT_SETTINGS, toPublicConfig, type PublicConfig } from '@snake/shared/site-config';

let cached: PublicConfig | null = null;

export function siteConfig(): PublicConfig {
  if (cached) return cached;
  const el = document.getElementById('site-config');
  try {
    cached = el?.textContent ? (JSON.parse(el.textContent) as PublicConfig) : toPublicConfig(DEFAULT_SETTINGS);
  } catch {
    cached = toPublicConfig(DEFAULT_SETTINGS);
  }
  return cached;
}

/** Nonce of the page's own scripts; needed to run ad code injected later. */
export function pageNonce(): string {
  return document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce ?? '';
}

/** ?addebug=1 shows an on-screen log of what happens with each ad. */
const adDebug = /[?&]addebug=1\b/.test(location.search);
let adLogBox: HTMLElement | null = null;

export function adLog(message: string): void {
  if (!adDebug) return;
  if (!adLogBox) {
    adLogBox = document.createElement('pre');
    adLogBox.style.cssText =
      'position:fixed;left:6px;right:6px;bottom:6px;z-index:2147483647;max-height:35vh;overflow:auto;margin:0;padding:8px;' +
      'background:rgba(0,0,0,.85);color:#7CFC9A;font:11px/1.4 monospace;border-radius:8px;pointer-events:none;white-space:pre-wrap';
    document.body.append(adLogBox);
  }
  const time = new Date().toLocaleTimeString();
  adLogBox.textContent = `${time} ${message}\n${adLogBox.textContent ?? ''}`.slice(0, 4000);
}

/** Finds a Monetag SDK zone in an ad code (show_123…() calls or the libtl.com SDK tag). */
export function monetagZoneIn(code: string): string | null {
  const m = code.match(/show_(\d{4,})/) ?? code.match(/libtl\.com[^>]*data-zone=['"](\d{4,})['"]/) ?? code.match(/data-zone=['"](\d{4,})['"][^>]*libtl/);
  return m ? m[1] : null;
}

/** True when an ad code only drives Monetag's SDK; the game calls the SDK itself instead of running it. */
export function isMonetagSdkCode(code: string): boolean {
  return /show_\d{4,}\s*\(/.test(code) || (/libtl\.com/.test(code) && !/<(?!script)[a-z]/i.test(code));
}

/** Inserts third-party HTML (ad tags) so that its <script> elements actually run. */
export function injectHtml(container: HTMLElement, html: string): void {
  // Plain JavaScript pasted without <script> tags is treated as a script.
  if (html.trim() && !/<[a-z!]/i.test(html)) html = `<script>${html}</script>`;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const nonce = pageNonce();
  for (const old of Array.from(tpl.content.querySelectorAll('script'))) {
    const script = document.createElement('script');
    for (const attr of Array.from(old.attributes)) script.setAttribute(attr.name, attr.value);
    if (nonce) script.nonce = nonce;
    script.text = old.text;
    old.replaceWith(script);
  }
  container.replaceChildren(tpl.content);
}
