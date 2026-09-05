import { useMemo, useState } from 'react';
import { boyName, useAppState } from '../lib/store';
import { sortedFloors } from '../lib/checks';
import { can, visibleFloorIds } from '../lib/permissions';
import type { StaffUser } from '../lib/types';
import { Button } from '../ui/Button';
import { Chips } from '../ui/Form';
import { Icon } from '../ui/Icon';
import { Card, Empty, ListRow, PageHeader, SectionLabel } from '../ui/Layout';

export function Boys({ user }: { user: StaffUser }) {
  const state = useAppState();
  const manage = can(user, 'manageBoys', state.headRAPermissions);
  const visible = visibleFloorIds(state, user);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [showRemoved, setShowRemoved] = useState(false);

  const floors = sortedFloors(state).filter((f) => visible.includes(f.id));
  const roomFloor = useMemo(() => new Map(state.rooms.map((r) => [r.id, r.floorId])), [state.rooms]);
  const grades = useMemo(() => [...new Set(state.boys.filter((b) => b.active).map((b) => b.grade))].sort((a, b) => a - b), [state.boys]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.boys
      .filter((b) => (showRemoved ? !b.active : b.active))
      .map((b) => {
        const room = state.rooms.find((r) => r.id === b.roomId);
        const floor = room ? state.floors.find((f) => f.id === room.floorId) : undefined;
        return { b, room, floor };
      })
      .filter(({ b, room, floor }) => {
        if (!manage && (!room || !visible.includes(room.floorId))) return false;
        if (filter.startsWith('f:') && floor?.id !== filter.slice(2)) return false;
        if (filter.startsWith('g:') && b.grade !== Number(filter.slice(2))) return false;
        if (filter === 'noroom' && room) return false;
        if (q && !boyName(b).toLowerCase().includes(q) && !`${b.firstName} ${b.lastName}`.toLowerCase().includes(q) && !(room?.number.toLowerCase().includes(q))) return false;
        return true;
      })
      .sort((x, y) => x.b.lastName.localeCompare(y.b.lastName) || x.b.firstName.localeCompare(y.b.firstName));
  }, [state, query, filter, showRemoved, manage, visible]);

  const activeCount = state.boys.filter((b) => b.active).length;
  const noRoom = state.boys.filter((b) => b.active && !b.roomId).length;
  const removedCount = state.boys.filter((b) => !b.active).length;
  const roomFloorName = (roomId: string | null) => (roomId ? state.floors.find((f) => f.id === roomFloor.get(roomId))?.name : undefined);

  return (
    <>
      <PageHeader
        title="Boys"
        subtitle={`${activeCount} in ${state.settings.dormName} · ${state.floors.length} ${state.floors.length === 1 ? 'floor' : 'floors'}`}
        actions={manage ? <Button iconOnly round icon="plus" to="/boys/new" aria-label="Add a boy" /> : undefined}
      />
      <div className="search">
        <Icon name="search" size={20} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or room" aria-label="Search boys" />
      </div>
      <Chips
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          ...floors.map((f) => ({ value: `f:${f.id}`, label: f.name })),
          ...grades.map((g) => ({ value: `g:${g}`, label: `Grade ${g}` })),
          ...(manage && noRoom ? [{ value: 'noroom', label: `No room (${noRoom})` }] : []),
        ]}
      />
      {manage && activeCount === 0 && (
        <Card>
          <ListRow icon="upload" to="/boys/import" title="Import the roster" subtitle="Paste names, grades and rooms from a spreadsheet" chevron />
          <ListRow icon="plus" to="/boys/new" title="Add one boy" chevron />
        </Card>
      )}
      <Card>
        {rows.length === 0 ? (
          <Empty icon="boys">{showRemoved ? 'Nobody has been removed.' : query ? 'No one matches.' : 'No boys yet.'}</Empty>
        ) : (
          rows.map(({ b, room }) => (
            <ListRow key={b.id} to={`/boys/${b.id}`} title={boyName(b)} subtitle={`${room ? `Room ${room.number}` : 'No room'} · Grade ${b.grade}${room ? ` · ${roomFloorName(room.id) ?? ''}` : ''}`} chevron />
          ))
        )}
      </Card>
      {manage && (
        <>
          <SectionLabel>Roster</SectionLabel>
          <Card>
            <ListRow icon="upload" to="/boys/import" title="Import from spreadsheet" subtitle="Adds new boys and updates rooms for existing ones" chevron />
            {removedCount > 0 && (
              <ListRow icon="eye" onClick={() => setShowRemoved(!showRemoved)} title={showRemoved ? 'Show current boys' : `Show removed boys (${removedCount})`} subtitle="Removed boys stay on past sheets" />
            )}
          </Card>
        </>
      )}
    </>
  );
}
