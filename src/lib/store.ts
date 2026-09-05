import { produce, type Draft } from 'immer';
import { get, set } from 'idb-keyval';
import { useSyncExternalStore } from 'react';
import type {
  AppState, Assignment, Boy, CheckSchedule, Cover, DaySignature, Floor, HeadRAPermissions, Leave, Nudge, Room, RoomType, SheetTemplate, StaffUser, StatusType,
} from './types';
import { DEFAULT_HEAD_RA_PERMISSIONS, DEFAULT_SCHEDULES, DEFAULT_STATUS_TYPES, initialState } from './defaults';
import { uid } from './ids';
import { nowIso, hoursSince, isDateKey, weekdayOf } from './dates';
import { boysOnFloor, defaultStatusFor, findCheck } from './checks';
import { can, visibleFloorIds } from './permissions';
import { randomSeed, runWithContext } from './execution';

const STORAGE_KEY = 'rh-state-v1';

let state: AppState = initialState();
let ready = false;
const listeners = new Set<() => void>();
let persistEnabled = true;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function getState(): AppState {
  return state;
}
export function isReady(): boolean {
  return ready;
}
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function emit() {
  listeners.forEach((l) => l());
}

export function setPersistence(enabled: boolean) {
  persistEnabled = enabled;
}

function scheduleSave() {
  if (!persistEnabled) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void persistNow();
  }, 150);
}

/** Flush a pending save the moment the app is backgrounded, so the last tap survives a locked phone. */
function flushOnHide() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    void persistNow();
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushOnHide);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushOnHide();
  });
}

export async function persistNow(): Promise<void> {
  if (!persistEnabled) return;
  try {
    await set(STORAGE_KEY, state);
  } catch (err) {
    console.warn('Could not save to this device', err);
  }
}

export async function loadState(): Promise<void> {
  try {
    // Ask the browser not to evict our data when storage runs low (best effort).
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    // older browsers
  }
  try {
    const saved = (await get(STORAGE_KEY)) as AppState | undefined;
    if (saved && saved.version === 1) state = migrate(saved);
  } catch (err) {
    console.warn('Could not read saved data', err);
  }
  ready = true;
  emit();
}

function migrate(s: AppState): AppState {
  const base = initialState();
  return {
    ...base,
    ...s,
    settings: { ...base.settings, ...s.settings },
    headRAPermissions: { ...DEFAULT_HEAD_RA_PERMISSIONS, ...s.headRAPermissions },
    floors: (s.floors ?? []).map((f) => ({ ...f, layout: f.layout ?? 'corridor' })),
    sheetTemplates: s.sheetTemplates ?? [],
    signatures: s.signatures ?? [],
    assignments: s.assignments ?? [],
    nudges: s.nudges ?? [],
    covers: s.covers ?? [],
  };
}

/** Replace state wholesale (tests, import). */
export function replaceState(next: AppState) {
  state = next;
  ready = true;
  emit();
  scheduleSave();
}

let batching = false;

export function update(recipe: (draft: Draft<AppState>) => void) {
  state = produce(state, recipe);
  if (batching) return;
  emit();
  scheduleSave();
}

/** Run several updates and notify once at the end. */
export function batch(fn: () => void) {
  const was = batching;
  batching = true;
  try {
    fn();
  } finally {
    batching = was;
  }
  if (!batching) {
    emit();
    scheduleSave();
  }
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}
export function useStoreReady(): boolean {
  return useSyncExternalStore(subscribe, isReady, isReady);
}

// ---------- helpers ----------

function log(d: Draft<AppState>, actor: StaffUser | null | undefined, action: string, detail: string) {
  d.audit.unshift({ id: uid('a'), at: nowIso(), userId: actor?.id ?? 'system', userName: actor?.name ?? 'System', action, detail });
  if (d.audit.length > 1000) d.audit.length = 1000;
}

function withIds<T extends object>(items: Omit<T, 'id'>[], prefix: string): T[] {
  return items.map((it) => ({ ...(it as T), id: uid(prefix) }));
}

export function boyName(b: Pick<Boy, 'firstName' | 'lastName' | 'preferredName'>): string {
  const first = b.preferredName?.trim() || b.firstName;
  return `${first} ${b.lastName}`.trim();
}

export interface SetupFloorInput {
  name: string;
  gradeLabel?: string;
  roomFrom: number;
  roomTo: number;
  capacity: number;
}
export interface SetupInput {
  dormName: string;
  yearLabel: string;
  dean: { name: string; pin: string; email?: string; authUserId?: string };
  floors: SetupFloorInput[];
}

export interface RosterRow {
  firstName: string;
  lastName: string;
  grade: number;
  roomNumber: string;
}

export type Result = { ok: true } | { ok: false; error: string };

// ---------- actions ----------

export const rawActions = {
  completeSetup(input: SetupInput): string {
    const deanId = uid('u');
    update((d) => {
      d.settings.dormName = input.dormName.trim() || 'Ryan Hall';
      d.settings.yearLabel = input.yearLabel.trim() || d.settings.yearLabel;
      const dean: StaffUser = {
        id: deanId, name: input.dean.name.trim(), email: input.dean.email?.trim() || undefined,
        role: 'dean', pin: input.dean.pin, authUserId: input.dean.authUserId, active: true, floorIds: [], createdAt: nowIso(),
      };
      d.staff.push(dean);
      if (d.statusTypes.length === 0) d.statusTypes = withIds<StatusType>(DEFAULT_STATUS_TYPES, 's');
      if (d.schedules.length === 0) d.schedules = withIds<CheckSchedule>(DEFAULT_SCHEDULES, 'sch');
      if (d.sheetTemplates.length === 0) {
        d.sheetTemplates = [{
          id: uid('sht'), name: 'Sunday to Thursday', days: [0, 1, 2, 3, 4],
          scheduleIds: d.schedules.map((x) => x.id), roomIds: 'floor', sortOrder: 0,
        }];
      }
      input.floors.forEach((f, i) => {
        const floor: Floor = { id: uid('f'), name: f.name.trim() || `Floor ${i + 1}`, sortOrder: i, gradeLabel: f.gradeLabel?.trim() || undefined, layout: 'corridor' };
        d.floors.push(floor);
        addRoomsRangeDraft(d, floor.id, f.roomFrom, f.roomTo, f.capacity);
      });
      d.setupComplete = true;
      log(d, dean, 'setup', `Set up ${d.settings.dormName} with ${input.floors.length} floors`);
    });
    return deanId;
  },

  // ----- floors & rooms -----
  addFloor(name: string, gradeLabel?: string): string {
    const id = uid('f');
    update((d) => {
      d.floors.push({ id, name: name.trim(), sortOrder: d.floors.length, gradeLabel: gradeLabel?.trim() || undefined, layout: 'corridor' });
    });
    return id;
  },
  updateFloor(id: string, patch: Partial<Omit<Floor, 'id'>>) {
    update((d) => {
      const f = d.floors.find((x) => x.id === id);
      if (f) Object.assign(f, patch);
    });
  },
  moveFloor(id: string, dir: -1 | 1) {
    update((d) => {
      const sorted = [...d.floors].sort((a, b) => a.sortOrder - b.sortOrder);
      const i = sorted.findIndex((f) => f.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= sorted.length) return;
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
      sorted.forEach((f, k) => {
        const real = d.floors.find((x) => x.id === f.id);
        if (real) real.sortOrder = k;
      });
    });
  },
  deleteFloor(id: string): Result {
    const roomIds = state.rooms.filter((r) => r.floorId === id).map((r) => r.id);
    if (state.boys.some((b) => b.active && b.roomId && roomIds.includes(b.roomId))) {
      return { ok: false, error: 'Move the boys off this floor first.' };
    }
    update((d) => {
      d.floors = d.floors.filter((f) => f.id !== id);
      d.rooms = d.rooms.filter((r) => r.floorId !== id);
      d.staff.forEach((s) => { s.floorIds = s.floorIds.filter((x) => x !== id); });
      d.schedules.forEach((s) => { if (s.floorIds !== 'all') s.floorIds = s.floorIds.filter((x) => x !== id); });
    });
    return { ok: true };
  },
  addRoomsRange(floorId: string, from: number, to: number, capacity = 2): number {
    let added = 0;
    update((d) => { added = addRoomsRangeDraft(d, floorId, from, to, capacity); });
    return added;
  },
  addRoom(floorId: string, number: string, capacity = 2, type: RoomType = 'standard'): Result {
    const num = number.trim();
    if (!num) return { ok: false, error: 'Room number is required.' };
    if (state.rooms.some((r) => r.floorId === floorId && r.number.toLowerCase() === num.toLowerCase())) {
      return { ok: false, error: `Room ${num} already exists on this floor.` };
    }
    update((d) => {
      d.rooms.push({ id: uid('r'), floorId, number: num, capacity, type, sortOrder: d.rooms.filter((r) => r.floorId === floorId).length });
    });
    return { ok: true };
  },
  updateRoom(id: string, patch: Partial<Omit<Room, 'id' | 'floorId'>>) {
    update((d) => {
      const r = d.rooms.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
    });
  },
  deleteRoom(id: string): Result {
    if (state.boys.some((b) => b.active && b.roomId === id)) return { ok: false, error: 'Move the boys out of this room first.' };
    update((d) => {
      d.rooms = d.rooms.filter((r) => r.id !== id);
      d.boys.forEach((b) => { if (b.roomId === id) b.roomId = null; });
    });
    return { ok: true };
  },

  // ----- boys -----
  addBoy(input: { firstName: string; lastName: string; preferredName?: string; grade: number; roomId: string | null; deanNotes?: string }, actor?: StaffUser): string {
    const id = uid('b');
    update((d) => {
      const boy: Boy = {
        id, firstName: input.firstName.trim(), lastName: input.lastName.trim(), preferredName: input.preferredName?.trim() || undefined,
        grade: input.grade, roomId: input.roomId, active: true, deanNotes: input.deanNotes?.trim() || undefined, createdAt: nowIso(),
      };
      d.boys.push(boy);
      if (input.roomId) {
        const room = d.rooms.find((r) => r.id === input.roomId);
        d.moves.push({ id: uid('m'), boyId: id, fromRoom: null, toRoom: room?.number ?? null, at: nowIso(), by: actor?.id ?? 'system' });
      }
      log(d, actor, 'boy.add', boyName(boy));
    });
    return id;
  },
  updateBoy(id: string, patch: Partial<Omit<Boy, 'id' | 'roomId' | 'createdAt'>>, actor?: StaffUser) {
    update((d) => {
      const b = d.boys.find((x) => x.id === id);
      if (!b) return;
      Object.assign(b, patch);
      log(d, actor, 'boy.update', boyName(b));
    });
  },
  moveBoy(boyId: string, roomId: string | null, actor?: StaffUser) {
    update((d) => {
      const b = d.boys.find((x) => x.id === boyId);
      if (!b || b.roomId === roomId) return;
      const from = d.rooms.find((r) => r.id === b.roomId)?.number ?? null;
      const to = d.rooms.find((r) => r.id === roomId)?.number ?? null;
      b.roomId = roomId;
      d.moves.push({ id: uid('m'), boyId, fromRoom: from, toRoom: to, at: nowIso(), by: actor?.id ?? 'system' });
      log(d, actor, 'boy.move', `${boyName(b)}: ${from ?? 'no room'} → ${to ?? 'no room'}`);
    });
  },
  setBoyActive(id: string, active: boolean, actor?: StaffUser) {
    update((d) => {
      const b = d.boys.find((x) => x.id === id);
      if (!b) return;
      b.active = active;
      log(d, actor, active ? 'boy.reactivate' : 'boy.remove', boyName(b));
    });
  },
  deleteBoy(id: string, actor?: StaffUser): Result {
    if (state.checks.some((c) => c.entries.some((e) => e.boyId === id))) {
      return { ok: false, error: 'This boy appears on past checks. Remove him from the roster instead so history stays intact.' };
    }
    update((d) => {
      const b = d.boys.find((x) => x.id === id);
      d.boys = d.boys.filter((x) => x.id !== id);
      d.leaves = d.leaves.filter((l) => l.boyId !== id);
      if (b) log(d, actor, 'boy.delete', boyName(b));
    });
    return { ok: true };
  },
  importRoster(rows: RosterRow[], actor?: StaffUser): { added: number; updated: number; unmatchedRooms: string[] } {
    let added = 0;
    let updated = 0;
    const unmatched = new Set<string>();
    update((d) => {
      for (const row of rows) {
        const matches = row.roomNumber ? d.rooms.filter((r) => r.number.toLowerCase() === row.roomNumber.toLowerCase()) : [];
        const room = matches.length === 1 ? matches[0] : undefined;
        if (row.roomNumber && !room) unmatched.add(matches.length > 1 ? `${row.roomNumber} (on more than one floor)` : row.roomNumber);
        const existing = d.boys.find((b) => b.firstName.toLowerCase() === row.firstName.toLowerCase() && b.lastName.toLowerCase() === row.lastName.toLowerCase());
        if (existing) {
          existing.grade = row.grade;
          existing.active = true;
          if (room && existing.roomId !== room.id) {
            const from = d.rooms.find((r) => r.id === existing.roomId)?.number ?? null;
            existing.roomId = room.id;
            d.moves.push({ id: uid('m'), boyId: existing.id, fromRoom: from, toRoom: room.number, at: nowIso(), by: actor?.id ?? 'system' });
          }
          updated++;
        } else {
          const boy: Boy = { id: uid('b'), firstName: row.firstName, lastName: row.lastName, grade: row.grade, roomId: room?.id ?? null, active: true, createdAt: nowIso() };
          d.boys.push(boy);
          if (room) d.moves.push({ id: uid('m'), boyId: boy.id, fromRoom: null, toRoom: room.number, at: nowIso(), by: actor?.id ?? 'system' });
          added++;
        }
      }
      log(d, actor, 'roster.import', `${added} added, ${updated} updated`);
    });
    return { added, updated, unmatchedRooms: [...unmatched] };
  },

  // ----- staff -----
  addStaff(input: { name: string; email?: string; role: StaffUser['role']; pin: string; floorIds: string[] }, actor?: StaffUser): string {
    const id = uid('u');
    update((d) => {
      d.staff.push({ id, name: input.name.trim(), email: input.email?.trim() || undefined, role: input.role, pin: input.pin, active: true, floorIds: [...input.floorIds], createdAt: nowIso() });
      log(d, actor, 'staff.add', `${input.name.trim()} (${input.role})`);
    });
    return id;
  },
  updateStaff(id: string, patch: Partial<Omit<StaffUser, 'id' | 'createdAt'>>, actor?: StaffUser) {
    update((d) => {
      const s = d.staff.find((x) => x.id === id);
      if (!s) return;
      Object.assign(s, patch);
      log(d, actor, 'staff.update', s.name);
    });
  },
  /** Online mode: attach an approved account to a staff entry, creating it if needed. */
  linkStaff(input: { authUserId: string; name: string; email?: string; role: StaffUser['role']; floorIds: string[]; staffId?: string }, actor?: StaffUser): string {
    let id = '';
    update((d) => {
      const existing = d.staff.find((s) => s.authUserId === input.authUserId) ?? (input.staffId ? d.staff.find((s) => s.id === input.staffId && !s.authUserId) : undefined);
      if (existing) {
        existing.authUserId = input.authUserId;
        existing.name = input.name.trim() || existing.name;
        existing.email = input.email?.trim() || existing.email;
        existing.role = input.role;
        existing.floorIds = [...input.floorIds];
        existing.active = true;
        id = existing.id;
        log(d, actor, 'staff.update', `${existing.name} (${input.role})`);
      } else {
        id = uid('u');
        d.staff.push({ id, name: input.name.trim(), email: input.email?.trim() || undefined, role: input.role, pin: '', authUserId: input.authUserId, active: true, floorIds: [...input.floorIds], createdAt: nowIso() });
        log(d, actor, 'staff.add', `${input.name.trim()} (${input.role})`);
      }
    });
    return id;
  },
  setHeadRAPermissions(perms: HeadRAPermissions, actor?: StaffUser) {
    update((d) => {
      d.headRAPermissions = { ...perms };
      log(d, actor, 'headra.permissions', Object.entries(perms).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none');
    });
  },

  // ----- status types -----
  addStatusType(input: Omit<StatusType, 'id' | 'sortOrder'>): Result {
    const code = input.code.trim().toUpperCase();
    if (!input.name.trim() || !code) return { ok: false, error: 'Name and code are required.' };
    if (state.statusTypes.some((s) => s.code.toUpperCase() === code)) return { ok: false, error: `Code ${code} is already used.` };
    update((d) => {
      const st: StatusType = { ...input, name: input.name.trim(), code, id: uid('s'), sortOrder: d.statusTypes.length };
      if (st.isDefault) d.statusTypes.forEach((s) => { s.isDefault = false; });
      if (st.useForLeave) d.statusTypes.forEach((s) => { s.useForLeave = false; });
      d.statusTypes.push(st);
    });
    return { ok: true };
  },
  updateStatusType(id: string, patch: Partial<Omit<StatusType, 'id'>>): Result {
    if (patch.code !== undefined) {
      const code = patch.code.trim().toUpperCase();
      if (!code) return { ok: false, error: 'Code is required.' };
      if (state.statusTypes.some((s) => s.id !== id && s.code.toUpperCase() === code)) return { ok: false, error: `Code ${code} is already used.` };
      patch = { ...patch, code };
    }
    update((d) => {
      const st = d.statusTypes.find((s) => s.id === id);
      if (!st) return;
      if (patch.isDefault) d.statusTypes.forEach((s) => { s.isDefault = false; });
      if (patch.useForLeave) d.statusTypes.forEach((s) => { s.useForLeave = false; });
      Object.assign(st, patch);
    });
    return { ok: true };
  },
  moveStatusType(id: string, dir: -1 | 1) {
    update((d) => {
      const sorted = [...d.statusTypes].sort((a, b) => a.sortOrder - b.sortOrder);
      const i = sorted.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= sorted.length) return;
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
      sorted.forEach((s, k) => {
        const real = d.statusTypes.find((x) => x.id === s.id);
        if (real) real.sortOrder = k;
      });
    });
  },
  deleteStatusType(id: string): Result {
    if (state.statusTypes.length <= 1) return { ok: false, error: 'Keep at least one status type.' };
    if (state.checks.some((c) => c.entries.some((e) => e.statusId === id))) return { ok: false, error: 'This status is used on past checks. Rename it instead.' };
    const st = state.statusTypes.find((s) => s.id === id);
    if (st?.isDefault) return { ok: false, error: 'Make another status the default first.' };
    update((d) => { d.statusTypes = d.statusTypes.filter((s) => s.id !== id); });
    return { ok: true };
  },

  // ----- schedules -----
  addSchedule(input: Omit<CheckSchedule, 'id'>): string {
    const id = uid('sch');
    update((d) => { d.schedules.push({ ...input, id }); });
    return id;
  },
  updateSchedule(id: string, patch: Partial<Omit<CheckSchedule, 'id'>>) {
    update((d) => {
      const s = d.schedules.find((x) => x.id === id);
      if (s) Object.assign(s, patch);
    });
  },
  /** A dean naming who does a check, for a date range. Overrides plain floor membership. */
  addAssignment(input: Omit<Assignment, 'id' | 'createdBy' | 'createdAt'>, actor: StaffUser): Result {
    if (input.to < input.from) return { ok: false, error: 'The end date is before the start.' };
    if (!isDateKey(input.from) || !isDateKey(input.to)) return { ok: false, error: 'Enter both dates.' };
    const state = getState();
    const ra = state.staff.find((s) => s.id === input.raId && s.active);
    if (!ra) return { ok: false, error: 'That person is not on the staff list.' };
    if (!state.floors.some((f) => f.id === input.floorId)) return { ok: false, error: 'That floor is gone.' };
    update((d) => {
      d.assignments.push({ ...input, id: uid('as'), createdBy: actor.id, createdAt: nowIso() });
      const what = input.scheduleId === 'all' ? 'every check' : d.schedules.find((x) => x.id === input.scheduleId)?.name ?? 'a check';
      log(d, actor, 'assignment.add', `${ra.name} · ${what} · ${d.floors.find((f) => f.id === input.floorId)?.name} · ${input.from} to ${input.to}`);
    });
    return { ok: true };
  },
  deleteAssignment(id: string, actor: StaffUser) {
    update((d) => {
      const a = d.assignments.find((x) => x.id === id);
      if (!a) return;
      d.assignments = d.assignments.filter((x) => x.id !== id);
      log(d, actor, 'assignment.remove', `${d.staff.find((s) => s.id === a.raId)?.name ?? 'Someone'} · ${a.from} to ${a.to}`);
    });
  },

  /** A dean poking whoever owes a check. Lands on that person's home screen. */
  nudge(input: Omit<Nudge, 'id' | 'byId' | 'byName' | 'at' | 'seenAt'>, actor: StaffUser): Result {
    const state = getState();
    if (!state.staff.some((s) => s.id === input.toRaId && s.active)) return { ok: false, error: 'That person is not on the staff list.' };
    // One open nudge per person per check per day: a dean tapping twice should not spam them.
    if (state.nudges.some((n) => !n.seenAt && n.toRaId === input.toRaId && n.scheduleId === input.scheduleId && n.floorId === input.floorId && n.date === input.date)) {
      return { ok: false, error: 'They already have an unread reminder for this check.' };
    }
    update((d) => {
      d.nudges.push({ ...input, id: uid('ndg'), byId: actor.id, byName: actor.name, at: nowIso() });
      log(d, actor, 'nudge', `${d.staff.find((s) => s.id === input.toRaId)?.name ?? 'Someone'} · ${input.date}`);
    });
    return { ok: true };
  },
  markNudgesSeen(raId: string) {
    update((d) => { d.nudges.forEach((n) => { if (n.toRaId === raId && !n.seenAt) n.seenAt = nowIso(); }); });
  },

  /**
   * A check handed back by someone covering. It becomes an ordinary check attributed to the RA
   * who arranged the cover, with the coverer's name on it, so the sheet and the history always
   * show who actually walked the floor. Ignored if that check already exists — the RA may have
   * done it themselves after all, and their own work wins.
   */
  applyCoverResult(input: {
    handoffId: string; scheduleId: string; floorId: string; date: string;
    forRaId: string; forRaName: string; coveredBy: string;
    startedAt: string; submittedAt: string; entries: { boyId: string; statusId: string; note?: string }[];
  }): Result {
    const state = getState();
    if (findCheck(state, input.scheduleId, input.floorId, input.date)) return { ok: false, error: 'That check is already done.' };
    const schedule = state.schedules.find((s) => s.id === input.scheduleId);
    const floor = state.floors.find((f) => f.id === input.floorId);
    if (!schedule || !floor) return { ok: false, error: 'That check no longer exists.' };
    const byBoy = new Map(input.entries.map((e) => [e.boyId, e]));
    update((d) => {
      const entries = boysOnFloor(d, input.floorId).map(({ boy, room }) => {
        const got = byBoy.get(boy.id);
        // A boy who arrived after the handoff was made is not in the returned result; he falls
        // back to the default rather than silently inheriting someone else's mark.
        const statusId = got && d.statusTypes.some((s) => s.id === got.statusId) ? got.statusId : defaultStatusFor(d, boy.id, input.date).id;
        return { boyId: boy.id, name: boyName(boy), grade: boy.grade, roomNumber: room?.number ?? '', statusId, note: got?.note };
      });
      d.checks.push({
        id: uid('c'), scheduleId: input.scheduleId, scheduleName: schedule.name, time: schedule.time,
        floorId: input.floorId, floorName: floor.name, date: input.date,
        raId: input.forRaId, raName: input.forRaName, startedAt: input.startedAt, submittedAt: input.submittedAt,
        source: 'cover', coveredBy: input.coveredBy, entries,
      });
      d.audit.unshift({
        id: uid('a'), at: nowIso(), userId: input.forRaId, userName: input.forRaName,
        action: 'check.cover', detail: `${input.coveredBy} covered ${schedule.name} · ${floor.name} · ${input.date}`,
      });
    });
    return { ok: true };
  },

  /** Recorded when a handoff is claimed, so a dean can see who is walking the floor tonight. */
  recordCover(input: Omit<Cover, 'id'>) {
    update((d) => {
      if (d.covers.some((c) => c.handoffId === input.handoffId)) return;
      d.covers.push({ ...input, id: uid('cov') });
      d.audit.unshift({
        id: uid('a'), at: nowIso(), userId: input.createdBy, userName: input.forRaName,
        action: 'cover.claimed', detail: `${input.name} is covering ${d.floors.find((f) => f.id === input.floorId)?.name ?? ''} · ${input.from} to ${input.to}`,
      });
    });
  },

  addSheetTemplate(input: Omit<SheetTemplate, 'id' | 'sortOrder'>): string {
    const id = uid('sht');
    update((d) => { d.sheetTemplates.push({ ...input, id, sortOrder: d.sheetTemplates.length }); });
    return id;
  },
  updateSheetTemplate(id: string, patch: Partial<Omit<SheetTemplate, 'id'>>) {
    update((d) => {
      const t = d.sheetTemplates.find((x) => x.id === id);
      if (t) Object.assign(t, patch);
    });
  },
  deleteSheetTemplate(id: string): Result {
    if (getState().sheetTemplates.length <= 1) return { ok: false, error: 'Keep at least one sheet.' };
    update((d) => { d.sheetTemplates = d.sheetTemplates.filter((x) => x.id !== id); });
    return { ok: true };
  },

  /**
   * An RA signing off one day on one floor. Bound to that day and floor so a signature
   * cannot be lifted onto another night: re-signing replaces their own, and nobody else's.
   */
  signDay(floorId: string, date: string, image: string, actor: StaffUser): Result {
    if (!image.startsWith('data:image/png;base64,')) return { ok: false, error: 'That is not a signature.' };
    if (actor.role !== 'dean' && !actor.floorIds.includes(floorId)) return { ok: false, error: 'That floor is not yours.' };
    const state = getState();
    const due = state.schedules.filter((s) => s.active && s.days.includes(weekdayOf(date))
      && (s.floorIds === 'all' || s.floorIds.includes(floorId)));
    if (due.length === 0) return { ok: false, error: 'No checks were scheduled that day.' };
    const done = due.every((s) => state.checks.some((c) => c.scheduleId === s.id && c.floorId === floorId && c.date === date && c.submittedAt));
    if (!done) return { ok: false, error: 'Finish and submit the day\'s checks first.' };
    update((d) => {
      d.signatures = d.signatures.filter((x) => !(x.raId === actor.id && x.floorId === floorId && x.date === date));
      d.signatures.push({ id: uid('sig'), raId: actor.id, raName: actor.name, floorId, date, image, signedAt: nowIso() });
      log(d, actor, 'Signed a day', `${date} · ${d.floors.find((f) => f.id === floorId)?.name ?? floorId}`);
    });
    return { ok: true };
  },
  unsignDay(floorId: string, date: string, actor: StaffUser): Result {
    const mine = (x: DaySignature) => x.floorId === floorId && x.date === date && (actor.role === 'dean' || x.raId === actor.id);
    if (!getState().signatures.some(mine)) return { ok: false, error: 'Nothing signed for that day.' };
    update((d) => {
      d.signatures = d.signatures.filter((x) => !mine(x));
      log(d, actor, 'Removed a signature', `${date} · ${d.floors.find((f) => f.id === floorId)?.name ?? floorId}`);
    });
    return { ok: true };
  },

  deleteSchedule(id: string) {
    update((d) => { d.schedules = d.schedules.filter((s) => s.id !== id); });
  },

  // ----- checks -----
  /** Creates the check if it does not exist yet. Returns the check id. */
  startCheck(scheduleId: string, floorId: string, date: string, actor: StaffUser, source: 'app' | 'paper' = 'app'): string {
    const existing = findCheck(state, scheduleId, floorId, date);
    if (existing) return existing.id;
    const id = uid('c');
    update((d) => {
      const schedule = d.schedules.find((s) => s.id === scheduleId);
      const floor = d.floors.find((f) => f.id === floorId);
      if (!schedule || !floor) return;
      const entries = boysOnFloor(d, floorId).map(({ boy, room }) => ({
        boyId: boy.id, name: boyName(boy), grade: boy.grade, roomNumber: room?.number ?? '', statusId: defaultStatusFor(d, boy.id, date).id,
      }));
      d.checks.push({
        id, scheduleId, scheduleName: schedule.name, time: schedule.time, floorId, floorName: floor.name, date,
        raId: actor.id, raName: actor.name, startedAt: nowIso(), submittedAt: null, source, entries,
      });
      log(d, actor, source === 'paper' ? 'check.paper' : 'check.start', `${schedule.name} · ${floor.name} · ${date}`);
    });
    return id;
  },
  setEntryStatus(checkId: string, boyId: string, statusId: string) {
    update((d) => {
      const c = d.checks.find((x) => x.id === checkId);
      if (!c || c.submittedAt) return;
      const e = c.entries.find((x) => x.boyId === boyId);
      if (e) e.statusId = statusId;
    });
  },
  cycleEntryStatus(checkId: string, boyId: string) {
    update((d) => {
      const c = d.checks.find((x) => x.id === checkId);
      if (!c || c.submittedAt) return;
      const e = c.entries.find((x) => x.boyId === boyId);
      if (!e) return;
      const sorted = [...d.statusTypes].sort((a, b) => a.sortOrder - b.sortOrder);
      const i = sorted.findIndex((s) => s.id === e.statusId);
      e.statusId = sorted[(i + 1) % sorted.length].id;
    });
  },
  setEntryNote(checkId: string, boyId: string, note: string) {
    update((d) => {
      const c = d.checks.find((x) => x.id === checkId);
      if (!c || c.submittedAt) return;
      const e = c.entries.find((x) => x.boyId === boyId);
      if (e) e.note = note.trim() || undefined;
    });
  },
  markAllDefault(checkId: string, date: string) {
    update((d) => {
      const c = d.checks.find((x) => x.id === checkId);
      if (!c || c.submittedAt) return;
      c.entries.forEach((e) => { e.statusId = defaultStatusFor(d, e.boyId, date).id; });
    });
  },
  submitCheck(checkId: string, actor: StaffUser): { ok: true } | { ok: false; error: string; missingNotes: string[] } {
    const c = state.checks.find((x) => x.id === checkId);
    if (!c) return { ok: false, error: 'Check not found.', missingNotes: [] };
    const missing = c.entries
      .filter((e) => state.statusTypes.find((s) => s.id === e.statusId)?.requiresNote && !e.note)
      .map((e) => e.name);
    if (missing.length) return { ok: false, error: 'Some statuses need a note.', missingNotes: missing };
    update((d) => {
      const check = d.checks.find((x) => x.id === checkId);
      if (!check) return;
      check.submittedAt = nowIso();
      log(d, actor, 'check.submit', `${check.scheduleName} · ${check.floorName} · ${check.date}`);
    });
    return { ok: true };
  },
  reopenCheck(checkId: string, actor: StaffUser): Result {
    const c = state.checks.find((x) => x.id === checkId);
    if (!c || !c.submittedAt) return { ok: false, error: 'Nothing to reopen.' };
    const isDean = actor.role === 'dean';
    const onVisibleFloor = visibleFloorIds(state, actor).includes(c.floorId);
    // nowIso() is the event's own timestamp during replay, so every device decides this the same way.
    const headRAOk = onVisibleFloor && can(actor, 'reopenCheck', state.headRAPermissions) && hoursSince(c.submittedAt, new Date(nowIso())) <= 24;
    if (!isDean && !headRAOk) return { ok: false, error: 'Only a dean can reopen this check.' };
    update((d) => {
      const check = d.checks.find((x) => x.id === checkId);
      if (!check) return;
      check.submittedAt = null;
      check.reopenedBy = actor.id;
      log(d, actor, 'check.reopen', `${check.scheduleName} · ${check.floorName} · ${check.date}`);
    });
    return { ok: true };
  },
  deleteCheck(checkId: string, actor: StaffUser): Result {
    const c = state.checks.find((x) => x.id === checkId);
    if (!c) return { ok: false, error: 'Check not found.' };
    if (c.submittedAt && actor.role !== 'dean') return { ok: false, error: 'Only a dean can delete a submitted check.' };
    if (!c.submittedAt && actor.role !== 'dean' && c.raId !== actor.id) return { ok: false, error: 'Only the RA who started this check, or a dean, can discard it.' };
    update((d) => {
      d.checks = d.checks.filter((x) => x.id !== checkId);
      log(d, actor, 'check.delete', `${c.scheduleName} · ${c.floorName} · ${c.date}`);
    });
    return { ok: true };
  },

  // ----- leave -----
  addLeave(input: Omit<Leave, 'id' | 'enteredBy'>, actor: StaffUser): Result {
    if (!isDateKey(input.from) || !isDateKey(input.to)) return { ok: false, error: 'Pick both dates.' };
    if (input.to < input.from) return { ok: false, error: 'The end date is before the start date.' };
    update((d) => {
      d.leaves.push({ ...input, reason: input.reason.trim(), id: uid('l'), enteredBy: actor.id });
      const b = d.boys.find((x) => x.id === input.boyId);
      log(d, actor, 'leave.add', `${b ? boyName(b) : input.boyId}: ${input.from} to ${input.to}`);
    });
    return { ok: true };
  },
  deleteLeave(id: string, actor: StaffUser) {
    update((d) => {
      d.leaves = d.leaves.filter((l) => l.id !== id);
      log(d, actor, 'leave.delete', id);
    });
  },

  // ----- settings / rollover / backup -----
  updateSettings(patch: Partial<AppState['settings']>) {
    update((d) => { Object.assign(d.settings, patch); });
  },
  archiveYear(newYearLabel: string, actor: StaffUser) {
    update((d) => {
      d.archives.unshift({
        id: uid('y'), label: d.settings.yearLabel, archivedAt: nowIso(),
        floors: [...d.floors], rooms: [...d.rooms], boys: [...d.boys], checks: [...d.checks], leaves: [...d.leaves],
        statusTypes: [...d.statusTypes], moves: [...d.moves], signatures: [...d.signatures],
      });
      d.boys = [];
      d.checks = [];
      d.leaves = [];
      d.moves = [];
      d.signatures = [];
      d.staff.forEach((s) => { if (s.role !== 'dean') s.active = false; });
      d.settings.yearLabel = newYearLabel.trim() || d.settings.yearLabel;
      log(d, actor, 'year.rollover', `Archived ${d.archives[0].label}, started ${d.settings.yearLabel}`);
    });
  },
  exportJson(): string {
    return JSON.stringify({ exportedAt: nowIso(), state }, null, 2);
  },
  importJson(json: string): Result {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { ok: false, error: 'That file is not valid JSON.' };
    }
    const candidate = (parsed && typeof parsed === 'object' && 'state' in parsed ? (parsed as { state: unknown }).state : parsed) as Partial<AppState> | null;
    if (!candidate || typeof candidate !== 'object' || candidate.version !== 1 || !Array.isArray(candidate.floors) || !Array.isArray(candidate.staff)) {
      return { ok: false, error: 'That file is not a Room Check backup.' };
    }
    replaceState(migrate(candidate as AppState));
    return { ok: true };
  },
  resetAll() {
    replaceState(initialState());
  },
};

// ---------- event recording and replay (used by encrypted sync) ----------

export type ActionName = keyof typeof rawActions;

export interface StoreEvent {
  /** Also the idempotency key on the server. */
  seed: string;
  at: string;
  name: ActionName;
  args: unknown[];
}

const NOT_SYNCED = new Set<ActionName>(['exportJson', 'importJson', 'resetAll']);
let recorder: ((event: StoreEvent) => void) | null = null;

/** Called with every synced action performed on this device. */
export function setRecorder(fn: ((event: StoreEvent) => void) | null) {
  recorder = fn;
}

/**
 * Public actions. Each call runs with a fresh seed so the ids and timestamps it generates can be
 * reproduced on other devices, and is handed to the recorder when sync is on.
 */
export const actions: typeof rawActions = new Proxy(rawActions, {
  get(target, prop: string) {
    const fn = (target as Record<string, unknown>)[prop];
    if (typeof fn !== 'function' || NOT_SYNCED.has(prop as ActionName)) return fn;
    return (...args: unknown[]) => {
      const seed = randomSeed();
      const at = new Date().toISOString();
      const result = runWithContext(seed, at, () => (fn as (...a: unknown[]) => unknown).apply(target, args));
      recorder?.({ seed, at, name: prop as ActionName, args });
      return result;
    };
  },
}) as typeof rawActions;

/** Replay one event exactly as it ran on the device that produced it. Never recorded. */
export function applyEvent(event: StoreEvent) {
  const fn = rawActions[event.name] as unknown as (...a: unknown[]) => unknown;
  if (typeof fn !== 'function' || NOT_SYNCED.has(event.name)) return;
  try {
    runWithContext(event.seed, event.at, () => fn.apply(rawActions, event.args));
  } catch (err) {
    console.warn('Could not replay event', event.name, err);
  }
}

/**
 * Rebase: start from the last server-confirmed state, apply the new confirmed events in server order,
 * remember that as the new confirmed state, then re-apply this device's still-pending events on top.
 */
export function rebase(confirmed: AppState, newlyConfirmed: StoreEvent[], pending: StoreEvent[]): AppState {
  let nextConfirmed = confirmed;
  batch(() => {
    state = confirmed;
    for (const e of newlyConfirmed) applyEvent(e);
    nextConfirmed = state;
    for (const e of pending) applyEvent(e);
  });
  return nextConfirmed;
}

function addRoomsRangeDraft(d: Draft<AppState>, floorId: string, from: number, to: number, capacity: number): number {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 500) return 0;
  const existing = new Set(d.rooms.filter((r) => r.floorId === floorId).map((r) => r.number.toLowerCase()));
  const width = String(from).length;
  let order = d.rooms.filter((r) => r.floorId === floorId).length;
  let added = 0;
  for (let n = from; n <= to; n++) {
    const num = String(n).padStart(width, '0');
    if (existing.has(num.toLowerCase())) continue;
    d.rooms.push({ id: uid('r'), floorId, number: num, capacity, type: 'standard', sortOrder: order++ });
    added++;
  }
  return added;
}
