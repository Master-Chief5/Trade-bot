export type Role = 'dean' | 'headra' | 'ra';
export type CountsAs = 'present' | 'absent' | 'excused';
export type RoomType = 'standard' | 'ra' | 'unused';
export type FloorLayout = 'corridor' | 'single';

export interface Floor {
  id: string;
  name: string;
  sortOrder: number;
  gradeLabel?: string;
  layout: FloorLayout;
}

export interface Room {
  id: string;
  floorId: string;
  number: string;
  capacity: number;
  type: RoomType;
  side?: 'left' | 'right';
  sortOrder: number;
}

export interface Boy {
  id: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  grade: number;
  roomId: string | null;
  active: boolean;
  deanNotes?: string;
  createdAt: string;
}

export interface StaffUser {
  id: string;
  name: string;
  email?: string;
  role: Role;
  /** Device-only sign-in. Empty for staff who sign in with an online account. */
  pin: string;
  /** Online account this staff member signs in with, when the dorm syncs. */
  authUserId?: string;
  active: boolean;
  floorIds: string[];
  createdAt: string;
}

export interface HeadRAPermissions {
  viewAllFloors: boolean;
  editSubmitted24h: boolean;
  assignRAs: boolean;
  moveBoys: boolean;
  manageRAs: boolean;
  printAllFloors: boolean;
  receiveEscalations: boolean;
}

export interface StatusType {
  id: string;
  name: string;
  code: string;
  color: string;
  countsAs: CountsAs;
  requiresNote: boolean;
  sortOrder: number;
  isDefault: boolean;
  useForLeave: boolean;
}

export interface CheckSchedule {
  id: string;
  name: string;
  /** 24h "HH:MM" local time */
  time: string;
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  floorIds: string[] | 'all';
  reminderMinutes: number;
  deadlineMinutes: number;
  active: boolean;
}

export interface CheckEntry {
  boyId: string;
  name: string;
  grade: number;
  roomNumber: string;
  statusId: string;
  note?: string;
}

export interface Check {
  id: string;
  scheduleId: string;
  scheduleName: string;
  time: string;
  floorId: string;
  floorName: string;
  /** "YYYY-MM-DD" local */
  date: string;
  raId: string;
  raName: string;
  startedAt: string;
  submittedAt: string | null;
  source: 'app' | 'paper';
  entries: CheckEntry[];
  reopenedBy?: string;
}

export interface Leave {
  id: string;
  boyId: string;
  from: string;
  to: string;
  reason: string;
  enteredBy: string;
}

export interface Move {
  id: string;
  boyId: string;
  fromRoom: string | null;
  toRoom: string | null;
  at: string;
  by: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  userId: string;
  userName: string;
  action: string;
  detail: string;
}

export interface ArchivedYear {
  id: string;
  label: string;
  archivedAt: string;
  floors: Floor[];
  rooms: Room[];
  boys: Boy[];
  checks: Check[];
  leaves: Leave[];
  /** Snapshotted so archived sheets keep their codes even if a status is deleted later. */
  statusTypes?: StatusType[];
  moves?: Move[];
}

export interface Settings {
  dormName: string;
  yearLabel: string;
  headRAEnabled: boolean;
  remindersEnabled: boolean;
  /** RAs may read the notes other RAs left on a boy in earlier checks */
  raSeeNotes: boolean;
}

export interface AppState {
  version: 1;
  setupComplete: boolean;
  settings: Settings;
  floors: Floor[];
  rooms: Room[];
  boys: Boy[];
  staff: StaffUser[];
  headRAPermissions: HeadRAPermissions;
  statusTypes: StatusType[];
  schedules: CheckSchedule[];
  checks: Check[];
  leaves: Leave[];
  moves: Move[];
  audit: AuditEntry[];
  archives: ArchivedYear[];
}
