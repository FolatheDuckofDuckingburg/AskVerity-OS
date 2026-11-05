import { appIcon, uiIcon } from './icons.js';
import { clear } from './ui.js';

/**
 * The desktop surface: app icons, selection, and a keyboard-friendly context menu.
 */
export function createDesktop({ surface, container, menu, apps, onOpen, onNewNote, onSettings, onAbout }) {
  let selected = null;
  let menuCleanup = null;

  function select(appId) {
    selected = appId;
    for (const icon of container.querySelectorAll('.desk-icon')) {
      icon.classList.toggle('is-selected', icon.dataset.app === appId);
    }
  }

  function open(appId) {
    select(appId);
    onOpen(appId);
  }

  function clearSelection() {
    selected = null;
    for (const icon of container.querySelectorAll('.desk-icon')) {
      icon.classList.remove('is-selected');
    }
  }

  function renderIcons() {
    clear(container);

    for (const app of apps) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `desk-icon${app.id === 'assistant' ? ' desk-icon--verity' : ''}`;
      button.dataset.app = app.id;
      button.innerHTML = `
        <span class="desk-icon__tile" aria-hidden="true">${appIcon(app.id)}</span>
        <span class="desk-icon__label"></span>`;
      button.querySelector('.desk-icon__label').textContent = app.title;
      button.title = `Open ${app.title}`;
      button.setAttribute('aria-label', `${app.title}. Press Enter to open.`);

      button.addEventListener('click', () => select(app.id));
      button.addEventListener('dblclick', () => open(app.id));
      button.addEventListener('pointerup', (event) => {
        if (event.pointerType === 'touch') open(app.id);
      });
      button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open(app.id);
        }
      });
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        select(app.id);
        showMenu(event.clientX, event.clientY, app);
      });

      container.appendChild(button);
    }
  }

  function closeMenu({ restoreFocus = false } = {}) {
    if (menu.hidden) return;
    menu.hidden = true;
    clear(menu);
    menuCleanup?.();
    menuCleanup = null;
    if (restoreFocus) {
      const target = selected
        ? container.querySelector(`.desk-icon[data-app="${selected}"]`)
        : surface;
      target?.focus?.({ preventScroll: true });
    }
  }

  function showMenu(x, y, app = null) {
    closeMenu();

    const items = app
      ? [
          {
            label: `Open ${app.title}`,
            icon: 'external',
            run: () => open(app.id),
          },
          { type: 'separator' },
          { label: 'Personalise desktop…', icon: 'palette', run: onSettings },
        ]
      : [
          { label: 'Open Ask Verity', icon: 'chat', run: () => open('assistant') },
          { label: 'New note', icon: 'pencil', run: onNewNote },
          { type: 'separator' },
          { label: 'Personalise…', icon: 'palette', run: onSettings },
          { label: 'About AskVerity OS', icon: 'info', run: onAbout },
          { type: 'separator' },
          {
            label: 'Refresh desktop',
            icon: 'refresh',
            run: () => {
              renderIcons();
              clearSelection();
            },
          },
        ];

    for (const item of items) {
      if (item.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'context-menu__sep';
        sep.setAttribute('role', 'separator');
        menu.appendChild(sep);
        continue;
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'context-menu__item';
      button.setAttribute('role', 'menuitem');
      button.innerHTML = `${uiIcon(item.icon)}<span></span>`;
      button.querySelector('span').textContent = item.label;
      button.addEventListener('click', () => {
        closeMenu();
        item.run();
      });
      menu.appendChild(button);
    }

    const label = document.createElement('p');
    label.className = 'context-menu__label';
    label.textContent = app ? app.title : 'Desktop';
    menu.prepend(label);

    menu.hidden = false;
    menu.style.left = '0px';
    menu.style.top = '0px';
    const rect = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    menu.querySelector('.context-menu__item')?.focus({ preventScroll: true });

    const onPointerDown = (event) => {
      if (!menu.contains(event.target)) closeMenu();
    };
    const onKeyDown = (event) => {
      const itemsEls = Array.from(menu.querySelectorAll('.context-menu__item'));
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu({ restoreFocus: true });
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const index = itemsEls.indexOf(document.activeElement);
        const next =
          event.key === 'ArrowDown'
            ? (index + 1) % itemsEls.length
            : (index - 1 + itemsEls.length) % itemsEls.length;
        itemsEls[next]?.focus();
      }
      if (event.key === 'Tab') closeMenu();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', () => closeMenu(), { once: true });
    window.addEventListener('blur', () => closeMenu(), { once: true });

    menuCleanup = () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }

  surface.addEventListener('contextmenu', (event) => {
    if (event.target.closest('.window, .desk-icon')) return;
    event.preventDefault();
    clearSelection();
    const menuWidth = 218;
    showMenu(
      Math.min(event.clientX, window.innerWidth - menuWidth - 8),
      event.clientY,
    );
  });

  container.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.desk-icon')) clearSelection();
  });

  surface.addEventListener('pointerdown', (event) => {
    if (event.target === surface || event.target.classList.contains('desktop__texture')) {
      clearSelection();
      closeMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
      closeMenu();
    }
  });

  renderIcons();

  return { renderIcons, clearSelection, closeMenu };
}
