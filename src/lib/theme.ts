import { useSyncExternalStore } from 'react';

export type Theme = 'system' | 'light' | 'dark';
const KEY = 'rh-theme';
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

let current: Theme = read();

function apply() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (current === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', current);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolvedTheme() === 'dark' ? '#121820' : '#24466E');
}

export function getTheme(): Theme {
  return current;
}

export function setTheme(t: Theme) {
  current = t;
  try {
    if (t === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    // storage may be unavailable; the choice still applies for this page load
  }
  apply();
  listeners.forEach((l) => l());
}

export function resolvedTheme(): 'light' | 'dark' {
  if (current !== 'system') return current;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const t = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getTheme,
    getTheme,
  );
  return [t, setTheme];
}

apply();
