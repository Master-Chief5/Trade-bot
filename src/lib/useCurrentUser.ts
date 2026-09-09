import { useAppState } from './store';
import { useSessionUserId } from './session';
import { useOnline } from './online';
import type { StaffUser } from './types';

/** The signed-in staff member: by online account when there is one, otherwise by the device PIN session. */
export function useCurrentUser(): StaffUser | null {
  const state = useAppState();
  const id = useSessionUserId();
  const authUserId = useOnline().session?.user.id;
  if (authUserId) {
    const linked = state.staff.find((s) => s.authUserId === authUserId);
    return linked && linked.active ? linked : null;
  }
  if (!id) return null;
  const user = state.staff.find((s) => s.id === id);
  return user && user.active ? user : null;
}
