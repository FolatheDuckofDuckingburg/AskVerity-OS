import { uiIcon } from '../icons.js';
import { veritySVG } from '../verity.js';
import { bus } from '../bus.js';
import { clear, formatShortDate, fromHTML } from '../ui.js';
import { read, write } from '../store.js';
import {
  childrenOf,
  deleteToTrash,
  findItem,
  kindOf,
  loadTree,
  pathOf,
  prettySize,
  saveTree,
  searchItems,
} from '../lib/vfs.js';

const KIND_ICONS = {
  folder: 'folder',
  text: 'doc',
  image: 'image',
  audio: 'music',
  other: 'box',
};

const SHORTCUTS = [
  { id: null, label: 'Home', icon: 'home' },
  { id: 'root-documents', label: 'Documents', icon: 'doc' },
  { id: 'root-pictures', label: 'Pictures', icon: 'image' },
  { id: 'root-music', label: 'Music', icon: 'music' },
  { id: 'root-projects', label: 'Projects', icon: 'folder' },
];

export default {
  id: 'files',
  title: 'Files',
  size: { w: 900, h: 580 },

  mount(body, ctx) {
    let tree = loadTree();
    let folderId = null;
    let selectedId = null;
    let query = '';
    let view = read('filesView', 'grid');
    if (view !== 'list') view = 'grid';

    const root = fromHTML(`
      <div class="files">
        <aside class="files__sidebar" aria-label="Places">
          <p class="files__group-label">This browser</p>
          <div data-shortcuts></div>
          <p class="files__group-label">System</p>
          <button class="files__navbtn" type="button" data-open-trash>
            ${uiIcon('trash')}<span>Trash</span>
          </button>
        </aside>
        <section class="files__main">
          <div class="files__toolbar">
            <div class="field">
              <span aria-hidden="true">${uiIcon('search')}</span>
              <label class="sr-only" for="files-search">Search the simulated drive</label>
              <input id="files-search" type="search" data-search placeholder="Search files" autocomplete="off" />
            </div>
            <button class="icon-button" type="button" data-view="grid" aria-label="Grid view" title="Grid view" aria-pressed="false">${uiIcon('grid')}</button>
            <button class="icon-button" type="button" data-view="list" aria-label="List view" title="List view" aria-pressed="false">${uiIcon('list')}</button>
          </div>
          <nav class="crumbs" data-crumbs aria-label="Breadcrumb"></nav>
          <div class="files__body" data-body></div>
          <div class="files__status">
            <span class="dot" data-state="local" aria-hidden="true"></span>
            <span data-status-text>Simulated drive · stored in this browser</span>
          </div>
        </section>
        <aside class="files__details" data-details aria-label="File details"></aside>
      </div>`);

    body.appendChild(root);

    const shortcutsEl = root.querySelector('[data-shortcuts]');
    const searchEl = root.querySelector('[data-search]');
    const crumbsEl = root.querySelector('[data-crumbs]');
    const bodyEl = root.querySelector('[data-body]');
    const detailsEl = root.querySelector('[data-details]');
    const statusText = root.querySelector('[data-status-text]');
    const gridButton = root.querySelector('[data-view="grid"]');
    const listButton = root.querySelector('[data-view="list"]');

    for (const shortcut of SHORTCUTS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'files__navbtn';
      button.innerHTML = `${uiIcon(shortcut.icon)}<span></span>`;
      button.querySelector('span').textContent = shortcut.label;
      button.addEventListener('click', () => {
        folderId = shortcut.id;
        query = '';
        searchEl.value = '';
        selectedId = null;
        render();
      });
      button.dataset.folder = shortcut.id ?? 'home';
      shortcutsEl.appendChild(button);
    }

    root.querySelector('[data-open-trash]').addEventListener('click', () => ctx.openApp('trash'));

    function updateViewButtons() {
      gridButton.setAttribute('aria-pressed', String(view === 'grid'));
      listButton.setAttribute('aria-pressed', String(view === 'list'));
    }

    gridButton.addEventListener('click', () => {
      view = 'grid';
      write('filesView', view);
      updateViewButtons();
      renderBody();
    });

    listButton.addEventListener('click', () => {
      view = 'list';
      write('filesView', view);
      updateViewButtons();
      renderBody();
    });

    searchEl.addEventListener('input', () => {
      query = searchEl.value;
      selectedId = null;
      render();
    });

    function currentFolder() {
      return folderId ? findItem(tree, folderId) : null;
    }

    function renderCrumbs() {
      clear(crumbsEl);

      const home = document.createElement('button');
      home.type = 'button';
      home.className = 'crumb';
      home.textContent = 'Home';
      if (!folderId) home.setAttribute('aria-current', 'page');
      home.addEventListener('click', () => {
        folderId = null;
        selectedId = null;
        render();
      });
      crumbsEl.appendChild(home);

      const folder = currentFolder();
      if (!folder) return;

      const path = pathOf(tree, folder);
      for (const [position, item] of path.entries()) {
        const separator = document.createElement('span');
        separator.className = 'crumb-sep';
        separator.setAttribute('aria-hidden', 'true');
        separator.textContent = '/';
        crumbsEl.appendChild(separator);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'crumb';
        button.textContent = item.name;
        if (position === path.length - 1) button.setAttribute('aria-current', 'page');
        button.addEventListener('click', () => {
          folderId = item.id;
          selectedId = null;
          render();
        });
        crumbsEl.appendChild(button);
      }
    }

    function tileFor(item) {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'file-tile';
      tile.dataset.id = item.id;
      tile.classList.toggle('is-selected', item.id === selectedId);
      tile.innerHTML = `
        ${uiIcon(KIND_ICONS[kindOf(item)] ?? 'doc')}
        <span class="file-tile__name"></span>
        <span class="file-tile__meta"></span>`;
      tile.querySelector('.file-tile__name').textContent = item.name;
      tile.querySelector('.file-tile__meta').textContent =
        item.type === 'folder' ? 'Folder' : `${prettySize(item)} · ${formatShortDate(item.modified ?? Date.now())}`;
      tile.title = `${item.name}${item.type === 'folder' ? '' : ` · ${prettySize(item)}`}`;

      tile.addEventListener('click', () => {
        selectedId = item.id;
        renderBody();
        renderDetails();
      });

      tile.addEventListener('dblclick', () => openItem(item));

      tile.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          openItem(item);
        }
      });

      return tile;
    }

    function openItem(item) {
      if (!item) return;
      if (item.type === 'folder') {
        folderId = item.id;
        selectedId = null;
        query = '';
        searchEl.value = '';
        render();
        return;
      }
      selectedId = item.id;
      renderBody();
      renderDetails();
      detailsEl.focus?.();
    }

    function renderBody() {
      clear(bodyEl);

      const grid = document.createElement('div');
      grid.className = `files__grid${view === 'list' ? ' is-list' : ''}`;

      let items;
      let emptyTitle = 'This folder is empty';
      let emptyBody = 'Nothing here yet.';

      if (query.trim()) {
        items = searchItems(tree, query).sort((a, b) => a.name.localeCompare(b.name));
        emptyTitle = 'No matches';
        emptyBody = `Nothing on the simulated drive matches “${query.trim()}”.`;
      } else {
        items = childrenOf(tree, folderId);
      }

      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = `${uiIcon(query.trim() ? 'search' : 'folder')}<strong data-empty-title></strong><p data-empty-body></p>`;
        empty.querySelector('[data-empty-title]').textContent = emptyTitle;
        empty.querySelector('[data-empty-body]').textContent = emptyBody;
        bodyEl.appendChild(empty);
      } else {
        for (const item of items) {
          const tile = tileFor(item);
          if (query.trim() && item.type === 'file') {
            const location = pathOf(tree, item)
              .slice(0, -1)
              .map((part) => part.name)
              .join(' / ');
            tile.querySelector('.file-tile__meta').textContent = location || 'Home';
          }
          grid.appendChild(tile);
        }
        bodyEl.appendChild(grid);
      }

      const folderName = currentFolder()?.name ?? 'Home';
      statusText.textContent = query.trim()
        ? `${items.length} result${items.length === 1 ? '' : 's'} · Simulated drive`
        : `${items.length} item${items.length === 1 ? '' : 's'} in ${folderName} · Simulated drive`;

      root.querySelectorAll('[data-folder]').forEach((button) => {
        const target = button.dataset.folder === 'home' ? null : button.dataset.folder;
        button.setAttribute('aria-current', String(target === folderId));
      });
    }

    function detailRow(label, value) {
      const wrapper = document.createElement('div');
      wrapper.className = 'detail-row';
      wrapper.innerHTML = '<dt></dt><dd></dd>';
      wrapper.querySelector('dt').textContent = label;
      wrapper.querySelector('dd').textContent = value;
      return wrapper;
    }

    function renderDetails() {
      clear(detailsEl);
      const item = selectedId ? findItem(tree, selectedId) : null;

      if (!item) {
        detailsEl.innerHTML = `
          <div class="files__details-face" aria-hidden="true">${veritySVG('curious', { decorative: true })}</div>
          <p class="files__details-name">Nothing selected</p>
          <p class="settings__note">
            Choose a file or folder to see its details. Everything on this drive is
            simulated and lives in your browser.
          </p>`;
        return;
      }

      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.gap = '9px';
      header.style.alignItems = 'center';
      header.innerHTML = `<span aria-hidden="true">${uiIcon(KIND_ICONS[kindOf(item)] ?? 'doc')}</span><span class="files__details-name"></span>`;
      header.querySelector('.files__details-name').textContent = item.name;
      detailsEl.appendChild(header);

      const list = document.createElement('dl');
      list.style.display = 'grid';
      list.style.gap = '8px';
      list.style.margin = '0';
      list.appendChild(detailRow('Type', item.type === 'folder' ? 'Folder' : kindOf(item)));
      list.appendChild(detailRow('Size', prettySize(item)));
      list.appendChild(detailRow('Modified', formatShortDate(item.modified ?? Date.now())));
      list.appendChild(
        detailRow(
          'Location',
          pathOf(tree, item)
            .slice(0, -1)
            .map((part) => part.name)
            .join(' / ') || 'Home',
        ),
      );
      list.appendChild(detailRow('Source', 'Simulated · browser storage'));
      detailsEl.appendChild(list);

      if (item.type === 'file' && item.content) {
        const preview = document.createElement('pre');
        preview.className = 'details-preview';
        preview.textContent = item.content.slice(0, 600);
        detailsEl.appendChild(preview);
      }

      const actions = document.createElement('div');
      actions.className = 'settings__actions';

      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'btn btn--small btn--primary';
      openButton.textContent = item.type === 'folder' ? 'Open folder' : 'Show preview';
      openButton.addEventListener('click', () => openItem(item));

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'btn btn--small';
      deleteButton.textContent = 'Move to Trash';
      deleteButton.addEventListener('click', () => {
        const moved = deleteToTrash(tree, item.id);
        selectedId = null;
        bus.emit('files:changed', { moved });
        ctx.notify({
          title: moved > 1 ? `${moved} items moved to Trash` : `${item.name} moved to Trash`,
          body: 'You can restore it from the Trash app.',
          tone: 'success',
          duration: 3200,
        });
        render();
      });

      actions.append(openButton, deleteButton);
      detailsEl.appendChild(actions);
    }

    function render() {
      renderCrumbs();
      renderBody();
      renderDetails();
    }

    const unsubscribe = bus.on('files:changed', () => {
      tree = loadTree();
      if (selectedId && !findItem(tree, selectedId)) selectedId = null;
      render();
    });

    ctx.onCleanup(unsubscribe);

    updateViewButtons();
    render();

    // Persist the tree at least once so first-run seeding is visible in Trash.
    saveTree(tree);
  },
};
