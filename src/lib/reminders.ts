import { useEffect, useSyncExternalStore } from 'react';
import type { AppState, StaffUser } from './types';
import { slotsForUser } from './checks';
import { formatTime12, todayKey } from './dates';

const KEY = 'rh-reminders';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}
let enabled = read();

export function getRemindersEnabled(): boolean {
  return enabled;
}
export function setRemindersEnabled(v: boolean) {
  enabled = v;
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}
export function useRemindersEnabled(): [boolean, (v: boolean) => void] {
  const v = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getRemindersEnabled,
    getRemindersEnabled,
  );
  return [v, setRemindersEnabled];
}

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function notificationPermission(): PermissionState {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * While the app is open, fire a notification before each of the user's checks today.
 * Server-sent push (when the phone is locked) needs the backend and is not part of this build.
 */
export function useReminders(state: AppState, user: StaffUser | null, remindersOn: boolean) {
  const key = user ? `${user.id}|${todayKey()}|${state.schedules.map((s) => s.id + s.time + s.reminderMinutes + s.active).join(',')}|${state.checks.filter((c) => c.date === todayKey()).map((c) => c.id + (c.submittedAt ? 1 : 0)).join(',')}` : '';
  useEffect(() => {
    if (!user || !remindersOn || !state.settings.remindersEnabled) return;
    if (notificationPermission() !== 'granted') return;
    const now = new Date();
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const slot of slotsForUser(state, user, todayKey(), now)) {
      if (slot.status === 'submitted') continue;
      const fireIn = (slot.minutesUntil - slot.schedule.reminderMinutes) * 60_000;
      if (fireIn <= 0 || fireIn > 12 * 3600_000) continue;
      timers.push(
        setTimeout(() => {
          try {
            new Notification(`${slot.schedule.name} on ${slot.floor.name}`, { body: `Starts at ${formatTime12(slot.schedule.time)}. Open Room Check to begin.`, tag: `rh-${slot.schedule.id}-${slot.floor.id}` });
          } catch {
            // notifications may be blocked at the OS level
          }
        }, fireIn),
      );
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, remindersOn]);
}
