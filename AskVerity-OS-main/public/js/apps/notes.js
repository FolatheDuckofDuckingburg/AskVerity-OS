import { uiIcon } from '../icons.js';
import { veritySVG } from '../verity.js';
import { bus } from '../bus.js';
import { clear, formatRelative, fromHTML } from '../ui.js';
import { read, uid, write } from '../store.js';

const SEED_NOTE = {
  id: 'note-welcome',
  title: 'Welcome to Notes',
  body:
    'This is a real text editor for a made-up desktop.\n\n' +
    '• Everything you type is saved in this browser as you go.\n' +
    '• Create a note with the + button, rename it in the title field, delete it with the bin.\n' +
    '• Search filters by title and text.\n\n' +
    'Nothing here is uploaded anywhere. Close the window, reload the page: your notes stay.',
  createdAt: Date.now() - 86_400_000,
  updatedAt: Date.now() - 86_400_000,
};

function seedNotes() {
  return [JSON.parse(JSON.stringify(SEED_NOTE))];
}

function loadNotes() {
  const stored = read('notes', null);
  if (Array.isArray(stored)) {
    return stored.filter(
      (note) => note && typeof note.title === 'string' && typeof note.body === 'string',
    );
  }
  const seeded = seedNotes();
  write('notes', seeded);
  return seeded;
}

function wordCount(text) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export default {
  id: 'notes',
  title: 'Notes',
  size: { w: 860, h: 580 },

  mount(body, ctx) {
    let notes = loadNotes();
    let activeId = notes[0]?.id ?? null;
    let query = '';
    let saveTimer = null;
    let lastSavedAt = 0;
    let dirty = false;

    const root = fromHTML(`
      <div class="notes">
        <aside class="notes__sidebar" aria-label="Notes">
          <div class="notes__sidebar-top">
            <div class="field" style="flex:1">
              <span aria-hidden="true">${uiIcon('search')}</span>
              <label class="sr-only" for="notes-search">Search notes</label>
              <input id="notes-search" type="search" data-search placeholder="Search notes" autocomplete="off" />
            </div>
            <button class="icon-button" type="button" data-new aria-label="New note" title="New note">${uiIcon('plus')}</button>
          </div>
          <div class="notes__list" data-list></div>
        </aside>
        <section class="notes__editor" data-editor aria-label="Note editor"></section>
      </div>`);

    body.appendChild(root);

    const listEl = root.querySelector('[data-list]');
    const editorEl = root.querySelector('[data-editor]');
    const searchEl = root.querySelector('[data-search]');

    function persist({ notify = false } = {}) {
      const saved = write('notes', notes);
      if (!saved) {
        ctx.notify({
          title: 'Could not save notes',
          body: 'This browser is blocking local storage, so the note may not survive a reload.',
          tone: 'error',
          duration: 7000,
        });
        return;
      }

      if (notify && Date.now() - lastSavedAt > 8000) {
        lastSavedAt = Date.now();
        ctx.notify({ title: 'Note saved', body: 'Stored in this browser.', tone: 'success', duration: 2400 });
      }
    }

    function activeNote() {
      let note = notes.find((item) => item.id === activeId);
      if (!note) {
        note = notes[0];
        if (!note) {
          note = {
            id: uid('note'),
            title: 'Untitled note',
            body: '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          notes.unshift(note);
        }
        activeId = note.id;
      }
      return note;
    }

    function filteredNotes() {
      const term = query.trim().toLowerCase();
      const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
      if (!term) return sorted;
      return sorted.filter(
        (note) =>
          note.title.toLowerCase().includes(term) || note.body.toLowerCase().includes(term),
      );
    }

    function renderList() {
      clear(listEl);
      const visible = filteredNotes();

      if (!visible.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = `${uiIcon('search')}<strong>No notes found</strong><p>Try a different search.</p>`;
        listEl.appendChild(empty);
        return;
      }

      for (const note of visible) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `note-item${note.id === activeId ? ' is-active' : ''}`;
        button.innerHTML = '<span class="note-item__title"></span><span class="note-item__meta"></span>';
        button.querySelector('.note-item__title').textContent = note.title || 'Untitled note';

        const snippet = note.body.replace(/\s+/g, ' ').trim();
        const meta = `${formatRelative(note.updatedAt)} · ${wordCount(note.body)} word${wordCount(note.body) === 1 ? '' : 's'}`;
        button.querySelector('.note-item__meta').textContent = snippet ? meta : `Empty · ${meta}`;

        button.setAttribute('aria-current', String(note.id === activeId));
        button.addEventListener('click', () => {
          if (dirty) saveNow();
          activeId = note.id;
          renderList();
          renderEditor();
        });
        listEl.appendChild(button);
      }
    }

    function renderEmptyEditor() {
      editorEl.innerHTML = `
        <div class="empty-state" style="flex:1">
          <div class="empty-state__face" aria-hidden="true">${veritySVG('curious', { decorative: true })}</div>
          <strong>No notes yet</strong>
          <p>Notes you write here are saved in this browser.</p>
          <button class="btn btn--primary btn--small" type="button" data-create>Create a note</button>
        </div>`;
      editorEl.querySelector('[data-create]').addEventListener('click', createNote);
    }

    function renderEditor() {
      if (!notes.length) {
        renderEmptyEditor();
        return;
      }

      const note = activeNote();
      editorEl.innerHTML = `
        <div class="notes__head">
          <label class="sr-only" for="note-title">Note title</label>
          <input class="notes__title" id="note-title" data-title maxlength="120" autocomplete="off" />
          <span class="notes__save-state" data-save-state>Saved</span>
          <button class="icon-button" type="button" data-delete aria-label="Delete this note" title="Delete note">${uiIcon('trash')}</button>
        </div>
        <div class="notes__body">
          <label class="sr-only" for="note-body">Note text</label>
          <textarea class="notes__textarea" id="note-body" data-note-body spellcheck="true" placeholder="Start writing…"></textarea>
        </div>
        <div class="notes__foot">
          <span data-edited></span>
          <span data-words></span>
        </div>`;

      const titleEl = editorEl.querySelector('[data-title]');
      const bodyEl = editorEl.querySelector('[data-note-body]');
      const stateEl = editorEl.querySelector('[data-save-state]');
      const editedEl = editorEl.querySelector('[data-edited]');
      const wordsEl = editorEl.querySelector('[data-words]');

      titleEl.value = note.title;
      bodyEl.value = note.body;

      const paintMeta = () => {
        editedEl.textContent = `Edited ${formatRelative(note.updatedAt)}`;
        wordsEl.textContent = `${wordCount(note.body)} words`;
      };
      paintMeta();
      stateEl.textContent = 'Saved';

      function scheduleSave() {
        dirty = true;
        stateEl.textContent = 'Saving…';
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          saveNow();
        }, 550);
      }

      function saveNow() {
        clearTimeout(saveTimer);
        dirty = false;
        note.title = titleEl.value.trim() || 'Untitled note';
        note.body = bodyEl.value;
        note.updatedAt = Date.now();
        persist({ notify: true });
        stateEl.textContent = 'Saved';
        paintMeta();
        renderList();
      }

      titleEl.addEventListener('input', () => {
        note.title = titleEl.value;
        scheduleSave();
      });
      titleEl.addEventListener('blur', () => {
        if (dirty) saveNow();
      });

      bodyEl.addEventListener('input', () => {
        note.body = bodyEl.value;
        scheduleSave();
      });
      bodyEl.addEventListener('blur', () => {
        if (dirty) saveNow();
      });

      editorEl.querySelector('[data-delete]').addEventListener('click', () => {
        const confirmed = window.confirm(`Delete “${note.title || 'Untitled note'}”? This cannot be undone.`);
        if (!confirmed) return;
        notes = notes.filter((item) => item.id !== note.id);
        activeId = notes[0]?.id ?? null;
        persist();
        renderList();
        renderEditor();
        ctx.notify({ title: 'Note deleted', body: note.title, tone: 'info', duration: 3000 });
      });
    }

    function createNote() {
      if (dirty) saveNow();
      const note = {
        id: uid('note'),
        title: 'Untitled note',
        body: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      notes.unshift(note);
      activeId = note.id;
      query = '';
      searchEl.value = '';
      persist();
      renderList();
      renderEditor();
      const titleEl = editorEl.querySelector('[data-title]');
      titleEl?.focus();
      titleEl?.select();
    }

    searchEl.addEventListener('input', () => {
      query = searchEl.value;
      renderList();
    });

    root.querySelector('[data-new]').addEventListener('click', createNote);

    const unsubscribeNew = bus.on('notes:new', () => createNote());

    ctx.onCleanup(() => {
      unsubscribeNew();
      if (saveTimer) {
        clearTimeout(saveTimer);
        const note = activeNote();
        note.updatedAt = Date.now();
        persist();
      }
    });

    renderList();
    renderEditor();
  },
};
