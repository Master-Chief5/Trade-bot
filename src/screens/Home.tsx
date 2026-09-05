import { useAppState } from '../lib/store';
import { can } from '../lib/permissions';
import type { StaffUser } from '../lib/types';
import { RAHome } from './RAHome';
import { DeanTonight } from './DeanTonight';

export function Home({ user }: { user: StaffUser }) {
  const state = useAppState();
  if (user.role === 'dean' || can(user, 'viewAllFloors', state.headRAPermissions)) return <DeanTonight user={user} />;
  return <RAHome user={user} />;
}
