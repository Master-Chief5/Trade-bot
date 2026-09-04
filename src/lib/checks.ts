import type { AppState, Boy, Check, CheckSchedule, Floor, Leave, Room, SheetTemplate, StaffUser, StatusType } from './types';
import { dateInRange, hoursSince, minutesOfDay, parseKey, weekdayOf } from './dates';
import { can, visibleFloorIds } from './permissions';

type StateLike = Pick<AppState, 'floors' | 'rooms' | 'boys' | 'statusTypes' | 'leaves' | 'schedules' | 'checks' | 'headRAPermissions'>;

export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function sortedFloors(state: Pick<AppState, 'floors'>): Floor[] {
  return [...state.floors].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function roomsOnFloor(state: Pick<AppState, 'rooms'>, floorId: string): Room[] {
  return state.rooms.filter((r) => r.floorId === floorId).sort((a, b) => naturalCompare(a.number, b.number));
}

export function sortedStatusTypes(state: Pick<AppState, 'statusTypes'>): StatusType[] {
  return [...state.statusTypes].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function statusById(state: Pick<AppState, 'statusTypes'>, id: string): StatusType | undefined {
  return state.statusTypes.find((s) => s.id === id);
}

export function defaultStatus(state: Pick<AppState, 'statusTypes'>): StatusType {
  const sorted = sortedStatusTypes(state);
  return sorted.find((s) => s.isDefault) ?? sorted.find((s) => s.countsAs === 'present') ?? sorted[0];
}

export function leaveStatus(state: Pick<AppState, 'statusTypes'>): StatusType | undefined {
  const sorted = sortedStatusTypes(state);
  return sorted.find((s) => s.useForLeave) ?? sorted.find((s) => s.countsAs === 'excused');
}

export function leaveCovering(state: Pick<AppState, 'leaves'>, boyId: string, date: string): Leave | undefined {
  return state.leaves.find((l) => l.boyId === boyId && dateInRange(date, l.from, l.to));
}

export function defaultStatusFor(state: Pick<AppState, 'statusTypes' | 'leaves'>, boyId: string, date: string): StatusType {
  if (leaveCovering(state, boyId, date)) {
    const ls = leaveStatus(state);
    if (ls) return ls;
  }
  return defaultStatus(state);
}

export function boysOnFloor(state: Pick<AppState, 'rooms' | 'boys'>, floorId: string): { boy: Boy; room: Room | undefined }[] {
  const rooms = roomsOnFloor(state, floorId);
  const roomIds = new Set(rooms.map((r) => r.id));
  return state.boys
    .filter((b) => b.active && b.roomId && roomIds.has(b.roomId))
    .map((boy) => ({ boy, room: rooms.find((r) => r.id === boy.roomId) }))
    .sort((a, b) => naturalCompare(a.room?.number ?? '', b.room?.number ?? '') || a.boy.lastName.localeCompare(b.boy.lastName) || a.boy.firstName.localeCompare(b.boy.firstName));
}

export function floorOfBoy(state: Pick<AppState, 'rooms' | 'floors'>, boy: Boy): Floor | undefined {
  const room = state.rooms.find((r) => r.id === boy.roomId);
  return room ? state.floors.find((f) => f.id === room.floorId) : undefined;
}

/** Column heading for a check on the printed sheet. Falls back to initials for schedules saved before codes existed. */
export function scheduleCode(s: Pick<CheckSchedule, 'code' | 'name'>): string {
  const set = s.code?.trim();
  if (set) return set.toUpperCase();
  const initials = s.name.trim().split(/\s+/).map((w) => w[0] ?? '').join('').toUpperCase();
  return initials.slice(0, 3) || '?';
}

/** The checks a designed sheet gives a column to, in the order the dean arranged them. */
export function templatePeriods(state: Pick<AppState, 'schedules'>, template?: Pick<SheetTemplate, 'scheduleIds'>): CheckSchedule[] {
  if (!template) return sheetPeriods(state);
  return template.scheduleIds
    .map((id) => state.schedules.find((s) => s.id === id))
    .filter((s): s is CheckSchedule => Boolean(s));
}

/** The rooms a designed sheet lists as rows, in the sheet's own order. */
export function templateRooms(state: Pick<AppState, 'rooms'>, floorId: string, template?: Pick<SheetTemplate, 'roomIds'>): Room[] {
  const onFloor = roomsOnFloor(state, floorId).filter((r) => r.type !== 'unused');
  if (!template || template.roomIds === 'floor') return onFloor;
  const byId = new Map(onFloor.map((r) => [r.id, r]));
  return template.roomIds.map((id) => byId.get(id)).filter((r): r is Room => Boolean(r));
}

/** The checks that make up one printed week, earliest in the evening first. */
export function sheetPeriods(state: Pick<AppState, 'schedules'>): CheckSchedule[] {
  return state.schedules.filter((s) => s.active).sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
}

/** Weekdays the sheet needs a column block for: every day any active check runs, Sunday first. */
export function sheetDays(state: Pick<AppState, 'schedules'>): number[] {
  const days = new Set<number>();
  sheetPeriods(state).forEach((s) => s.days.forEach((d) => days.add(d)));
  return [...days].sort((a, b) => a - b);
}

export function schedulesForDate(state: Pick<AppState, 'schedules'>, date: string): CheckSchedule[] {
  const wd = weekdayOf(date);
  return state.schedules.filter((s) => s.active && s.days.includes(wd)).sort((a, b) => minutesOfDay(a.time) - minutesOfDay(b.time));
}

export function scheduleFloorIds(state: Pick<AppState, 'floors'>, schedule: CheckSchedule): string[] {
  const all = sortedFloors(state).map((f) => f.id);
  return schedule.floorIds === 'all' ? all : all.filter((id) => schedule.floorIds.includes(id));
}

export function findCheck(state: Pick<AppState, 'checks'>, scheduleId: string, floorId: string, date: string): Check | undefined {
  return state.checks.find((c) => c.scheduleId === scheduleId && c.floorId === floorId && c.date === date);
}

export type SlotStatus = 'not-started' | 'in-progress' | 'submitted';
export interface Slot {
  schedule: CheckSchedule;
  floor: Floor;
  date: string;
  check: Check | undefined;
  status: SlotStatus;
  /** minutes from now until the scheduled time; negative when it has passed */
  minutesUntil: number;
  pastDeadline: boolean;
}

/** The scheduled start as a real Date, so deadlines that cross midnight still work. */
export function slotStart(date: string, time: string): Date {
  const d = parseKey(date);
  d.setHours(0, minutesOfDay(time), 0, 0);
  return d;
}

export function slotsForDate(state: StateLike, date: string, now: Date = new Date(), floorFilter?: string[]): Slot[] {
  const out: Slot[] = [];
  for (const schedule of schedulesForDate(state, date)) {
    for (const floorId of scheduleFloorIds(state, schedule)) {
      if (floorFilter && !floorFilter.includes(floorId)) continue;
      const floor = state.floors.find((f) => f.id === floorId);
      if (!floor) continue;
      const check = findCheck(state, schedule.id, floorId, date);
      const status: SlotStatus = check ? (check.submittedAt ? 'submitted' : 'in-progress') : 'not-started';
      const start = slotStart(date, schedule.time);
      const minutesUntil = Math.round((start.getTime() - now.getTime()) / 60_000);
      const deadline = start.getTime() + schedule.deadlineMinutes * 60_000;
      const pastDeadline = status !== 'submitted' && now.getTime() > deadline;
      out.push({ schedule, floor, date, check, status, minutesUntil, pastDeadline });
    }
  }
  return out;
}

export interface Tally {
  present: number;
  absent: number;
  excused: number;
  total: number;
  byCode: { code: string; name: string; color: string; count: number; countsAs: StatusType['countsAs'] }[];
}

export function tally(check: Pick<Check, 'entries'>, statusTypes: StatusType[]): Tally {
  const t: Tally = { present: 0, absent: 0, excused: 0, total: check.entries.length, byCode: [] };
  const sorted = [...statusTypes].sort((a, b) => a.sortOrder - b.sortOrder);
  const counts = new Map<string, number>();
  for (const e of check.entries) {
    counts.set(e.statusId, (counts.get(e.statusId) ?? 0) + 1);
    const st = statusTypes.find((s) => s.id === e.statusId);
    if (!st) continue;
    t[st.countsAs]++;
  }
  t.byCode = sorted.map((s) => ({ code: s.code, name: s.name, color: s.color, count: counts.get(s.id) ?? 0, countsAs: s.countsAs }));
  return t;
}

export function tallyLine(t: Tally): string {
  return t.byCode.filter((b) => b.count > 0).map((b) => `${b.count} ${b.code}`).join(' · ') || '—';
}

export function submittedChecksOn(state: Pick<AppState, 'checks'>, date: string): Check[] {
  return state.checks.filter((c) => c.date === date && c.submittedAt);
}

export interface AbsentRow {
  check: Check;
  entry: Check['entries'][number];
  status: StatusType;
}

export function absentOn(state: Pick<AppState, 'checks' | 'statusTypes'>, date: string, floorIds?: string[]): AbsentRow[] {
  const rows: AbsentRow[] = [];
  for (const check of submittedChecksOn(state, date)) {
    if (floorIds && !floorIds.includes(check.floorId)) continue;
    for (const entry of check.entries) {
      const status = statusById(state, entry.statusId);
      if (status?.countsAs === 'absent') rows.push({ check, entry, status });
    }
  }
  return rows.sort((a, b) => naturalCompare(a.check.floorName, b.check.floorName) || naturalCompare(a.entry.roomNumber, b.entry.roomNumber));
}

/** Submitted checks newest first (by date, then scheduled time). */
export function submittedChecksDesc(state: Pick<AppState, 'checks'>): Check[] {
  return state.checks
    .filter((c) => c.submittedAt)
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
}

/** How many of the most recent submitted checks in a row mark this boy absent. */
export function consecutiveAbsences(state: Pick<AppState, 'checks' | 'statusTypes'>, boyId: string, upToDate: string): number {
  let n = 0;
  for (const check of submittedChecksDesc(state)) {
    if (check.date > upToDate) continue;
    const entry = check.entries.find((e) => e.boyId === boyId);
    if (!entry) continue;
    const status = statusById(state, entry.statusId);
    if (status?.countsAs === 'absent') n++;
    else break;
  }
  return n;
}

export interface Flag {
  boy: Boy;
  count: number;
  lastCheck: Check;
}

export function flaggedBoys(state: Pick<AppState, 'checks' | 'statusTypes' | 'boys'>, upToDate: string, threshold = 3): Flag[] {
  const flags: Flag[] = [];
  for (const boy of state.boys) {
    if (!boy.active) continue;
    const count = consecutiveAbsences(state, boy.id, upToDate);
    if (count >= threshold) {
      const lastCheck = submittedChecksDesc(state).find((c) => c.date <= upToDate && c.entries.some((e) => e.boyId === boy.id));
      if (lastCheck) flags.push({ boy, count, lastCheck });
    }
  }
  return flags.sort((a, b) => b.count - a.count);
}

export function checksForBoy(state: Pick<AppState, 'checks'>, boyId: string, limit = 14): { check: Check; entry: Check['entries'][number] }[] {
  const out: { check: Check; entry: Check['entries'][number] }[] = [];
  for (const check of submittedChecksDesc(state)) {
    const entry = check.entries.find((e) => e.boyId === boyId);
    if (entry) out.push({ check, entry });
    if (out.length >= limit) break;
  }
  return out;
}

/** Deans edit anywhere. Everyone else edits only the floors they are assigned to; "see every floor" is viewing only. */
export function canEditCheck(_state: Pick<AppState, 'headRAPermissions'>, user: StaffUser | null | undefined, check: Check): boolean {
  if (!user || !user.active) return false;
  if (check.submittedAt) return false;
  if (user.role === 'dean') return true;
  return user.floorIds.includes(check.floorId);
}

export function canDoCheckOnFloor(user: StaffUser | null | undefined, floorId: string): boolean {
  if (!user || !user.active) return false;
  return user.role === 'dean' || user.floorIds.includes(floorId);
}

export function canReopenCheck(state: Pick<AppState, 'headRAPermissions' | 'floors'>, user: StaffUser | null | undefined, check: Check): boolean {
  if (!user || !check.submittedAt) return false;
  if (user.role === 'dean') return true;
  if (!visibleFloorIds(state, user).includes(check.floorId)) return false;
  return can(user, 'reopenCheck', state.headRAPermissions) && hoursSince(check.submittedAt) <= 24;
}

export function slotsForUser(state: AppState, user: StaffUser, date: string, now: Date = new Date()): Slot[] {
  return slotsForDate(state, date, now, visibleFloorIds(state, user));
}

/** The checks that were due on a floor that day — what an RA has to finish before signing off. */
export function checksDueOn(state: Pick<AppState, 'schedules'>, floorId: string, date: string): CheckSchedule[] {
  const wd = weekdayOf(date);
  return state.schedules.filter((s) => s.active && s.days.includes(wd) && (s.floorIds === 'all' || s.floorIds.includes(floorId)));
}

/** Whether every check due on a floor that day has been submitted, so the day can be signed. */
export function dayComplete(state: Pick<AppState, 'schedules' | 'checks'>, floorId: string, date: string): boolean {
  const due = checksDueOn(state, floorId, date);
  if (due.length === 0) return false;
  return due.every((s) => state.checks.some((c) => c.scheduleId === s.id && c.floorId === floorId && c.date === date && c.submittedAt));
}

export function signatureFor(state: Pick<AppState, 'signatures'>, floorId: string, date: string) {
  return state.signatures.find((s) => s.floorId === floorId && s.date === date);
}

export function roomOccupants(state: Pick<AppState, 'boys'>, roomId: string): Boy[] {
  return state.boys.filter((b) => b.active && b.roomId === roomId).sort((a, b) => a.lastName.localeCompare(b.lastName));
}

/** Live status of every room on a floor for a given date: worst status wins. */
export type RoomState = 'ok' | 'absent' | 'away' | 'unchecked' | 'empty';
export function roomStates(state: Pick<AppState, 'checks' | 'statusTypes' | 'boys' | 'rooms'>, floorId: string, date: string): Map<string, RoomState> {
  const map = new Map<string, RoomState>();
  const rooms = roomsOnFloor(state, floorId);
  const checks = state.checks.filter((c) => c.floorId === floorId && c.date === date);
  const latest = checks.sort((a, b) => b.time.localeCompare(a.time))[0];
  for (const room of rooms) {
    const boys = roomOccupants(state, room.id);
    if (boys.length === 0) {
      map.set(room.id, 'empty');
      continue;
    }
    if (!latest) {
      map.set(room.id, 'unchecked');
      continue;
    }
    let worst: RoomState = 'ok';
    let matched = 0;
    for (const boy of boys) {
      const entry = latest.entries.find((e) => e.boyId === boy.id);
      const st = entry ? statusById(state, entry.statusId) : undefined;
      if (!st) continue;
      matched++;
      if (st.countsAs === 'absent') worst = 'absent';
      else if (st.countsAs === 'excused' && worst === 'ok') worst = 'away';
    }
    map.set(room.id, matched === 0 ? 'unchecked' : worst);
  }
  return map;
}
