// Client for the 24/7 cloud bot — a Supabase Edge Function that runs the same
// engine server-side, ticked once a minute by pg_cron. It keeps trading with
// the phone off or offline; this module just reads its state and sends
// commands when the app is open. Paper trading only, like everything here.
const CLOUD_URL = 'https://ztatmhxvvthlevddqqdl.supabase.co/functions/v1/trade-bot';

export async function fetchCloud() {
  const res = await fetch(CLOUD_URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`cloud ${res.status}`);
  return res.json(); // { state, hasAiKey, now }
}

async function post(body) {
  const res = await fetch(CLOUD_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `cloud ${res.status}`);
  return data;
}

export const cloudSetConfig = (config, aiKey) =>
  post({ action: 'config', config, ...(aiKey !== undefined ? { aiKey } : {}) });
export const cloudReset = (startingBalance) => post({ action: 'reset', startingBalance });
export const cloudTick = () => post({ action: 'tick' });
