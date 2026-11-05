import { appIcon } from './icons.js';
import { bus } from './bus.js';
import { clamp, debounce } from './ui.js';

let windowSeq = 0;

/**
 * Creates, stacks, drags, minimises and closes application windows.
 * Apps never touch the DOM outside their own window body.
 */
export class WindowManager {
  constructor({ layer, desktop, apps, notify, getSettings }) {
    this.layer = layer;
    this.desktop = desktop;
    this.apps = new Map(apps.map((app) => [app.id, app]));
    this.notify = notify ?? (() => {});
    this.getSettings = getSettings ?? (() => ({}));
    this.windows = [];
    this.zCounter = 100;
    this.cascade = 0;
    this.activeId = null;

    window.addEventListener(
      'resize',
      debounce(() => this.#clampAll(), 120),
    );
  }

  app(appId) {
    return this.apps.get(appId) ?? null;
  }

  snapshot() {
    return this.windows.map((win) => ({
      id: win.id,
      appId: win.appId,
      title: win.title,
      minimized: win.minimized,
      focused: win.id === this.activeId,
    }));
  }

  #changed() {
    bus.emit('windows:changed', this.snapshot());
  }

  #bounds() {
    return {
      width: this.desktop.clientWidth,
      height: this.desktop.clientHeight,
    };
  }

  #initialRect(app) {
    const { width: bw, height: bh } = this.#bounds();
    const margin = 12;
    const maxWidth = Math.max(280, bw - margin * 2);
    const maxHeight = Math.max(180, bh - margin * 2);
    const width = Math.min(app.size?.w ?? 720, maxWidth);
    const height = Math.min(app.size?.h ?? 560, maxHeight);

    const step = 26;
    const offset = (this.cascade % 5) * step;
    this.cascade += 1;

    const left = clamp(
      Math.round((bw - width) / 2) - step * 2 + offset,
      margin,
      Math.max(margin, bw - width - margin),
    );
    const top = clamp(
      Math.round((bh - height) / 2) - step * 2 + offset,
      margin,
      Math.max(margin, bh - height - margin),
    );

    return { left, top, width, height };
  }

  /**
   * Open an application. Existing windows are focused instead of duplicated.
   * @returns {object|null} the window instance
   */
  open(appId, options = {}) {
    const app = this.apps.get(appId);
    if (!app) return null;

    const existing = this.windows.find((win) => win.appId === appId);
    if (existing) {
      if (existing.minimized) this.restore(existing);
      this.focus(existing);
      options.afterOpen?.(existing);
      return existing;
    }

    const id = `win-${++windowSeq}`;
    const rect = this.#initialRect(app);
    const titleId = `${id}-title`;

    const el = document.createElement('section');
    el.className = 'window is-opening';
    el.id = id;
    el.dataset.app = app.id;
    el.tabIndex = -1;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'false');
    el.setAttribute('aria-labelledby', titleId);
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.top}px`;
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;

    el.innerHTML = `
      <header class="window__bar" data-drag-handle>
        <span class="window__icon" aria-hidden="true">${appIcon(app.id)}</span>
        <h2 class="window__title" id="${titleId}"></h2>
        <span class="window__subtitle" hidden></span>
        <div class="window__controls">
          <button class="winbtn winbtn--min" type="button" aria-label="Minimise window" title="Minimise">
            <span aria-hidden="true">–</span>
          </button>
          <button class="winbtn winbtn--max" type="button" aria-label="Maximise window" title="Maximise" aria-pressed="false">
            <span aria-hidden="true">▢</span>
          </button>
          <button class="winbtn winbtn--close" type="button" aria-label="Close window" title="Close">
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      </header>
      <div class="window__body"></div>`;

    const titleEl = el.querySelector('.window__title');
    const subtitleEl = el.querySelector('.window__subtitle');
    const body = el.querySelector('.window__body');
    const minBtn = el.querySelector('.winbtn--min');
    const maxBtn = el.querySelector('.winbtn--max');
    const closeBtn = el.querySelector('.winbtn--close');

    titleEl.textContent = app.title;

    const win = {
      id,
      appId: app.id,
      title: app.title,
      el,
      body,
      minimized: false,
      maximized: false,
      cleanups: [],
      focusHandlers: [],
      instance: null,
    };

    const updateControlLabels = () => {
      const name = win.title;
      minBtn.setAttribute('aria-label', `Minimise ${name}`);
      maxBtn.setAttribute('aria-label', win.maximized ? `Restore ${name}` : `Maximise ${name}`);
      maxBtn.title = win.maximized ? 'Restore' : 'Maximise';
      maxBtn.setAttribute('aria-pressed', String(win.maximized));
      closeBtn.setAttribute('aria-label', `Close ${name}`);
    };

    const ctx = {
      id,
      app,
      window: win,
      el,
      body,
      notify: this.notify,
      getSettings: this.getSettings,
      openApp: (nextId) => this.open(nextId),
      setTitle: (nextTitle) => {
        const text = String(nextTitle ?? '').trim() || app.title;
        win.title = text;
        titleEl.textContent = text;
        updateControlLabels();
        this.#changed();
      },
      setSubtitle: (text) => {
        const value = String(text ?? '').trim();
        subtitleEl.textContent = value;
        subtitleEl.hidden = !value;
      },
      focus: () => this.focus(win),
      minimize: () => this.minimize(win),
      close: () => this.close(win),
      isFocused: () => this.activeId === win.id,
      onCleanup: (fn) => {
        if (typeof fn === 'function') win.cleanups.push(fn);
      },
      onFocus: (fn) => {
        if (typeof fn === 'function') win.focusHandlers.push(fn);
      },
    };

    win.ctx = ctx;
    updateControlLabels();

    minBtn.addEventListener('click', () => this.minimize(win));
    maxBtn.addEventListener('click', () => this.toggleMaximize(win));
    closeBtn.addEventListener('click', () => this.close(win));

    el.addEventListener('pointerdown', () => this.focus(win), true);
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && el.contains(document.activeElement)) {
        // Escape belongs to the app first (they may close a popover).
        if (event.defaultPrevented) return;
      }
    });

    const bar = el.querySelector('[data-drag-handle]');
    bar.addEventListener('pointerdown', (event) => this.#startDrag(win, event));
    bar.addEventListener('dblclick', (event) => {
      if (event.target.closest('button')) return;
      this.toggleMaximize(win);
    });

    this.layer.appendChild(el);
    this.windows.push(win);
    this.focus(win);

    const settle = () => el.classList.remove('is-opening');
    el.addEventListener('animationend', settle, { once: true });
    setTimeout(settle, 420);

    try {
      app.mount?.(body, ctx);
      win.instance = true;
    } catch (error) {
      console.error(`[askverity] ${app.id} failed to start`, error);
      body.innerHTML = '';
      const fallback = document.createElement('div');
      fallback.className = 'empty-state';
      fallback.innerHTML = '<strong>This app could not start.</strong>';
      const detail = document.createElement('p');
      detail.textContent = String(error?.message ?? error);
      fallback.appendChild(detail);
      body.appendChild(fallback);
      this.notify({
        title: `${app.title} could not open`,
        body: 'Something went wrong while starting this app. The error is in the console.',
        tone: 'error',
      });
    }

    this.#changed();
    bus.emit('window:opened', { appId: app.id, title: app.title });
    return win;
  }

  focus(win) {
    if (!this.windows.includes(win)) return;
    if (this.activeId === win.id && win.el.classList.contains('is-focused')) {
      this.#runFocusHandlers(win);
      return;
    }

    this.activeId = win.id;
    this.zCounter += 1;
    win.el.style.zIndex = String(this.zCounter);

    for (const other of this.windows) {
      other.el.classList.toggle('is-focused', other === win);
    }

    if (!win.el.contains(document.activeElement)) {
      win.el.focus({ preventScroll: true });
    }

    this.#runFocusHandlers(win);
    this.#changed();
    bus.emit('window:focused', { id: win.id, appId: win.appId });
  }

  #runFocusHandlers(win) {
    for (const handler of win.focusHandlers) {
      try {
        handler();
      } catch (error) {
        console.error('[askverity] focus handler failed', error);
      }
    }
  }

  minimize(win) {
    if (!this.windows.includes(win) || win.minimized) return;
    win.minimized = true;
    win.el.classList.add('is-minimized');
    win.el.setAttribute('aria-hidden', 'true');

    if (this.activeId === win.id) {
      this.activeId = null;
      const next = this.#topmost();
      if (next) this.focus(next);
    }

    this.#changed();
    bus.emit('window:minimized', { id: win.id, appId: win.appId });
  }

  restore(win) {
    if (!this.windows.includes(win) || !win.minimized) return;
    win.minimized = false;
    win.el.classList.remove('is-minimized');
    win.el.removeAttribute('aria-hidden');
    this.#changed();
    bus.emit('window:restored', { id: win.id, appId: win.appId });
  }

  toggleMaximize(win) {
    if (!this.windows.includes(win)) return;
    win.maximized = !win.maximized;
    win.el.classList.toggle('is-maximized', win.maximized);
    const maxBtn = win.el.querySelector('.winbtn--max');
    const minBtn = win.el.querySelector('.winbtn--min');
    if (maxBtn) {
      maxBtn.setAttribute('aria-pressed', String(win.maximized));
      maxBtn.setAttribute('aria-label', win.maximized ? `Restore ${win.title}` : `Maximise ${win.title}`);
      maxBtn.title = win.maximized ? 'Restore' : 'Maximise';
      maxBtn.querySelector('span').textContent = win.maximized ? '⤢' : '▢';
    }
    if (minBtn) minBtn.disabled = false;
    this.focus(win);
  }

  close(win) {
    if (!this.windows.includes(win)) return;

    for (const cleanup of win.cleanups) {
      try {
        cleanup();
      } catch (error) {
        console.error('[askverity] cleanup failed', error);
      }
    }

    win.el.remove();
    this.windows = this.windows.filter((item) => item !== win);

    if (this.activeId === win.id) {
      this.activeId = null;
      const next = this.#topmost();
      if (next) this.focus(next);
    }

    this.#changed();
    bus.emit('window:closed', { appId: win.appId, title: win.title });
  }

  /** Taskbar click behaviour: restore, focus, or minimise a focused window. */
  activate(id) {
    const win = this.windows.find((item) => item.id === id);
    if (!win) return;

    if (win.minimized) {
      this.restore(win);
      this.focus(win);
      return;
    }

    if (this.activeId === win.id) {
      this.minimize(win);
      return;
    }

    this.focus(win);
  }

  closeAll() {
    for (const win of [...this.windows]) this.close(win);
  }

  #topmost() {
    let top = null;
    let topZ = -1;
    for (const win of this.windows) {
      if (win.minimized) continue;
      const z = Number(win.el.style.zIndex || 0);
      if (z > topZ) {
        top = win;
        topZ = z;
      }
    }
    return top;
  }

  #startDrag(win, event) {
    if (event.button !== 0 || win.maximized) return;
    if (event.target.closest('button')) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = win.el.offsetLeft;
    const startTop = win.el.offsetTop;
    const { width: bw, height: bh } = this.#bounds();

    win.el.classList.add('is-dragging');
    document.body.classList.add('is-dragging-window');
    win.el.setPointerCapture?.(event.pointerId);

    const move = (moveEvent) => {
      const width = win.el.offsetWidth;
      const left = clamp(startLeft + (moveEvent.clientX - startX), -width + 140, bw - 140);
      const top = clamp(startTop + (moveEvent.clientY - startY), 0, Math.max(0, bh - 44));
      win.el.style.left = `${left}px`;
      win.el.style.top = `${top}px`;
    };

    const end = () => {
      win.el.classList.remove('is-dragging');
      document.body.classList.remove('is-dragging-window');
      win.el.removeEventListener('pointermove', move);
      win.el.removeEventListener('pointerup', end);
      win.el.removeEventListener('pointercancel', end);
    };

    win.el.addEventListener('pointermove', move);
    win.el.addEventListener('pointerup', end);
    win.el.addEventListener('pointercancel', end);
  }

  #clampAll() {
    const { width: bw, height: bh } = this.#bounds();
    for (const win of this.windows) {
      if (win.maximized || win.minimized) continue;
      const width = win.el.offsetWidth;
      const height = win.el.offsetHeight;
      const maxLeft = Math.max(0, bw - 140);
      const maxTop = Math.max(0, bh - 44);
      const left = clamp(win.el.offsetLeft, -width + 140, maxLeft);
      const top = clamp(win.el.offsetTop, 0, maxTop);
      if (left !== win.el.offsetLeft) win.el.style.left = `${left}px`;
      if (top !== win.el.offsetTop) win.el.style.top = `${top}px`;
      if (width > bw - 24) win.el.style.width = `${Math.max(280, bw - 24)}px`;
      if (height > bh - 24) win.el.style.height = `${Math.max(180, bh - 24)}px`;
    }
  }
}
