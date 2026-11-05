# AskVerity OS

A small, friendly desktop environment that runs in your browser, with **Verity** living inside it:
a yellow smiley-faced assistant who is happy to help and honest about what it cannot do.
Verity has no fixed gender and is referred to as “they”.

No framework. No build step. No paid API. No tracking.

![Verity](public/assets/verity.svg)

---

## Quick start (Windows, macOS or Linux)

You need **Node.js 18 or newer** ([nodejs.org](https://nodejs.org)). Nothing else — the project has
**zero npm dependencies**.

```bash
npm start
```

Then open **http://localhost:3000**.

In VS Code: open the project folder, open a terminal with `Ctrl` + `` ` ``, run `npm start`, and
click the link in the terminal. `npm run dev` restarts the server automatically when a backend file
changes.

The desktop works immediately in **demo mode**. Verity can greet you, do arithmetic, tell you the
time, tell a joke, and explain the desktop — no model, no key, no internet.

---

## Adding a real local model (free, private, optional)

Verity can talk to a model running on your own computer through [Ollama](https://ollama.com).

1. Install Ollama and start it (it usually runs on `http://127.0.0.1:11434`).
2. Pull a model:
   ```bash
   ollama pull llama3.2
   ```
3. Copy `.env.example` to `.env` in the project root (both are git-ignored except the example).
4. Restart the server with `npm start`.
5. Open **Settings → Verity** and press **Check again**.

The taskbar and the assistant header will both say **Local AI · your-model**. Nothing leaves your
computer: the browser talks only to the local AskVerity OS server, and that server talks only to
your local Ollama.

If Ollama is not running, or the configured model is not pulled, the desktop says so plainly and
falls back to demo mode. It never claims to be connected when it is not.

### Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `AI_PROVIDER` | `ollama` | `ollama` for a local model, `mock` for the built-in demo brain. |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Local endpoint. Use `http://host.docker.internal:11434` from Docker. |
| `OLLAMA_MODEL` | `llama3.2` | The model name you pulled. |
| `OLLAMA_TIMEOUT_MS` | `60000` | How long to wait for a slow reply. |
| `PORT` | `3000` | Web server port. |
| `HOST` | `0.0.0.0` | Bind address. |

No API keys exist in this project, so there is nothing secret in the frontend.

---

## What is in the desktop

| App | What actually works |
| --- | --- |
| **Ask Verity** | Streaming chat, conversation history, new/clear chat, stop generating, typing indicator, six facial expressions, retry on error. |
| **Notes** | Autosaving notes in `localStorage`, rename, delete, search, word count, last-edited timestamps. |
| **Files** | A simulated drive: sidebar, breadcrumbs, grid/list views, search, details pane, move to Trash. |
| **Browser** | A real, script-free reader: fetches pages through the local server, strips their scripts, rewrites links, and supports back/forward, bookmarks, history and a **Verity panel** that summarises the page and answers questions about it. |
| **Calculator** | Safe recursive-descent parser (no `eval`), keyboard input, decimals, parentheses, percent, friendly errors. |
| **Settings** | Themes, wallpapers, sound effects, motion preference, Verity's personality, provider status, reset. |
| **Trash** | Restore or permanently delete simulated files. |
| **About Verity** | The mascot (click to cycle expressions), honest feature notes, keyboard shortcuts. |

The shell itself has draggable and maximisable windows, stacking and focus, a taskbar with running
windows, a searchable Start menu, a desktop context menu, toasts, a live clock, and a first-run
welcome tour.

### Things that are deliberately simulated

AskVerity OS does not pretend to do more than it does:

- **Files** lists a virtual drive stored in your browser. It never reads your real filesystem.
- **Browser** is a reader, not an engine. The server fetches the HTML, removes every script, and the
  page is displayed without JavaScript. Logins, video, and script-driven sites usually will not work;
  some sites refuse to be fetched at all, and the app says so instead of pretending.
- **The Verity panel** in the browser only sees the plain text the reader extracted. In demo mode it
  extracts sentences; with a local model it can reason over the page.
- **Assistant** uses a small rule-based demo brain unless a local Ollama model is connected, and
  every demo reply is labelled *Demo reply*.
- The clock uses your computer's time. The demo brain's time answers use the *server's* clock and
  say so.

---

## Architecture

```text
askverity-os/
├── public/
│   ├── index.html            shell markup
│   ├── css/
│   │   ├── themes.css        tokens, 3 themes, 5 CSS wallpapers
│   │   ├── desktop.css       desktop, taskbar, start menu, toasts, welcome
│   │   ├── windows.css       window chrome and drag states
│   │   ├── applications.css  per-app layout
│   │   ├── retro.css         classic bevels, square chrome, system menus
│   │   └── browser.css       browser reader, loading dialog, Verity panel
│   ├── assets/verity.svg     standalone mascot
│   └── js/
│       ├── main.js           boot, providers, shortcuts, welcome
│       ├── desktop.js        icons + context menu
│       ├── window-manager.js windows, focus, drag, minimise, maximise
│       ├── taskbar.js        running windows, clock, status
│       ├── start-menu.js     searchable launcher
│       ├── notifications.js  dismissible toasts
│       ├── status.js         provider status cache
│       ├── store.js          namespaced localStorage + preferences
│       ├── verity.js         mascot + expressions
│       ├── icons.js          original inline SVG icons
│       ├── ui.js             DOM/date/sound helpers
│       ├── bus.js            tiny event bus
│       ├── lib/calc.js       safe arithmetic parser (shared with the server)
│       ├── lib/vfs.js        simulated filesystem model
│       └── apps/             one module per application
├── server/
│   ├── server.js             zero-dependency static + API server
│   ├── ai-provider.js        provider interface, Ollama + fallback
│   ├── mock-provider.js      the demo brain's rules
│   ├── browser.js            page fetcher, sanitiser and text extractor
│   └── env.js                tiny .env reader
├── .env.example
└── package.json
```

The assistant is separated from the desktop UI on purpose. The browser only knows about
`POST /api/chat` (Server-Sent Events) and `GET /api/status`. New providers slot into
`server/ai-provider.js` behind the same stream interface.

### API

`GET /api/status` → provider, mode (`local` / `mock`), model, availability and a human explanation.

`GET /api/read?url=…` → JSON `{ ok, title, site, text, wordCount, readingMinutes }` for the address,
fetched server-side with a 12 s timeout, a 2.5 MB cap and a 3-minute cache.

`GET /api/page?url=…` → the sanitised HTML for the reader iframe. Scripts, iframes, objects and
inline event handlers are removed, links are rewritten to stay inside the reader, and the page is served
with `script-src 'none'`. Private, loopback and link-local addresses are refused (SSRF guard).

`POST /api/chat` with `{ messages: [{ role, content }], personality, page? }` → `text/event-stream` of:

- `meta` — `{ mode, provider, model?, demo }`
- `delta` — `{ text }`
- `done` — `{ finishReason, expression? }`
- `error` — `{ message }`

Messages are validated and capped server-side; request bodies are limited to 128 KB. `page` is an
optional `{ title, url, text }` from the browser, capped at 12,000 characters.

### Shared code note

`public/js/lib/calc.js` is imported by both the Calculator app and the demo brain. That keeps one
safe implementation of arithmetic instead of two.

---

## Accessibility

- Every interactive element is a real button, input or link, with visible focus rings.
- Windows are labelled dialogs; the welcome tour is modal and traps focus.
- The Start menu, context menu and chats popover work with arrow keys and Escape.
- Chat output is not announced token-by-token; a polite live region announces when a reply lands.
- `prefers-reduced-motion` is respected automatically, and Settings can force reduced motion
  regardless of the OS setting.
- Text colours target WCAG AA contrast in all three themes; interactive targets are at least
  ~40 px tall.
- Sounds are off-able, and never required to understand an action.

## Privacy & security

- No accounts, analytics, ads, or third-party requests.
- The server validates every path so static file requests cannot escape `public/`.
- Secrets stay on the server; there are none in the browser bundles.
- User text is inserted with `textContent`, never as HTML, and the calculator never uses `eval`.
- The page reader refuses loopback, private, link-local and `.local` addresses, re-checks every
  redirect hop, caps response size, and never executes remote scripts.
- Remote pages are shown in a sandboxed iframe with `script-src 'none'`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Server offline" in the assistant | The Node server is not running. `npm start`, then reload. |
| Stuck in demo mode | Check `AI_PROVIDER=ollama`, that Ollama is running, and run **Settings → Check again**. |
| "model is not installed" | `ollama pull <the model in .env>`. |
| Notes reset after reload | Your browser is blocking local storage (private mode or strict settings). |
| "This page could not be opened" | Some sites block readers or are script-only. Use **Open in your real browser**, or try a simpler page. |
| Page looks unstyled | Remote CSS was blocked or the site needs JavaScript. The reader shows the text, not the site's behaviour. |
| Port already in use | `PORT=3100 npm start`. |

## License

Apache 2.0 License. The mascot and icons are original SVG drawn for this project.
