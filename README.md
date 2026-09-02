# Ryan Hall Room Check

A web app for the RAs and deans of Ryan Hall, the boys' residence at Kingsway College, Oshawa.

Room check stays on paper. This app fills the sheet in. RAs tap through the boys on their floor at check time, the app compiles the results into the check-sheet layout as a PDF, and the deans print and sign it. Deans keep the roster, floors and rooms in the app. Anyone can print a blank sheet when a phone is not an option.

## What it does today

- **Three interfaces from one login.** RAs see tonight's checks for their floors. Deans see every floor, who is absent, who is late, and the settings. The head RA gets whatever switches the deans turn on.
- **The check.** Everyone starts as Present. Tap a status to cycle it, tap a name for a note or another status. Boys on the leave board are pre-marked Away. Submit locks the check; a dean (or a permitted head RA within 24 hours) can reopen it.
- **Floors.** A corridor map per floor that colours itself from tonight's check. Deans add floors, rooms, and move boys between rooms.
- **Boys.** Roster with search and filters, paste-from-spreadsheet import, room moves with history, removal that keeps past sheets intact.
- **Print.** Filled check sheet with signature lines, blank check sheet, week-at-a-glance. All built in the browser, so they work offline.
- **Settings.** Custom status types and their sheet codes, check schedules by day of week, staff and PINs, head RA permissions, leave board, activity log, backup and restore, year rollover with archives.
- **Light and dark mode**, per device. Installs to the iPhone home screen as a web app. Works offline.

## What it does not do yet

- **Sync between phones.** Data lives on the device it was entered on. Use Settings → Backup to move it. The online version needs a hosted database owned by a dean; the plan in `PLAN.md` describes it.
- **Reminders while the phone is locked.** In-app reminders fire while the app is open. Push reminders need the backend.
- **Real accounts.** Sign-in is a name and a PIN on this device.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck, lint, unit tests
npm run build      # production build in dist/
npm run test:e2e   # browser smoke test against the build (needs Chromium)
```

Deploy `dist/` to any static host (Vercel, Netlify, GitHub Pages). The app uses hash routing, so no server rewrites are needed. If you host under a sub-path, set Vite's `base` accordingly.

## Layout

- `src/lib` — data model, store with IndexedDB persistence, check logic, permissions, PDF generation, roster parsing.
- `src/screens` — one file per screen; `screens/settings` for dean tools.
- `src/ui` — buttons, rows, sheets, form controls, icons.
- `tests` — unit tests (Vitest). `e2e` — Playwright smoke test.
- `PLAN.md` — the project plan the app follows.
