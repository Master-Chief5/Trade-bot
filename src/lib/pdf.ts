import { jsPDF } from 'jspdf';
import autoTable, { type RowInput, type UserOptions } from 'jspdf-autotable';
import type { AppState, Check, StatusType } from './types';
import { addDays, formatClock, formatDateLong, formatDateShort, formatTime12, DAY_NAMES } from './dates';
import { boysOnFloor, sortedStatusTypes, statusById, tally } from './checks';

type StateLike = Pick<AppState, 'settings' | 'statusTypes' | 'floors' | 'rooms' | 'boys' | 'checks'>;

const PAGE_W = 215.9;
const PAGE_H = 279.4;
const M = 14;

function newDoc(): jsPDF {
  return new jsPDF({ unit: 'mm', format: 'letter' });
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
