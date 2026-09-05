import { describe, expect, it } from 'vitest';
import { buildPayload, handoffUrl, normalizeName, validFullName } from '../src/lib/handoff';
import { initialState } from '../src/lib/defaults';
import type { AppState } from '../src/lib/types';

function dorm(): AppState {
  const s = initialState();
  s.settings.dormName = 'Ryan Hall';
  s.floors = [
    { id: 'f1', name: 'Floor 1', sortOrder: 0, layout: 'corridor' },
    { id: 'f2', name: 'Floor 2', sortOrder: 1, layout: 'corridor' },
  ];
  s.rooms = [
    { id: 'r1', floorId: 'f1', number: '101', capacity: 2, type: 'standard', sortOrder: 0 },
    { id: 'r2', floorId: 'f2', number: '201', capacity: 2, type: 'standard', sortOrder: 0 },
  ];
  s.boys = [
    { id: 'b1', firstName: 'Daniel', lastName: 'Achebe', grade: 9, roomId: 'r1', active: true, createdAt: '', deanNotes: 'Family situation, handle gently' },
    { id: 'b2', firstName: 'Caleb', lastName: 'Moore', grade: 10, roomId: 'r2', active: true, createdAt: '' },
    { id: 'b3', firstName: 'Gone', lastName: 'Away', grade: 11, roomId: 'r1', active: false, createdAt: '' },
  ];
  s.schedules = [
    { id: 'sch1', name: 'Room check', code: 'RC', time: '22:00', days: [0, 1, 2, 3, 4], floorIds: 'all', reminderMinutes: 10, deadlineMinutes: 20, active: true },
    { id: 'sch2', name: 'Worship', code: 'W', time: '19:30', days: [0, 1, 2, 3, 4], floorIds: 'all', reminderMinutes: 10, deadlineMinutes: 20, active: true },
  ];
  s.statusTypes = [{ id: 's1', name: 'Present', code: 'P', color: '#0a0', countsAs: 'present', requiresNote: false, sortOrder: 0, isDefault: true, useForLeave: false }];
  return s;
}

describe('what a handover hands over', () => {
  it('carries one floor and nothing else', () => {
    const p = buildPayload(dorm(), 'f1', '2026-09-06', '2026-09-08', 'u1', 'Alex Reid', ['sch1']);
    expect(p.floorName).toBe('Floor 1');
    expect(p.boys.map((b) => b.name)).toEqual(['Daniel Achebe']);
    expect(p.checks.map((c) => c.scheduleId)).toEqual(['sch1']);
  });

  it('never includes a dean note, a room id or an inactive boy', () => {
    const json = JSON.stringify(buildPayload(dorm(), 'f1', '2026-09-06', '2026-09-06', 'u1', 'Alex Reid', ['sch1', 'sch2']));
    expect(json).not.toContain('Family situation');
    expect(json).not.toContain('deanNotes');
    expect(json).not.toContain('"r1"');
    expect(json).not.toContain('Gone');
    // Nor anyone on another floor.
    expect(json).not.toContain('Caleb');
  });

  it('puts the key in the fragment, where no server sees it', () => {
    const url = handoffUrl('abc-123', 'KEYMATERIAL+/=');
    const [before, fragment] = url.split('#');
    expect(before).not.toContain('KEYMATERIAL');
    expect(fragment).toContain('KEYMATERIAL');
    expect(fragment.startsWith('/cover/abc-123?k=')).toBe(true);
  });

  it('insists on a real full name from someone the dorm does not know', () => {
    expect(validFullName('Jordan Miles')).toBe(true);
    expect(validFullName("Ana-María O'Brien")).toBe(true);
    expect(validFullName('Jordan')).toBe(false);
    expect(validFullName('J M')).toBe(false);
    expect(validFullName('  ')).toBe(false);
    expect(validFullName('<script>alert(1)</script> x')).toBe(false);
    expect(validFullName('a'.repeat(90) + ' b')).toBe(false);
    expect(normalizeName('  Jordan   Miles  ')).toBe('Jordan Miles');
  });
});
