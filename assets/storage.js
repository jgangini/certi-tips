export function readStored(key, fallback, storage = getStorage()) {
  try {
    return JSON.parse(storage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key, value) {
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function getStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return { getItem: () => null };
  }
}
