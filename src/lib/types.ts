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
  /** Short heading for this check's column on the printed sheet, e.g. "W", "SH", "RC". */
  code: string;
  /** 24h "HH:MM" local time */
  time: string;
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  floorIds: string[] | 'all';
  reminderMinutes: number;
  deadlineMinutes: number;
  active: boolean;
}

/**
 * A sheet the deans have designed: which days it covers, which checks get a column,
 * and which rooms are listed. One dorm can keep several — a Sunday-to-Thursday sheet
 * and a separate weekend one, say — and print whichever it needs.
 */
export interface SheetTemplate {
  id: string;
  name: string;
  /** Weekday numbers, 0 = Sunday, that get a column block. */
  days: number[];
  /** Checks that get a column inside each day's block, in this order. */
  scheduleIds: string[];
  /** Rooms listed as rows, or 'floor' for every room on whichever floor is printed. */
  roomIds: string[] | 'floor';
  sortOrder: number;
}

/**
 * A dean putting one person on one check, rather than leaving it to whoever covers the floor.
 * An assignment wins over floor membership for the dates it covers.
 */
export interface Assignment {
  id: string;
  /** A specific check, or 'all' for every check that day. */
  scheduleId: string | 'all';
  floorId: string;
  raId: string;
  /** "YYYY-MM-DD" local, inclusive. */
  from: string;
  to: string;
  createdBy: string;
  createdAt: string;
}

/** A dean poking someone whose check is late. Seen on that person's home screen. */
export interface Nudge {
  id: string;
  toRaId: string;
  floorId: string;
  scheduleId: string;
  date: string;
  message?: string;
  byId: string;
  byName: string;
  at: string;
  seenAt?: string;
}

/**
 * A record that someone outside the dorm covered a check, written when their result comes
 * back through the handoff. Kept so a dean can always see who actually walked the floor.
 */
export interface Cover {
  id: string;
  handoffId: string;
  /** Typed in by the person covering; they are not in the dorm, so this is all we have. */
  name: string;
  forRaId: string;
  forRaName: string;
  floorId: string;
  from: string;
  to: string;
  claimedAt: string;
  createdBy: string;
}

/** An RA's drawn signature for one day on one floor, printed onto that day's line. */
export interface DaySignature {
  id: string;
  raId: string;
  raName: string;
  floorId: string;
  /** "YYYY-MM-DD" local */
  date: string;
  /** PNG data URL of what they drew. */
  image: string;
  signedAt: string;
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
  source: 'app' | 'paper' | 'cover';
  /** Set when someone outside the dorm covered this check through a handoff. */
  coveredBy?: string;
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
  signatures?: DaySignature[];
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
  sheetTemplates: SheetTemplate[];
  assignments: Assignment[];
  nudges: Nudge[];
  covers: Cover[];
  checks: Check[];
  signatures: DaySignature[];
  leaves: Leave[];
  moves: Move[];
  audit: AuditEntry[];
  archives: ArchivedYear[];
}
