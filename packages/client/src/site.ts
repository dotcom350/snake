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

/** Inserts third-party HTML (ad tags) so that its <script> elements actually run. */
export function injectHtml(container: HTMLElement, html: string): void {
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
