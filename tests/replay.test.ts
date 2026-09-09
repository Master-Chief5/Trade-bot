import { describe, expect, it, beforeEach } from 'vitest';
import { actions, applyEvent, getState, rebase, replaceState, setRecorder, type StoreEvent } from '../src/lib/store';
import { initialState } from '../src/lib/defaults';
import { todayKey } from '../src/lib/dates';
import { addRA, boy, floor, setupDorm, status } from './helpers';

describe('event replay', () => {
  beforeEach(() => {
    setRecorder(null);
  });

  it('reproduces identical ids and timestamps on another device', () => {
    const recorded: StoreEvent[] = [];
    setRecorder((e) => recorded.push(e));
    const { dean } = setupDorm();
    const ra = addRA('Alex', ['Floor 1'], dean);
    const id = actions.startCheck(getState().schedules[0].id, floor('Floor 1').id, todayKey(), ra);
    actions.setEntryStatus(id, boy('Achebe').id, status('A').id);
    actions.submitCheck(id, ra);
    const deviceA = getState();
    setRecorder(null);

    replaceState(initialState());
    for (const e of recorded) applyEvent(e);
    const deviceB = getState();
    expect(deviceB).toEqual(deviceA);
    expect(deviceB.checks[0].id).toBe(id);
    expect(deviceB.checks[0].submittedAt).toBe(deviceA.checks[0].submittedAt);
  });

  it('does not record replayed events or backup operations', () => {
    const recorded: StoreEvent[] = [];
    setRecorder((e) => recorded.push(e));
    setupDorm();
    const count = recorded.length;
    applyEvent(recorded[0]);
    actions.exportJson();
    expect(recorded.length).toBe(count);
    expect(recorded.some((e) => e.name === 'exportJson')).toBe(false);
  });

  it('rebases pending local changes on top of newly confirmed remote ones', () => {
    const recorded: StoreEvent[] = [];
    setRecorder((e) => recorded.push(e));
    const { dean } = setupDorm();
    setRecorder(null);
    const confirmed = getState();

    // Device A (remote) adds a floor; device B (local, pending) adds a boy.
    const remote: StoreEvent[] = [];
    setRecorder((e) => remote.push(e));
    actions.addFloor('Floor 3');
    setRecorder(null);
    replaceState(confirmed);
    const pending: StoreEvent[] = [];
    setRecorder((e) => pending.push(e));
    actions.addBoy({ firstName: 'New', lastName: 'Boy', grade: 9, roomId: null }, dean);
    setRecorder(null);

    const nextConfirmed = rebase(confirmed, remote, pending);
    expect(nextConfirmed.floors.map((f) => f.name)).toContain('Floor 3');
    expect(nextConfirmed.boys.some((b) => b.lastName === 'Boy')).toBe(false);
    expect(getState().floors.map((f) => f.name)).toContain('Floor 3');
    expect(getState().boys.some((b) => b.lastName === 'Boy')).toBe(true);
  });
});

describe('replay determinism', () => {
  it('judges the head RA reopen window by the event clock, not the replaying device clock', () => {
    const { dean } = setupDorm();
    const head = addRA('Head', ['Floor 1'], dean, 'headra');
    actions.setHeadRAPermissions({ ...getState().headRAPermissions, editSubmitted24h: true, viewAllFloors: true }, dean);
    const afterSetup = getState();

    const recorded: StoreEvent[] = [];
    setRecorder((e) => recorded.push(e));
    const id = actions.startCheck(getState().schedules[0].id, floor('Floor 1').id, todayKey(), head);
    actions.submitCheck(id, head);
    expect(actions.reopenCheck(id, head).ok).toBe(true);
    setRecorder(null);

    // Replay the same three events on a device catching up days later. The check was
    // submitted and reopened an hour apart, so the reopen must still stand.
    const threeDaysAgo = Date.now() - 3 * 24 * 3600_000;
    const at = [threeDaysAgo, threeDaysAgo + 60_000, threeDaysAgo + 3600_000];
    replaceState(afterSetup);
    recorded.forEach((e, i) => applyEvent({ ...e, at: new Date(at[i]).toISOString() }));

    expect(getState().checks).toHaveLength(1);
    expect(getState().checks[0].submittedAt).toBeNull();
  });
});
