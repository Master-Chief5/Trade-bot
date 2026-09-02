import { useAppState } from './store';
import { useSessionUserId } from './session';
import type { StaffUser } from './types';

export function useCurrentUser(): StaffUser | null {
  const state = useAppState();
  const id = useSessionUserId();
  if (!id) return null;
  const user = state.staff.find((s) => s.id === id);
  return user && user.active ? user : null;
}
