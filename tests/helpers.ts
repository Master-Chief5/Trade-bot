import { actions, getState, replaceState, setPersistence } from '../src/lib/store';
import { initialState } from '../src/lib/defaults';
import type { StaffUser } from '../src/lib/types';

export function fresh() {
  setPersistence(false);
  replaceState(initialState());
}

export function setupDorm(): { dean: StaffUser } {
  fresh();
  const deanId = actions.completeSetup({
    dormName: 'Ryan Hall',
    yearLabel: '2026–27',
    dean: { name: 'Dean Sutton', pin: '1234' },
    floors: [
      { name: 'Floor 1', roomFrom: 101, roomTo: 104, capacity: 2 },
      { name: 'Floor 2', roomFrom: 201, roomTo: 204, capacity: 2 },
    ],
  });
  const dean = getState().staff.find((s) => s.id === deanId)!;
  actions.importRoster(
    [
      { firstName: 'Daniel', lastName: 'Achebe', grade: 9, roomNumber: '101' },
      { firstName: 'Jonah', lastName: 'Bell', grade: 9, roomNumber: '101' },
      { firstName: 'Micah', lastName: 'Brooks', grade: 10, roomNumber: '102' },
      { firstName: 'Caleb', lastName: 'Moore', grade: 10, roomNumber: '201' },
      { firstName: 'Samuel', lastName: 'Reyes', grade: 11, roomNumber: '202' },
    ],
    dean,
  );
  return { dean };
}

export function addRA(name: string, floorNames: string[], dean: StaffUser, role: StaffUser['role'] = 'ra'): StaffUser {
  const floorIds = getState().floors.filter((f) => floorNames.includes(f.name)).map((f) => f.id);
  const id = actions.addStaff({ name, role, pin: '0000', floorIds }, dean);
  return getState().staff.find((s) => s.id === id)!;
}

export function status(code: string) {
  return getState().statusTypes.find((s) => s.code === code)!;
}

export function floor(name: string) {
  return getState().floors.find((f) => f.name === name)!;
}

export function boy(last: string) {
  return getState().boys.find((b) => b.lastName === last)!;
}
