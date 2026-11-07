import { read, write, uid } from '../store.js';

/**
 * The simulated AskVerity drive.
 *
 * Everything here lives in localStorage in the user's browser. Nothing on the
 * real computer is read, listed or touched — the UI says so in a few places.
 */

const daysAgo = (days) => Date.now() - days * 86_400_000;

const SEED = {
  items: [
    { id: 'root-documents', name: 'Documents', type: 'folder', parent: null, modified: daysAgo(2) },
    { id: 'root-pictures', name: 'Pictures', type: 'folder', parent: null, modified: daysAgo(6) },
    { id: 'root-music', name: 'Music', type: 'folder', parent: null, modified: daysAgo(11) },
    { id: 'root-projects', name: 'Projects', type: 'folder', parent: null, modified: daysAgo(1) },
    {
      id: 'doc-welcome',
      name: 'welcome.txt',
      type: 'file',
      parent: 'root-documents',
      modified: daysAgo(2),
      content:
        'Welcome to AskVerity OS!\\n\\nThis drive is simulated. Every file you see lives in your browser\\'s local storage, not on your computer.\\n\\nThings to try:\\n- Open the Notes app and write something.\\n- Switch Files to list view.\\n- Delete a file and restore it from Trash.\\n- Ask Verity what it can do.\\n',
    },
    {
      id: 'doc-shortcuts',
      name: 'keyboard-shortcuts.md',
      type: 'file',
      parent: 'root-documents',
      modified: daysAgo(4),
      content:
        '# Keyboard shortcuts\\n\\n- Alt + Shift + V — open Verity\\n- Alt + Shift + S — open the Start menu\\n- Enter on a desktop icon — open the app\\n- Escape — close menus and popovers\\n- Tab / Shift + Tab — move between controls\\n\\nWindows are draggable by their title bars. Double-click a title bar to maximise.\\n',
    },
    {
      id: 'doc-verity',
      name: 'about-verity.txt',
      type: 'file',
      parent: 'root-documents',
      modified: daysAgo(5),
      content:
        'Verity is the resident assistant of AskVerity OS.\\n\\nVerity is a yellow smiley face, drawn entirely in SVG: they try very hard to be useful without pretending to know things they do not.\\n\\nVerity has no fixed gender. Without a local model configured they run on a small demo brain that can greet you, do arithmetic, tell the time and explain the desktop. With Ollama running, a real model takes over.\\n',
    },
    {
      id: 'pic-face',
      name: 'verity-face.svg',
      type: 'file',
      parent: 'root-pictures',
      modified: daysAgo(6),
      content:
        '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">\\n  <circle cx="60" cy="62" r="45" fill="#FFE66D" stroke="#292929" stroke-width="4"/>\\n  <circle cx="44" cy="50" r="6" fill="#292929"/>\\n  <circle cx="76" cy="50" r="6" fill="#292929"/>\\n  <path d="M42 74q18 17 36 0" fill="none" stroke="#292929" stroke-width="4" stroke-linecap="round"/>\\n</svg>\\n',
    },
    {
      id: 'pic-notes',
      name: 'wallpaper-notes.txt',
      type: 'file',
      parent: 'root-pictures',
      modified: daysAgo(9),
      content:
        'Wallpaper sketches (all drawn with CSS gradients, no image files):\\n\\n1. Sky — soft blue with distant clouds.\\n2. Lavender — pale purple with a warm sun.\\n3. Sunrise — peach, pink and a low sun.\\n4. Pixel grid — cream with a 32px grid.\\n5. Midnight — navy, stars and a soft moon.\\n',
    },
    {
      id: 'mus-chime',
      name: 'desktop-chime.txt',
      type: 'file',
      parent: 'root-music',
      modified: daysAgo(11),
      content:
        'AskVerity OS does not ship audio files.\\n\\nInterface sounds are generated live with the Web Audio API: two short triangle-wave notes for opening a window, a lower pair for closing, and a small rise for notifications.\\n\\nYou can switch them off in Settings → Sound effects.\\n',
    },
    { id: 'proj-folder', name: 'askverity-os', type: 'folder', parent: 'root-projects', modified: daysAgo(1) },
    {
      id: 'proj-readme',
      name: 'README.md',
      type: 'file',
      parent: 'proj-folder',
      modified: daysAgo(1),
      content:
        '# AskVerity OS\\n\\nA small desktop environment in the browser.\\n\\n- Frontend: plain HTML, CSS and ES modules. No framework.\\n- Backend: a tiny Node.js server with zero dependencies.\\n- Assistant: an Ollama provider and a built-in demo brain behind one interface.\\n\\nRun it with: npm start\\n',
    },
    {
      id: 'proj-roadmap',
      name: 'roadmap.md',
      type: 'file',
      parent: 'proj-folder',
      modified: daysAgo(1),
      content:
        '# Ideas for later\\n\\n- A text editor app with real file export.\\n- Multiple assistant providers behind the same interface.\\n- Window snapping to screen edges.\\n- A shared clipboard between apps.\\n\\nShortcuts and honesty first, features second.\\n',
    },
  ],
  trash: [
    {
      id: 'trash-old-list',
      name: 'old-shopping-list.txt',
      type: 'file',
      parent: null,
      modified: daysAgo(12),
      content: 'postcards\\npens\\nsomething yellow\\n',
      trashId: 'trash-entry-1',
      trashGroup: 'trash-group-1',
      deletedAt: daysAgo(2),
    },
  ],
};

export function loadTree() {
  const stored = read('vfs', null);
  if (stored && Array.isArray(stored.items)) {
    return {
      items: stored.items.filter((item) => item && typeof item.id === 'string'),
      trash: Array.isArray(stored.trash) ? stored.trash : [],
    };
  }
  const seeded = JSON.parse(JSON.stringify(SEED));
  write('vfs', seeded);
  return seeded;
}

export function saveTree(tree) {
  return write('vfs', { items: tree.items, trash: tree.trash });
}

export function findItem(tree, id) {
  return tree.items.find((item) => item.id === id) ?? null;
}

export function childrenOf(tree, parentId) {
  return tree.items
    .filter((item) => (item.parent ?? null) === (parentId ?? null))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
}

export function pathOf(tree, item) {
  const path = [];
  let current = item;
  let guard = 0;
  while (current && guard < 32) {
    path.unshift(current);
    current = current.parent ? findItem(tree, current.parent) : null;
    guard += 1;
  }
  return path;
}

export function collectIds(tree, id) {
  if (!findItem(tree, id)) return [];

  const childrenByParent = new Map();
  for (const item of tree.items) {
    if (typeof item.id !== 'string') continue;
    const parentId = item.parent ?? null;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(item.id);
    childrenByParent.set(parentId, children);
  }

  const ids = [];
  const queue = [id];
  const visited = new Set();
  for (let index = 0; index < queue.length; index += 1) {
    const currentId = queue[index];
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    ids.push(currentId);
    for (const childId of childrenByParent.get(currentId) ?? []) {
      if (!visited.has(childId)) queue.push(childId);
    }
  }
  return ids;
}

export function deleteToTrash(tree, id) {
  const ids = collectIds(tree, id);
  if (!ids.length) return 0;

  const group = uid('trash-group');
  let moved = 0;

  for (const itemId of ids) {
    const index = tree.items.findIndex((item) => item.id === itemId);
    if (index === -1) continue;
    const [item] = tree.items.splice(index, 1);
    tree.trash.push({
      ...item,
      trashId: uid('trash'),
      trashGroup: group,
      deletedAt: Date.now(),
    });
    moved += 1;
  }

  if (moved) saveTree(tree);
  return moved;
}

export function restoreFromTrash(tree, trashId) {
  const entry = tree.trash.find((item) => item.trashId === trashId);
  if (!entry) return 0;

  const group = entry.trashGroup;
  const entries = tree.trash.filter(
    (item) => (group ? item.trashGroup === group : item.trashId === trashId),
  );

  let restored = 0;
  for (const item of entries) {
    tree.trash = tree.trash.filter((candidate) => candidate !== item);
    const { trashId, trashGroup, deletedAt, ...original } = item;
    const parentExists = original.parent ? tree.items.some((i) => i.id === original.parent) : true;
    tree.items.push({ ...original, parent: parentExists ? original.parent : null });
    restored += 1;
  }

  saveTree(tree);
  return restored;
}

export function emptyTrash(tree) {
  const count = tree.trash.length;
  if (!count) return 0;
  tree.trash = [];
  saveTree(tree);
  return count;
}

export function searchItems(tree, query) {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  return tree.items.filter((item) => item.name.toLowerCase().includes(term));
}

export function kindOf(item) {
  if (!item) return 'other';
  if (item.type === 'folder') return 'folder';
  const extension = item.name.toLowerCase().split('.').pop() ?? '';
  if (['txt', 'md', 'log', 'json', 'js', 'css', 'html', 'svg'].includes(extension)) {
    if (extension === 'svg') return 'image';
    return 'text';
  }
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension)) return 'image';
  if (['mp3', 'wav', 'ogg', 'flac'].includes(extension)) return 'audio';
  return 'other';
}

export function prettySize(item) {
  if (!item) return '—';
  if (item.type === 'folder') return '—';
  const bytes = item.content ? new TextEncoder().encode(item.content).length : 0;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return `${kb >= 10 ? Math.round(kb) : kb.toFixed(1)} KB`;
}
