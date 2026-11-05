import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * A very small, deliberately limited web reader.
 *
 * The browser app asks this module for a page; the module fetches it on the
 * server, rejects private/loopback addresses, strips every script and rewrites
 * links to come back through the reader. It is a reader, not an engine: no
 * JavaScript from remote pages ever runs.
 */

const TIMEOUT_MS = 12_000;
const MAX_BYTES = 2_500_000;
const MAX_REDIRECTS = 5;
const MAX_TEXT = 20_000;
const CACHE_TTL_MS = 3 * 60_000;
const CACHE_MAX = 24;

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  reg: '®',
  trade: '™',
  middot: '·',
  bull: '•',
  euro: '€',
  pound: '£',
  deg: '°',
};

function browserError(message, code, status = 502) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function decodeEntities(value) {
  return String(value).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const key = entity.toLowerCase();
    if (key.startsWith('#')) {
      const code =
        key[1] === 'x' ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[key] ?? match;
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateHost(hostname) {
  const host = String(hostname ?? '')
    .replace(/^\[|\]$/g, '')
    .toLowerCase();

  if (!host) return true;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa')
  ) {
    return true;
  }

  if (net.isIPv4(host)) return isPrivateIpv4(host);

  if (net.isIPv6(host)) {
    if (host === '::' || host === '::1') return true;
    if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(host)) return true;
    const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIpv4(mapped[1]);
    return false;
  }

  return false;
}

async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    throw browserError('That is not a valid web address.', 'bad-url', 400);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw browserError('Only http and https pages can be opened here.', 'bad-protocol', 400);
  }
  if (url.username || url.password) {
    throw browserError('Addresses with a username or password cannot be opened.', 'bad-url', 400);
  }
  if (isPrivateHost(url.hostname)) {
    throw browserError(
      'That address points at this computer or a private network, so the browser will not fetch it.',
      'private-address',
      403,
    );
  }

  if (!net.isIP(url.hostname)) {
    let records;
    try {
      records = await dns.lookup(url.hostname, { all: true, verbatim: true });
    } catch {
      throw browserError(`Could not find “${url.hostname}”. Check the spelling.`, 'dns', 502);
    }
    if (!records.length) {
      throw browserError(`Could not find “${url.hostname}”.`, 'dns', 502);
    }
    if (records.some((record) => isPrivateHost(record.address))) {
      throw browserError(
        'That address resolves to a private network address, so the browser will not fetch it.',
        'private-address',
        403,
      );
    }
  }

  return url;
}

async function fetchPage(rawUrl) {
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url = await assertPublicUrl(current);
    let response;

    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'user-agent': 'AskVerityBrowser/1.0 (local script-free reader)',
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
          'accept-language': 'en',
        },
      });
    } catch (error) {
      const message = String(error?.message ?? '');
      throw /timeout|abort/i.test(message)
        ? browserError('That site took too long to answer.', 'timeout', 504)
        : browserError('That site could not be reached.', 'network', 502);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      try {
        await response.body?.cancel();
      } catch {
        /* already closed */
      }
      if (!location) {
        throw browserError('The site redirected without a destination.', 'redirect', 502);
      }
      current = new URL(location, url).toString();
      continue;
    }

    if (!response.ok) {
      try {
        await response.body?.cancel();
      } catch {
        /* already closed */
      }
      throw browserError(`The site answered with HTTP ${response.status}.`, 'http', 502);
    }

    return { response, finalUrl: url.toString() };
  }

  throw browserError('That address redirected too many times.', 'redirect', 502);
}

async function readCapped(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared && declared > maxBytes) {
    throw browserError('That page is too large to open in this desktop.', 'too-large', 413);
  }

  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        throw browserError('That page is too large to open in this desktop.', 'too-large', 413);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* already closed */
    }
  }

  return Buffer.concat(chunks).toString('utf8');
}

function extractTitle(html, fallback) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match ? decodeEntities(match[1]).replace(/\s+/g, ' ').trim() : '';
  return title || fallback;
}

function extractText(html) {
  const cleaned = html
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(cleaned)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT);
}

function toProxied(href) {
  return `/api/page?url=${encodeURIComponent(href)}`;
}

function sanitizeHtml(html, baseUrl) {
  let output = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/<(iframe|frame|frameset|object|embed|applet|base|template)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(iframe|frame|embed|applet|base)\b[^>]*\/?>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy[^>]*>/gi, '')
    .replace(/<link\b[^>]*rel\s*=\s*["']?(preload|modulepreload|prefetch)["']?[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src|action)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, ' $1="#"');

  output = output.replace(/<a\b([^>]*)>/gi, (match, attrs) => {
    const hrefMatch = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (!hrefMatch) return `<a${attrs}>`;
    const raw = decodeEntities(hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? '');
    let absolute;
    try {
      absolute = new URL(raw, baseUrl);
    } catch {
      return `<a${attrs.replace(hrefMatch[0], '')}>`;
    }
    if (!/^https?:$/.test(absolute.protocol)) {
      return `<a${attrs.replace(hrefMatch[0], '')}>`;
    }
    const clean = attrs.replace(hrefMatch[0], `href="${toProxied(absolute.toString())}"`);
    return `<a${clean} target="_self" rel="noreferrer">`;
  });

  const base = `<base href="${escapeAttr(baseUrl)}"><meta name="referrer" content="no-referrer">`;
  if (/<head[^>]*>/i.test(output)) {
    output = output.replace(/<head[^>]*>/i, (tag) => `${tag}${base}`);
  } else {
    output = `${base}${output}`;
  }

  return output;
}

function wrapPlainText(text, url) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(url)}</title>
  <style>body{font:14px/1.6 "Courier New",monospace;margin:16px;white-space:pre-wrap;color:#111;background:#fff}</style>
  </head><body>${escapeHtml(text)}</body></html>`;
}

export function renderErrorPage({ title = 'Cannot open page', message, detail, url }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  HTML,body{height:100%}
  body{margin:0;display:grid;place-items:center;background:#c0c0c0;font:12px Tahoma,"MS Sans Serif",sans-serif;color:#000}
  .dialog{width:min(420px,92vw);background:#c0c0c0;padding:3px;box-shadow:inset -1px -1px #0a0a0a,inset 1px 1px #fff,inset -2px -2px #808080,inset 2px 2px #dfdfdf}
  .bar{background:linear-gradient(90deg,#000080,#1084d0);color:#fff;font-weight:700;padding:2px 4px;margin-bottom:10px}
  .body{padding:4px 10px 12px;display:flex;gap:12px;align-items:flex-start}
  .icon{width:32px;height:32px;flex:none;display:grid;place-items:center;background:#ff0;border:1px solid #000;font-weight:700;font-size:20px}
  p{margin:0 0 8px;line-height:1.5}
  .url{font-family:"Courier New",monospace;font-size:11px;word-break:break-all;color:#333}
  .actions{display:flex;justify-content:flex-end;gap:6px;padding:0 10px 10px}
  a.button{background:#c0c0c0;color:#000;text-decoration:none;padding:3px 12px;box-shadow:inset -1px -1px #0a0a0a,inset 1px 1px #fff,inset -2px -2px #808080,inset 2px 2px #dfdfdf}
</style></head>
<body><div class="dialog" role="alertdialog" aria-labelledby="t">
  <div class="bar" id="t">${escapeHtml(title)}</div>
  <div class="body"><div class="icon" aria-hidden="true">!</div>
    <div><p>${escapeHtml(message || 'That page could not be opened.')}</p>
    ${detail ? `<p class="url">${escapeHtml(detail)}</p>` : ''}
    ${url ? `<p class="url">${escapeHtml(url)}</p>` : ''}</div>
  </div>
  <div class="actions"><a class="button" href="https://duckduckgo.com/" target="_blank" rel="noreferrer">Open a new page</a></div>
</div></body></html>`;
}

export function createBrowser() {
  const cache = new Map();

  async function readPage(rawUrl, { refresh = false } = {}) {
    let normalized;
    try {
      normalized = new URL(String(rawUrl)).toString();
    } catch {
      throw browserError('That is not a valid web address.', 'bad-url', 400);
    }

    const cached = cache.get(normalized);
    if (!refresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;

    const { response, finalUrl } = await fetchPage(normalized);
    const contentType = String(response.headers.get('content-type') ?? '').toLowerCase();
    const body = await readCapped(response, MAX_BYTES);
    const site = new URL(finalUrl).hostname.replace(/^www\./, '');

    let html;
    let text;

    if (/text\/plain/.test(contentType)) {
      text = body.slice(0, MAX_TEXT);
      html = wrapPlainText(text, finalUrl);
    } else if (/html|xhtml/.test(contentType) || !contentType) {
      html = sanitizeHtml(body, finalUrl);
      text = extractText(html);
    } else {
      throw browserError(
        `That link is ${contentType.split(';')[0] || 'a file'}, not a web page. This desktop browser can only show HTML pages.`,
        'not-html',
        415,
      );
    }

    const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const entry = {
      ok: true,
      url: normalized,
      finalUrl,
      site,
      title: extractTitle(body, site),
      text,
      html,
      wordCount,
      readingMinutes: Math.max(1, Math.round(wordCount / 220)),
      fetchedAt: Date.now(),
    };

    cache.set(normalized, entry);
    while (cache.size > CACHE_MAX) {
      cache.delete(cache.keys().next().value);
    }
    return entry;
  }

  return { readPage, renderErrorPage };
}
