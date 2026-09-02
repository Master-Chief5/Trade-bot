import { useSyncExternalStore } from 'react';

export interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'error';
}
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export function toast(text: string, kind: Toast['kind'] = 'ok') {
  const id = nextId++;
  toasts = [...toasts, { id, text, kind }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 2600);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
    () => toasts,
  );
}
