import { uiIcon } from '../icons.js';
import { verityMiniSVG } from '../verity.js';
import { fromHTML, formatShortDate } from '../ui.js';
import { read, uid, write } from '../store.js';
import { getAssistantStatus } from '../status.js';
import { readEventStream } from './assistant.js';

const HOME_URL = 'verity://home';
const SEARCH_URL = 'https://lite.duckduckgo.com/lite/?q=';
const MAX_HISTORY = 40;

const DEFAULT_BOOKMARKS = [
  { id: 'bm-wikipedia', name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Operating_system', letter: 'W' },
  { id: 'bm-mdn', name: 'MDN Web Docs', url: 'https://developer.mozilla.org', letter: 'M' },
  { id: 'bm-ollama', name: 'Ollama', url: 'https://ollama.com', letter: 'O' },
  { id: 'bm-archive', name: 'Internet Archive', url: 'https://archive.org', letter: 'A' },
  { id: 'bm-example', name: 'Example', url: 'https://example.com', letter: 'E' },
  { id: 'bm-hn', name: 'Hacker News', url: 'https://news.ycombinator.com', letter: 'H' },
];

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function parseUrl(url) {
  if (!String(url).startsWith('verity://')) {
    return { kind: 'external', url };
  }
  const rest = String(url).slice('verity://'.length);
  const [page, query] = rest.split('?');
  return { kind: 'internal', page: (page || 'home').toLowerCase(), params: new URLSearchParams(query ?? '') };
}

function titleFor(url) {
  const parsed = parseUrl(url);
  if (parsed.kind === 'external') return hostOf(url);
  return (
    {
      home: 'Start page',
      bookmarks: 'Bookmarks',
      history: 'History',
      search: 'Search',
    }[parsed.page] ?? 'Page not found'
  );
}

function normalizeInput(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return HOME_URL;

  if (/^verity:\/\//i.test(value)) {
    const parsed = parseUrl(value);
    if (parsed.page === 'search') {
      const query = parsed.params.get('q') ?? '';
      return `verity://search?q=${encodeURIComponent(query)}`;
    }
    return `verity://${parsed.page}`;
  }

  if (/^https?:\/\//i.test(value)) return value;
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/i.test(value)) return `https://${value}`;

  // A bare phrase becomes a real web search, fetched through the reader.
  return `${SEARCH_URL}${encodeURIComponent(value)}`;
}

function errorMessageFor(code, fallback) {
  if (code === 'private-address') return fallback;
  return fallback || 'That page could not be opened.';
}

export default {
  id: 'browser',
  title: 'Browser',
  size: { w: 940, h: 640 },

  mount(body, ctx) {
    let bookmarks = read('browser.bookmarks', DEFAULT_BOOKMARKS);
    if (!Array.isArray(bookmarks) || !bookmarks.length) bookmarks = [...DEFAULT_BOOKMARKS];

    let history = read('browser.history', []);
    if (!Array.isArray(history)) history = [];

    let stack = [HOME_URL];
    let index = 0;

    let currentUrl = HOME_URL;
    let pageMeta = null;
    let activeLoad = null;
    let loadToken = 0;
    let frameEl = null;

    let panelOpen = false;
    let panelMessages = [];
    let panelStream = null;
    let assistantStatus = null;

    const root = fromHTML(`
      <div class="browser" data-browser>
        <div class="browser__bar">
          <div class="browser__row">
            <div class="browser__nav">
              <button class="icon-button" type="button" data-back aria-label="Go back" title="Back">${uiIcon('back')}</button>
              <button class="icon-button" type="button" data-forward aria-label="Go forward" title="Forward">${uiIcon('forward')}</button>
              <button class="icon-button" type="button" data-reload aria-label="Reload this page" title="Reload">${uiIcon('refresh')}</button>
              <button class="icon-button" type="button" data-home aria-label="Go to the start page" title="Home">${uiIcon('home')}</button>
            </div>
            <form class="field browser__address" data-address-form role="search">
              <span aria-hidden="true">${uiIcon('globe')}</span>
              <label class="sr-only" for="browser-address">Address and search bar</label>
              <input id="browser-address" data-address type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="Type an address, or search the web" />
            </form>
            <button class="icon-button" type="button" data-star aria-label="Bookmark this page" title="Bookmark this page" aria-pressed="false">${uiIcon('star')}</button>
            <button class="icon-button browser__verity-toggle" type="button" data-verity aria-label="Open the Verity panel" title="Ask Verity about this page" aria-expanded="false">
              <span aria-hidden="true" data-verity-face></span>
            </button>
            <a class="icon-button" data-external-link aria-label="Open this page in your real browser" title="Open in your real browser" target="_blank" rel="noopener noreferrer">${uiIcon('external')}</a>
          </div>
          <div class="browser__row browser__row--tools">
            <button class="btn btn--small" type="button" data-go-bookmarks>
              ${uiIcon('star')}<span>Bookmarks</span>
            </button>
            <button class="btn btn--small" type="button" data-go-history>
              ${uiIcon('clock')}<span>History</span>
            </button>
            <span class="app-toolbar__spacer"></span>
            <span class="chip browser__engine" data-engine>Cached reader</span>
          </div>
        </div>
        <div class="browser__body">
          <div class="browser__main">
            <div class="browser__viewport" data-viewport aria-label="Page content"></div>
          </div>
          <aside class="veritypanel" data-panel hidden aria-label="Verity page assistant">
            <header class="veritypanel__head">
              <span class="veritypanel__face" data-panel-face aria-hidden="true"></span>
              <span class="veritypanel__name">Verity</span>
              <span class="chip" data-panel-mode hidden></span>
              <button class="veritypanel__close" type="button" data-panel-close aria-label="Close the Verity panel">✕</button>
            </header>
            <div class="veritypanel__body" data-panel-body></div>
            <form class="veritypanel__ask" data-panel-form>
              <label class="sr-only" for="browser-verity-input">Ask Verity about this page</label>
              <input class="veritypanel__input" id="browser-verity-input" data-panel-input type="text" placeholder="Ask about this page" autocomplete="off" />
              <button class="veritypanel__send" type="submit" data-panel-send aria-label="Send question">${uiIcon('send')}</button>
            </form>
            <p class="veritypanel__foot" data-panel-foot>
              <span class="dot" aria-hidden="true"></span>
              <span data-panel-status>Checking the assistant…</span>
            </p>
          </aside>
        </div>
      </div>`);

    body.appendChild(root);

    const viewport = root.querySelector('[data-viewport]');
    const address = root.querySelector('[data-address]');
    const backButton = root.querySelector('[data-back]');
    const forwardButton = root.querySelector('[data-forward]');
    const starButton = root.querySelector('[data-star]');
    const externalLink = root.querySelector('[data-external-link]');
    const engineChip = root.querySelector('[data-engine]');
    const verityToggle = root.querySelector('[data-verity]');
    const panel = root.querySelector('[data-panel]');
    const panelBody = root.querySelector('[data-panel-body]');
    const panelInput = root.querySelector('[data-panel-input]');
    const panelForm = root.querySelector('[data-panel-form]');
    const panelSend = root.querySelector('[data-panel-send]');
    const panelMode = root.querySelector('[data-panel-mode]');
    const panelStatus = root.querySelector('[data-panel-status]');
    const panelFootDot = root.querySelector('[data-panel-foot] .dot');

    root.querySelector('[data-verity-face]').innerHTML = verityMiniSVG();
    root.querySelector('[data-panel-face]').innerHTML = verityMiniSVG();
    verityToggle.setAttribute('aria-controls', 'browser-verity-panel');
    panel.id = 'browser-verity-panel';

    /* ------------------------------------------------------------------ */
    /* Persistence and history                                             */
    /* ------------------------------------------------------------------ */

    const persistBookmarks = () => write('browser.bookmarks', bookmarks);
    const persistHistory = () => write('browser.history', history);

    function recordHistory(url, title) {
      const parsed = parseUrl(url);
      if (parsed.kind === 'internal' && ['history', 'bookmarks'].includes(parsed.page)) return;
      if (history[0]?.url === url) return;
      history.unshift({ id: uid('h'), url, title: title || titleFor(url), ts: Date.now() });
      history = history.slice(0, MAX_HISTORY);
      persistHistory();
    }

    function bookmarkFor(url) {
      return bookmarks.find((bookmark) => bookmark.url === url) ?? null;
    }

    function updateStar() {
      const external = parseUrl(currentUrl).kind === 'external';
      const bookmarked = external && Boolean(bookmarkFor(currentUrl));
      starButton.disabled = !external;
      starButton.setAttribute('aria-pressed', String(bookmarked));
      starButton.setAttribute('aria-label', bookmarked ? 'Remove bookmark for this page' : 'Bookmark this page');
      starButton.title = bookmarked ? 'Remove bookmark' : 'Bookmark this page';
      starButton.classList.toggle('is-on', bookmarked);

      if (external && safeExternalUrl(currentUrl)) {
        externalLink.href = currentUrl;
        externalLink.removeAttribute('aria-disabled');
        externalLink.classList.remove('is-disabled');
      } else {
        externalLink.removeAttribute('href');
        externalLink.setAttribute('aria-disabled', 'true');
        externalLink.classList.add('is-disabled');
      }
    }

    function updateNav() {
      backButton.disabled = index === 0;
      forwardButton.disabled = index >= stack.length - 1;
    }

    function setEngine(label) {
      engineChip.textContent = label;
    }

    /* ------------------------------------------------------------------ */
    /* Internal pages                                                      */
    /* ------------------------------------------------------------------ */

    function bookmarkCard(bookmark) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bookmark';
      button.innerHTML = `
        <span class="bookmark__dot" aria-hidden="true"></span>
        <span class="bookmark__text">
          <span class="bookmark__name"></span>
          <span class="bookmark__url"></span>
        </span>`;
      button.querySelector('.bookmark__dot').textContent = String(bookmark.letter ?? 'W').slice(0, 1);
      button.querySelector('.bookmark__name').textContent = bookmark.name;
      button.querySelector('.bookmark__url').textContent = hostOf(bookmark.url);
      button.addEventListener('click', () => navigate(bookmark.url));
      return button;
    }

    function searchForm() {
      const form = document.createElement('form');
      form.className = 'browser__row';
      form.setAttribute('role', 'search');
      form.innerHTML = `
        <div class="field">
          <span aria-hidden="true">${uiIcon('search')}</span>
          <label class="sr-only" for="browser-search">Search the web</label>
          <input id="browser-search" type="search" placeholder="Search the web" autocomplete="off" />
        </div>
        <button class="btn btn--small btn--primary" type="submit">Search</button>`;

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const input = form.querySelector('input');
        const term = input.value.trim();
        if (!term) return;
        navigate(`${SEARCH_URL}${encodeURIComponent(term)}`);
        address.focus();
      });

      return form;
    }

    function homePage() {
      const page = fromHTML(`
        <div class="webpage webpage--home">
          <section class="webpage__hero">
            <p class="webpage__eyebrow">AskVerity Browser</p>
            <h2 class="webpage__title">Where would you like to go?</h2>
            <p class="webpage__lede">
              Type an address or a search. Pages are fetched by the local server and shown
              without their scripts, so nothing runs in the background.
            </p>
          </section>
          <section>
            <h3 class="webpage__section-title">Bookmarks</h3>
            <div class="bookmark-grid" data-bookmark-grid></div>
          </section>
          <section data-recent hidden>
            <h3 class="webpage__section-title">Recently visited</h3>
            <div class="history-list" data-recent-list></div>
          </section>
          <p class="webpage__card">
            Honest note: this is a reader, not Chrome. Scripts never run, video and logins
            usually will not work, and some sites refuse to be fetched. When that happens
            the page says so and offers your real browser instead.
          </p>
        </div>`);

      page.querySelector('.webpage__hero').append(searchForm());

      const grid = page.querySelector('[data-bookmark-grid]');
      for (const bookmark of bookmarks.slice(0, 6)) grid.appendChild(bookmarkCard(bookmark));

      if (!bookmarks.length) {
        const empty = document.createElement('p');
        empty.className = 'webpage__card';
        empty.textContent = 'No bookmarks yet. Visit a page, then press the star.';
        grid.replaceWith(empty);
      }

      const recent = history.filter((entry) => parseUrl(entry.url).kind === 'external').slice(0, 5);
      if (recent.length) {
        const section = page.querySelector('[data-recent]');
        section.hidden = false;
        const list = section.querySelector('[data-recent-list]');
        for (const entry of recent) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'history-row__link';
          button.innerHTML = '<span class="history-row__title"></span><span class="history-row__meta"></span>';
          button.querySelector('.history-row__title').textContent = entry.title;
          button.querySelector('.history-row__meta').textContent = entry.url;
          button.addEventListener('click', () => navigate(entry.url));
          list.appendChild(button);
        }
      }

      return page;
    }

    function bookmarksPage() {
      const page = fromHTML(`
        <div class="webpage">
          <p class="webpage__eyebrow">verity://bookmarks</p>
          <h2 class="webpage__title">Bookmarks</h2>
          <p class="webpage__lede">Saved addresses, opened in this reader.</p>
          <div class="history-list" data-list></div>
        </div>`);

      const list = page.querySelector('[data-list]');

      if (!bookmarks.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = `${uiIcon('star')}<strong>No bookmarks yet</strong><p>Open a page, then press the star in the toolbar.</p>`;
        list.replaceWith(empty);
        return page;
      }

      for (const bookmark of bookmarks) {
        const row = document.createElement('div');
        row.className = 'history-row';

        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'history-row__link';
        open.innerHTML = '<span class="history-row__title"></span><span class="history-row__meta"></span>';
        open.querySelector('.history-row__title').textContent = bookmark.name;
        open.querySelector('.history-row__meta').textContent = bookmark.url;
        open.addEventListener('click', () => navigate(bookmark.url));

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'icon-button';
        remove.setAttribute('aria-label', `Remove bookmark ${bookmark.name}`);
        remove.title = 'Remove bookmark';
        remove.innerHTML = uiIcon('close');
        remove.addEventListener('click', () => {
          bookmarks = bookmarks.filter((item) => item.id !== bookmark.id);
          persistBookmarks();
          renderCurrent();
        });

        row.append(open, remove);
        list.appendChild(row);
      }

      return page;
    }

    function historyPage() {
      const page = fromHTML(`
        <div class="webpage">
          <p class="webpage__eyebrow">verity://history</p>
          <h2 class="webpage__title">History</h2>
          <p class="webpage__lede">Recent pages from this browser. Stored locally.</p>
          <div class="browser__row" data-actions></div>
          <div class="history-list" data-list></div>
        </div>`);

      const actions = page.querySelector('[data-actions]');
      const clearButton = document.createElement('button');
      clearButton.type = 'button';
      clearButton.className = 'btn btn--small';
      clearButton.textContent = 'Clear history';
      clearButton.disabled = history.length === 0;
      clearButton.addEventListener('click', () => {
        history = [];
        persistHistory();
        ctx.notify({ title: 'History cleared', body: 'Browser history is now empty.', tone: 'info', duration: 2800 });
        renderCurrent();
      });
      actions.appendChild(clearButton);

      const list = page.querySelector('[data-list]');

      if (!history.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = `${uiIcon('clock')}<strong>No history yet</strong><p>Pages you visit will appear here.</p>`;
        list.replaceWith(empty);
        return page;
      }

      for (const entry of history) {
        const row = document.createElement('div');
        row.className = 'history-row';

        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'history-row__link';
        open.innerHTML = '<span class="history-row__title"></span><span class="history-row__meta"></span>';
        open.querySelector('.history-row__title').textContent = entry.title;
        open.querySelector('.history-row__meta').textContent = `${entry.url} · ${formatShortDate(entry.ts)} ${new Date(entry.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
        open.addEventListener('click', () => navigate(entry.url));

        row.appendChild(open);
        list.appendChild(row);
      }

      return page;
    }

    function searchPage(query) {
      const term = query.trim();
      const page = fromHTML(`
        <div class="webpage">
          <p class="webpage__eyebrow">Search</p>
          <h2 class="webpage__title">Search for “<span data-query></span>”</h2>
          <p class="webpage__lede">
            Press the button to open this search as a real page, fetched by the local reader.
          </p>
          <div data-link></div>
        </div>`);

      page.querySelector('[data-query]').textContent = term || '(nothing)';
      if (term) {
        const searchUrl = `${SEARCH_URL}${encodeURIComponent(term)}`;
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'btn btn--primary';
        link.textContent = 'Search the web';
        link.addEventListener('click', () => navigate(searchUrl));
        page.querySelector('[data-link]').appendChild(link);
      }

      return page;
    }

    function notFoundPage(name) {
      return fromHTML(`
        <div class="webpage">
          <p class="webpage__eyebrow">verity://${name || 'unknown'}</p>
          <h2 class="webpage__title">That internal page does not exist.</h2>
          <p class="webpage__lede">Try verity://home, verity://bookmarks or verity://history.</p>
        </div>`);
    }

    function internalPage(parsed) {
      if (parsed.page === 'home') return homePage();
      if (parsed.page === 'bookmarks') return bookmarksPage();
      if (parsed.page === 'history') return historyPage();
      if (parsed.page === 'search') return searchPage(parsed.params.get('q') ?? '');
      return notFoundPage(parsed.page);
    }

    /* ------------------------------------------------------------------ */
    /* External pages                                                      */
    /* ------------------------------------------------------------------ */

    function connectingDialog(url) {
      const element = fromHTML(`
        <div class="connecting">
          <div class="connecting__dialog">
            <div class="connecting__bar">Connecting…</div>
            <div class="connecting__body">
              <div class="connecting__icons" aria-hidden="true">
                <svg viewBox="0 0 64 64" class="connecting__globe">
                  <circle cx="32" cy="32" r="24" fill="#1c4f9c" stroke="#000" stroke-width="2"/>
                  <path d="M8 32h48M32 8c8 9 8 39 0 48M32 8c-8 9-8 39 0 48" fill="none" stroke="#7ec4ef" stroke-width="1.6"/>
                  <path d="M15 19c7 4 14 1 17 6s10 3 14 8" fill="none" stroke="#79b34f" stroke-width="4" stroke-linecap="round"/>
                  <path d="M12 40c8-3 13 2 20 0s12 3 19 0" fill="none" stroke="#79b34f" stroke-width="4" stroke-linecap="round"/>
                </svg>
                <svg viewBox="0 0 64 64" class="connecting__computer">
                  <rect x="6" y="10" width="52" height="34" fill="#c0c0c0" stroke="#000" stroke-width="2"/>
                  <rect x="10" y="14" width="44" height="26" fill="#0a7a0a"/>
                  <rect x="22" y="46" width="20" height="8" fill="#a8a8a8" stroke="#000" stroke-width="2"/>
                  <rect x="14" y="54" width="36" height="5" fill="#c0c0c0" stroke="#000" stroke-width="2"/>
                </svg>
              </div>
              <p class="connecting__text">Connecting to <strong data-connecting-host></strong>…</p>
              <p class="connecting__status" data-connecting-status>Looking up the address…</p>
              <div class="connecting__progress" role="progressbar" aria-label="Loading page"><span></span></div>
              <div class="connecting__actions">
                <button class="btn btn--small" type="button" data-cancel>Cancel</button>
              </div>
            </div>
          </div>
        </div>`);

      element.querySelector('[data-connecting-host]').textContent = hostOf(url);
      element.querySelector('[data-cancel]').addEventListener('click', () => {
        activeLoad?.abort();
        loadToken += 1;
        pageMeta = null;
        currentUrl = 'verity://home';
        stack = ['verity://home'];
        index = 0;
        renderCurrent();
      });

      return element;
    }

    function errorCard({ message, url, retry }) {
      const element = fromHTML(`
        <div class="browser__error">
          <div class="browser__error-card">
            <h2 class="browser__error-title">This page could not be opened</h2>
            <p class="browser__error-message"></p>
            <p class="browser__error-url"></p>
            <div class="browser__error-actions">
              <button class="btn btn--small btn--primary" type="button" data-retry>Try again</button>
              <a class="btn btn--small" data-real target="_blank" rel="noopener noreferrer">${uiIcon('external')}<span>Open in your real browser</span></a>
            </div>
            <p class="browser__error-note">
              Some sites block automated readers. Nothing was downloaded, and no scripts ran.
            </p>
          </div>
        </div>`);

      element.querySelector('.browser__error-message').textContent = message;
      element.querySelector('.browser__error-url').textContent = url || '';
      const real = element.querySelector('[data-real]');
      if (safeExternalUrl(url)) real.href = url;
      else real.remove();
      element.querySelector('[data-retry]').addEventListener('click', () => {
        if (retry) retry();
        else navigate(currentUrl, { push: false, refresh: true });
      });

      return element;
    }

    function renderFrame(meta) {
      viewport.innerHTML = '';
      const frame = document.createElement('iframe');
      frame.className = 'browser__frame';
      frame.title = `Page: ${meta.title || hostOf(meta.finalUrl)}`;
      frame.setAttribute('sandbox', 'allow-same-origin');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.src = `/api/page?url=${encodeURIComponent(meta.finalUrl)}`;
      frameEl = frame;

      frame.addEventListener('load', () => {
        frame.classList.add('is-ready');
        try {
          const locationHref = frame.contentWindow.location.href;
          const proxied = new URL(locationHref, window.location.href);
          if (proxied.pathname === '/api/page') {
            const target = proxied.searchParams.get('url');
            if (target && target !== currentUrl) adoptExternal(target);
          }
        } catch {
          /* opaque frame: ignore */
        }
      });

      viewport.appendChild(frame);
    }

    async function adoptExternal(target) {
      currentUrl = target;
      stack = stack.slice(0, index + 1);
      stack.push(target);
      index = stack.length - 1;
      address.value = target;
      updateNav();
      updateStar();
      ctx.setSubtitle(hostOf(target));
      setEngine('Reading page…');

      try {
        const response = await fetch(`/api/read?url=${encodeURIComponent(target)}`);
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || 'That page could not be read.');
        applyMeta(data, { record: true });
      } catch {
        setEngine('Reader mode · no scripts');
        renderPanel();
      }
    }

    function applyMeta(meta, { record = true } = {}) {
      pageMeta = meta;
      currentUrl = meta.finalUrl || pageMeta.url;
      address.value = currentUrl;
      stack[index] = currentUrl;
      setEngine(meta.wordCount ? `Reader · ${meta.wordCount.toLocaleString()} words` : 'Reader mode');
      ctx.setSubtitle(meta.title || hostOf(currentUrl));
      updateStar();
      updateNav();
      if (record) recordHistory(currentUrl, meta.title);
      renderPanel();
    }

    async function loadExternal(url, { refresh = false } = {}) {
      const safe = safeExternalUrl(url);
      if (!safe) {
        viewport.innerHTML = '';
        viewport.appendChild(
          errorCard({ message: 'That address is not a valid http or https link.', url }),
        );
        return;
      }

      const token = ++loadToken;
      activeLoad?.abort();
      const controller = new AbortController();
      activeLoad = controller;

      currentUrl = safe;
      address.value = safe;
      pageMeta = null;
      setEngine('Connecting…');
      ctx.setSubtitle(hostOf(safe));
      updateStar();
      updateNav();
      renderPanel();
      viewport.innerHTML = '';
      viewport.appendChild(connectingDialog(safe));

      try {
        const response = await fetch(
          `/api/read?url=${encodeURIComponent(safe)}${refresh ? '&refresh=1' : ''}`,
          { signal: controller.signal },
        );
        const data = await response.json();
        if (token !== loadToken) return;
        if (!response.ok || !data.ok) {
          throw Object.assign(new Error(data.error || 'That page could not be opened.'), {
            code: data.code,
          });
        }
        applyMeta(data, { record: true });
        renderFrame(data);
      } catch (error) {
        if (error?.name === 'AbortError' || token !== loadToken) return;
        pageMeta = null;
        setEngine('Reader mode · no scripts');
        viewport.innerHTML = '';
        viewport.appendChild(
          errorCard({
            message: errorMessageFor(error.code, error.message),
            url: safe,
            retry: () => loadExternal(safe, { refresh: true }),
          }),
        );
        renderPanel();
      } finally {
        if (token === loadToken) activeLoad = null;
      }
    }

    /* ------------------------------------------------------------------ */
    /* Navigation                                                          */
    /* ------------------------------------------------------------------ */

    function renderInternal(url) {
      const parsed = parseUrl(url);
      currentUrl = url;
      pageMeta = null;
      frameEl = null;
      address.value = url;
      setEngine('Local page');
      ctx.setSubtitle(titleFor(url));
      updateStar();
      updateNav();
      viewport.innerHTML = '';
      viewport.appendChild(internalPage(parsed));
      renderPanel();
    }

    function renderCurrent() {
      const parsed = parseUrl(currentUrl);
      if (parsed.kind === 'internal') renderInternal(currentUrl);
      else loadExternal(currentUrl);
    }

    function navigate(raw, { push = true, record = true, refresh = false } = {}) {
      const url = normalizeInput(raw);
      if (push) {
        stack = stack.slice(0, index + 1);
        stack.push(url);
        index = stack.length - 1;
      } else {
        stack[index] = url;
      }
      updateNav();

      const parsed = parseUrl(url);
      if (parsed.kind === 'internal') {
        renderInternal(url);
        return;
      }

      // Record only after the page loads, so the title is real. `record` is
      // kept for the external link path and ignored here on purpose.
      void record;
      loadExternal(url, { refresh });
    }

    function goBack() {
      if (index === 0) return;
      index -= 1;
      const url = stack[index];
      const parsed = parseUrl(url);
      if (parsed.kind === 'internal') renderInternal(url);
      else loadExternal(url);
      updateNav();
    }

    function goForward() {
      if (index >= stack.length - 1) return;
      index += 1;
      const url = stack[index];
      const parsed = parseUrl(url);
      if (parsed.kind === 'internal') renderInternal(url);
      else loadExternal(url);
      updateNav();
    }

    /* ------------------------------------------------------------------ */
    /* Verity panel                                                        */
    /* ------------------------------------------------------------------ */

    function setStatusLine() {
      const mode = assistantStatus?.mode ?? null;
      const label =
        mode === 'local'
          ? 'Local AI · connected'
          : mode === 'mock'
            ? 'Demo brain · honest about limits'
            : 'Assistant status unknown';
      panelStatus.textContent = label;
      panelFootDot.dataset.state = mode === 'local' ? 'local' : mode === 'mock' ? 'mock' : 'error';
      panelMode.hidden = mode !== 'local';
      if (mode === 'local') panelMode.textContent = 'Local AI';
      else panelMode.hidden = true;
    }

    getAssistantStatus()
      .then((status) => {
        assistantStatus = status;
        setStatusLine();
      })
      .catch(() => {
        panelStatus.textContent = 'The local assistant service is not responding.';
        panelFootDot.dataset.state = 'error';
      });

    function renderPanel() {
      if (!panelOpen) return;

      const body = panelBody;
      body.innerHTML = '';

      if (!pageMeta) {
        const empty = fromHTML(`
          <div class="veritypanel__empty">
            <p><strong>Open a web page</strong> and I will read it with you.</p>
            <p class="veritypanel__hint">
              The reader strips scripts and keeps the text, so I can quote it and answer
              questions about it.
            </p>
            <button class="btn btn--small" type="button" data-open-home>Go to the start page</button>
          </div>`);
        empty.querySelector('[data-open-home]').addEventListener('click', () => navigate(HOME_URL));
        body.appendChild(empty);
        panelInput.disabled = true;
        panelSend.disabled = true;
        panelInput.placeholder = 'Open a page first';
        return;
      }

      panelInput.disabled = Boolean(panelStream);
      panelSend.disabled = Boolean(panelStream);
      panelInput.placeholder = 'Ask about this page';

      const context = fromHTML(`
        <div class="veritypanel__top">
          <div class="veritypanel__context">
            <p class="veritypanel__page-title"></p>
            <p class="veritypanel__page-meta"></p>
          </div>
          <div class="veritypanel__actions">
            <button class="btn btn--small" type="button" data-summarise>Summarise page</button>
            <button class="btn btn--small" type="button" data-what>What is this about?</button>
          </div>
        </div>`);

      context.querySelector('.veritypanel__page-title').textContent = pageMeta.title || hostOf(currentUrl);
      context.querySelector('.veritypanel__page-meta').textContent =
        `${pageMeta.site || hostOf(currentUrl)} · ${Number(pageMeta.wordCount ?? 0).toLocaleString()} words · ${pageMeta.readingMinutes ?? 1} min read`;
      context.querySelector('[data-summarise]').addEventListener('click', () => ask('Summarise this page.'));
      context.querySelector('[data-what]').addEventListener('click', () => ask('What is this page about?'));
      body.appendChild(context);

      if (!pageMeta.text) {
        const noText = fromHTML(
          '<p class="veritypanel__hint">This page had no readable text, so there is nothing to summarise.</p>',
        );
        body.appendChild(noText);
        return;
      }

      const log = document.createElement('div');
      log.className = 'veritypanel__log';
      log.setAttribute('role', 'log');
      log.setAttribute('aria-live', 'polite');

      for (const message of panelMessages) {
        const item = document.createElement('div');
        item.className = `vmsg vmsg--${message.role}`;

        const meta = document.createElement('p');
        meta.className = 'vmsg__meta';
        meta.textContent = message.role === 'user' ? 'You' : 'Verity';
        if (message.mode === 'demo') {
          const chip = document.createElement('span');
          chip.className = 'chip';
          chip.textContent = 'Demo reply';
          meta.appendChild(chip);
        }

        const text = document.createElement('p');
        text.className = 'vmsg__text';
        if (message.error) {
          text.classList.add('vmsg__text--error');
          text.textContent = message.error;
        } else if (message.content) {
          text.textContent = message.content;
        } else {
          text.classList.add('vmsg__text--typing');
          text.textContent = '…';
        }

        item.append(meta, text);
        log.appendChild(item);
      }

      body.appendChild(log);
      body.scrollTop = body.scrollHeight;
    }

    function setPanelMode(mode) {
      if (mode === 'local') {
        panelMode.hidden = false;
        panelMode.textContent = 'Local AI';
      } else {
        panelMode.hidden = true;
      }
    }

    /** Update only the streaming bubble so typing in the input keeps focus. */
    function updateStreamingText(reply) {
      const nodes = panelBody.querySelectorAll('.vmsg__text');
      const last = nodes[nodes.length - 1];
      if (!last) return;
      last.classList.remove('vmsg__text--typing');
      last.textContent = reply.content;
      panelBody.scrollTop = panelBody.scrollHeight;
    }

    function friendlyPanelError(error) {
      if (error?.name === 'AbortError') return null;
      const message = String(error?.message ?? error);
      if (/fetch|network|load failed/i.test(message)) {
        return 'I could not reach the assistant service. Is the AskVerity OS server still running?';
      }
      return message || 'That question could not be answered.';
    }

    async function ask(question) {
      const text = String(question ?? '').trim();
      if (!text || panelStream || !pageMeta) return;

      panelMessages.push({ role: 'user', content: text });
      const reply = { role: 'assistant', content: '', mode: null, error: null };
      panelMessages.push(reply);
      panelMessages = panelMessages.slice(-40);
      renderPanel();

      const controller = new AbortController();
      panelStream = controller;
      panelInput.value = '';
      renderPanel();

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            personality: ctx.getSettings()?.personality ?? 'balanced',
            page: {
              title: pageMeta.title,
              url: pageMeta.finalUrl || pageMeta.url,
              text: pageMeta.text,
            },
            messages: panelMessages
              .filter((message) => message.content && !message.error)
              .map(({ role, content }) => ({ role, content })),
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `The assistant service answered ${response.status}.`);
        }

        await readEventStream(response.body, (event, payload) => {
          if (event === 'meta') {
            reply.mode = payload.demo ? 'demo' : 'local';
            setPanelMode(reply.mode);
          } else if (event === 'delta') {
            reply.content += payload.text;
            updateStreamingText(reply);
          } else if (event === 'error') {
            reply.error = payload.message;
          }
        });
      } catch (error) {
        const message = friendlyPanelError(error);
        if (message) reply.error = message;
      } finally {
        if (!reply.content && !reply.error) reply.error = 'No reply arrived. Try asking again.';
        panelStream = null;
        renderPanel();
        panelInput.focus({ preventScroll: true });
      }
    }

    function openPanel() {
      panelOpen = true;
      panel.hidden = false;
      root.classList.add('browser--panel');
      verityToggle.setAttribute('aria-expanded', 'true');
      verityToggle.setAttribute('aria-label', 'Close the Verity panel');
      renderPanel();
      if (pageMeta) panelInput.focus({ preventScroll: true });
    }

    function closePanel() {
      panelOpen = false;
      panel.hidden = true;
      root.classList.remove('browser--panel');
      verityToggle.setAttribute('aria-expanded', 'false');
      verityToggle.setAttribute('aria-label', 'Open the Verity panel');
      verityToggle.focus({ preventScroll: true });
    }

    /* ------------------------------------------------------------------ */
    /* Wiring                                                              */
    /* ------------------------------------------------------------------ */

    root.querySelector('[data-address-form]').addEventListener('submit', (event) => {
      event.preventDefault();
      navigate(address.value);
      address.blur();
    });

    backButton.addEventListener('click', goBack);
    forwardButton.addEventListener('click', goForward);

    root.querySelector('[data-reload]').addEventListener('click', () => {
      if (parseUrl(currentUrl).kind === 'external') loadExternal(currentUrl, { refresh: true });
      else renderInternal(currentUrl);
    });

    root.querySelector('[data-home]').addEventListener('click', () => navigate(HOME_URL));
    root.querySelector('[data-go-bookmarks]').addEventListener('click', () => navigate('verity://bookmarks'));
    root.querySelector('[data-go-history]').addEventListener('click', () => navigate('verity://history'));

    starButton.addEventListener('click', () => {
      if (parseUrl(currentUrl).kind !== 'external') return;
      const existing = bookmarkFor(currentUrl);
      if (existing) {
        bookmarks = bookmarks.filter((bookmark) => bookmark.id !== existing.id);
        persistBookmarks();
        ctx.notify({ title: 'Bookmark removed', body: existing.name, tone: 'info', duration: 2400 });
      } else {
        const name = pageMeta?.title || hostOf(currentUrl);
        bookmarks.push({
          id: uid('bm'),
          name,
          url: currentUrl,
          letter: (hostOf(currentUrl)[0] || 'W').toUpperCase(),
        });
        persistBookmarks();
        ctx.notify({ title: 'Bookmark saved', body: name, tone: 'success', duration: 2400 });
      }
      updateStar();
      renderCurrent();
    });

    verityToggle.addEventListener('click', () => {
      if (panelOpen) closePanel();
      else openPanel();
    });

    panel.querySelector('[data-panel-close]').addEventListener('click', closePanel);

    panelForm.addEventListener('submit', (event) => {
      event.preventDefault();
      ask(panelInput.value);
    });

    panelInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        ask(panelInput.value);
      }
    });

    renderInternal(HOME_URL);
    setEngine('Local page');
  },
};
