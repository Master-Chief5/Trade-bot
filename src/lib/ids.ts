export function uid(prefix = ''): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return prefix + c.randomUUID().replace(/-/g, '').slice(0, 16);
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6);
}
