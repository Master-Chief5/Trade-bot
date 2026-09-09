import { describe, expect, it } from 'vitest';
import { addDays, formatTime12, isValidTime, weekStart, weekdayOf } from '../src/lib/dates';

describe('dates', () => {
  it('formats 24h times', () => {
    expect(formatTime12('22:00')).toBe('10:00 PM');
    expect(formatTime12('09:15')).toBe('9:15 AM');
    expect(formatTime12('00:05')).toBe('12:05 AM');
    expect(formatTime12('12:00')).toBe('12:00 PM');
  });
  it('finds the Monday of a week', () => {
    expect(weekStart('2026-09-02')).toBe('2026-08-31');
    expect(weekStart('2026-09-06')).toBe('2026-08-31');
    expect(weekStart('2026-08-31')).toBe('2026-08-31');
  });
  it('adds days across month ends', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(weekdayOf('2026-09-05')).toBe(6);
  });
  it('validates times', () => {
    expect(isValidTime('22:00')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('9:00')).toBe(false);
  });
});
