import { describe, expect, it, beforeEach } from 'vitest';
import { actions, getState } from '../src/lib/store';
import { blankSheet, filledSheet, raSheet, weekSheet } from '../src/lib/pdf';
import { todayKey, weekStart, weekStartSunday } from '../src/lib/dates';
import { scheduleCode, sheetDays, sheetPeriods } from '../src/lib/checks';
import { addRA, boy, floor, setupDorm, status } from './helpers';

describe('pdf', () => {
  beforeEach(() => {
    const { dean } = setupDorm();
    const ra = addRA('Alex', ['Floor 1'], dean);
    const id = actions.startCheck(getState().schedules[0].id, floor('Floor 1').id, todayKey(), ra);
    actions.setEntryStatus(id, boy('Achebe').id, status('A').id);
    actions.setEntryNote(id, boy('Achebe').id, 'Not signed out');
    actions.submitCheck(id, ra);
  });

  it('builds a filled sheet with one page per check', () => {
    const doc = filledSheet(getState(), getState().checks);
    expect(doc.getNumberOfPages()).toBe(1);
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(1500);
  });

  it('builds a blank sheet for every floor', () => {
    const doc = blankSheet(getState(), getState().floors.map((f) => f.id), 'Evening check');
    expect(doc.getNumberOfPages()).toBe(2);
  });

  it('builds a week sheet', () => {
    const doc = weekSheet(getState(), [floor('Floor 1').id], weekStart(todayKey()));
    expect(doc.getNumberOfPages()).toBe(1);
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(1000);
  });
});

describe('the school check sheet', () => {
  beforeEach(() => setupDorm());

  it('lays out one column block per day and one column per check', () => {
    const state = getState();
    // Sunday–Thursday × Worship/Study hall/Room check, plus the name and room columns.
    expect(sheetDays(state)).toEqual([0, 1, 2, 3, 4]);
    expect(sheetPeriods(state).map(scheduleCode)).toEqual(['W', 'SH', 'RC']);
    const doc = raSheet(state, floor('Floor 1').id, weekStartSunday(todayKey()));
    expect(doc.getNumberOfPages()).toBe(1);
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(1500);
  });

  it('grows a column block when a dean adds a Friday check', () => {
    actions.updateSchedule(getState().schedules[2].id, { days: [0, 1, 2, 3, 4, 5] });
    expect(sheetDays(getState())).toEqual([0, 1, 2, 3, 4, 5]);
    expect(raSheet(getState(), floor('Floor 1').id, weekStartSunday(todayKey())).getNumberOfPages()).toBe(1);
  });

  it('carries each submitted check into its own cell', () => {
    const { dean } = setupDorm();
    const ra = addRA('Alex', ['Floor 1'], dean);
    const sunday = weekStartSunday(todayKey());
    const worship = getState().schedules[0].id;
    const id = actions.startCheck(worship, floor('Floor 1').id, sunday, ra);
    actions.setEntryStatus(id, boy('Achebe').id, status('A').id);
    expect(actions.submitCheck(id, ra).ok).toBe(true);

    const filled = raSheet(getState(), floor('Floor 1').id, sunday, { raName: 'Alex' });
    const blank = raSheet(getState(), floor('Floor 1').id, sunday, { blank: true });
    // The blank backup sheet is the same grid with no marks, so it must be strictly smaller.
    expect(filled.output('arraybuffer').byteLength).toBeGreaterThan(blank.output('arraybuffer').byteLength);
  });

  it('falls back to initials for a schedule saved before sheet codes existed', () => {
    expect(scheduleCode({ code: '', name: 'Study hall' })).toBe('SH');
    expect(scheduleCode({ code: 'rc', name: 'Room check' })).toBe('RC');
  });
});
