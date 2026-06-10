const SHARED_PREFIX = 'shared:';

function localKey(key, shared) {
  return shared ? SHARED_PREFIX + key : key;
}

function readProperty(target, key) {
  try {
    return target?.[key];
  } catch {
    return null;
  }
}

export function createStorageAdapter(windowLike = globalThis) {
  const hosted = readProperty(windowLike, 'storage');
  const local = readProperty(windowLike, 'localStorage');

  return {
    async get(key, shared = false) {
      if (hosted?.get) return hosted.get(key, shared);
      if (!local?.getItem) return null;
      const value = local.getItem(localKey(key, shared));
      return value == null ? null : { value };
    },

    async set(key, value, shared = false) {
      if (hosted?.set) return hosted.set(key, value, shared);
      if (!local?.setItem) return;
      local.setItem(localKey(key, shared), value);
    },

    async remove(key, shared = false) {
      if (hosted?.remove) return hosted.remove(key, shared);
      if (local?.removeItem) local.removeItem(localKey(key, shared));
    }
  };
}
