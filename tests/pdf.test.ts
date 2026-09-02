import { describe, expect, it, beforeEach } from 'vitest';
import { actions, getState } from '../src/lib/store';
import { blankSheet, filledSheet, weekSheet } from '../src/lib/pdf';
import { todayKey, weekStart } from '../src/lib/dates';
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
