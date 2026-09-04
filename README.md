# Ryan Hall Room Check

A web app for the RAs and deans of Ryan Hall, the boys' residence at Kingsway College, Oshawa.

Room check stays on paper. This app fills the sheet in. RAs tap through the boys on their floor at check time, the app compiles the results into the check-sheet layout as a PDF, and the deans print and sign it. Deans keep the roster, floors and rooms in the app. Anyone can print a blank sheet when a phone is not an option.

**The server never sees a boy's name.** Phones sync through a relay that only ever holds encrypted blobs. See [Accounts and encryption](#accounts-and-encryption).

## What it does today

- **Three interfaces from one login.** RAs see tonight's checks for their floors. Deans see every floor, who is absent, who is late, and the settings. The head RA gets whatever switches the deans turn on.
- **The check.** Everyone starts as Present. Tap a status to cycle it, tap a name for a note or another status. Boys on the leave board are pre-marked Away. Submit locks the check; a dean (or a permitted head RA within 24 hours) can reopen it.
- **Floors.** A corridor map per floor that colours itself from tonight's check. Deans add floors, rooms, and move boys between rooms.
- **Boys.** Roster with search and filters, paste-from-spreadsheet import, room moves with history, removal that keeps past sheets intact.
- **Print.** Filled check sheet with signature lines, blank check sheet, week-at-a-glance. All built in the browser, so they work offline.
- **Settings.** Custom status types and their sheet codes, check schedules by day of week, staff and PINs, head RA permissions, leave board, activity log, backup and restore, year rollover with archives.
- **Light and dark mode**, per device. Installs to the iPhone home screen as a web app. Works offline.
- **Accounts and sync.** RAs make their own account; a dean activates them with a join code. Every phone then shows the same dorm, and none of it is readable by the server.

## Accounts and encryption

The goal is that losing the server loses nothing, because the server never held anything.

- **Each device makes its own key pair** the first time it opens the app. The private key is generated non-extractable by the browser and never leaves the phone — not in a backup, not to us, not to the server.
- **Each dorm has one dorm key.** A dean's phone generates it when they turn on sync.
- **Activating someone hands their phone the dorm key sealed to it.** The dean's phone derives a shared secret from its own private key and that phone's public key (ECDH P-256), and wraps the dorm key with it. Only that phone can unwrap it. The server relays the sealed blob and cannot open it.
- **Everything else is AES-GCM ciphertext.** Every change an RA makes is encrypted on the phone before upload and decrypted after download. What the server stores looks like this, and that is the whole row:

  ```
  v1.cwCVBiCQFzX7WoJf.S2WI8m09iI2+vBROj4l+hGqzb5cHT3Tfw2l59rCn/Nsuz0Bb…
  ```

- **The server does hold** account emails, device public keys, who belongs to which dorm and in what role, and the timing and size of changes. It does not hold names, rooms, statuses, notes, or anything a boy did.
- **Removing someone rotates the dorm key.** Their phone keeps whatever it already downloaded — nothing can reach into a phone and erase it — but it cannot read anything from that moment on.
- **Deans approve every phone, not just every person.** A new phone shows a short fingerprint the dean can compare before approving, so an attacker with a stolen password still cannot read the dorm.
- **Websockets are a bonus, not a requirement.** Everything also polls, because school networks block sockets.

To point the app at your own project, copy `.env.example` to `.env` and apply `supabase/migrations/*.sql`. With no configuration the app simply runs on one device.

## What it does not do yet

- **Reminders while the phone is locked.** In-app reminders fire while the app is open. Locked-phone push needs a server job with VAPID keys.
- **Password recovery without email.** Reset goes through the email on the account.
- **Leaked-password checking** is available in the hosting project's auth settings and is worth turning on before real use.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck, lint, unit tests
npm run build      # production build in dist/
npm run test:e2e   # browser smoke test against the build (needs Chromium)
```

The two-device online test is opt-in, because it talks to a real project and needs two
confirmed accounts:

```bash
E2E_ONLINE=1 E2E_DEAN_EMAIL=… E2E_RA_EMAIL=… E2E_PASSWORD=… npx playwright test e2e/online.spec.ts
```

It signs a dean in, creates the dorm, has an RA join and get activated, runs a check on the
RA's device, verifies it appears on the dean's, then removes the RA and checks their access ends.

Deploy `dist/` to any static host (Vercel, Netlify, GitHub Pages). The app uses hash routing, so no server rewrites are needed. If you host under a sub-path, set Vite's `base` accordingly.

## Layout

- `src/lib` — data model, store with IndexedDB persistence, check logic, permissions, PDF generation, roster parsing, `crypto.ts` (key handling) and `online.ts` (accounts, approvals, encrypted sync).
- `supabase/migrations` — the database schema, row-level security and the join/approve functions.
- `src/screens` — one file per screen; `screens/settings` for dean tools.
- `src/ui` — buttons, rows, sheets, form controls, icons.
- `tests` — unit tests (Vitest). `e2e` — Playwright smoke test.
- `PLAN.md` — the project plan the app follows.
