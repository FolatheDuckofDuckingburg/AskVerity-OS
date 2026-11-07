import test from 'node:test';
import assert from 'node:assert/strict';

import { collectIds, deleteToTrash } from './vfs.js';

test('collectIds returns a folder and all descendants in breadth-first order', () => {
  const tree = {
    items: [
      { id: 'root', parent: null, type: 'folder' },
      { id: 'a', parent: 'root', type: 'folder' },
      { id: 'b', parent: 'root', type: 'file' },
      { id: 'a1', parent: 'a', type: 'file' },
    ],
    trash: [],
  };

  assert.deepEqual(collectIds(tree, 'root'), ['root', 'a', 'b', 'a1']);
});

test('collectIds terminates when stored folder relationships contain a cycle', () => {
  const tree = {
    items: [
      { id: 'root', parent: 'loop', type: 'folder' },
      { id: 'child', parent: 'root', type: 'folder' },
      { id: 'loop', parent: 'child', type: 'folder' },
      { id: 'sibling', parent: 'root', type: 'file' },
    ],
    trash: [],
  };

  const ids = collectIds(tree, 'root');
  assert.deepEqual(ids, ['root', 'child', 'sibling', 'loop']);
  assert.equal(new Set(ids).size, ids.length);
});

test('collectIds returns an empty list for a missing item', () => {
  assert.deepEqual(collectIds({ items: [], trash: [] }, 'missing'), []);
});

test('deleteToTrash moves each reachable item once even when the tree has a cycle', () => {
  const tree = {
    items: [
      { id: 'root', name: 'Root', parent: null, type: 'folder' },
      { id: 'child', name: 'Child', parent: 'root', type: 'folder' },
      { id: 'root', name: 'Duplicate root', parent: 'child', type: 'file' },
    ],
    trash: [],
  };

  assert.equal(deleteToTrash(tree, 'root'), 2);
  assert.equal(tree.items.length, 1);
  assert.equal(tree.items[0].name, 'Duplicate root');
  assert.equal(tree.trash.length, 2);
});

test('deleteToTrash leaves the tree unchanged for a missing item', () => {
  const tree = { items: [{ id: 'kept', name: 'Keep', parent: null, type: 'file' }], trash: [] };

  assert.equal(deleteToTrash(tree, 'missing'), 0);
  assert.equal(tree.items.length, 1);
  assert.equal(tree.trash.length, 0);
});
