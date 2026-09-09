/**
 * Deterministic execution context.
 *
 * Synced devices replay the same store actions. For every device to end up with identical state,
 * ids and timestamps generated inside an action must be reproducible. An event carries a `seed` and
 * an `at`; while it runs, `uid()` draws from the seed and `nowIso()` returns `at`.
 */

interface Context {
  seed: string;
  at: string;
  counter: number;
}

let current: Context | null = null;

export function runWithContext<T>(seed: string, at: string, fn: () => T): T {
  const previous = current;
  current = { seed, at, counter: 0 };
  try {
    return fn();
  } finally {
    current = previous;
  }
}

export function contextId(): string | null {
  if (!current) return null;
  current.counter += 1;
  return `${current.seed}${current.counter.toString(36)}`;
}

export function contextTime(): string | null {
  return current?.at ?? null;
}

export function randomSeed(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID().replace(/-/g, '').slice(0, 12);
  return Math.random().toString(36).slice(2, 14);
}
