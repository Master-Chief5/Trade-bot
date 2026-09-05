import { describe, expect, it } from 'vitest';
import { can } from '../src/lib/permissions';
import { DEFAULT_HEAD_RA_PERMISSIONS } from '../src/lib/defaults';
import type { StaffUser } from '../src/lib/types';

const user = (role: StaffUser['role'], active = true): StaffUser => ({ id: role, name: role, role, pin: '0000', active, floorIds: [], createdAt: '' });

describe('can', () => {
  it('gives deans everything and RAs nothing extra', () => {
    expect(can(user('dean'), 'rollover', DEFAULT_HEAD_RA_PERMISSIONS)).toBe(true);
    expect(can(user('ra'), 'viewAllFloors', DEFAULT_HEAD_RA_PERMISSIONS)).toBe(false);
    expect(can(user('ra'), 'manageBoys', DEFAULT_HEAD_RA_PERMISSIONS)).toBe(false);
  });
  it('maps head RA switches and never leaks dean-only powers', () => {
    const perms = { ...DEFAULT_HEAD_RA_PERMISSIONS, moveBoys: true, viewAllFloors: true };
    expect(can(user('headra'), 'moveBoys', perms)).toBe(true);
    expect(can(user('headra'), 'viewHistory', perms)).toBe(true);
    expect(can(user('headra'), 'manageRAs', perms)).toBe(false);
    expect(can(user('headra'), 'rollover', perms)).toBe(false);
    expect(can(user('headra'), 'manageDeans', perms)).toBe(false);
  });
  it('denies inactive users', () => {
    expect(can(user('dean', false), 'manageBoys', DEFAULT_HEAD_RA_PERMISSIONS)).toBe(false);
  });
});
