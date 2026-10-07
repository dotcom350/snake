import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { brotliCompressSync, gzipSync, constants as zlib } from 'zlib';
import { config } from './config.js';

interface Rendered {
  raw: Buffer;
  br: Buffer;
  gz: Buffer;
}

const PAGES: Record<string, string> = {
  '/': 'index.html',
  '/es/': 'es/index.html',
};

function siteOrigin(request: FastifyRequest): string {
  if (config.env.SITE_URL) return config.env.SITE_URL.replace(/\/+$/, '');
  const host = request.host.replace(/[^A-Za-z0-9.:\-[\]]/g, '');
  return `${request.protocol}://${host}`;
}

export async function registerPages(fastify: FastifyInstance, publicDir: string): Promise<void> {
  const templates = new Map<string, string>();
  for (const [route, file] of Object.entries(PAGES)) {
    const full = path.join(publicDir, file);
    if (existsSync(full)) templates.set(route, readFileSync(full, 'utf8'));
  }

  const cache = new Map<string, Rendered>();
  const render = (route: string, origin: string): Rendered | null => {
    const key = `${origin}${route}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const tpl = templates.get(route);
    if (!tpl) return null;
    const raw = Buffer.from(tpl.replaceAll('%SITE_URL%', origin));
    const out: Rendered = {
      raw,
      br: brotliCompressSync(raw, { params: { [zlib.BROTLI_PARAM_QUALITY]: 11 } }),
      gz: gzipSync(raw, { level: 9 }),
    };
    if (cache.size > 16) cache.clear();
    cache.set(key, out);
    return out;
  };

  const sendCompressed = (request: FastifyRequest, reply: FastifyReply, body: Rendered, type: string) => {
    const accept = String(request.headers['accept-encoding'] ?? '');
    reply.header('Content-Type', type).header('Vary', 'Accept-Encoding');
    if (/\bbr\b/.test(accept)) return reply.header('Content-Encoding', 'br').send(body.br);
    if (/\bgzip\b/.test(accept)) return reply.header('Content-Encoding', 'gzip').send(body.gz);
    return reply.send(body.raw);
  };

  for (const route of Object.keys(PAGES)) {
    fastify.get(route, async (request, reply) => {
      const page = render(route, siteOrigin(request));
      if (!page) return reply.code(503).send('Client not built');
      reply.header('Cache-Control', 'no-cache');
      return sendCompressed(request, reply, page, 'text/html; charset=utf-8');
    });
  }

  fastify.get('/es', async (_request, reply) => reply.redirect('/es/', 301));
  fastify.get('/index.html', async (_request, reply) => reply.redirect('/', 301));

  fastify.get('/robots.txt', async (request, reply) => {
    reply.header('Content-Type', 'text/plain; charset=utf-8').header('Cache-Control', 'public, max-age=86400');
    return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${siteOrigin(request)}/sitemap.xml\n`;
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
