import { uiIcon } from '../icons.js';
import { bus } from '../bus.js';
import { clear, formatRelative, fromHTML } from '../ui.js';
import { emptyTrash, loadTree, restoreFromTrash } from '../lib/vfs.js';

export default {
  id: 'trash',
  title: 'Trash',
  size: { w: 620, h: 480 },

  mount(body, ctx) {
    let tree = loadTree();

    const root = fromHTML(`
      <div class="trash">
        <div class="trash__bar">
          <p class="trash__bar-text" data-summary>Reading the bin…</p>
          <button class="btn btn--small" type="button" data-empty>${uiIcon('trash')}<span>Empty trash</span></button>
        </div>
        <div class="trash__list" data-list></div>
      </div>`);

    body.appendChild(root);

    const listEl = root.querySelector('[data-list]');
    const summaryEl = root.querySelector('[data-summary]');
    const emptyButton = root.querySelector('[data-empty]');

    function render() {
      tree = loadTree();
      clear(listEl);

      const entries = [...tree.trash].sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

      summaryEl.textContent = entries.length
        ? `${entries.length} item${entries.length === 1 ? '' : 's'} in the bin · simulated`
        : 'The bin is empty · simulated';

      emptyButton.disabled = entries.length === 0;

      if (!entries.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = `${uiIcon('trash')}<strong>Nothing in the trash</strong><p>Files you delete in the Files app wait here until you empty it.</p>`;
        listEl.appendChild(empty);
        return;
      }

      for (const entry of entries) {
        const row = document.createElement('div');
        row.className = 'trash-row';
        row.innerHTML = `
          ${uiIcon(entry.type === 'folder' ? 'folder' : 'doc')}
          <span class="trash-row__text">
            <span class="trash-row__name"></span>
            <span class="trash-row__meta"></span>
          </span>`;

        row.querySelector('.trash-row__name').textContent = entry.name;
        row.querySelector('.trash-row__meta').textContent =
          `${entry.type === 'folder' ? 'Folder' : 'File'} · deleted ${formatRelative(entry.deletedAt ?? Date.now())}`;

        const restore = document.createElement('button');
        restore.type = 'button';
        restore.className = 'btn btn--small';
        restore.innerHTML = `${uiIcon('restore')}<span>Restore</span>`;
        restore.setAttribute('aria-label', `Restore ${entry.name}`);
        restore.addEventListener('click', () => {
          const count = restoreFromTrash(tree, entry.trashId);
          bus.emit('files:changed', { restored: count });
          ctx.notify({
            title: count > 1 ? `${count} items restored` : `${entry.name} restored`,
            body: 'Back on the simulated drive.',
            tone: 'success',
            duration: 3000,
          });
          render();
        });

        row.appendChild(restore);
        listEl.appendChild(row);
      }
    }

    emptyButton.addEventListener('click', () => {
      if (!tree.trash.length) return;
      const confirmed = window.confirm(
        `Permanently delete ${tree.trash.length} item${tree.trash.length === 1 ? '' : 's'}? This cannot be undone.`,
      );
      if (!confirmed) return;
      const count = emptyTrash(tree);
      bus.emit('files:changed', { emptied: count });
      ctx.notify({ title: 'Trash emptied', body: `${count} item${count === 1 ? '' : 's'} permanently deleted.`, tone: 'info', duration: 3200 });
      render();
    });

    const unsubscribe = bus.on('files:changed', () => render());
    ctx.onCleanup(unsubscribe);

    render();
  },
};
