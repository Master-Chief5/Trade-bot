import type { AppState, CheckSchedule, HeadRAPermissions, StatusType } from './types';

export const DEFAULT_STATUS_TYPES: Omit<StatusType, 'id'>[] = [
  { name: 'Present', code: 'P', color: '#2E7D4F', countsAs: 'present', requiresNote: false, sortOrder: 0, isDefault: true, useForLeave: false },
  { name: 'Absent', code: 'A', color: '#B3352F', countsAs: 'absent', requiresNote: false, sortOrder: 1, isDefault: false, useForLeave: false },
  { name: 'Away', code: 'AW', color: '#6B7A8C', countsAs: 'excused', requiresNote: false, sortOrder: 2, isDefault: false, useForLeave: true },
  { name: 'Late', code: 'L', color: '#C48A2C', countsAs: 'present', requiresNote: true, sortOrder: 3, isDefault: false, useForLeave: false },
  { name: 'Infirmary', code: 'INF', color: '#4C7FA8', countsAs: 'excused', requiresNote: false, sortOrder: 4, isDefault: false, useForLeave: false },
];

/**
 * The three checks the Kingsway sheet has a column for, Sunday through Thursday.
 * Times are a starting point — deans set the real ones in Settings → Check schedules.
 */
export const DEFAULT_SCHEDULES: Omit<CheckSchedule, 'id'>[] = [
  { name: 'Worship', code: 'W', time: '19:30', days: [0, 1, 2, 3, 4], floorIds: 'all', reminderMinutes: 10, deadlineMinutes: 20, active: true },
  { name: 'Study hall', code: 'SH', time: '20:30', days: [0, 1, 2, 3, 4], floorIds: 'all', reminderMinutes: 10, deadlineMinutes: 20, active: true },
  { name: 'Room check', code: 'RC', time: '22:00', days: [0, 1, 2, 3, 4], floorIds: 'all', reminderMinutes: 15, deadlineMinutes: 20, active: true },
];

export const DEFAULT_HEAD_RA_PERMISSIONS: HeadRAPermissions = {
  viewAllFloors: false,
  editSubmitted24h: false,
  assignRAs: false,
  moveBoys: false,
  manageRAs: false,
  printAllFloors: false,
  receiveEscalations: false,
};

export const HEAD_RA_PERMISSION_LABELS: { key: keyof HeadRAPermissions; label: string; help: string }[] = [
  { key: 'viewAllFloors', label: 'See every floor', help: 'Tonight overview, history and maps for all floors, not just their own.' },
  { key: 'editSubmitted24h', label: 'Reopen a submitted check within 24 hours', help: 'Fix a mistake without waiting for a dean.' },
  { key: 'assignRAs', label: 'Assign RAs to floors', help: 'Change which RA covers which floor.' },
  { key: 'moveBoys', label: 'Move a boy between rooms', help: 'Room changes show on the next printed sheet.' },
  { key: 'manageRAs', label: 'Add or remove RAs', help: 'Invite new RAs and deactivate old ones. Cannot touch deans.' },
  { key: 'printAllFloors', label: 'Print sheets for any floor', help: 'Filled and blank sheets for the whole dorm.' },
  { key: 'receiveEscalations', label: 'Get the missed-check alerts', help: 'Shown on their home screen when a floor is late.' },
];

export function initialState(): AppState {
  return {
    version: 1,
    setupComplete: false,
    settings: {
      dormName: 'Ryan Hall',
      yearLabel: '2026–27',
      headRAEnabled: true,
      remindersEnabled: true,
      raSeeNotes: false,
    },
    floors: [],
    rooms: [],
    boys: [],
    staff: [],
    headRAPermissions: { ...DEFAULT_HEAD_RA_PERMISSIONS },
    statusTypes: [],
    schedules: [],
    sheetTemplates: [],
    checks: [],
    signatures: [],
    leaves: [],
    moves: [],
    audit: [],
    archives: [],
  };
}
