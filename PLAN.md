# Ryan Hall Room Check — Project Plan

**Kingsway College, Oshawa, Ontario · Boys' residence (Ryan Hall)**
Draft v0.1 · 2026-09-01 · for review by the three deans and the head RA

This is a working plan, not a contract. Everything under "Should" and "Could" is open to change once the deans have used a first version. The "Must" list is the part that has to be right.

---

## 1. The one-paragraph version

Room check stays on paper. The school wants a signed paper sheet, and the sheet is the record. What changes is how the sheet gets filled in. RAs tap through a list of boys on their phone during check. The app compiles the results into the exact check-sheet layout as a PDF, ready to print and sign. Deans keep the roster, the floors and the room assignments in the app instead of re-typing a sheet every time a boy changes rooms. If a phone is lost, dead or not allowed, anyone can print a blank sheet from the app and do it the old way, then type it in later. Nothing about the school's process is removed. The app sits in front of the paper and feeds it.

---

## 2. What the app is, and what it is not

**It is**

- A roster and building map for Ryan Hall that the deans control.
- A fast way for an RA to record who is present, absent or away at each check.
- A PDF generator that produces the filled-in check sheet, a blank check sheet and simple summaries.
- A reminder system so checks do not get forgotten.
- A backup copy of every check in a Google Sheet the deans own.

**It is not**

- A replacement for the signed paper sheet.
- A student-facing app. Boys do not log in. (Could change later; see §11.)
- A discipline or demerit system. It records presence. What the deans do with that is theirs.
- A native App Store app. It is a web app that installs to the iPhone home screen and can send notifications from there.

---

## 3. People and permissions

| Role | Who | Can do |
|---|---|---|
| **Dean** | The three deans | Everything. Manage floors, rooms, roster, RAs, status types, check schedules, permissions. See all history. Print everything. Run year rollover. |
| **Head RA** | One senior RA, optional | A subset chosen by the deans. Each ability below is a switch the deans turn on or off per head RA. The deans can also choose to have no head RA at all. |
| **RA** | Residential assistants, changes yearly | Do checks on the floors assigned to them. Print blank sheets. See their own past checks. Add notes. |

**Head RA switches** (all off by default):

- View checks for every floor, not just their own
- Edit a submitted check within 24 hours
- Assign RAs to floors and duty nights
- Move a boy between rooms
- Add or remove RAs
- Print filled sheets for any floor
- Receive the "check not done" escalation alerts

RAs are invited by email by a dean. Removing an RA is one tap. Their past checks stay in history with their name on them. Re-appointing someone next year is re-inviting the same email.

---

## 4. A normal day, start to finish

**Before the year (dean, once)**

1. Create Ryan Hall. Enter how many floors. Name them (e.g., Ground, 1, 2, 3, or "Grade 9 floor").
2. For each floor, enter the room numbers. Optionally mark rooms as double, single, RA room, or out of use.
3. Enter the boys. Name, grade, and tap the floor and room. A paste-from-spreadsheet importer handles the whole list at once.
4. Invite the RAs by email. Assign each RA to one or more floors.
5. Set the check times. Example: "Evening check, 10:00 PM, every night" and "Sabbath morning check, 9:15 AM, Saturdays". Times can differ by day of week.
6. Review the status types. Defaults are Present, Absent, Away (signed out), Late, Infirmary. Add, rename, recolor or remove any of them.

**On the night (RA)**

1. Phone buzzes 15 minutes before check: "Evening check on Floor 2 starts at 10:00."
2. Opens the app. Sees tonight's check card for Floor 2 and one button: **Start check**.
3. Sees the floor as a list grouped by room. Every boy starts as Present. The RA only taps the exceptions. A tap cycles Present → Absent → Away → Late. Long-press for other statuses or a note.
4. Boys the deans already signed out for the weekend show as Away before the RA even starts.
5. Taps **Submit**. Summary shows: 38 present, 2 absent, 4 away. Done in under two minutes.
6. If there is no Wi-Fi in the hallway, none of this changes. The check saves on the phone and uploads when the signal returns.

**Same night (dean)**

1. Gets a summary at 10:30 PM: which floors are checked, which are not, and who is marked absent.
2. If a floor was not submitted by 10:20 PM, the on-duty RA gets a nudge and the dean gets an alert.
3. Opens **Print** and taps **Tonight's sheet**. A PDF in the school's check-sheet layout downloads, one page per floor, ready to print and sign.

**When the phone is not an option**

1. Any RA or dean taps **Print → Blank sheet** at any time. It prints the current roster in the check-sheet layout with empty tick boxes.
2. The RA does the check on paper.
3. Later, a dean (or the RA, if permitted) opens that night's check, chooses **Enter from paper**, and types it in. The check is marked "entered from paper" so the history is honest.

---

## 5. Feature map

Labels: **Must** for the first version the deans use nightly. **Should** for the first full term. **Could** if it earns its place.

### Setup and roster (Must)

- Floors, rooms, and which rooms are on which floor.
- Boys: name, grade, room, active or not. Optional: preferred name, photo, notes visible only to deans.
- Move a boy between rooms. History of moves is kept so old sheets stay correct.
- Add a boy mid-year. Remove a boy mid-year (he stays in past records, disappears from future sheets).
- Paste-from-spreadsheet import. CSV export.
- Mixed-grade and single-grade floors are both fine: the grade is on the boy, not the floor. Sheets can be sorted by room or grouped by grade at print time.

### Building map (Must for the 2D version, Could for anything fancier)

- One simple floor plan per floor. Rooms are boxes on a grid. A dean drags them into roughly the shape of the real corridor. Ten minutes of setup, done once.
- Floors shown as tabs or a stack. Tap a floor, see its rooms, tap a room, see who is in it.
- During a check, the map colours rooms live: green all present, red someone absent, grey away.
- **Could:** a "stacked floors" view that draws the floors as an isometric stack, built straight from the same 2D layouts. This gives the "3D" feel without a 3D engine. It is decorative, so it comes last.

### Checks (Must)

- Check schedules: name, time, days of week, which floors. Each schedule generates one check per floor per day automatically.
- The RA check screen described in §4. Everyone Present by default, tap exceptions.
- Notes per boy per check ("in shower, confirmed", "with Dean at office").
- Submitted checks are locked. A dean can reopen one. Edits are logged with who and when.
- Works offline. Syncs when back online. Two RAs on the same floor cannot silently overwrite each other; the app shows the conflict.
- Enter-from-paper mode for checks done on the blank sheet.

### Status types (Must)

- Deans create their own. Each has a name, a short code for the sheet (P, A, AW, L), a colour, and a rule: counts as present, counts as absent, or counts as excused.
- Optional per status: "requires a note".
- Defaults ship, deans change them, nothing is hard-coded.

### Printing and PDF (Must)

- **The weekly check sheet**, in the school's own layout: the RA's name in the corner, rooms down the side with one row per bed, square mark boxes, a column block per day and one column per check inside it — W for worship, SH for study hall, RC for room check. A Total Boys row, and a signature and date line per day carrying the signature the RA drew when they signed off.
- **A sheet designer.** Deans build the sheets rather than accepting ours: name, which days it covers, which checks get a column and in what order, and exactly which rooms are listed. A dorm can keep several — a Sunday-to-Thursday sheet and a separate weekend one — and print whichever it needs.
- **The same sheet blank**, roster printed and every mark empty, for when a phone is not an option.
- **Should:** week-at-a-glance grid per floor (boys down the side, nights across, one letter per cell). Per-boy history sheet. Floor map printout with room numbers.
- Everything prints from the browser, on a phone or a computer. No special software.

### Reminders and notifications (Should, early)

- Push notifications to the RA on duty before each check. Works on iPhone once the app is added to the home screen.
- Nudge if a check is not submitted by the deadline. Escalation to the dean and, if enabled, the head RA.
- Dean nightly summary by notification and optional email.
- Quiet by design. RAs get reminders for their own floors only. Deans choose whether Sabbath reminders are on.

### Duty roster (Should)

- Which RA covers which floor on which night. Reminders and escalations follow the roster, not a fixed assignment. Covers sick nights and swaps.

### Leave and sign-out board (Should)

- Deans enter planned absences ahead of time: weekend leave, sports trip, home visit. Those boys are pre-marked Away on the checks that fall inside the leave. RAs do not have to remember who left.

### Dean dashboard (Should)

- Tonight at a glance: floors checked, floors pending, boys absent.
- Patterns: a boy absent at three checks in a row, or absent twice this week, gets a quiet flag. No automatic consequences.
- Full history with search by boy, date, floor or RA.

### Google backup (Should)

- Every submitted check is appended as rows to a Google Sheet that a dean owns. If the app disappears, the sheet is still there. The dean shares one sheet with the app once. No Google Forms are needed; the blank PDF already covers the "fill it in by hand" case, and a form would be a third place for the same data.

### Year rollover (Must, but only needed once a year)

- One guided flow: archive this year's roster and checks, keep the floors and rooms, clear the RA list, keep the deans. Everything archived stays readable and printable.

### Could, if wanted

- Photo of the signed paper sheet attached to the night's check, so the paper record is also digital.
- Room-swap drag and drop on the map.
- Boy-facing sign-out kiosk on a hallway tablet (a separate decision; see §11).
- Multiple dorms in one app, in case the girls' residence wants the same thing.

---

## 6. Screens

The UI is deliberately small. Six screens cover it.

1. **Home.** Different per role. RA sees today's checks for their floors. Dean sees the dashboard. Big buttons, no menus to hunt through.
2. **Check.** The floor list with tap-to-cycle statuses, search, a running count, and Submit. This screen gets the most design time. It has to work one-handed in a hallway at 10 PM.
3. **Floors.** The building. Tabs per floor, rooms as boxes, boys inside rooms. Dean edit mode to add rooms or move boys. Optional stacked view.
4. **Boys.** The roster. Search, filter by floor or grade, add, edit, move, deactivate. Import and export.
5. **Print.** Every PDF lives here. Pick a date, pick a floor, pick a document, download.
6. **Settings.** Deans only. Status types, check schedules, RAs and permissions, head RA switches, duty roster, Google backup, year rollover.

Style: plain, high contrast, large tap targets, works in light and dark. Looks like a well-made school tool, not a startup.

---

## 7. Technical approach

Recommendations, with reasons. Any of these can be swapped if the deans or the school's IT have preferences.

| Concern | Choice | Why |
|---|---|---|
| App type | Progressive web app (PWA) | No Apple developer account. Installs to the iPhone home screen, gets an icon, runs full screen, supports push notifications on iOS 16.4 and later. One codebase for phones and the dean's office computer. |
| Front end | React + TypeScript + Vite | Well understood, easy to find help for, strong offline tooling. |
| Backend and database | Supabase (Postgres, Auth, Row Level Security, Edge Functions, scheduled jobs) | One service covers login, data, permissions and scheduled reminders. Free tier is enough for one dorm. Already familiar from the previous project in this repo. |
| Login | Email magic link, plus Google sign-in if the school uses Google Workspace | No passwords to reset. Deans invite by email, so nobody can join uninvited. |
| Offline | Local-first check screen: the in-progress check is saved on the phone (IndexedDB) and synced when online | Hallway Wi-Fi is the first thing that will break an app like this. |
| PDF | Generated in the browser with a PDF library, from a template that matches the school's sheet | Works offline, no server rendering, pixel-exact layout every time. |
| Push notifications | Standard Web Push (VAPID keys) sent by a scheduled Supabase job | Reminders have to come from a server, because phones cannot schedule web notifications on their own. |
| Google backup | A Supabase function with a Google service account appends rows to a sheet the dean shares with it | No OAuth screens for users. One-time setup by a dean. |
| Hosting | Vercel (front end) + Supabase (data) | Free at this size, automatic deploys from GitHub. |
| Code | This repository | The previous paper-trading app was removed so the dorm app has a clean home. Rename the repository on GitHub from Trade-bot to something like ryan-hall-check. |

**Ownership.** The Supabase project, the Vercel project, the Google account holding the backup sheet and the GitHub repository should all be owned by a school or dean account, with the head RA added as a collaborator. Students graduate. The deans should never lose the keys when that happens.

---

## 8. Data model, in plain English

- **Dorm** — Ryan Hall. Has floors.
- **Floor** — name, sort order, optional grade label. Has rooms.
- **Room** — number, floor, capacity, type (standard, RA, out of use), position on the floor map.
- **Boy** — name, preferred name, grade, active flag, current room. Has a room history.
- **Room assignment** — boy, room, from date, to date. This is what makes old sheets print correctly after a move.
- **Staff user** — email, display name, role (dean, head RA, RA), active flag.
- **Head RA permissions** — one row of on/off switches per head RA.
- **Floor assignment** — which RAs are responsible for which floors.
- **Duty roster** — RA, floor, date. Optional; falls back to floor assignment.
- **Status type** — name, code, colour, counts-as, requires-note, sort order.
- **Check schedule** — name, time, days of week, floors, reminder lead time, deadline.
- **Check** — schedule, floor, date, RA, started at, submitted at, source (app or paper), locked.
- **Check entry** — check, boy, status, note.
- **Leave** — boy, from, to, reason, entered by.
- **Audit log** — who changed what and when, for anything that touches a submitted check, the roster or permissions.
- **Push subscription** — per device, per user.

Everything is scoped to a dorm, so a second residence can be added without a rewrite.

---

## 9. Privacy and safety

This is a record of where minors are at night. It deserves more care than a normal school app.

- Only invited staff can log in. Every table is protected by row-level rules, so an RA cannot read another floor's data unless a dean allows it.
- No student logins in the first version, so there is no student password to leak.
- Notes about boys are visible to deans by default and to RAs only if a dean turns that on.
- Every edit to a submitted check is logged with a name and a time.
- Data lives in one region the deans choose. The Google backup sheet is owned by a dean.
- A retention setting: archived years can be exported to PDF and deleted after a period the deans decide.
- Before anything is built, a dean should confirm the school is comfortable with student names and presence data being stored in a hosted database. If the answer is no, the app can run in a stricter mode: initials only, or the whole thing hosted on a school-controlled machine. That decision changes the build, so it belongs at the front.

---

## 10. Phases

Today is 2026-09-01. The year is starting now. The plan is arranged so that each phase is useful on its own and the app never blocks the paper process.

**Phase 0 — Discovery (this week)**
Get a photo or scan of the current paper check sheet. Confirm floor count, room numbers, check times, current status categories, who the head RA is this year, and where the data may live. Get one dean to own the accounts. Deliverable: the answers to §11 written down.

**Phase 1 — Roster, floors and blank sheets**
Login and roles. Floors, rooms, boys, import. 2D floor map. Blank check sheet PDF in the school's layout. Year rollover. Result: deans stop re-typing sheets. The app already pays for itself here, even if nothing else ships.

**Phase 2 — Checks and filled sheets**
Status types. Check schedules. The RA check screen, offline-capable. Filled check sheet PDF. History. Enter-from-paper mode. Result: RAs use phones, deans print the signed sheet.

**Phase 3 — Reminders and the dean's view**
Web push reminders. Deadline nudges and escalation. Duty roster. Dean dashboard and nightly summary. Head RA permission switches. Result: checks stop getting forgotten.

**Phase 4 — Backup and depth**
Google Sheet mirror. Leave and sign-out board. Week-at-a-glance and per-boy PDFs. Pattern flags. Audit log view for deans. Result: the deans trust it enough to rely on it.

**Phase 5 — Polish, only if wanted**
Stacked floor view. Photo of the signed sheet. Room-swap drag and drop. Second dorm.

No dates are attached on purpose. Phase 1 is small enough to be in the deans' hands within the first weeks of term. Phases 2 and 3 are where the RAs start living in it. Running paper and app side by side for the whole first term is the expected outcome, not a failure.

---

## 11. Questions for the deans

Answers to these change the build, so they come first.

1. A photo or scan of the check sheet you use now. Column by column. Is there a signature line, a date line, a "time completed" box, a notes column?
2. How many floors, what are they called, and what are the room numbers on each? Are there rooms that are never used?
3. How many checks per day, at what times, and does the schedule differ on Friday evening and Sabbath?
4. What words do you use today for a boy's status? Present, absent, signed out, leave, infirmary, late, other?
5. Do you want a head RA role this year, and which of the switches in §3 should be on?
6. Where may student data live? Hosted database owned by a dean, or something the school controls? Names, or initials?
7. Is hallway Wi-Fi reliable, or should the app assume it is not?
8. Do you want boys' photos in the app to help new RAs learn names? This is a privacy trade-off, so it is your call.
9. Who is the one dean who will own the accounts?
10. Should the girls' residence be included from the start, or is this Ryan Hall only?

---

## 12. Decisions already made in this draft, and why

These are choices made for you so the plan has a shape. Push back on any of them.

- **Paper remains the record.** The app produces the sheet; it does not replace it. This is the whole premise and it removes the "I lost my phone" excuse without fighting the school's policy.
- **2D floor map first, isometric stack later.** A true 3D view costs a lot and helps nobody find a boy faster. The stacked view can be generated from the 2D layout once that exists.
- **Google Sheet backup, no Google Form.** A form would be a third copy of the same data with a worse interface than both the app and the blank PDF.
- **Everyone Present by default.** Room check is mostly confirming people are there. Tapping the two exceptions is faster and less error-prone than tapping forty confirmations.
- **No student logins in v1.** It halves the security surface and the support load. A sign-out kiosk can be added later if the deans want it.
- **Offline is a Must, not a Should.** A check app that needs a signal in a hallway will be abandoned in the first week.
- **The grade lives on the boy, not the floor.** That is what makes mixed and single-grade floors the same thing to the software.
- **Its own repository, school-owned accounts.** The head RA changes every year or two. The tool should outlive its builder.
