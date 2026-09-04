import { contextTime } from './execution';

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_NAMES_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as "YYYY-MM-DD". */
export function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const todayKey = () => dateKey(new Date());

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function isDateKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseKey(s).getTime());
}

export function addDays(key: string, n: number): string {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function weekdayOf(key: string): number {
  return parseKey(key).getDay();
}

/** Monday of the week containing `key`. */
export function weekStart(key: string): string {
  const wd = weekdayOf(key);
  const back = wd === 0 ? 6 : wd - 1;
  return addDays(key, -back);
}

export function formatDate(key: string): string {
  const d = parseKey(key);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatDateLong(key: string): string {
  const d = parseKey(key);
  return `${DAY_NAMES_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateShort(key: string): string {
  const d = parseKey(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "22:00" → "10:00 PM" */
export function formatTime12(hm: string): string {
  const [h, m] = hm.split(':').map(Number);
  if (Number.isNaN(h)) return hm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${pad(m || 0)} ${suffix}`;
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  return formatTime12(`${d.getHours()}:${pad(d.getMinutes())}`);
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(dateKey(d))} · ${formatClock(iso)}`;
}

export function minutesOfDay(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function nowMinutes(d: Date = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

export const nowIso = () => contextTime() ?? new Date().toISOString();

export function isValidTime(hm: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hm);
}

/** Inclusive range check on date keys. */
export function dateInRange(key: string, from: string, to: string): boolean {
  return key >= from && key <= to;
}

export function hoursSince(iso: string, now: Date = new Date()): number {
  return (now.getTime() - new Date(iso).getTime()) / 36e5;
}
