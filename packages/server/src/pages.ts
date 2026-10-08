import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { brotliCompressSync, gzipSync, constants as zlib } from 'zlib';
import { toPublicConfig, sanitizeMetaTags } from '@snake/shared';
import { config } from './config.js';
import { settings, settingsVersion } from './settings.js';
import { stats } from './stats.js';

const PUBLIC_PAGES: Record<string, { file: string; lang: string }> = {
  '/': { file: 'index.html', lang: 'en' },
  '/es/': { file: 'es/index.html', lang: 'es' },
};

const COLOR = /^#[0-9a-fA-F]{6}$/;

function siteOrigin(request: FastifyRequest): string {
  if (config.env.SITE_URL) return config.env.SITE_URL.replace(/\/+$/, '');
  const host = request.host.replace(/[^A-Za-z0-9.:\-[\]]/g, '');
  return `${request.protocol}://${host}`;
}

function publicCsp(nonce: string, adsOn: boolean): string {
  const ext = adsOn ? ' https:' : '';
  return [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'self' https: 'unsafe-inline'`,
    `style-src 'self' 'unsafe-inline'${ext}`,
    `img-src 'self' data:${ext}`,
    `font-src 'self' data:${ext}`,
    `connect-src 'self' ws: wss:${ext}`,
    `media-src 'self' blob:${ext}`,
    `frame-src ${adsOn ? 'https:' : "'none'"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
  ].join('; ');
}

function jsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function send(request: FastifyRequest, reply: FastifyReply, html: string) {
  const accept = String(request.headers['accept-encoding'] ?? '');
  reply.header('Content-Type', 'text/html; charset=utf-8').header('Vary', 'Accept-Encoding').header('Cache-Control', 'no-cache');
  const raw = Buffer.from(html);
  if (/\bbr\b/.test(accept)) {
    return reply.header('Content-Encoding', 'br').send(brotliCompressSync(raw, { params: { [zlib.BROTLI_PARAM_QUALITY]: 5 } }));
  }
  if (/\bgzip\b/.test(accept)) return reply.header('Content-Encoding', 'gzip').send(gzipSync(raw, { level: 6 }));
  return reply.send(raw);
}

export async function registerPages(fastify: FastifyInstance, publicDir: string): Promise<void> {
  const read = (file: string) => {
    const full = path.join(publicDir, file);
    return existsSync(full) ? readFileSync(full, 'utf8') : null;
  };
  const templates = new Map<string, string>();
  for (const [route, page] of Object.entries(PUBLIC_PAGES)) {
    const tpl = read(page.file);
    if (tpl) templates.set(route, tpl);
  }
  const adminHtml = read('admin/index.html');

  const cache = new Map<string, string>();
  const render = (route: string, origin: string): string | null => {
    const key = `${settingsVersion()}|${origin}|${route}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const tpl = templates.get(route);
    if (!tpl) return null;

    const s = settings();
    const a = s.appearance;
    const vars = [
      COLOR.test(a.landingAccent) ? `--accent:${a.landingAccent}` : '',
      COLOR.test(a.landingAccent2) ? `--accent-2:${a.landingAccent2}` : '',
      COLOR.test(a.landingBackground) ? `--bg:${a.landingBackground}` : '',
    ]
      .filter(Boolean)
      .join(';');
    const adsOn = s.ads.enabled;
    const head =
      sanitizeMetaTags(s.ads.verifyTags) +
      `<style>:root{${vars}}</style>` +
      `<script type="application/json" id="site-config">${jsonForHtml(toPublicConfig(s))}</script>` +
      (adsOn && s.ads.headCode ? s.ads.headCode : '');

    let html = tpl.replaceAll('%SITE_URL%', origin).replace('</head>', `${head}</head>`);
    const adLabel = PUBLIC_PAGES[route]?.lang === 'es' ? 'Publicidad' : 'Advertisement';
    html = html.replace(
      '<!--AD_LANDING-->',
      adsOn && s.ads.landingCode
        ? `<section class="ad-band" aria-label="${adLabel}"><div class="ad-slot ad-landing" data-label="${adLabel}">${s.ads.landingCode}</div></section>`
        : ''
    );
    if (cache.size > 32) cache.clear();
    cache.set(key, html);
    return html;
  };

  for (const [route, page] of Object.entries(PUBLIC_PAGES)) {
    fastify.get(route, async (request, reply) => {
      const html = render(route, siteOrigin(request));
      if (!html) return reply.code(503).send('Client not built');
      const s = settings();
      stats.pageview(request, page.lang);
      if (s.ads.enabled && s.ads.landingCode) stats.inc('ad_impression', 'landing');
      const nonce = randomBytes(16).toString('base64');
      reply.header('Content-Security-Policy', publicCsp(nonce, s.ads.enabled || !!s.ads.tgZone));
      // X-Frame-Options can't list Telegram; the CSP frame-ancestors above replaces it.
      reply.removeHeader('X-Frame-Options');
      return send(request, reply, html.replaceAll('<script', `<script nonce="${nonce}"`));
    });
  }

  fastify.get('/admin', async (request, reply) => {
    if (!adminHtml) return reply.code(503).send('Admin not built');
    reply.header('X-Robots-Tag', 'noindex, nofollow').header('Referrer-Policy', 'no-referrer');
    return send(request, reply, adminHtml);
  });
  fastify.get('/admin/', async (_request, reply) => reply.redirect('/admin', 301));

  fastify.get('/es', async (_request, reply) => reply.redirect('/es/', 301));
  fastify.get('/index.html', async (_request, reply) => reply.redirect('/', 301));

  // Files the ad network asks to place at the site root (e.g. Monetag's sw.js for push ads).
  const ROOT_TYPES: Record<string, string> = {
    js: 'application/javascript; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
    xml: 'application/xml; charset=utf-8',
    json: 'application/json; charset=utf-8',
  };
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return;
    const path = request.url.split('?')[0];
    if (path.indexOf('/', 1) !== -1 || path.length < 4) return;
    const file = settings().ads.rootFiles.find((f) => `/${f.name}` === path);
    if (!file) return;
    const ext = file.name.split('.').pop() ?? 'txt';
    return reply
      .header('Content-Type', ROOT_TYPES[ext] ?? 'text/plain; charset=utf-8')
      .header('Cache-Control', 'public, max-age=300')
      .send(file.content);
  });

  fastify.get('/ads.txt', async (_request, reply) => {
    const txt = settings().ads.adsTxt.trim();
    if (!txt) return reply.code(404).type('text/plain').send('');
    return reply.type('text/plain; charset=utf-8').header('Cache-Control', 'public, max-age=3600').send(`${txt}\n`);
  });

  const eventHits = new Map<string, { n: number; reset: number }>();
  fastify.post('/api/event', async (request, reply) => {
    const now = Date.now();
    const hit = eventHits.get(request.ip);
    if (hit && hit.reset > now && hit.n >= 30) return reply.code(429).send();
    if (!hit || hit.reset <= now) eventHits.set(request.ip, { n: 1, reset: now + 60_000 });
    else hit.n++;
    if (eventHits.size > 20_000) eventHits.clear();

    let body = request.body as { t?: unknown; s?: unknown } | string | undefined;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body) as { t?: unknown; s?: unknown };
      } catch {
        body = undefined;
      }
    }
    if (body && typeof body === 'object' && body.t === 'ad' && (body.s === 'death' || body.s === 'landing' || body.s === 'revive')) {
      stats.inc('ad_impression', body.s);
    }
    return reply.code(204).send();
  });

  fastify.get('/robots.txt', async (request, reply) => {
    reply.header('Content-Type', 'text/plain; charset=utf-8').header('Cache-Control', 'public, max-age=86400');
    return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\n\nSitemap: ${siteOrigin(request)}/sitemap.xml\n`;
  });

  fastify.get('/sitemap.xml', async (request, reply) => {
    const o = siteOrigin(request);
    const alt = `<xhtml:link rel="alternate" hreflang="en" href="${o}/"/><xhtml:link rel="alternate" hreflang="es" href="${o}/es/"/><xhtml:link rel="alternate" hreflang="x-default" href="${o}/"/>`;
    reply.header('Content-Type', 'application/xml; charset=utf-8').header('Cache-Control', 'public, max-age=86400');
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
<url><loc>${o}/</loc>${alt}<changefreq>weekly</changefreq><priority>1.0</priority></url>
<url><loc>${o}/es/</loc>${alt}<changefreq>weekly</changefreq><priority>1.0</priority></url>
</urlset>
`;
  });

  fastify.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api/') && request.headers.accept?.includes('text/html')) {
      return reply.redirect('/', 302);
    }
    return reply.code(404).send({ error: 'NOT_FOUND' });
  });
}
