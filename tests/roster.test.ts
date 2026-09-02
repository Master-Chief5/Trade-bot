import { describe, expect, it } from 'vitest';
import { parseRoster } from '../src/lib/roster';

const rooms = ['101', '102', '201'];

describe('parseRoster', () => {
  it('reads tab separated rows and skips the header', () => {
    const rows = parseRoster('Name\tGrade\tRoom\nDaniel Achebe\t9\t101\nJonah Bell\tGr 10\t102', rooms);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ firstName: 'Daniel', lastName: 'Achebe', grade: 9, roomNumber: '101', issues: [] });
    expect(rows[1]).toMatchObject({ firstName: 'Jonah', lastName: 'Bell', grade: 10, roomNumber: '102' });
  });

  it('reads comma separated rows in any column order', () => {
    const rows = parseRoster('201, 11, Samuel Reyes', rooms);
    expect(rows[0]).toMatchObject({ firstName: 'Samuel', lastName: 'Reyes', grade: 11, roomNumber: '201' });
  });

  it('handles Last, First when tab separated', () => {
    const rows = parseRoster('Reyes, Samuel\t11\t201', rooms);
    expect(rows[0]).toMatchObject({ firstName: 'Samuel', lastName: 'Reyes' });
  });

  it('flags unknown rooms and missing grades', () => {
    const rows = parseRoster('Micah Brooks\t10\t999\nNo Grade\t101', rooms);
    expect(rows[0].issues).toEqual(['Room 999 is not set up']);
    expect(rows[1].issues).toContain('No grade found');
  });

  it('supports Last First ordering', () => {
    const rows = parseRoster('Bell Jonah\t9\t101', rooms, true);
    expect(rows[0]).toMatchObject({ firstName: 'Jonah', lastName: 'Bell' });
  });
});
