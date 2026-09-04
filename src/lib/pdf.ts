import { jsPDF } from 'jspdf';
import autoTable, { type CellInput, type RowInput, type UserOptions } from 'jspdf-autotable';
import type { AppState, Check, StatusType } from './types';
import { addDays, formatClock, formatDateLong, formatDateShort, formatTime12, DAY_NAMES, DAY_NAMES_LONG } from './dates';
import { boysOnFloor, roomOccupants, roomsOnFloor, scheduleCode, sheetDays, sheetPeriods, sortedStatusTypes, statusById, tally } from './checks';

type StateLike = Pick<AppState, 'settings' | 'statusTypes' | 'floors' | 'rooms' | 'boys' | 'checks'>;
type SheetStateLike = StateLike & Pick<AppState, 'schedules'>;

const PAGE_W = 215.9;
const PAGE_H = 279.4;
const M = 14;

function newDoc(landscape = false): jsPDF {
  return new jsPDF({ unit: 'mm', format: 'letter', orientation: landscape ? 'landscape' : 'portrait' });
}

const TEXT_W = PAGE_W - 2 * M;

/** Draws a wrapped text block and returns the y just below it. */
function block(doc: jsPDF, text: string, y: number, size: number, opts: { bold?: boolean; grey?: boolean } = {}): number {
  doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  doc.setTextColor(opts.grey ? 90 : 20);
  const lines = doc.splitTextToSize(text, TEXT_W) as string[];
  doc.text(lines, M, y);
  doc.setTextColor(0);
  return y + lines.length * size * 0.42;
}

/** Header block; returns the y where the table should start. */
function header(doc: jsPDF, lines: [string, string, string]): number {
  let y = block(doc, lines[0], M + 6, 15, { bold: true });
  y = block(doc, lines[1], y + 2, 10.5);
  y = block(doc, lines[2], y + 1.5, 9.5, { grey: true });
  doc.setDrawColor(40);
  doc.setLineWidth(0.4);
  doc.line(M, y + 1, PAGE_W - M, y + 1);
  return y + 5;
}

/** Adds a page when `needed` mm would run past the bottom margin; returns the y to draw at. */
function ensureRoom(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_H - M) {
    doc.addPage();
    return M + 6;
  }
  return y;
}

function legend(statusTypes: StatusType[]): string {
  return statusTypes.map((s) => `${s.code} ${s.name}`).join('   ·   ');
}

function tableBase(): Partial<UserOptions> {
  return {
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 1.6, lineColor: [120, 120, 120], lineWidth: 0.2, textColor: 20 },
    headStyles: { fillColor: [232, 232, 232], textColor: 20, fontStyle: 'bold' },
    margin: { left: M, right: M, top: M + 6 },
  };
}

function finalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? M + 30;
}

function signatureBlock(doc: jsPDF, y: number, extra?: string) {
  y = ensureRoom(doc, y, 30);
  doc.setFontSize(9.5);
  doc.setTextColor(20);
  if (extra) {
    y = block(doc, extra, y, 9.5) + 3;
  }
  const lineY = y + 8;
  doc.setLineWidth(0.3);
  doc.setDrawColor(60);
  doc.line(M, lineY, M + 80, lineY);
  doc.text('RA signature', M, lineY + 4);
  doc.line(M + 92, lineY, M + 130, lineY);
  doc.text('Dean initials', M + 92, lineY + 4);
  doc.line(M + 142, lineY, PAGE_W - M, lineY);
  doc.text('Date', M + 142, lineY + 4);
}

export interface RASheetOptions {
  /** Name printed in the "RA:" corner. Left as a blank line when absent. */
  raName?: string;
  /** Print each boy's name against his bed. Off leaves the column blank to fill in by hand. */
  printNames?: boolean;
  /** Leave every mark blank — the backup sheet for a lost phone. */
  blank?: boolean;
}

/**
 * The dorm's own weekly check sheet: rooms down the side, one column block per day,
 * one column per check inside it. This is the sheet that gets signed and handed in,
 * so its shape follows the school's, not ours — the day and check columns come from
 * the schedules the deans set, so adding a Friday check adds a Friday column.
 */
export function raSheet(state: SheetStateLike, floorId: string, sundayKey: string, opts: RASheetOptions = {}): jsPDF {
  const { raName, printNames = true, blank = false } = opts;
  const floor = state.floors.find((f) => f.id === floorId);
  const periods = sheetPeriods(state);
  const days = sheetDays(state);
  const slots = days.length * periods.length;

  const landscape = slots > 15;
  const doc = newDoc(landscape);
  const pageW = landscape ? PAGE_H : PAGE_W;
  const textW = pageW - 2 * M;

  const roomW = 11;
  let nameW = 40;
  let cellW = slots ? (textW - nameW - roomW) / slots : textW - nameW - roomW;
  if (cellW < 7 && slots) {
    cellW = 7;
    nameW = Math.max(22, textW - roomW - cellW * slots);
  }
  const fontSize = cellW < 8.5 ? 7.5 : 9;

  const dayKeys = days.map((d) => addDays(sundayKey, d));
  const rooms = roomsOnFloor(state, floorId).filter((r) => r.type !== 'unused');

  const codeFor = (boyId: string, dayKey: string, scheduleId: string): string => {
    if (blank) return '';
    const check = state.checks.find((c) => c.floorId === floorId && c.date === dayKey && c.scheduleId === scheduleId && c.submittedAt);
    const entry = check?.entries.find((e) => e.boyId === boyId);
    return entry ? statusById(state, entry.statusId)?.code ?? '?' : '';
  };

  const head: RowInput[] = [
    [
      { content: raName ? `RA: ${raName}` : 'RA:', rowSpan: 2, styles: { halign: 'left' as const, valign: 'middle' as const } },
      { content: 'Rm#', rowSpan: 2, styles: { halign: 'center' as const, valign: 'middle' as const } },
      ...days.map((d) => ({ content: DAY_NAMES_LONG[d], colSpan: periods.length, styles: { halign: 'center' as const } })),
    ],
    days.flatMap(() => periods.map((p) => ({ content: scheduleCode(p), styles: { halign: 'center' as const } }))),
  ];

  const body: RowInput[] = [];
  let boyCount = 0;
  rooms.forEach((room) => {
    const occupants = roomOccupants(state, room.id);
    boyCount += occupants.length;
    const beds = Math.max(room.capacity, occupants.length, 1);
    for (let bed = 0; bed < beds; bed += 1) {
      const boy = occupants[bed];
      const name = boy && printNames ? `${boy.preferredName?.trim() || boy.firstName} ${boy.lastName}` : '';
      const cells: CellInput[] = days.flatMap((d, di) =>
        periods.map((p) => {
          const runsToday = p.days.includes(d);
          if (!runsToday) return { content: '', styles: { fillColor: [238, 238, 238] as [number, number, number] } };
          return { content: boy ? codeFor(boy.id, dayKeys[di], p.id) : '' };
        }),
      );
      const roomCell: CellInput[] = bed === 0 ? [{ content: room.number, rowSpan: beds, styles: { halign: 'center' as const, valign: 'middle' as const } }] : [];
      body.push([{ content: name }, ...roomCell, ...cells]);
    }
  });

  const totals: CellInput[] = days.flatMap((d, di) =>
    periods.map((p) => {
      if (blank || !p.days.includes(d)) return { content: '' };
      const check = state.checks.find((c) => c.floorId === floorId && c.date === dayKeys[di] && c.scheduleId === p.id && c.submittedAt);
      if (!check) return { content: '' };
      const present = check.entries.filter((e) => statusById(state, e.statusId)?.countsAs === 'present').length;
      return { content: String(present) };
    }),
  );

  const columnStyles: UserOptions['columnStyles'] = { 0: { cellWidth: nameW, halign: 'left' }, 1: { cellWidth: roomW, halign: 'center' } };
  for (let i = 0; i < slots; i += 1) columnStyles[2 + i] = { cellWidth: cellW, halign: 'center' };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20);
  const title = [state.settings.dormName, floor?.name, `Week of ${formatDateShort(sundayKey)}`].filter(Boolean).join('  ·  ');
  doc.text(title, M, M + 4);

  autoTable(doc, {
    theme: 'grid',
    startY: M + 8,
    margin: { left: M, right: M, top: M + 8 },
    styles: { font: 'helvetica', fontSize, cellPadding: 1.4, lineColor: [90, 90, 90], lineWidth: 0.2, textColor: 20, minCellHeight: 6.4 },
    headStyles: { fillColor: [232, 232, 232], textColor: 20, fontStyle: 'bold', fontSize: Math.min(fontSize, 8.5) },
    footStyles: { fillColor: [246, 246, 246], textColor: 20, fontStyle: 'bold', fontSize },
    head,
    body,
    foot: [[{ content: 'Total Boys:', styles: { halign: 'left' as const } }, { content: String(boyCount), styles: { halign: 'center' as const } }, ...totals]],
    columnStyles,
  });

  let y = finalY(doc) + 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(90);
  doc.text(`${legend(sortedStatusTypes(state))}   ·   shaded = no check scheduled   ·   Total Boys row counts those marked present`, M, y);
  doc.setTextColor(20);
  y += 7;

  const perRow = landscape ? 3 : 2;
  const colW = textW / perRow;
  doc.setFontSize(8.5);
  days.forEach((d, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = M + col * colW;
    const lineY = y + row * 12 + 6;
    if (lineY > (landscape ? PAGE_W : PAGE_H) - M) return;
    doc.setDrawColor(60);
    doc.setLineWidth(0.3);
    doc.line(x, lineY, x + colW * 0.52, lineY);
    doc.line(x + colW * 0.58, lineY, x + colW - 6, lineY);
    doc.text(`${DAY_NAMES_LONG[d]} — R.A. signature`, x, lineY + 3.6);
    doc.text('Date', x + colW * 0.58, lineY + 3.6);
  });

  return doc;
}

/** One page per check, in the school's check-sheet layout. */
export function filledSheet(state: StateLike, checks: Check[]): jsPDF {
  const doc = newDoc();
  const statusTypes = sortedStatusTypes(state);
  checks.forEach((check, i) => {
    if (i > 0) doc.addPage();
    const t = tally(check, state.statusTypes);
    const submitted = check.submittedAt ? `Submitted ${formatClock(check.submittedAt)}` : 'Not submitted';
    const source = check.source === 'paper' ? '  ·  Entered from paper' : '';
    const startY = header(doc, [
      `${state.settings.dormName} · ${check.scheduleName}`,
      `${check.floorName}  ·  ${formatDateLong(check.date)}  ·  ${formatTime12(check.time)}`,
      `RA: ${check.raName}  ·  ${submitted}${source}`,
    ]);
    const body: RowInput[] = check.entries.map((e) => [e.roomNumber, e.name, String(e.grade), statusById(state, e.statusId)?.code ?? '?', e.note ?? '']);
    autoTable(doc, {
      ...tableBase(),
      startY,
      head: [['Room', 'Name', 'Gr', 'Status', 'Notes']],
      body,
      columnStyles: { 0: { cellWidth: 18 }, 2: { cellWidth: 11, halign: 'center' }, 3: { cellWidth: 17, halign: 'center', fontStyle: 'bold' }, 4: { cellWidth: 64 } },
    });
    let y = ensureRoom(doc, finalY(doc) + 7, 42);
    y = block(doc, `Totals: ${t.byCode.filter((b) => b.count > 0).map((b) => `${b.count} ${b.name}`).join('  ·  ')}  ·  ${t.total} boys`, y, 9.5) + 2;
    y = block(doc, legend(statusTypes), y, 8.5, { grey: true });
    signatureBlock(doc, y + 2);
  });
  return doc;
}

/** Blank sheet with the current roster and an empty box per status. */
export function blankSheet(state: StateLike, floorIds: string[], scheduleName = 'Room check'): jsPDF {
  const doc = newDoc();
  const statusTypes = sortedStatusTypes(state);
  floorIds.forEach((floorId, i) => {
    const floor = state.floors.find((f) => f.id === floorId);
    if (!floor) return;
    if (i > 0) doc.addPage();
    const startY = header(doc, [
      `${state.settings.dormName} · ${scheduleName}`,
      `${floor.name}  ·  Date: ____________________  ·  Time: ____________`,
      'RA: ____________________________',
    ]);
    const rows = boysOnFloor(state, floorId);
    const body: RowInput[] = rows.map(({ boy, room }) => [room?.number ?? '', `${boy.preferredName?.trim() || boy.firstName} ${boy.lastName}`, String(boy.grade), ...statusTypes.map(() => ''), '']);
    const columnStyles: UserOptions['columnStyles'] = { 0: { cellWidth: 18 }, 2: { cellWidth: 11, halign: 'center' } };
    statusTypes.forEach((_, k) => { columnStyles[3 + k] = { cellWidth: 12, halign: 'center' }; });
    autoTable(doc, {
      ...tableBase(),
      startY,
      head: [['Room', 'Name', 'Gr', ...statusTypes.map((s) => s.code), 'Notes']],
      body,
      columnStyles,
    });
    let y = ensureRoom(doc, finalY(doc) + 7, 42);
    y = block(doc, legend(statusTypes), y, 8.5, { grey: true });
    signatureBlock(doc, y + 2, `${rows.length} boys on ${floor.name}. Tick one box per boy. Type it into the app later as "entered from paper".`);
  });
  return doc;
}

/** Boys down the side, seven nights across, one code per cell. One page per floor. */
export function weekSheet(state: StateLike, floorIds: string[], mondayKey: string): jsPDF {
  const doc = newDoc();
  const days = Array.from({ length: 7 }, (_, i) => addDays(mondayKey, i));
  const statusTypes = sortedStatusTypes(state);
  floorIds.forEach((floorId, pageIndex) => {
    const floor = state.floors.find((f) => f.id === floorId);
    if (!floor) return;
    if (pageIndex > 0) doc.addPage();
    const startY = header(doc, [
      `${state.settings.dormName} · Week at a glance`,
      `${floor.name}  ·  ${formatDateShort(days[0])} to ${formatDateShort(days[6])}`,
      'One code per night. Two codes means two checks that day.',
    ]);
    const rows = boysOnFloor(state, floorId);
    const body: RowInput[] = rows.map(({ boy, room }) => {
      const cells = days.map((day) => {
        const checks = state.checks.filter((c) => c.floorId === floorId && c.date === day && c.submittedAt).sort((a, b) => a.time.localeCompare(b.time));
        const codes = checks.map((c) => {
          const e = c.entries.find((x) => x.boyId === boy.id);
          return e ? statusById(state, e.statusId)?.code ?? '?' : '';
        }).filter(Boolean);
        return codes.join('/');
      });
      return [room?.number ?? '', `${boy.preferredName?.trim() || boy.firstName} ${boy.lastName}`, ...cells];
    });
    const columnStyles: UserOptions['columnStyles'] = { 0: { cellWidth: 18 } };
    days.forEach((_, k) => { columnStyles[2 + k] = { cellWidth: 16, halign: 'center' }; });
    autoTable(doc, {
      ...tableBase(),
      startY,
      head: [['Room', 'Name', ...days.map((d) => { const dt = new Date(d + 'T00:00:00'); return `${DAY_NAMES[dt.getDay()]} ${dt.getDate()}`; })]],
      body,
      columnStyles,
    });
    const y = ensureRoom(doc, finalY(doc) + 7, 12);
    block(doc, legend(statusTypes), y, 8.5, { grey: true });
  });
  return doc;
}

export function openPdf(doc: jsPDF, filename: string) {
  try {
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) doc.save(filename);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    doc.save(filename);
  }
}

export function downloadPdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}

export function safeName(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}
