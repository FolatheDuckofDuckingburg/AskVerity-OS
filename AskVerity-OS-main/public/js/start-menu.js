import { appIcon, uiIcon } from './icons.js';
import { verityMiniSVG } from './verity.js';
import { clear } from './ui.js';

const HINTS = {
  assistant: 'Talk to Verity',
  browser: 'A pretend web browser',
  files: 'Simulated drive',
  notes: 'Write things down',
  calculator: 'Quick sums',
  settings: 'Make it yours',
  about: 'Meet the face',
  trash: 'Deleted files',
};

/**
 * Start menu: searchable app launcher with keyboard support.
 */
export function createStartMenu({ root, button, apps, onOpen, onClose }) {
  root.innerHTML = `
    <div class="start-menu__banner" aria-hidden="true"><span>AskVerity <b>95</b></span></div>
    <div class="start-menu__content">
      <div class="start-menu__hello">
        <span class="start-menu__face" aria-hidden="true">${verityMiniSVG()}</span>
        <div>
          <p class="start-menu__title">Hi, I'm Verity</p>
          <p class="start-menu__subtitle">Everything lives on this computer.</p>
        </div>
      </div>
      <div class="start-menu__search">
        <span aria-hidden="true">${uiIcon('search')}</span>
        <input type="search" id="start-search" placeholder="Search apps" aria-label="Search applications" autocomplete="off" spellcheck="false" />
      </div>
      <div class="start-menu__list" role="menu" aria-label="Applications"></div>
      <div class="start-menu__footer">
        <span class="start-menu__status">
          <span class="dot" data-start-dot aria-hidden="true"></span>
          <span data-start-status>Checking the assistant…</span>
        </span>
        <button class="btn btn--small" type="button" data-settings>
          ${uiIcon('settings')}<span>Settings</span>
        </button>
      </div>
    </div>`;

  const searchInput = root.querySelector('#start-search');
  const list = root.querySelector('.start-menu__list');
  const statusText = root.querySelector('[data-start-status]');
  const statusDot = root.querySelector('[data-start-dot]');

  let isOpen = false;
  let lastFocused = null;

  function buildList(query = '') {
    const term = query.trim().toLowerCase();
    const matches = term
      ? apps.filter(
          (app) =>
            app.title.toLowerCase().includes(term) || (HINTS[app.id] ?? '').toLowerCase().includes(term),
        )
      : apps;

    clear(list);

    const label = document.createElement('p');
    label.className = 'start-menu__group';
    label.textContent = term ? `${matches.length} result${matches.length === 1 ? '' : 's'}` : 'All apps';
    list.appendChild(label);

    if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'start-menu__empty';
      empty.textContent = `Nothing here matches “${query.trim()}”. Try “notes” or “settings”.`;
      list.appendChild(empty);
      return;
    }

    for (const app of matches) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'start-app';
      item.setAttribute('role', 'menuitem');
      item.innerHTML = `
        ${appIcon(app.id)}
        <span class="start-app__text">
          <span class="start-app__name"></span>
          <span class="start-app__hint"></span>
        </span>`;
      item.querySelector('.start-app__name').textContent = app.title;
      item.querySelector('.start-app__hint').textContent = HINTS[app.id] ?? 'Application';
      item.addEventListener('click', () => {
        close({ restoreFocus: false });
        onOpen(app.id);
      });
      list.appendChild(item);
    }
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    lastFocused = document.activeElement;
    root.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    searchInput.value = '';
    buildList('');
    searchInput.focus({ preventScroll: true });
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function close({ restoreFocus = true } = {}) {
    if (!isOpen) return;
    isOpen = false;
    root.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    if (restoreFocus) {
      if (lastFocused instanceof HTMLElement && document.contains(lastFocused)) {
        lastFocused.focus({ preventScroll: true });
      } else {
        button.focus({ preventScroll: true });
      }
    }
    onClose?.();
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  function onPointerDown(event) {
    if (root.contains(event.target) || button.contains(event.target)) return;
    close({ restoreFocus: false });
  }

  function onKeyDown(event) {
    if (!isOpen) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const items = Array.from(root.querySelectorAll('.start-app'));
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement);
      const nextIndex =
        event.key === 'ArrowDown'
          ? index < 0
            ? 0
            : (index + 1) % items.length
          : index <= 0
            ? items.length - 1
            : index - 1;
      items[nextIndex].focus();
      return;
    }

    if (event.key === 'Home' && event.target === searchInput) {
      event.preventDefault();
      root.querySelector('.start-app')?.focus();
    }
  }

  searchInput.addEventListener('input', () => buildList(searchInput.value));
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      root.querySelector('.start-app')?.click();
    }
  });

  root.querySelector('[data-settings]').addEventListener('click', () => {
    close({ restoreFocus: false });
    onOpen('settings');
  });

  button.addEventListener('click', toggle);

  function setStatus(status) {
    if (!status) return;
    statusDot.dataset.state = status.state;
    statusText.textContent = status.text;
  }

  buildList('');

  return {
    open,
    close,
    toggle,
    setStatus,
    get isOpen() {
      return isOpen;
    },
  };
}
