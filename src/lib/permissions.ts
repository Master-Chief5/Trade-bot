import type { AppState, HeadRAPermissions, StaffUser } from './types';

export type Capability =
  | 'viewAllFloors'
  | 'reopenCheck'
  | 'assignRAs'
  | 'moveBoys'
  | 'manageRAs'
  | 'printAllFloors'
  | 'receiveEscalations'
  | 'manageDorm'
  | 'manageBoys'
  | 'manageStatusTypes'
  | 'manageSchedules'
  | 'manageDeans'
  | 'enterFromPaper'
  | 'manageLeave'
  | 'rollover'
  | 'backup'
  | 'viewDeanNotes'
  | 'viewHistory';

const HEAD_RA_MAP: Partial<Record<Capability, keyof HeadRAPermissions>> = {
  viewAllFloors: 'viewAllFloors',
  reopenCheck: 'editSubmitted24h',
  assignRAs: 'assignRAs',
  moveBoys: 'moveBoys',
  manageRAs: 'manageRAs',
  printAllFloors: 'printAllFloors',
  receiveEscalations: 'receiveEscalations',
  viewHistory: 'viewAllFloors',
};

export function can(user: StaffUser | null | undefined, cap: Capability, perms: HeadRAPermissions): boolean {
  if (!user || !user.active) return false;
  if (user.role === 'dean') return true;
  if (user.role === 'headra') {
    const key = HEAD_RA_MAP[cap];
    return key ? perms[key] : false;
  }
  return false;
}

export function roleLabel(role: StaffUser['role']): string {
  return role === 'dean' ? 'Dean' : role === 'headra' ? 'Head RA' : 'RA';
}

/** Floors this user may see and act on. */
export function visibleFloorIds(state: Pick<AppState, 'floors' | 'headRAPermissions'>, user: StaffUser | null | undefined): string[] {
  if (!user) return [];
  if (can(user, 'viewAllFloors', state.headRAPermissions)) return state.floors.map((f) => f.id);
  return user.floorIds.filter((id) => state.floors.some((f) => f.id === id));
}

export function printableFloorIds(state: Pick<AppState, 'floors' | 'headRAPermissions'>, user: StaffUser | null | undefined): string[] {
  if (!user) return [];
  if (can(user, 'printAllFloors', state.headRAPermissions) || can(user, 'viewAllFloors', state.headRAPermissions)) {
    return state.floors.map((f) => f.id);
  }
  return visibleFloorIds(state, user);
}
