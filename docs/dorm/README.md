# Ryan Hall dorm staff documents

Two printable PDFs for the dorm, generated from `make_docs.py`:

- `Ryan-Hall-Roles-and-Responsibilities.pdf` — black-and-white flowcharts, one per role
  (Janitors, Monitors, RAs, Head RA), plus a who-reports-to-whom chart and a quick-reference table.
- `Ryan-Hall-Fire-Drill-Plan.pdf` — what everyone does when the alarm sounds, who does what,
  the fire doors on all three floors, the muster point on an aerial photo, and the grade lineup
  with an RA assignment table to fill in.

`aerial-ryan-hall-lot.jpg` is the satellite view of Ryan Hall and the parking lot across
Kingsway College Dr that the fire drill plan annotates.

Regenerate after editing the script (needs Python 3 with `reportlab` and `Pillow`):

    python3 docs/dorm/make_docs.py
