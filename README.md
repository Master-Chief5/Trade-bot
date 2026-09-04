# Ryan Hall Room Check

A web app for the RAs and deans of Ryan Hall, the boys' residence at Kingsway College, Oshawa.

Room check stays on paper. This app fills the sheet in. RAs tap through the boys on their floor at check time, the app compiles the results into the check-sheet layout as a PDF, and the deans print and sign it. Deans keep the roster, floors and rooms in the app. Anyone can print a blank sheet when a phone is not an option.

**The server never sees a boy's name.** Phones sync through a relay that only ever holds encrypted blobs. See [Accounts and encryption](#accounts-and-encryption).

## What it does today

- **Three interfaces from one login.** RAs see tonight's checks for their floors. Deans see every floor, who is absent, who is late, and the settings. The head RA gets whatever switches the deans turn on.
- **The check.** Everyone starts as Present. Tap a status to cycle it, tap a name for a note or another status. Boys on the leave board are pre-marked Away. Submit locks the check; a dean (or a permitted head RA within 24 hours) can reopen it.
- **Floors.** A corridor map per floor that colours itself from tonight's check. Deans add floors, rooms, and move boys between rooms.
- **Boys.** Roster with search and filters, paste-from-spreadsheet import, room moves with history, removal that keeps past sheets intact.
- **Print.** The dorm's own weekly check sheet — rooms down the side, square mark boxes, one column block per day and one column per check inside it, filled in from the week's submitted checks, with each day's signature where the RA signed off. Same sheet blank for when a phone is not an option, plus per-night sheets and a week-at-a-glance. All built in the browser, so they work offline.
- **Signing off.** When every check due on a floor that day is submitted, the RA draws their signature on their phone and it lands on that day's line of the printed sheet. It is tied to that floor and date, so it cannot be moved to another night, and a dean or the RA can clear it and sign again.
- **Settings.** Custom status types and their sheet codes, check schedules by day of week, a sheet designer where deans build the sheets themselves — days, which checks get a column and in what order, and exactly which rooms are listed, so a weekend sheet can sit alongside the Sunday-to-Thursday one — staff and PINs, head RA permissions, leave board, activity log, backup and restore, year rollover with archives.
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

- **The server does hold** account emails, device public keys, who belongs to which dorm and in what role, and the timing and size of changes. It does not hold names, rooms, statuses, notes, or anything a boy did. Names and the account-to-device list are readable only by people who share a dorm with you.
- **Only a dean's device can pass the key on.** On every other device the dorm key is imported so the browser will not export it, so a script injected into the page cannot copy it out.
- **A device never silently skips a change it cannot read.** If decryption fails, sync stops and says so rather than moving past it, because a skipped change means two phones printing different sheets.
- **Removing someone rotates the dorm key and the join code.** Their phone keeps whatever it already downloaded — nothing can reach into a phone and erase it — but it cannot read anything from that moment on. The database refuses writes under a superseded key, so a device that missed the rotation cannot keep publishing in a key the removed member holds.
- **Deans approve every phone, not just every person.** Activating someone lists their phones with a 64-bit fingerprint each, and the dean ticks the ones whose code matches what the RA reads out. A phone left unticked joins with no access until it is approved by name. So a stolen password alone does not read the dorm: the attacker's own phone is a phone the dean never confirmed.
- **Websockets are a bonus, not a requirement.** Everything also polls, because school networks block sockets.

To point the app at your own project, copy `.env.example` to `.env` and apply `supabase/migrations/*.sql`. With no configuration the app simply runs on one device.

### Know this before you rely on it

**If every device holding the dorm key is lost, the dorm cannot be recovered.** Not by the school, not by the hosting provider, not by anyone. That is the other side of the server being unable to read it. Two protections, and you want both:

- Keep at least two dean devices signed in, so one can approve a replacement for the other.
- Export a backup from Settings → Backup now and then. It writes a plain file to that device, which is the only copy anybody can read without a key.

## What it does not do yet

- **Reminders while the phone is locked.** In-app reminders fire while the app is open. Locked-phone push needs a server job with VAPID keys.
- **A printed recovery code**, so a lone dean who loses their only phone can still get back in.
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
