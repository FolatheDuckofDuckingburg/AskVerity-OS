import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.js';
import { createAssistant, normalizeMessages } from './ai-provider.js';
import { createBrowser } from './browser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

loadEnv(path.join(ROOT, '.env'));

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10) || 3000;
const HOST = process.env.HOST ?? '0.0.0.0';
const MAX_BODY_BYTES = 128 * 1024;
const HEARTBEAT_MS = 15_000;

const assistant = createAssistant(process.env);
const browser = createBrowser();

const PAGE_CSP = [
  "default-src 'self' http: https: data: blob:",
  "script-src 'none'",
  "style-src 'unsafe-inline' http: https: data:",
  "img-src http: https: data: blob:",
  "font-src http: https: data:",
  "media-src http: https:",
  "object-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri http: https:",
  "frame-ancestors 'self'",
].join('; ');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self'",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors *",
  ].join('; '),
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
  });
  res.end(body);
}

function resolvePublicPath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null; // malformed percent-encoding
  }
  if (decoded.includes('\0')) return null;

  const relative = decoded.replace(/^\/+/, '') || 'index.html';
  const resolved = path.resolve(PUBLIC_DIR, relative);
  if (resolved !== PUBLIC_DIR && !resolved.startsWith(PUBLIC_DIR + path.sep)) return null;
  return resolved;
}

async function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', ...SECURITY_HEADERS });
    res.end('Method not allowed');
    return;
  }

  let filePath = resolvePublicPath(new URL(req.url, 'http://localhost').pathname);
  if (!filePath) {
    res.writeHead(400, SECURITY_HEADERS);
    res.end('Bad request');
    return;
  }

  try {
    let info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      info = await stat(filePath);
    }
    if (!info.isFile()) throw new Error('not a file');

    const data = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();

    res.writeHead(200, {
      'Content-Type': MIME_TYPES[extension] ?? 'application/octet-stream',
      'Content-Length': data.length,
      // Local prototype: always revalidate so edits show up on reload.
      'Cache-Control': 'no-cache',
      ...SECURITY_HEADERS,
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
      ...SECURITY_HEADERS,
    });
    res.end('Not found');
  }
}

function readJsonBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('That request was not valid JSON.'), { statusCode: 400 }));
      }
    });

    req.on('error', reject);
  });
}

function sseSend(res, event, data) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function handleChat(req, res) {
  let body;
  try {
    body = await readJsonBody(req, MAX_BODY_BYTES);
  } catch (error) {
    sendJson(res, error.statusCode ?? 400, { error: error.message });
    return;
  }

  const messages = normalizeMessages(body?.messages);
  if (!messages.length) {
    sendJson(res, 400, { error: 'Send a message first.' });
    return;
  }

  const personality = ['warm', 'balanced', 'focused'].includes(body?.personality)
    ? body.personality
    : 'balanced';

  const page = body?.page && typeof body.page === 'object'
    ? {
        title: String(body.page.title ?? '').slice(0, 200),
        url: String(body.page.url ?? '').slice(0, 500),
        text: String(body.page.text ?? '').slice(0, 12_000),
      }
    : null;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...SECURITY_HEADERS,
  });
  res.write('retry: 4000\n\n');

  const controller = new AbortController();
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': keep-alive\n\n');
  }, HEARTBEAT_MS);

  let closedByClient = false;
  req.on('close', () => {
    if (!res.writableEnded) {
      closedByClient = true;
      controller.abort();
    }
  });

  try {
    for await (const event of assistant.chat({
      messages,
      personality,
      page,
      signal: controller.signal,
    })) {
      if (res.writableEnded) break;
      if (event.type === 'delta') {
        sseSend(res, 'delta', { text: event.text });
      } else if (event.type === 'meta') {
        sseSend(res, 'meta', event);
      } else if (event.type === 'done') {
        sseSend(res, 'done', event);
      } else if (event.type === 'error') {
        sseSend(res, 'error', { message: event.message });
      }
    }
  } catch (error) {
    if (!closedByClient) {
      sseSend(res, 'error', {
        message: 'Verity hit an unexpected problem answering that. Please try again.',
      });
      console.error('[askverity] chat error:', error);
    }
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
  }
}

async function handleStatus(res, refresh) {
  try {
    const info = await assistant.status();
    sendJson(res, 200, { ...info, refreshed: Boolean(refresh) });
  } catch (error) {
    sendJson(res, 500, {
      error: 'Could not read the assistant status.',
      detail: String(error?.message ?? error),
    });
  }
}

async function handlePageRequest(pathname, url, res) {
  const target = url.searchParams.get('url');

  if (!target) {
    if (pathname === '/api/read') {
      sendJson(res, 400, { ok: false, error: 'Give the browser an address to open.', code: 'missing-url' });
    } else {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS });
      res.end(browser.renderErrorPage({ message: 'Give the browser an address to open.' }));
    }
    return;
  }

  try {
    const page = await browser.readPage(target, { refresh: url.searchParams.get('refresh') === '1' });

    if (pathname === '/api/read') {
      sendJson(res, 200, {
        ok: true,
        url: page.url,
        finalUrl: page.finalUrl,
        site: page.site,
        title: page.title,
        text: page.text,
        wordCount: page.wordCount,
        readingMinutes: page.readingMinutes,
        fetchedAt: page.fetchedAt,
      });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(page.html),
      'Cache-Control': 'no-store',
      'Content-Security-Policy': PAGE_CSP,
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(page.html);
  } catch (error) {
    const status = Number(error?.status) || 502;
    const message = String(error?.message ?? 'That page could not be opened.');

    if (pathname === '/api/read') {
      sendJson(res, status, { ok: false, error: message, code: error?.code ?? 'failed' });
      return;
    }

    const html = browser.renderErrorPage({ message, detail: target, url: target });
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html),
      'Cache-Control': 'no-store',
      'Content-Security-Policy': PAGE_CSP,
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(html);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const { pathname } = url;

  try {
    if (pathname === '/api/status') {
      if (req.method !== 'GET') {
        res.writeHead(405, { Allow: 'GET', ...SECURITY_HEADERS });
        res.end();
        return;
      }
      await handleStatus(res, url.searchParams.has('refresh'));
      return;
    }

    if (pathname === '/api/chat') {
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST', ...SECURITY_HEADERS });
        res.end();
        return;
      }
      await handleChat(req, res);
      return;
    }

    if (pathname === '/api/read' || pathname === '/api/page') {
      if (req.method !== 'GET') {
        res.writeHead(405, { Allow: 'GET', ...SECURITY_HEADERS });
        res.end();
        return;
      }
      await handlePageRequest(pathname, url, res);
      return;
    }

    if (pathname === '/api/health') {
      sendJson(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
      return;
    }

    if (pathname.startsWith('/api/')) {
      sendJson(res, 404, { error: 'Unknown endpoint.' });
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    console.error('[askverity] request failed:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
    }
    res.end('Something went wrong on the server.');
  }
});

server.listen(PORT, HOST, () => {
  const provider =
    assistant.providerId === 'mock'
      ? 'demo brain (no model configured)'
      : `Ollama at ${process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434'} · model ${assistant.model}`;
  console.log('');
  console.log('  AskVerity OS is running');
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  AI provider: ${provider}`);
  console.log('  If the model is offline, Verity falls back to demo mode and says so.');
  console.log('');
  assistant.warmUp();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
