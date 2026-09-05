import { useSyncExternalStore } from 'react';

const KEY = 'rh-session';
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

let userId: string | null = read();

export function getSessionUserId(): string | null {
  return userId;
}

export function signIn(id: string) {
  userId = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

export function signOut() {
  userId = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

export function useSessionUserId(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getSessionUserId,
    getSessionUserId,
  );
}
