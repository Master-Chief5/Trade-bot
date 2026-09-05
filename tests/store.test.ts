import { describe, expect, it, beforeEach } from 'vitest';
import { actions, getState } from '../src/lib/store';
import { canEditCheck, canReopenCheck, consecutiveAbsences, dayComplete, flaggedBoys, nudgesFor, roomStates, signatureFor, slotsForDate, slotsForUser, tally, templatePeriods, templateRooms } from '../src/lib/checks';
import { parseRoster } from '../src/lib/roster';
import { addDays, todayKey, weekStartSunday } from '../src/lib/dates';
import { addRA, boy, floor, setupDorm, singleSchedule, status } from './helpers';

describe('setup', () => {
  beforeEach(() => setupDorm());

  it('creates the dean, defaults, floors and rooms', () => {
    const s = getState();
    expect(s.setupComplete).toBe(true);
    expect(s.staff).toHaveLength(1);
    expect(s.staff[0].role).toBe('dean');
    expect(s.statusTypes.map((t) => t.code)).toEqual(['P', 'A', 'AW', 'L', 'INF']);
    expect(s.schedules.map((t) => t.code)).toEqual(['W', 'SH', 'RC']);
    expect(s.schedules.every((t) => t.days.join() === '0,1,2,3,4')).toBe(true);
    expect(s.floors).toHaveLength(2);
    expect(s.rooms.filter((r) => r.floorId === floor('Floor 1').id).map((r) => r.number)).toEqual(['101', '102', '103', '104']);
  });

  it('imports the roster into rooms and updates on re-import', () => {
    expect(getState().boys).toHaveLength(5);
    expect(getState().rooms.find((r) => r.id === boy('Achebe').roomId)?.number).toBe('101');
    const res = actions.importRoster([{ firstName: 'Daniel', lastName: 'Achebe', grade: 10, roomNumber: '103' }, { firstName: 'New', lastName: 'Kid', grade: 9, roomNumber: '999' }], getState().staff[0]);
    expect(res).toEqual({ added: 1, updated: 1, unmatchedRooms: ['999'] });
    expect(boy('Achebe').grade).toBe(10);
    expect(getState().rooms.find((r) => r.id === boy('Achebe').roomId)?.number).toBe('103');
    expect(boy('Kid').roomId).toBeNull();
  });

  it('refuses to delete a floor with boys on it', () => {
    expect(actions.deleteFloor(floor('Floor 1').id).ok).toBe(false);
    actions.moveBoy(boy('Achebe').id, null);
    actions.moveBoy(boy('Bell').id, null);
    actions.moveBoy(boy('Brooks').id, null);
    expect(actions.deleteFloor(floor('Floor 1').id).ok).toBe(true);
    expect(getState().rooms.some((r) => r.number === '101')).toBe(false);
  });
});

describe('checks', () => {
  let dean: ReturnType<typeof setupDorm>['dean'];
  beforeEach(() => {
    ({ dean } = setupDorm());
  });

  it('starts a check with everyone present and pre-marks leave', () => {
    const ra = addRA('Alex', ['Floor 1'], dean);
    const today = todayKey();
    actions.addLeave({ boyId: boy('Bell').id, from: today, to: addDays(today, 2), reason: 'Home' }, dean);
    const id = actions.startCheck(getState().schedules[0].id, floor('Floor 1').id, today, ra);
    const check = getState().checks.find((c) => c.id === id)!;
    expect(check.entries.map((e) => e.name)).toEqual(['Daniel Achebe', 'Jonah Bell', 'Micah Brooks']);
    expect(check.entries.find((e) => e.name === 'Jonah Bell')?.statusId).toBe(status('AW').id);
    expect(check.entries.find((e) => e.name === 'Daniel Achebe')?.statusId).toBe(status('P').id);
    expect(actions.startCheck(getState().schedules[0].id, floor('Floor 1').id, today, ra)).toBe(id);
    const t = tally(check, getState().statusTypes);
    expect(t).toMatchObject({ present: 2, absent: 0, excused: 1, total: 3 });
  });

  it('blocks submit until required notes are written, then locks the check', () => {
    const ra = addRA('Alex', ['Floor 1'], dean);
    const id = actions.startCheck(getState().schedules[0].id, floor('Floor 1').id, todayKey(), ra);
    actions.setEntryStatus(id, boy('Achebe').id, status('L').id);
    const first = actions.submitCheck(id, ra);
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.missingNotes).toEqual(['Daniel Achebe']);
    actions.setEntryNote(id, boy('Achebe').id, 'In shower, confirmed');
    expect(actions.submitCheck(id, ra).ok).toBe(true);
    const check = getState().checks[0];
    expect(check.submittedAt).toBeTruthy();
    expect(canEditCheck(getState(), ra, check)).toBe(false);
    expect(canReopenCheck(getState(), ra, check)).toBe(false);
    expect(canReopenCheck(getState(), dean, check)).toBe(true);
  });

  it('cycles statuses in sort order', () => {
    const ra = addRA('Alex', ['Floor 1'], dean);
    const id = actions.startCheck(getState().schedules[0].id, floor('Floor 1').id, todayKey(), ra);
    actions.cycleEntryStatus(id, boy('Achebe').id);
    expect(getState().checks[0].entries[0].statusId).toBe(status('A').id);
    actions.cycleEntryStatus(id, boy('Achebe').id);
    expect(getState().checks[0].entries[0].statusId).toBe(status('AW').id);
  });

  it('lets a head RA reopen only with the permission switch on', () => {
    const head = addRA('Head', ['Floor 1'], dean, 'headra');
    const id = actions.startCheck(getState().schedules[0].id, floor('Floor 1').id, todayKey(), head);
    actions.submitCheck(id, head);
    expect(actions.reopenCheck(id, head).ok).toBe(false);
    actions.setHeadRAPermissions({ ...getState().headRAPermissions, editSubmitted24h: true }, dean);
    expect(actions.reopenCheck(id, head).ok).toBe(true);
    expect(getState().checks[0].submittedAt).toBeNull();
  });

  it('keeps an RA out of floors they are not assigned to', () => {
    const ra = addRA('Alex', ['Floor 2'], dean);
    const id = actions.startCheck(getState().schedules[0].id, floor('Floor 1').id, todayKey(), dean);
    expect(canEditCheck(getState(), ra, getState().checks.find((c) => c.id === id)!)).toBe(false);
  });

  it('flags a boy absent three checks in a row', () => {
    const ra = addRA('Alex', ['Floor 1'], dean);
    const sched = getState().schedules[0].id;
    for (let i = 3; i >= 1; i--) {
      const date = addDays(todayKey(), -i);
      const id = actions.startCheck(sched, floor('Floor 1').id, date, ra);
      actions.setEntryStatus(id, boy('Brooks').id, status('A').id);
      expect(actions.submitCheck(id, ra).ok).toBe(true);
    }
    expect(consecutiveAbsences(getState(), boy('Brooks').id, todayKey())).toBe(3);
    expect(consecutiveAbsences(getState(), boy('Achebe').id, todayKey())).toBe(0);
    const flags = flaggedBoys(getState(), todayKey());
    expect(flags.map((f) => f.boy.lastName)).toEqual(['Brooks']);
  });

  it('marks a slot late after the deadline', () => {
    singleSchedule('22:00', 20);
    const today = todayKey();
    const late = new Date();
    late.setHours(23, 30, 0, 0);
    const early = new Date();
    early.setHours(20, 0, 0, 0);
    const lateSlots = slotsForDate(getState(), today, late);
    const earlySlots = slotsForDate(getState(), today, early);
    expect(lateSlots).toHaveLength(2);  // one per floor
    expect(lateSlots.every((s) => s.pastDeadline)).toBe(true);
    expect(earlySlots.every((s) => !s.pastDeadline && s.minutesUntil === 120)).toBe(true);
  });
});

describe('status types and rollover', () => {
  let dean: ReturnType<typeof setupDorm>['dean'];
  beforeEach(() => {
    ({ dean } = setupDorm());
  });

  it('refuses duplicate codes and deleting the default', () => {
    expect(actions.addStatusType({ name: 'Practice', code: 'p', color: '#000', countsAs: 'excused', requiresNote: false, isDefault: false, useForLeave: false }).ok).toBe(false);
    expect(actions.addStatusType({ name: 'Practice', code: 'PR', color: '#000', countsAs: 'excused', requiresNote: false, isDefault: false, useForLeave: false }).ok).toBe(true);
    expect(actions.deleteStatusType(status('P').id).ok).toBe(false);
    expect(actions.deleteStatusType(status('PR').id).ok).toBe(true);
  });

  it('keeps one default and one leave status', () => {
    actions.updateStatusType(status('A').id, { isDefault: true });
    expect(getState().statusTypes.filter((s) => s.isDefault).map((s) => s.code)).toEqual(['A']);
  });

  it('archives the year and keeps the building', () => {
    const ra = addRA('Alex', ['Floor 1'], dean);
    const id = actions.startCheck(getState().schedules[0].id, floor('Floor 1').id, todayKey(), ra);
    actions.submitCheck(id, ra);
    actions.archiveYear('2027–28', dean);
    const s = getState();
    expect(s.archives).toHaveLength(1);
    expect(s.archives[0].boys).toHaveLength(5);
    expect(s.archives[0].checks).toHaveLength(1);
    expect(s.boys).toHaveLength(0);
    expect(s.checks).toHaveLength(0);
    expect(s.floors).toHaveLength(2);
    expect(s.staff.find((x) => x.id === ra.id)?.active).toBe(false);
    expect(s.staff.find((x) => x.id === dean.id)?.active).toBe(true);
    expect(s.settings.yearLabel).toBe('2027–28');
  });

  it('round-trips a backup and rejects junk', () => {
    const json = actions.exportJson();
    actions.resetAll();
    expect(getState().setupComplete).toBe(false);
    expect(actions.importJson(json).ok).toBe(true);
    expect(getState().boys).toHaveLength(5);
    expect(actions.importJson('{"nope":1}').ok).toBe(false);
    expect(actions.importJson('not json').ok).toBe(false);
  });
});

describe('review fixes', () => {
  let dean: ReturnType<typeof setupDorm>['dean'];
  beforeEach(() => {
    ({ dean } = setupDorm());
  });

  it('ignores edits to a submitted check and refuses another RA discarding it', () => {
    const ra = addRA('Alex', ['Floor 1'], dean);
    const other = addRA('Sam', ['Floor 1'], dean);
    const id = actions.startCheck(getState().schedules[0].id, floor('Floor 1').id, todayKey(), ra);
    expect(actions.deleteCheck(id, other).ok).toBe(false);
    actions.submitCheck(id, ra);
    actions.setEntryStatus(id, boy('Achebe').id, status('A').id);
    actions.cycleEntryStatus(id, boy('Bell').id);
    actions.setEntryNote(id, boy('Bell').id, 'late');
    const check = getState().checks[0];
    expect(check.entries.every((e) => e.statusId === status('P').id && !e.note)).toBe(true);
  });

  it('keeps a head RA from reopening a floor they cannot see, and "see every floor" is view-only', () => {
    const head = addRA('Head', ['Floor 1'], dean, 'headra');
    actions.setHeadRAPermissions({ ...getState().headRAPermissions, editSubmitted24h: true }, dean);
    const id = actions.startCheck(getState().schedules[0].id, floor('Floor 2').id, todayKey(), dean);
    actions.submitCheck(id, dean);
    expect(actions.reopenCheck(id, head).ok).toBe(false);
    actions.setHeadRAPermissions({ ...getState().headRAPermissions, editSubmitted24h: true, viewAllFloors: true }, dean);
    expect(actions.reopenCheck(id, head).ok).toBe(true);
    expect(canEditCheck(getState(), head, getState().checks[0])).toBe(false);
  });

  it('paints a room unchecked when its boys joined after the check', () => {
    const ra = addRA('Alex', ['Floor 1'], dean);
    actions.startCheck(getState().schedules[0].id, floor('Floor 1').id, todayKey(), ra);
    const room104 = getState().rooms.find((r) => r.number === '104')!;
    actions.moveBoy(boy('Reyes').id, room104.id, dean);
    const states = roomStates(getState(), floor('Floor 1').id, todayKey());
    expect(states.get(room104.id)).toBe('unchecked');
    expect(states.get(getState().rooms.find((r) => r.number === '101')!.id)).toBe('ok');
  });

  it('refuses leave with missing dates', () => {
    expect(actions.addLeave({ boyId: boy('Bell').id, from: '', to: '', reason: '' }, dean).ok).toBe(false);
    expect(actions.addLeave({ boyId: boy('Bell').id, from: '2026-09-05', to: '2026-09-06', reason: '' }, dean).ok).toBe(true);
  });

  it('does not guess when a room number exists on two floors', () => {
    actions.addRoom(floor('Floor 2').id, '101');
    const res = actions.importRoster([{ firstName: 'Twin', lastName: 'Rooms', grade: 9, roomNumber: '101' }], dean);
    expect(res.unmatchedRooms).toEqual(['101 (on more than one floor)']);
    expect(boy('Rooms').roomId).toBeNull();
    const parsed = parseRoster('Twin Rooms\t9\t101', getState().rooms.map((r) => r.number));
    expect(parsed[0].issues[0]).toMatch(/more than one floor/);
  });

  it('keeps a late-night check alive past midnight', () => {
    singleSchedule('23:50', 20);
    const yesterday = addDays(todayKey(), -1);
    const now = new Date();
    now.setHours(0, 5, 0, 0);
    const slots = slotsForDate(getState(), yesterday, now);
    expect(slots[0].pastDeadline).toBe(false);
    expect(slots[0].minutesUntil).toBe(-15);
    now.setHours(0, 15, 0, 0);
    expect(slotsForDate(getState(), yesterday, now)[0].pastDeadline).toBe(true);
  });

  it('snapshots status types and room history into the archive', () => {
    actions.archiveYear('2027–28', dean);
    expect(getState().archives[0].statusTypes?.map((s) => s.code)).toEqual(['P', 'A', 'AW', 'L', 'INF']);
    expect(getState().archives[0].moves?.length).toBe(5);
    expect(getState().moves).toHaveLength(0);
  });
});

describe('sheets and signing off', () => {
  let dean: ReturnType<typeof setupDorm>['dean'];
  beforeEach(() => {
    ({ dean } = setupDorm());
  });

  it('seeds one sheet covering every default check', () => {
    const [sheet] = getState().sheetTemplates;
    expect(sheet.name).toBe('Sunday to Thursday');
    expect(sheet.days).toEqual([0, 1, 2, 3, 4]);
    expect(sheet.scheduleIds).toEqual(getState().schedules.map((s) => s.id));
    expect(sheet.roomIds).toBe('floor');
  });

  it('keeps a weekend sheet separate from the weekday one', () => {
    const rc = getState().schedules.find((s) => s.code === 'RC')!;
    const rooms = getState().rooms.filter((r) => r.floorId === floor('Floor 1').id).slice(0, 2).map((r) => r.id);
    actions.addSheetTemplate({ name: 'Weekend', days: [5, 6], scheduleIds: [rc.id], roomIds: rooms });
    const weekend = getState().sheetTemplates.find((t) => t.name === 'Weekend')!;
    expect(templatePeriods(getState(), weekend).map((p) => p.code)).toEqual(['RC']);
    expect(templateRooms(getState(), floor('Floor 1').id, weekend)).toHaveLength(2);
    // The weekday sheet is untouched by the new one.
    expect(getState().sheetTemplates[0].days).toEqual([0, 1, 2, 3, 4]);
  });

  it('refuses to delete the last sheet', () => {
    expect(actions.deleteSheetTemplate(getState().sheetTemplates[0].id).ok).toBe(false);
    actions.addSheetTemplate({ name: 'Second', days: [6], scheduleIds: [getState().schedules[0].id], roomIds: 'floor' });
    expect(actions.deleteSheetTemplate(getState().sheetTemplates[0].id).ok).toBe(true);
  });

  it('drops a deleted room from the sheets that listed it', () => {
    const rooms = getState().rooms.filter((r) => r.floorId === floor('Floor 1').id).map((r) => r.id);
    actions.addSheetTemplate({ name: 'Some rooms', days: [0], scheduleIds: [getState().schedules[0].id], roomIds: rooms });
    const sheet = getState().sheetTemplates.find((t) => t.name === 'Some rooms')!;
    actions.moveBoy(boy('Achebe').id, null);
    actions.moveBoy(boy('Bell').id, null);
    actions.deleteRoom(rooms[0]);
    expect(templateRooms(getState(), floor('Floor 1').id, sheet).map((r) => r.id)).not.toContain(rooms[0]);
  });

  const SIG = 'data:image/png;base64,iVBORw0KGgo=';

  it('will not let an RA sign a day whose checks are not all in', () => {
    const ra = addRA('Alex', ['Floor 1'], dean);
    const sunday = weekStartSunday(todayKey());
    const first = actions.startCheck(getState().schedules[0].id, floor('Floor 1').id, sunday, ra);
    actions.submitCheck(first, ra);
    // Two of the three checks are still outstanding.
    expect(dayComplete(getState(), floor('Floor 1').id, sunday)).toBe(false);
    expect(actions.signDay(floor('Floor 1').id, sunday, SIG, ra).ok).toBe(false);
  });

  it('signs a day off once every check is submitted, and only for a floor of theirs', () => {
    const ra = addRA('Alex', ['Floor 1'], dean);
    const other = addRA('Sam', ['Floor 2'], dean);
    const sunday = weekStartSunday(todayKey());
    getState().schedules.forEach((s) => {
      const id = actions.startCheck(s.id, floor('Floor 1').id, sunday, ra);
      actions.submitCheck(id, ra);
    });
    expect(dayComplete(getState(), floor('Floor 1').id, sunday)).toBe(true);
    expect(actions.signDay(floor('Floor 1').id, sunday, SIG, other).ok).toBe(false);
    expect(actions.signDay(floor('Floor 1').id, sunday, SIG, ra).ok).toBe(true);
    expect(signatureFor(getState(), floor('Floor 1').id, sunday)?.raName).toBe('Alex');

    // Signing again replaces their own rather than stacking up.
    expect(actions.signDay(floor('Floor 1').id, sunday, SIG, ra).ok).toBe(true);
    expect(getState().signatures).toHaveLength(1);

    // A signature belongs to the day it was made for, and cannot be lifted to another.
    expect(signatureFor(getState(), floor('Floor 1').id, addDays(sunday, 1))).toBeUndefined();
    expect(actions.unsignDay(floor('Floor 1').id, sunday, other).ok).toBe(false);
    expect(actions.unsignDay(floor('Floor 1').id, sunday, ra).ok).toBe(true);
    expect(getState().signatures).toHaveLength(0);
  });

  it('rejects anything that is not a PNG signature', () => {
    const ra = addRA('Alex', ['Floor 1'], dean);
    const sunday = weekStartSunday(todayKey());
    getState().schedules.forEach((s) => actions.submitCheck(actions.startCheck(s.id, floor('Floor 1').id, sunday, ra), ra));
    expect(actions.signDay(floor('Floor 1').id, sunday, 'javascript:alert(1)', ra).ok).toBe(false);
    expect(actions.signDay(floor('Floor 1').id, sunday, 'data:image/svg+xml;base64,PHN2Zz4=', ra).ok).toBe(false);
  });

  it('archives signatures with the year and starts the new one clean', () => {
    const ra = addRA('Alex', ['Floor 1'], dean);
    const sunday = weekStartSunday(todayKey());
    getState().schedules.forEach((s) => actions.submitCheck(actions.startCheck(s.id, floor('Floor 1').id, sunday, ra), ra));
    actions.signDay(floor('Floor 1').id, sunday, SIG, ra);
    actions.archiveYear('2027–28', dean);
    expect(getState().archives[0].signatures).toHaveLength(1);
    expect(getState().signatures).toHaveLength(0);
  });
});

describe('assignments, reminders and covers', () => {
  let dean: ReturnType<typeof setupDorm>['dean'];
  beforeEach(() => {
    ({ dean } = setupDorm());
    singleSchedule('22:00', 20);
  });

  it('gives a named check to that person alone', () => {
    const alex = addRA('Alex', ['Floor 1'], dean);
    const sam = addRA('Sam', ['Floor 1'], dean);
    const today = todayKey();
    // Unassigned, both RAs on the floor see it.
    expect(slotsForUser(getState(), alex, today)).toHaveLength(1);
    expect(slotsForUser(getState(), sam, today)).toHaveLength(1);

    const sched = getState().schedules[0].id;
    expect(actions.addAssignment({ raId: alex.id, floorId: floor('Floor 1').id, scheduleId: sched, from: today, to: today }, dean).ok).toBe(true);
    expect(slotsForUser(getState(), alex, today)).toHaveLength(1);
    expect(slotsForUser(getState(), sam, today)).toHaveLength(0);
    // A dean still sees everything.
    expect(slotsForUser(getState(), dean, today)).toHaveLength(2);
  });

  it('only applies an assignment on the days it covers', () => {
    const alex = addRA('Alex', ['Floor 1'], dean);
    const sam = addRA('Sam', ['Floor 1'], dean);
    const today = todayKey();
    const tomorrow = addDays(today, 1);
    actions.addAssignment({ raId: alex.id, floorId: floor('Floor 1').id, scheduleId: 'all', from: today, to: today }, dean);
    expect(slotsForUser(getState(), sam, today)).toHaveLength(0);
    expect(slotsForUser(getState(), sam, tomorrow)).toHaveLength(1);
  });

  it('refuses an assignment that ends before it starts', () => {
    const alex = addRA('Alex', ['Floor 1'], dean);
    const res = actions.addAssignment({ raId: alex.id, floorId: floor('Floor 1').id, scheduleId: 'all', from: addDays(todayKey(), 2), to: todayKey() }, dean);
    expect(res.ok).toBe(false);
  });

  it('will not stack unread reminders for the same check', () => {
    const alex = addRA('Alex', ['Floor 1'], dean);
    const n = { toRaId: alex.id, floorId: floor('Floor 1').id, scheduleId: getState().schedules[0].id, date: todayKey() };
    expect(actions.nudge(n, dean).ok).toBe(true);
    expect(actions.nudge(n, dean).ok).toBe(false);
    expect(nudgesFor(getState(), alex.id)).toHaveLength(1);
    actions.markNudgesSeen(alex.id);
    expect(nudgesFor(getState(), alex.id)).toHaveLength(0);
    // Once read, a dean may chase again.
    expect(actions.nudge(n, dean).ok).toBe(true);
  });

  it('turns a returned cover into an ordinary check, named on both sides', () => {
    const alex = addRA('Alex', ['Floor 1'], dean);
    const today = todayKey();
    const sched = getState().schedules[0].id;
    const res = actions.applyCoverResult({
      handoffId: 'h1', scheduleId: sched, floorId: floor('Floor 1').id, date: today,
      forRaId: alex.id, forRaName: alex.name, coveredBy: 'Jordan Miles',
      startedAt: new Date().toISOString(), submittedAt: new Date().toISOString(),
      entries: [{ boyId: boy('Achebe').id, statusId: status('A').id, note: 'Not signed out' }],
    });
    expect(res.ok).toBe(true);
    const check = getState().checks[0];
    expect(check.source).toBe('cover');
    expect(check.coveredBy).toBe('Jordan Miles');
    expect(check.raName).toBe('Alex');
    expect(check.entries.find((e) => e.boyId === boy('Achebe').id)?.statusId).toBe(status('A').id);
    // Everyone else on the floor is still accounted for, at the default.
    expect(check.entries).toHaveLength(3);
    expect(check.entries.find((e) => e.boyId === boy('Bell').id)?.statusId).toBe(status('P').id);
  });

  it('lets the RA’s own check win over a cover that arrives late', () => {
    const alex = addRA('Alex', ['Floor 1'], dean);
    const today = todayKey();
    const sched = getState().schedules[0].id;
    const mine = actions.startCheck(sched, floor('Floor 1').id, today, alex);
    actions.submitCheck(mine, alex);
    const res = actions.applyCoverResult({
      handoffId: 'h2', scheduleId: sched, floorId: floor('Floor 1').id, date: today,
      forRaId: alex.id, forRaName: alex.name, coveredBy: 'Jordan Miles',
      startedAt: new Date().toISOString(), submittedAt: new Date().toISOString(),
      entries: [{ boyId: boy('Achebe').id, statusId: status('A').id }],
    });
    expect(res.ok).toBe(false);
    expect(getState().checks).toHaveLength(1);
    expect(getState().checks[0].source).toBe('app');
  });

  it('ignores a status the dorm does not have rather than trusting the sender', () => {
    const alex = addRA('Alex', ['Floor 1'], dean);
    actions.applyCoverResult({
      handoffId: 'h3', scheduleId: getState().schedules[0].id, floorId: floor('Floor 1').id, date: todayKey(),
      forRaId: alex.id, forRaName: alex.name, coveredBy: 'Jordan Miles',
      startedAt: new Date().toISOString(), submittedAt: new Date().toISOString(),
      entries: [{ boyId: boy('Achebe').id, statusId: 'made-up-status' }],
    });
    expect(getState().checks[0].entries.find((e) => e.boyId === boy('Achebe').id)?.statusId).toBe(status('P').id);
  });
});
