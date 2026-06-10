import test from 'node:test';
import assert from 'node:assert/strict';

import { createStorageAdapter } from '../src/systems/storage/storageAdapter.js';

function createLocalStorageMock() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    }
  };
}

test('storage adapter falls back to localStorage when window.storage is unavailable', async () => {
  const storage = createStorageAdapter({
    localStorage: createLocalStorageMock()
  });

  await storage.set('blade_stats', '{"hi":1200}');
  const result = await storage.get('blade_stats');

  assert.deepEqual(result, { value: '{"hi":1200}' });
});

test('storage adapter prefers window.storage when the hosted storage API exists', async () => {
  const calls = [];
  const storage = createStorageAdapter({
    storage: {
      async get(key, shared) {
        calls.push(['get', key, shared]);
        return { value: 'hosted' };
      },
      async set(key, value, shared) {
        calls.push(['set', key, value, shared]);
      }
    },
    localStorage: createLocalStorageMock()
  });

  await storage.set('blade_lb', '[1]', true);
  const result = await storage.get('blade_lb', true);

  assert.equal(result.value, 'hosted');
  assert.deepEqual(calls, [
    ['set', 'blade_lb', '[1]', true],
    ['get', 'blade_lb', true]
  ]);
});
