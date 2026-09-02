export interface ParsedRow {
  firstName: string;
  lastName: string;
  grade: number | null;
  roomNumber: string;
  raw: string;
  issues: string[];
}

const GRADE_RE = /^(?:gr(?:ade)?\.?\s*)?(7|8|9|10|11|12|13)$/i;
const ROOM_RE = /^[A-Za-z]?\d{1,4}[A-Za-z]?$/;
const HEADER_WORDS = /^(name|first|last|grade|gr|room|rm|student|boy)s?$/i;

function splitLine(line: string): string[] {
  let parts = line.split('\t');
  if (parts.length < 2) parts = line.split(/[;,]/);
  if (parts.length < 2) parts = line.split(/\s{2,}/);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function splitName(name: string, lastFirst: boolean): { firstName: string; lastName: string } {
  const cleaned = name.replace(/\s+/g, ' ').trim();
  if (cleaned.includes(',')) {
    const [last, ...rest] = cleaned.split(',');
    return { firstName: rest.join(' ').trim(), lastName: last.trim() };
  }
  const words = cleaned.split(' ');
  if (words.length === 1) return { firstName: words[0], lastName: '' };
  if (lastFirst) return { lastName: words[0], firstName: words.slice(1).join(' ') };
  return { firstName: words[0], lastName: words.slice(1).join(' ') };
}

/**
 * Parse a pasted roster. Accepts tab, comma or semicolon separated lines with a name,
 * a grade and a room in any order. A header row is skipped.
 */
export function parseRoster(text: string, knownRooms: string[], lastFirst = false): ParsedRow[] {
  const known = new Set(knownRooms.map((r) => r.toLowerCase()));
  const counts = new Map<string, number>();
  for (const r of knownRooms) counts.set(r.toLowerCase(), (counts.get(r.toLowerCase()) ?? 0) + 1);
  const rows: ParsedRow[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = splitLine(line);
    if (parts.length && parts.every((p) => HEADER_WORDS.test(p))) continue;

    const issues: string[] = [];
    let grade: number | null = null;
    let roomNumber = '';
    const rest: string[] = [];

    // known rooms win first so "10" can be a grade when room 10 does not exist
    const roomIdx = parts.findIndex((p) => known.has(p.toLowerCase()));
    if (roomIdx >= 0) roomNumber = parts[roomIdx];

    parts.forEach((p, i) => {
      if (i === roomIdx) return;
      const g = p.match(GRADE_RE);
      if (g && grade === null) {
        grade = Number(g[1]);
        return;
      }
      if (!roomNumber && ROOM_RE.test(p) && i > 0) {
        roomNumber = p;
        return;
      }
      rest.push(p);
    });

    const name = rest.join(' ');
    const { firstName, lastName } = splitName(name, lastFirst);
    if (!firstName) issues.push('No name found');
    if (grade === null) issues.push('No grade found');
    if (!roomNumber) issues.push('No room found');
    else if (!known.has(roomNumber.toLowerCase())) issues.push(`Room ${roomNumber} is not set up`);
    else if ((counts.get(roomNumber.toLowerCase()) ?? 0) > 1) issues.push(`Room ${roomNumber} is on more than one floor; set it by hand`);
    rows.push({ firstName, lastName, grade, roomNumber, raw: line, issues });
  }
  return rows;
}
