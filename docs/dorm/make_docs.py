#!/usr/bin/env python3
"""Builds the Ryan Hall dorm staff documents.

    python3 docs/dorm/make_docs.py

Outputs (next to this script):
    Ryan-Hall-Roles-and-Responsibilities.pdf   black-and-white flowcharts, one per role
    Ryan-Hall-Fire-Drill-Plan.pdf              evacuation steps, exits, muster point, grade lineup

Needs reportlab and Pillow. The aerial photo (aerial-ryan-hall-lot.jpg) is a crop of a
Google Maps satellite view of Ryan Hall and the parking lot across Kingsway College Dr.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE_W, PAGE_H = letter  # 612 x 792 pt
M = 40                   # page margin
F, FB, FI = "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"
DATE = "October 2026"
BLACK, WHITE = (0, 0, 0), (1, 1, 1)


# --------------------------------------------------------------------------- primitives
def arrow(c, x1, y1, x2, y2, head=6, label=None, label_dx=4, label_dy=0):
    """Straight line with a filled arrowhead at (x2, y2)."""
    import math
    c.line(x1, y1, x2, y2)
    ang = math.atan2(y2 - y1, x2 - x1)
    p = c.beginPath()
    p.moveTo(x2, y2)
    p.lineTo(x2 - head * math.cos(ang - 0.45), y2 - head * math.sin(ang - 0.45))
    p.lineTo(x2 - head * math.cos(ang + 0.45), y2 - head * math.sin(ang + 0.45))
    p.close()
    c.drawPath(p, stroke=0, fill=1)
    if label:
        c.setFont(FI, 8)
        c.drawString((x1 + x2) / 2 + label_dx, (y1 + y2) / 2 + label_dy, label)


def text_block(c, x, y_top, w, lines, font, size, leading=None, align="left"):
    """Draw pre-split lines starting at y_top (top of first line). Returns y after last line."""
    leading = leading or size * 1.2
    c.setFont(font, size)
    y = y_top - size
    for ln in lines:
        if align == "center":
            c.drawCentredString(x + w / 2, y, ln)
        else:
            c.drawString(x, y, ln)
        y -= leading
    return y_top - len(lines) * leading


def bullets(c, x, y_top, w, items, size=9, leading=11.2, indent=10):
    """Bulleted list; returns y below the last line."""
    y = y_top
    for it in items:
        lines = simpleSplit(it, F, size, w - indent)
        c.setFont(F, size)
        c.drawString(x + 2, y - size, "•")
        for i, ln in enumerate(lines):
            c.drawString(x + indent, y - size, ln)
            y -= leading
    return y


def header(c, title, kicker, page_no, total=None):
    c.setFillColorRGB(*BLACK)
    c.rect(M, PAGE_H - M - 30, PAGE_W - 2 * M, 30, stroke=0, fill=1)
    c.setFillColorRGB(*WHITE)
    c.setFont(FB, 15)
    c.drawString(M + 10, PAGE_H - M - 20, title)
    c.setFont(F, 8.5)
    c.drawRightString(PAGE_W - M - 10, PAGE_H - M - 19, kicker)
    c.setFillColorRGB(*BLACK)
    # footer
    c.setFont(F, 8)
    c.setStrokeColorRGB(*BLACK)
    c.setLineWidth(0.5)
    c.line(M, M + 14, PAGE_W - M, M + 14)
    c.drawString(M, M + 3, f"Ryan Hall, Kingsway College  •  {DATE}  •  Draft for review by the Deans and the Head RA")
    c.drawRightString(PAGE_W - M, M + 3, f"Page {page_no}" + (f" of {total}" if total else ""))


def subheader(c, y, reports_to, oversees=None):
    c.setFont(FB, 9)
    c.drawString(M, y, "Reports to:")
    c.setFont(F, 9)
    c.drawString(M + 56, y, reports_to)
    if oversees:
        c.setFont(FB, 9)
        c.drawString(M + 290, y, "Oversees:")
        c.setFont(F, 9)
        c.drawString(M + 290 + 50, y, oversees)
    c.setLineWidth(0.5)
    c.line(M, y - 6, PAGE_W - M, y - 6)


# --------------------------------------------------------------------------- flowchart engine
@dataclass
class Node:
    kind: str                 # start | end | step | decision | note
    title: str
    items: list = field(default_factory=list)
    side: "Node | None" = None   # branch (for decision) or note (for step) drawn to the right
    yes: str = "Yes"             # label on the side connector (decision only)
    no: str = "No"               # label on the down arrow (decision only)
    join_after: int = 0          # a decision's side branch rejoins the main column after N more nodes
    sub: str | None = None       # small italic line under the title (step only)
    float: bool = False          # side note only: may hang down beside later nodes without pushing them


PAD = 7
T_SIZE, B_SIZE, B_LEAD = 10, 9, 11.2


def measure(n: Node, w: float) -> float:
    if n.kind in ("start", "end"):
        lines = simpleSplit(n.title, FB, 10, w - 2 * PAD - 6)
        return len(lines) * 12 + 2 * PAD + 2
    if n.kind == "decision":
        lines = simpleSplit(n.title, FB, 9.5, w * 0.62)
        return max(len(lines) * 11.5 + 30, 46)
    h = PAD
    h += len(simpleSplit(n.title, FB, T_SIZE, w - 2 * PAD)) * 12
    if n.sub:
        h += len(simpleSplit(n.sub, FI, 8.5, w - 2 * PAD)) * 10.5
    if n.items:
        h += 3
        for it in n.items:
            h += len(simpleSplit(it, F, B_SIZE, w - 2 * PAD - 10)) * B_LEAD
    return h + PAD + 2


def draw_node(c, n: Node, x, y_top, w, h):
    c.setLineWidth(1)
    c.setStrokeColorRGB(*BLACK)
    c.setFillColorRGB(*WHITE)
    cx, cy = x + w / 2, y_top - h / 2
    if n.kind in ("start", "end"):
        c.setLineWidth(1.4)
        c.roundRect(x, y_top - h, w, h, h / 2, stroke=1, fill=1)
        c.setFillColorRGB(*BLACK)
        lines = simpleSplit(n.title, FB, 10, w - 2 * PAD - 6)
        text_block(c, x, y_top - (h - len(lines) * 12) / 2 + 1, w, lines, FB, 10, 12, align="center")
        return
    if n.kind == "decision":
        c.setDash([])
        p = c.beginPath()
        p.moveTo(cx, y_top); p.lineTo(x + w, cy); p.lineTo(cx, y_top - h); p.lineTo(x, cy); p.close()
        c.drawPath(p, stroke=1, fill=1)
        c.setFillColorRGB(*BLACK)
        lines = simpleSplit(n.title, FB, 9.5, w * 0.62)
        text_block(c, x, cy + len(lines) * 11.5 / 2 + 1, w, lines, FB, 9.5, 11.5, align="center")
        return
    if n.kind == "note":
        c.setDash([3, 2.5])
        c.setLineWidth(0.8)
    else:
        c.setDash([])
    c.rect(x, y_top - h, w, h, stroke=1, fill=1)
    c.setDash([])
    c.setFillColorRGB(*BLACK)
    y = y_top - PAD
    tl = simpleSplit(n.title, FB, T_SIZE, w - 2 * PAD)
    y = text_block(c, x + PAD, y, w - 2 * PAD, tl, FB, T_SIZE, 12)
    if n.sub:
        sl = simpleSplit(n.sub, FI, 8.5, w - 2 * PAD)
        y = text_block(c, x + PAD, y, w - 2 * PAD, sl, FI, 8.5, 10.5)
    if n.items:
        y -= 3
        bullets(c, x + PAD, y, w - 2 * PAD, n.items)


class Flow:
    """Vertical flowchart: a main column with optional side nodes to the right."""

    def __init__(self, c, main_x, main_w, side_x, side_w, y_top, gap=20):
        self.c, self.mx, self.mw, self.sx, self.sw, self.y, self.gap = c, main_x, main_w, side_x, side_w, y_top, gap
        self.cx = main_x + main_w / 2
        self.prev_bottom = None
        self.prev_node = None
        self.pending = []  # (side_cx, side_bottom, remaining_nodes)

    def add(self, n: Node):
        c = self.c
        h = measure(n, self.mw)
        if self.prev_bottom is not None:
            top = self.prev_bottom - self.gap
            label = self.prev_node.no if self.prev_node.kind == "decision" else None
            arrow(c, self.cx, self.prev_bottom, self.cx, top, label=label, label_dx=5, label_dy=2)
            # branches rejoining in this gap
            still = []
            for scx, sbot, remaining in self.pending:
                if remaining == 0:
                    yj = top + self.gap / 2
                    c.setLineWidth(1)
                    c.line(scx, sbot, scx, yj)
                    c.line(scx, yj, self.cx + 1, yj)
                else:
                    still.append((scx, sbot, remaining - 1))
            self.pending = still
            self.y = top
        draw_node(c, n, self.mx, self.y, self.mw, h)
        bottom = self.y - h
        if n.side:
            s = n.side
            sh = measure(s, self.sw)
            # centre on the main node, but never poke above its top edge
            s_top = min(self.y, self.y - h / 2 + sh / 2)
            draw_node(c, s, self.sx, s_top, self.sw, sh)
            mid_y = self.y - h / 2
            if n.kind == "decision":
                arrow(c, self.mx + self.mw, mid_y, self.sx, mid_y, label=n.yes, label_dx=-10, label_dy=4)
                self.pending.append((self.sx + self.sw / 2, s_top - sh, n.join_after))
            else:
                c.setDash([3, 2.5]); c.setLineWidth(0.8)
                c.line(self.mx + self.mw, mid_y, self.sx, mid_y)
                c.setDash([]); c.setLineWidth(1)
            if not s.float:
                bottom = min(bottom, s_top - sh - 4)
        self.prev_bottom, self.prev_node = bottom, n
        return bottom


def flow_height(nodes, main_w, side_w, gap=20):
    """Dry-run height so the page can be scaled to fit."""
    y, prev = 0, None
    for n in nodes:
        if prev is not None:
            y -= gap
        h = measure(n, main_w)
        bottom = y - h
        if n.side and not n.side.float:
            sh = measure(n.side, side_w)
            s_top = min(y, y - h / 2 + sh / 2)
            bottom = min(bottom, s_top - sh - 4)
        y, prev = bottom, n
    return -y


def draw_flow_page(c, title, reports_to, oversees, nodes, page_no, total, intro=None, main_w=300, side_w=206):
    header(c, title, "RYAN HALL  •  ROLES & RESPONSIBILITIES", page_no, total)
    y = PAGE_H - M - 46
    subheader(c, y, reports_to, oversees)
    y -= 18
    if intro:
        lines = simpleSplit(intro, F, 9, PAGE_W - 2 * M)
        y = text_block(c, M, y, PAGE_W - 2 * M, lines, F, 9, 11) - 10
    avail = y - (M + 26)
    need = flow_height(nodes, main_w, side_w)
    s = min(1.0, avail / need)
    c.saveState()
    content_w = main_w + 26 + side_w
    # scale about the top-left of the chart, centred horizontally
    ox = M + ((PAGE_W - 2 * M) - content_w * s) / 2
    c.translate(ox, y)
    c.scale(s, s)
    f = Flow(c, 0, main_w, main_w + 26, side_w, 0)
    for n in nodes:
        f.add(n)
    c.restoreState()


# --------------------------------------------------------------------------- roles document
def org_chart_page(c, page_no, total):
    header(c, "Dorm staff: who reports to whom", "RYAN HALL  •  ROLES & RESPONSIBILITIES", page_no, total)
    y = PAGE_H - M - 50
    intro = ("Ryan Hall runs on five roles. Each role has one page in this document with a flowchart of its "
             "responsibilities. Solid lines show who a role answers to. Dashed lines show who checks on whom.")
    y = text_block(c, M, y, PAGE_W - 2 * M, simpleSplit(intro, F, 9.5, PAGE_W - 2 * M), F, 9.5, 12) - 14

    def box(cx, cy, w, h, title, sub):
        c.setLineWidth(1.2); c.setFillColorRGB(*WHITE)
        c.rect(cx - w / 2, cy - h / 2, w, h, stroke=1, fill=1)
        c.setFillColorRGB(*BLACK)
        lines = simpleSplit(sub, F, 8, w - 12)
        c.setFont(FB, 11); c.drawCentredString(cx, cy + 6, title)
        c.setFont(F, 8)
        for i, ln in enumerate(lines):
            c.drawCentredString(cx, cy - 6 - i * 9.5, ln)

    cxm = PAGE_W / 2
    bw, bh = 150, 56
    y_dean, y_hra, y_mid, y_jan = y - 30, y - 108, y - 186, y - 264
    box(cxm, y_dean, bw, bh, "Deans", "run the dorm; final say on everything")
    box(cxm, y_hra, bw, bh, "Head RA", "organizes the RAs and Monitors; night facilities check")
    x_ra, x_mon = cxm - 150, cxm + 150
    box(x_ra, y_mid, bw, bh, "RAs", "one floor each: worship, study hall and room checks")
    box(x_mon, y_mid, bw, bh, "Monitors", "front desk; the Dean's eyes when the Dean is away; supervise the janitors when assigned")
    box(x_mon, y_jan, bw, bh, "Janitors", "clean the dorm during work periods")
    c.setLineWidth(1)
    arrow(c, cxm, y_hra + bh / 2, cxm, y_dean - bh / 2)
    # Head RA fans out to RAs and Monitors
    yb = y_hra - bh / 2 - 14
    c.line(cxm, y_hra - bh / 2, cxm, yb)
    c.line(x_ra, yb, x_mon, yb)
    arrow(c, x_ra, yb, x_ra, y_mid + bh / 2)
    arrow(c, x_mon, yb, x_mon, y_mid + bh / 2)
    arrow(c, x_mon, y_mid - bh / 2, x_mon, y_jan + bh / 2)
    c.setFont(FI, 7.5)
    c.drawRightString(x_mon - 5, y_mid - bh / 2 - 9, "when the Dean assigns")
    c.drawRightString(x_mon - 5, y_mid - bh / 2 - 18, "that Monitor to the period")
    # dashed: Head RA audits janitors' cleaning
    c.setDash([3, 2.5]); c.setLineWidth(0.8)
    c.line(cxm - bw / 2, y_hra - 8, cxm - 110, y_hra - 8)
    c.line(cxm - 110, y_hra - 8, cxm - 110, y_jan)
    arrow(c, cxm - 110, y_jan, x_mon - bw / 2, y_jan)
    c.drawString(cxm - 106, y_jan + 4, "audits the cleaning")
    # dashed: Deans check the janitors themselves when no Monitor is assigned (down the right side)
    xr = x_mon + bw / 2 + 22
    c.line(cxm + bw / 2, y_dean - 10, xr, y_dean - 10)
    c.line(xr, y_dean - 10, xr, y_jan + 6)
    arrow(c, xr, y_jan + 6, x_mon + bw / 2, y_jan + 6)
    c.saveState(); c.translate(xr + 11, y_jan + 16); c.rotate(90)
    c.drawString(0, 0, "check the janitors when no Monitor is assigned"); c.restoreState()
    c.setDash([]); c.setLineWidth(1)

    # legend, two by two
    ly = y_jan - 44
    c.setFont(FB, 9); c.drawString(M, ly, "Reading the flowcharts")
    ly -= 14
    items = [
        ("start", "Start or end of a shift or routine"),
        ("step", "A task block: the heading is the job, the bullets are what \"done\" means"),
        ("decision", "A question. Follow \"Yes\" to the right, \"No\" straight down"),
        ("note", "A standing rule that applies the whole time, not a step in the sequence"),
    ]
    half = (PAGE_W - 2 * M) / 2
    row_h = 50
    for i, (kind, desc) in enumerate(items):
        x = M + (i % 2) * half
        yy = ly - (i // 2) * row_h
        n = Node(kind, {"start": "Start", "step": "Task", "decision": "Question?", "note": "Rule"}[kind])
        w = 72
        h = measure(n, w) if kind != "step" else 24
        if kind == "step":
            c.rect(x, yy - h + 4, w, h, stroke=1, fill=0)
            c.setFont(FB, 9); c.drawCentredString(x + w / 2, yy - 8, "Task")
        else:
            draw_node(c, n, x, yy + 4, w, h)
        text_block(c, x + w + 8, yy + 2, half - w - 16, simpleSplit(desc, F, 8.5, half - w - 16), F, 8.5, 10.5)
    ly -= 2 * row_h

    # quick reference table
    ty = ly - 4
    c.setFont(FB, 9); c.drawString(M, ty, "Quick reference")
    ty -= 10
    rows = [
        ("Role", "Core job in one line", "Answers to"),
        ("Deans", "Run Ryan Hall: roster, rooms, RAs, check times, the signed paper sheet, discipline, drills. Final say on everything.", "School"),
        ("Head RA", "Night facilities check; organize the RAs; make sure Monitors and janitors do their jobs; whatever app switches the Deans turn on.", "Deans"),
        ("RAs", "Worship, study hall and room checks on their floor, in the app; peace, safety and well-being of their boys.", "Head RA, Deans"),
        ("Monitors", "Front desk: packages, visitors, sign-in, lobby. If the Dean assigns it, supervise the janitors during the work period as well.", "Head RA, Deans"),
        ("Janitors", "Keep the dorm clean: washrooms, floors, garbage, anything that needs cleaning.", "The Monitor the Dean assigned, or the Dean"),
    ]
    col = [M, M + 70, PAGE_W - M - 90]
    widths = [66, col[2] - col[1] - 8, 86]
    c.setLineWidth(0.6)
    for i, r in enumerate(rows):
        font = FB if i == 0 else F
        lines = [simpleSplit(r[k], font, 8.5, widths[k]) for k in range(3)]
        rh = max(len(l) for l in lines) * 10.5 + 7
        if i == 0:
            c.setFillColorRGB(*BLACK); c.rect(M, ty - rh, PAGE_W - 2 * M, rh, stroke=0, fill=1)
            c.setFillColorRGB(*WHITE)
        for k in range(3):
            text_block(c, col[k] + 3, ty - 3, widths[k], lines[k], font, 8.5, 10.5)
        c.setFillColorRGB(*BLACK)
        if i > 0:
            c.line(M, ty - rh, PAGE_W - M, ty - rh)
        ty -= rh
    c.rect(M, ty, PAGE_W - 2 * M, (ly - 14) - ty, stroke=1, fill=0)


def timeline_page(c, page_no, total):
    """A school night, Sunday to Thursday, as a grid of roles by time."""
    header(c, "A school night at a glance", "RYAN HALL  •  ROLES & RESPONSIBILITIES", page_no, total)
    y = PAGE_H - M - 50
    intro = ("Sunday to Thursday. The check times and deadlines are the app's defaults; the Deans set the real ones "
             "under Settings. Read down a column for one role's night, or across a row for who is doing what at that time.")
    y = text_block(c, M, y, PAGE_W - 2 * M, simpleSplit(intro, F, 9.5, PAGE_W - 2 * M), F, 9.5, 12) - 12
    roles = ["Janitors", "Monitors", "RAs", "Head RA", "Deans"]
    rows = [
        ("Work period\n(afternoon)",
         ["Clean: washrooms, floors, garbage. Report done to whoever the Dean put in charge.",
          "Desk as usual. If the Dean assigned you to the janitors: supervise them as well, and sign off the work.",
          "", "Every so often: audit the cleaning against what was signed off.",
          "Assign a Monitor to the work period, or check the janitors yourself."]),
        ("Evening\n(before 7:30)",
         ["", "Desk shift: lobby, packages, visitors sign in, sign-out sheet.",
          "On your floor. 7:20 PM: phone reminder for worship.",
          "Confirm every RA is on their floor.", "Leave board up to date so boys on leave show Away."]),
        ("7:30 PM\nWorship (W)",
         ["", "Desk.", "Worship check in the app. Submit by 7:50.",
          "RA missing or late? Cover or reassign, tell the Dean.",
          "Tonight screen: which floors are in. Late floor: nudge the RA."]),
        ("8:30 PM\nStudy hall (SH)",
         ["", "Desk. Keep the lobby quiet.", "Study hall check. Submit by 8:50.",
          "Spot-check the floors.", "Alert if a floor misses its deadline."]),
        ("10:00 PM\nRoom check (RC)",
         ["", "Desk until the end of the shift; hand over.",
          "Room check: every boy in his room. Submit by 10:20. Then sign the day.",
          "Collect each RA's lates and dirty rooms.",
          "10:30 PM summary: floors checked, boys absent."]),
        ("After checks",
         ["", "Note anything unusual for the Head RA.",
          "Report lates and dirty rooms to the Head RA. Settle the floor.",
          "Night facilities check: lobby, desk, closets, kitchen, laundry, bathrooms, supplies. Check in with the Dean.",
          "Receive the Head RA's report. Print tonight's sheet, sign it, file it."]),
    ]
    tw = PAGE_W - 2 * M
    time_w = 82
    col_w = (tw - time_w) / len(roles)
    # header row
    hh = 20
    c.setFillColorRGB(*BLACK); c.rect(M, y - hh, tw, hh, stroke=0, fill=1)
    c.setFillColorRGB(*WHITE); c.setFont(FB, 9)
    c.drawString(M + 5, y - 13, "Time")
    for i, r in enumerate(roles):
        c.drawCentredString(M + time_w + col_w * (i + 0.5), y - 13, r)
    c.setFillColorRGB(*BLACK)
    y -= hh
    c.setLineWidth(0.6)
    fs, lead = 8, 9.8
    for label, cells in rows:
        wrapped = [simpleSplit(t, F, fs, col_w - 10) if t else [] for t in cells]
        lab = label.split("\n")
        rh = max(max(len(w) for w in wrapped), len(lab)) * lead + 10
        c.rect(M, y - rh, tw, rh, stroke=1, fill=0)
        c.setFont(FB, 8.5)
        for k, ln in enumerate(lab):
            c.drawString(M + 5, y - 12 - k * 10.5, ln)
        for i, w in enumerate(wrapped):
            x = M + time_w + col_w * i
            c.line(x, y, x, y - rh)
            if w:
                text_block(c, x + 5, y - 4, col_w - 10, w, F, fs, lead)
            else:
                c.setFont(FI, 7.5); c.drawCentredString(x + col_w / 2, y - rh / 2 - 2, "—")
        y -= rh
    y -= 16
    c.setFont(FB, 10); c.drawString(M, y, "What the app does on its own"); y -= 6
    auto = [
        "Reminds the RA on duty 10 minutes before worship and study hall and 15 minutes before room check.",
        "Nudges the RA and alerts the Dean (and the Head RA, if that switch is on) when a floor is not submitted 20 minutes after check time.",
        "Marks boys on the leave board Away before the RA starts, locks a check when it is submitted, and logs every reopening with a name and time.",
        "Compiles the week's checks into the school's paper check sheet (W, SH, RC columns, one block per day) with each RA's drawn signature on their day.",
    ]
    bullets(c, M, y, tw, auto, size=9, leading=11.2)


def roles_pdf(path):
    c = canvas.Canvas(path, pagesize=letter)
    c.setTitle("Ryan Hall: Roles and Responsibilities")
    c.setAuthor("Ryan Hall, Kingsway College")
    total = 9

    # ---- cover / org chart
    org_chart_page(c, 1, total)
    c.showPage()
    timeline_page(c, 2, total)
    c.showPage()

    # ---- Janitors
    janitors = [
        Node("start", "Work period begins. Sign in with whoever the Dean put in charge of the period: the assigned Monitor, or the Dean."),
        Node("step", "Washrooms: top, middle and bottom floors", items=[
            "Refill the toilet paper in every stall.",
            "Unclog any blocked toilet.",
            "Check the urinals: screens and deodorizer blocks in place, working and not smelling. Replace or fix as needed.",
            "Sweep and mop the washroom floors.",
            "Wipe the sinks, counters and mirrors.",
        ], side=Node("note", "Standard for a finished washroom", items=[
            "Every stall has paper.",
            "Every toilet flushes.",
            "Urinals do not smell.",
            "Floor is swept, mopped and dry.",
        ])),
        Node("step", "Floors", items=[
            "Vacuum the main floor.",
            "Mop the top floor and the bottom floor.",
            "Vacuum every other carpeted area in the building: hallways, lobby, stairs, common rooms.",
        ]),
        Node("decision", "Is anyone in the dorm sick?",
             side=Node("step", "Sanitize the high-touch surfaces", items=[
                 "Wipe down every doorknob and door handle.",
                 "Wipe railings, light switches and washroom taps.",
             ])),
        Node("step", "Garbage and outside", items=[
            "Empty the garbage cans and put in new liners.",
            "Pick up any litter around the entrance and the grounds.",
            "Take the garbage out to the bin.",
        ]),
        Node("decision", "Anything else that needs cleaning?",
             side=Node("step", "Clean it", items=[
                 "If it is dirty, it is a janitor's job.",
                 "Not sure how, or where the supplies are? Ask the Monitor.",
             ])),
        Node("step", "Report to the assigned Monitor, or the Dean", items=[
            "Walk them through what was done.",
            "Report anything broken or running low (toilet paper, soap, cleaning supplies) so the Head RA can restock it.",
        ]),
        Node("end", "The assigned Monitor, or the Dean, signs off on the work period."),
    ]
    draw_flow_page(c, "Janitors", "the Monitor the Dean assigned to the work period; the Dean when none is. The Head RA audits.",
                   None, janitors, 3, total,
                   intro="The janitors keep the dorm clean. A work period is not finished when the time is up; it is "
                         "finished when whoever the Dean put in charge has checked the work.")
    c.showPage()

    # ---- Monitors
    monitors = [
        Node("start", "Monitor shift begins. Sign in at the monitor desk."),
        Node("step", "Lobby and front desk", items=[
            "Keep the lobby clean and organized, and keep the noise down.",
            "Receive packages and food orders and get them to the right person.",
            "Keep the desk papers and the sign-out sheet in order.",
        ]),
        Node("step", "Visitors and sign-in", items=[
            "Every visitor signs in and signs out, including girls from the girls' dorm.",
            "Visitors stay in the lobby or other permitted areas only.",
            "No unknown or unsafe person comes into the dorm. If someone refuses to sign in or seems dangerous, do not confront them: call the Dean immediately.",
        ]),
        Node("step", "Watch the dorm when the Dean is away", items=[
            "Stay at the desk. Know who is coming and going.",
            "Note problems: noise, rowdiness, damage, people where they should not be.",
            "You can reach the Dean on duty and the Head RA by phone at any time.",
        ]),
        Node("decision", "Work period, and the Dean assigned you to supervise the janitors?", join_after=1,
             side=Node("step", "Supervise the janitors as well as the desk", items=[
                 "On top of the desk job, not instead of it.",
                 "Every scheduled janitor shows up on time and knows their tasks. Write down who did not show.",
                 "When they report done, check it yourself: toilet paper, toilets, urinals, washrooms, floors vacuumed and mopped, garbage out.",
                 "Do not sign off until it is actually done. Report no-shows and unfinished work to the Head RA.",
             ])),
        Node("step", "Not assigned to the janitors", items=[
            "Carry on with the desk. The Deans check the janitors themselves during that work period.",
            "Not sure whether you were assigned? Ask the Dean before the work period starts.",
        ]),
        Node("decision", "A problem you cannot handle from the desk?",
             side=Node("step", "Escalate", items=[
                 "Call the Dean on duty.",
                 "If the Dean cannot be reached, call the Head RA.",
                 "Emergency: call 911 first, then the Dean.",
             ])),
        Node("end", "Shift ends. Hand over to the next Monitor and note anything unusual."),
    ]
    draw_flow_page(c, "Monitors", "the Head RA, and the Dean on duty.", "the janitors, when the Dean assigns it",
                   monitors, 4, total,
                   intro="Every Monitor shift is the front desk. Supervising the janitors during a work period is "
                         "something the Dean assigns to a particular Monitor, and it is added to the desk job, not "
                         "swapped for it. When no Monitor is assigned, the Deans check the janitors themselves.")
    c.showPage()

    # ---- RAs
    ras = [
        Node("start", "Evening duty begins (Sunday to Thursday).",
             side=Node("note", "At all times on your floor", float=True, items=[
                 "Keep the peace: no rowdiness, no roughhousing.",
                 "The safety and well-being of every boy on your floor is yours.",
                 "Know who is on your floor and who is missing.",
                 "Assist the Deans with whatever they need.",
             ])),
        Node("step", "Worship check", sub="Default time 7:30 PM, submit by 7:50. The Deans set the real times.", items=[
            "Take attendance of your floor at worship, in the app.",
            "Mark each boy present, late or absent. Late needs a note.",
        ]),
        Node("step", "Study hall check", sub="Default time 8:30 PM, submit by 8:50.", items=[
            "Confirm every boy on your floor is in study hall, quiet and on task.",
            "Record lates and absences.",
        ]),
        Node("step", "Room check", sub="Default time 10:00 PM, submit by 10:20.", items=[
            "Visit every room on your floor. Every boy in his own room and accounted for.",
            "Note lates, absences and dirty rooms.",
            "Settle the floor for the night. Then sign the day in the app (page 6).",
        ]),
        Node("decision", "Incident, rowdiness, or a boy you cannot find?",
             side=Node("step", "Handle it, then escalate", items=[
                 "Calm it down and separate the boys involved.",
                 "Missing boy: check with the other RAs and the Monitor, then call the Dean.",
                 "Never leave your floor unattended during a check.",
                 "Report it to the Head RA and the Dean the same night.",
             ])),
        Node("step", "Report to the Head RA", items=[
            "Hand in tonight's lates (worship, study hall, room check) and dirty rooms.",
            "Flag anything that needs a Dean.",
            "Sign the check sheet for your floor.",
        ], side=Node("note", "Fire drill or alarm", items=[
            "Go straight outside to your grade's designated spot (see the Fire Drill Plan).",
            "Line up your grade, take the roll, report the count to the Head RA.",
        ])),
        Node("end", "Night ends."),
    ]
    draw_flow_page(c, "RAs (Resident Assistants)", "the Head RA and the Deans.", "the boys on their floor",
                   ras, 5, total,
                   intro="Each RA is responsible for one floor and, during drills, for one grade. The three checks "
                         "are the backbone of the night; the standing rules on the right apply the whole time.")
    c.showPage()

    # ---- RAs: doing a check in the app
    ra_app = [
        Node("start", "Your phone buzzes: the check on your floor starts in 10 minutes (15 for room check).",
             side=Node("note", "Cannot make it tonight?", float=True, items=[
                 "Hand the check over: tap Hand a check over, pick the floor and nights, and show the code to whoever is covering.",
                 "They scan it with their camera, type their name, and get your floor for those nights. No account needed.",
                 "Both names go on the check. Tell the Head RA.",
             ])),
        Node("step", "Open the app and tap Start check", items=[
            "Your floor shows as a list grouped by room.",
            "Everyone starts as Present. Boys the Deans signed out on the leave board already show Away.",
        ]),
        Node("step", "Tap only the exceptions", items=[
            "Tap a boy to cycle Present, Absent, Away, Late. Tap his name for Infirmary or a note.",
            "Late always needs a note: where he was and why.",
            "A note is for the Deans (\"in shower, confirmed\", \"with Dean at office\").",
        ]),
        Node("step", "Tap Submit before the deadline", sub="Default: 20 minutes after the check time.", items=[
            "The summary shows how many are present, absent and away.",
            "Submit locks the check. A Dean, or the Head RA within 24 hours if allowed, can reopen it to fix a mistake. Every edit is logged.",
            "No Wi-Fi in the hallway? It saves on your phone and uploads when the signal is back.",
        ], side=Node("note", "Phone not an option?", items=[
            "Print a blank sheet (your floor, current roster, empty boxes) and do the check on paper.",
            "A Dean, or you if permitted, enters it from paper later. The record says so.",
        ])),
        Node("decision", "Missed the deadline?",
             side=Node("step", "Nudge and escalation", items=[
                 "A nudge lands on your home screen; the Dean gets an alert (and the Head RA, if that switch is on).",
                 "Do the check now. Tell the Head RA why it was late.",
             ])),
        Node("step", "After the last check of the night: sign the day", items=[
            "When every check due on your floor is in, draw your signature on your phone.",
            "It prints on that day's line of the paper check sheet, which the Deans print and sign. Paper stays the record.",
        ]),
        Node("end", "Done for the night."),
    ]
    draw_flow_page(c, "RAs: doing a check in the app", "the Head RA and the Deans.", "the boys on their floor",
                   ra_app, 6, total,
                   intro="The app fills in the school's paper check sheet; the RA only taps the exceptions. "
                         "Statuses: Present (P), Absent (A), Away (AW), Late (L), Infirmary (INF). The Deans can rename these.")
    c.showPage()

    # ---- Head RA, page 1: nightly
    hra_night = [
        Node("start", "Evening begins (Sunday to Thursday)."),
        Node("step", "Check on the RAs", items=[
            "Every RA is on their floor and on time for worship, study hall and room check.",
            "RA missing? Cover the floor yourself or reassign it, then tell the Dean.",
            "Collect each RA's report: worship lates, study hall lates, room check lates, dirty rooms.",
        ]),
        Node("step", "Night facilities check (the Head RA check sheet)", items=[
            "Lobby wipe-down.",
            "Monitor desk: papers and the sign-out sheet in order.",
            "Facilities: kitchen, laundry, basement janitor closet, main floor janitor closet, top floor closet.",
            "Bathrooms: bottom, middle and top floor.",
            "Supplies on each floor: Vanguard, Nu-Life, Windex, Hi-Genic. Note what is low.",
        ], side=Node("note", "Check sheet columns", items=[
            "One column per night, Sunday to Thursday.",
            "Tick each task when done; write lates and dirty rooms in the RA Report box; everything else under Notes.",
        ])),
        Node("decision", "Something dirty, broken, or missing?",
             side=Node("step", "Log it and follow up", items=[
                 "Write it on the check sheet.",
                 "Dirty or unfinished cleaning: take it up with the Monitor and the janitors at the next work period.",
                 "Broken: report it to the Dean for maintenance.",
                 "Low supplies: restock or ask the Dean.",
             ])),
        Node("step", "Check in with the Dean", items=[
            "Hand over the night's lates and dirty rooms.",
            "Report on the RAs, the Monitors and the facilities check.",
            "Raise anything that needs a Dean's decision.",
        ]),
        Node("end", "Night ends."),
    ]
    draw_flow_page(c, "Head RA: the nightly routine", "the Deans.", "the RAs, the Monitors and the janitors' work",
                   hra_night, 7, total,
                   intro="The Head RA is the Deans' second set of eyes. Every night: make sure the RAs did their checks, "
                         "walk the facilities, log what is wrong, and report to the Dean.")
    c.showPage()

    # ---- Head RA, page 2: organizing the team
    hra_team = [
        Node("start", "Ongoing: organizing the team."),
        Node("step", "Organize the RAs", items=[
            "Set the RA schedule and floor assignments.",
            "Make sure every check is done, on time, and done properly.",
            "Deal with RAs who skip checks or show up late. Repeat problems go to the Deans.",
        ], side=Node("note", "In the app: switches the Deans can turn on", float=True, items=[
            "See every floor.",
            "Reopen a submitted check within 24 hours.",
            "Assign RAs to floors.",
            "Move a boy between rooms.",
            "Add or remove RAs.",
            "Print sheets for any floor.",
            "Get the missed-check alerts.",
            "All off until a Dean turns them on.",
        ])),
        Node("step", "Supervise the Monitors", items=[
            "Monitors are at the desk for their shifts and the sign-in rules are enforced.",
            "During work periods: a Monitor the Dean assigned to the janitors is actually watching them and checking the work, not just signing it off, while still running the desk.",
        ]),
        Node("step", "Audit the cleaning", items=[
            "Every so often, walk the dorm yourself: washrooms, floors, lobby, garbage.",
            "Compare what you see with what the Monitor signed off.",
            "The janitors answer to the Monitors and the Monitors answer to you; the audit is how you know both layers work.",
        ]),
        Node("decision", "Does what you see match what was signed off?", yes="No", no="Yes",
             side=Node("step", "Address it", items=[
                 "Raise it with the Monitor and the janitors involved.",
                 "A pattern (same person, same problem) goes to the Deans with specifics: who, what, when.",
             ])),
        Node("step", "Fire drill", items=[
            "With the Deans, move quickly through every room, washroom and common area on all three floors.",
            "Confirm the building is empty; exit last.",
            "At the muster point, collect the RAs' counts and report \"all clear\" to the Dean. See the Fire Drill Plan.",
        ]),
        Node("end", "Report to the Deans."),
    ]
    draw_flow_page(c, "Head RA: organizing the team", "the Deans.", "the RAs, the Monitors and the janitors' work",
                   hra_team, 8, total,
                   intro="Beyond the nightly check, the Head RA keeps the whole staff working: RAs doing their checks, "
                         "Monitors watching the janitors, and the dorm actually getting cleaned.")
    c.showPage()

    # ---- Deans
    deans = [
        Node("start", "The year, start to finish.",
             side=Node("note", "The paper sheet stays the record", float=True, items=[
                 "The app fills in the school's check sheet; the Deans print it and sign it.",
                 "Any RA or Dean can print a blank sheet when a phone is not an option.",
             ])),
        Node("step", "Before the year, once", items=[
            "Set up the floors, rooms and roster in the app; name the Head RA and decide which switches are on.",
            "Invite the RAs and assign each one a floor. Set the check times and the status words.",
            "Print the recovery code and lock it away. Keep two Dean phones signed in.",
        ]),
        Node("step", "Every school night", items=[
            "Tonight screen: which floors are checked, which are late, who is absent.",
            "A floor is late? Tap Remind; it lands on that RA's home screen.",
            "10:30 PM summary. Then the Head RA's report: lates, dirty rooms, facilities, staff.",
            "Print tonight's sheet (one page per floor), sign it, file it.",
        ]),
        Node("decision", "A boy absent three checks in a row, or twice this week?",
             side=Node("step", "Follow up", items=[
                 "The app raises a quiet flag; it never applies a consequence.",
                 "What happens next is the Deans' call.",
             ])),
        Node("step", "Ongoing", items=[
            "Work periods: assign a Monitor to supervise the janitors, or check the janitors yourself.",
            "Leave board: sign boys out ahead of time so they show Away on every check in the range.",
            "Room moves, boys and RAs added or removed mid-year. Approve each new phone an RA signs in on.",
            "Reopen a submitted check only to fix a mistake; every edit is logged with a name and time.",
            "Discipline, parents, maintenance, and anything the Monitors or Head RA escalate.",
        ]),
        Node("step", "Fire drills", items=[
            "Lead the drill, sweep all three floors with the Head RA, exit last, give the all-clear. See the Fire Drill Plan.",
        ]),
        Node("step", "End of year", items=[
            "Year rollover: archive the roster and checks, keep the floors and rooms, clear the RA list. Archives stay printable.",
        ]),
        Node("end", "The Deans have the final say on everything in Ryan Hall."),
    ]
    draw_flow_page(c, "Deans", "the school.", "everyone in Ryan Hall",
                   deans, 9, total,
                   intro="Three Deans run the dorm. The app is theirs: they own the roster, the rooms, the staff list, the "
                         "check times and the printed, signed sheet. Everything the other roles do reports up to them.")
    c.save()


# --------------------------------------------------------------------------- fire drill document
def annotate_aerial(src, dst):
    """Mark the evacuation route, the muster point and the five RA positions on the aerial photo."""
    # black and white, like the rest of the plan
    im = Image.open(src).convert("L").convert("RGB")
    d = ImageDraw.Draw(im)
    big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 54)
    med = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 40)

    def outlined(xy, text, font, fill="white", outline="black", anchor="la", w=4):
        x, y = xy
        for dx in range(-w, w + 1):
            for dy in range(-w, w + 1):
                d.text((x + dx, y + dy), text, font=font, fill=outline, anchor=anchor)
        d.text((x, y), text, font=font, fill=fill, anchor=anchor)

    def thick_line(pts, width, fill, outline):
        d.line(pts, fill=outline, width=width + 8, joint="curve")
        d.line(pts, fill=fill, width=width, joint="curve")

    # evacuation route: front entrance -> walkway -> across Kingsway College Dr -> muster point
    route = [(763, 470), (752, 600), (790, 880), (905, 1120), (937, 1330)]
    thick_line(route, 14, "white", "black")
    # arrowhead at the end of the route
    ax, ay = 937, 1360
    d.polygon([(ax, ay + 30), (ax - 30, ay - 18), (ax + 30, ay - 18)], fill="black")
    d.polygon([(ax, ay + 18), (ax - 19, ay - 10), (ax + 19, ay - 10)], fill="white")
    outlined((760, 440), "Front entrance", med, anchor="mb")
    outlined((845, 1190), "Cross the road", med, anchor="rm")

    # garbage can = muster point anchor
    gx, gy = 937, 1406
    d.rectangle((gx - 28, gy - 28, gx + 28, gy + 28), fill="black", outline="white", width=4)
    outlined((gx + 44, gy - 22), "Garbage", med, anchor="lm")
    outlined((gx + 44, gy + 22), "can", med, anchor="lm")

    # The RA row: along the front of the parking stalls, parallel to the dorm, starting at the can
    # and going left (as you face the dorm). 10 ft apart; the photo is about 13 px per foot.
    # Both Grade 12 RAs share the fourth spot; the Grade 12s make one line.
    row_y = 1540
    step = 130
    r = 50
    xs = [gx - i * step for i in range(4)]
    labels = ["9", "10", "11", "12"]
    d.line([(xs[0], row_y), (xs[-1], row_y)], fill="black", width=10)
    d.line([(xs[0], row_y), (xs[-1], row_y)], fill="white", width=4)
    # short tick from the can down to the Grade 9 RA
    d.line([(gx, gy + 32), (gx, row_y - r)], fill="black", width=10)
    d.line([(gx, gy + 32), (gx, row_y - r)], fill="white", width=4)
    col_bottom = row_y + 430
    for x, label in zip(xs, labels):
        # the grade's line of students, behind the RA (away from the dorm)
        d.line([(x, row_y + r + 10), (x, col_bottom)], fill="black", width=16)
        d.line([(x, row_y + r + 10), (x, col_bottom)], fill="white", width=7)
        for k in range(5):
            sy = row_y + r + 50 + k * 80
            d.rectangle((x - 20, sy - 20, x + 20, sy + 20), fill="white", outline="black", width=4)
        d.ellipse((x - r, row_y - r, x + r, row_y + r), fill="white", outline="black", width=7)
        d.text((x, row_y + 2), label, font=big, fill="black", anchor="mm")
    outlined((xs[-1], row_y - r - 14), "2 RAs", med, anchor="mb")
    # labels
    outlined((xs[-1] - r - 20, row_y), "RAs", big, anchor="rm")
    cx_label = (xs[0] + xs[-1]) / 2
    outlined((cx_label, col_bottom + 60), "RAs face the dorm, 10 ft apart", med, anchor="mm")
    outlined((cx_label, col_bottom + 108), "Students line up behind their RA", med, anchor="mm")
    im.save(dst, quality=90)
    return im.size


def numbered(c, x, y, w, items, size=9.5, leading=12.5):
    for i, it in enumerate(items, 1):
        lines = simpleSplit(it, F, size, w - 20)
        c.setFont(FB, size)
        c.drawRightString(x + 14, y - size, f"{i}.")
        c.setFont(F, size)
        for ln in lines:
            c.drawString(x + 20, y - size, ln)
            y -= leading
        y -= 3
    return y


def fire_pdf(path, aerial_src):
    annotated = os.path.join(HERE, "_aerial-annotated.jpg")
    img_w, img_h = annotate_aerial(aerial_src, annotated)
    c = canvas.Canvas(path, pagesize=letter)
    c.setTitle("Ryan Hall: Fire Drill and Evacuation Plan")
    c.setAuthor("Ryan Hall, Kingsway College")
    total = 5
    K = "RYAN HALL  •  FIRE DRILL & EVACUATION PLAN"

    # ---- page 1: when the alarm sounds
    header(c, "Fire drill and evacuation plan", K, 1, total)
    y = PAGE_H - M - 52
    c.setFont(FB, 12); c.drawString(M, y, "When the alarm sounds: everyone"); y -= 8
    steps = [
        "Stop what you are doing. Treat every alarm as a real fire.",
        "Leave immediately. Do not pack, do not go back for anything, do not wait for your roommate.",
        "Put shoes on only if they are right there. Close your room door behind you; do not lock it.",
        "Go to the nearest fire exit. Every floor has a fire door at each end of the hallway. Use the one closest to you. From the main floor the lobby doors are also an exit.",
        "Walk. Do not run, push or talk. Keep your phone away so you can hear instructions.",
        "Smoke: stay low and cover your mouth. Before opening a closed door, feel it with the back of your hand. If it is hot, use the other exit.",
        "Outside, move away from the building and go straight to the muster point: the parking lot across Kingsway College Dr, in front of the parking spaces by the garbage can (see page 4).",
        "Find your grade's RA and line up behind them. Grade 9 is at the garbage can, then 10, 11 and 12 to the left as you face the dorm. All Grade 12s make one line; both Grade 12 RAs stand at that spot. Answer the roll call.",
        "Stay at the muster point. Nobody goes back into the building until the Dean gives the all-clear.",
        "If you think someone is still inside, tell your RA or the Dean. Never go back in to look.",
    ]
    y = numbered(c, M, y - 6, PAGE_W - 2 * M, steps)
    y -= 14
    c.setFont(FB, 12); c.drawString(M, y, "Who does what"); y -= 12
    rows = [
        ("RAs", "Go straight outside to your grade's spot in front of the parking spaces, facing the dorm. Line your grade up behind you, take the roll against your floor list, and report the count (and any missing name) to the Head RA. Keep your grade together and quiet until the all-clear."),
        ("Head RA", "Sweep the building with the Deans: every room, washroom and common area on all three floors. Exit last. At the muster point, collect the four grade counts from the RAs and report \"all clear\" or the missing names to the Dean."),
        ("Deans", "Lead the drill. Sweep the floors with the Head RA, meet the fire department if it is a real alarm, decide when the all-clear is given, and account for every person using the RAs' counts."),
        ("Monitors", "If you are at the desk: bring the visitor sign-in sheet with you, leave by the lobby, and report to the Dean at the muster point who was signed in. Visitors line up with the Monitor."),
        ("Janitors and everyone else", "Stop work at once, leave by the nearest fire door, line up with your grade."),
    ]
    c.setLineWidth(0.6)
    for role, what in rows:
        lines = simpleSplit(what, F, 9, PAGE_W - 2 * M - 110)
        role_lines = simpleSplit(role, FB, 9, 96)
        rh = max(len(lines), len(role_lines)) * 11 + 8
        c.rect(M, y - rh, PAGE_W - 2 * M, rh, stroke=1, fill=0)
        c.line(M + 104, y, M + 104, y - rh)
        c.setFont(FB, 9)
        for i, ln in enumerate(role_lines):
            c.drawString(M + 5, y - 11 - i * 11, ln)
        text_block(c, M + 110, y - 3, PAGE_W - 2 * M - 110, lines, F, 9, 11)
        y -= rh
    y -= 22
    c.setFont(FB, 12); c.drawString(M, y, "Before any drill: know your floor"); y -= 6
    know = [
        "Know where both fire doors on your floor are, and which one is closer to your room.",
        "Know your grade's spot at the muster point (page 5) and who your grade's RA is.",
        "Keep the hallway, stairs and the space inside every fire door clear at all times.",
        "Never prop a fire door open, pull an alarm as a joke, or touch a fire extinguisher except for a real fire.",
        "If you discover a fire: pull the nearest alarm, get out, and tell the Dean or the Monitor at the desk. The Dean calls 911.",
    ]
    bullets(c, M, y, PAGE_W - 2 * M, know, size=9.5, leading=12.5)
    c.showPage()

    # ---- page 2: the drill as a flowchart
    header(c, "The drill, step by step", K, 2, total)
    y = PAGE_H - M - 50
    intro = ("Two things happen at the same time: the RAs go straight out to their spots so the grades have somewhere "
             "to line up, while the Deans and the Head RA make sure the building is empty.")
    y = text_block(c, M, y, PAGE_W - 2 * M, simpleSplit(intro, F, 9.5, PAGE_W - 2 * M), F, 9.5, 12) - 16
    colw = 160
    gapx = (PAGE_W - 2 * M - 3 * colw) / 2
    xs = [M + i * (colw + gapx) for i in range(3)]
    titles = ["RAs", "Deans + Head RA", "Everyone else"]
    cols = [
        [Node("step", "Alarm sounds"),
         Node("step", "Leave by the nearest fire door", items=["Do not sweep rooms. Your job is outside."]),
         Node("step", "Go to your grade's spot", items=["In front of the parking spaces, facing the dorm. Grade 9 at the garbage can, then 10, 11, 12 to the left. Both Grade 12 RAs at the 12 spot."]),
         Node("step", "Line your grade up behind you and take the roll", items=["Check against your floor list."]),
         Node("step", "Report the count to the Head RA", items=["Name anyone missing and where they were last seen."]),
         Node("step", "Hold your grade at the spot", items=["Quiet, together, until the all-clear."])],
        [Node("step", "Alarm sounds"),
         Node("step", "Sweep all three floors", items=["Every room, washroom and common area.", "Knock, open, look, close the door."]),
         Node("step", "Send stragglers to the nearest fire door"),
         Node("step", "Exit last, confirm the building is empty"),
         Node("step", "Head RA collects the four grade counts"),
         Node("decision", "Everyone accounted for?"),
         Node("step", "Dean gives the all-clear", items=["Or tells the fire department who is missing and where."])],
        [Node("step", "Alarm sounds"),
         Node("step", "Leave at once by the nearest fire door", items=["Close your door. Walk. No belongings."]),
         Node("step", "Cross to the parking lot"),
         Node("step", "Find your grade's RA and line up behind them"),
         Node("step", "Answer the roll call"),
         Node("step", "Wait for the all-clear", items=["Nobody re-enters until the Dean says so."])],
    ]
    avail = y - (M + 26)
    need = max(flow_height(col, colw, 0, gap=14) for col in cols) + 20
    s = min(1.0, avail / need)
    c.saveState()
    c.translate(M, y)
    c.scale(s, s)
    for x0, title, col in zip(xs, titles, cols):
        xr = (x0 - M) / s
        c.setFont(FB, 10.5)
        c.drawCentredString(xr + colw / 2, -8, title)
        c.setLineWidth(0.8); c.line(xr, -14, xr + colw, -14)
        f = Flow(c, xr, colw, xr + colw, 0, -22, gap=14)
        for n in col:
            if n.kind == "decision":
                n.no = "No"
            f.add(n)
    c.restoreState()
    ya = y - need * s - 10
    c.setLineWidth(1)
    after = [
        "The Dean releases the grades one at a time. Each RA walks their grade back to the building.",
        "The Head RA notes the time the building was empty, any door found propped open, and any floor that was slow, and reports it to the Dean.",
        "If anyone was unaccounted for, the Dean tells the fire department. Nobody on staff goes back inside to search.",
    ]
    lines_h = sum(len(simpleSplit(a, F, 9, PAGE_W - 2 * M - 24)) for a in after) * 11.2 + 26
    c.rect(M, ya - lines_h, PAGE_W - 2 * M, lines_h, stroke=1, fill=0)
    c.setFont(FB, 10); c.drawString(M + 8, ya - 14, "After the all-clear")
    bullets(c, M + 8, ya - 20, PAGE_W - 2 * M - 16, after, size=9, leading=11.2)
    c.showPage()

    # ---- page 3: building exits
    header(c, "Fire exits: three floors, two fire doors each", K, 3, total)
    y = PAGE_H - M - 50
    intro = ("Ryan Hall has three floors along one long hallway. Each hallway has a fire door at both ends. "
             "Go to whichever end is closer. The lobby doors on the main floor are a third way out for that floor only. "
             "Rooms in the drawing are schematic, not to scale.")
    y = text_block(c, M, y, PAGE_W - 2 * M, simpleSplit(intro, F, 9.5, PAGE_W - 2 * M), F, 9.5, 12) - 20
    floors = [("TOP FLOOR", False), ("MIDDLE (MAIN) FLOOR: lobby, monitor desk, front entrance", True), ("BOTTOM FLOOR", False)]
    bx, bw, bh, gap = M + 50, PAGE_W - 2 * M - 100, 96, 36
    for i, (name, main) in enumerate(floors):
        top = y - i * (bh + gap)
        c.setLineWidth(1.2)
        c.rect(bx, top - bh, bw, bh, stroke=1, fill=0)
        c.setFont(FB, 9); c.drawString(bx + 6, top - 12, name)
        # rooms along both sides of the hallway
        n_rooms = 10
        rw = (bw - 24) / n_rooms
        c.setLineWidth(0.5)
        for k in range(n_rooms):
            rx = bx + 12 + k * rw
            if main and 4 <= k <= 5:
                continue
            c.rect(rx + 2, top - 18 - 22, rw - 4, 22, stroke=1, fill=0)
            c.rect(rx + 2, top - bh + 6, rw - 4, 22, stroke=1, fill=0)
        # hallway
        hy = top - bh / 2 - 2
        c.setDash([2, 2]); c.line(bx + 12, hy, bx + bw - 12, hy); c.setDash([])
        c.setFont(FI, 7.5); c.drawString(bx + 16, hy - 10, "hallway")
        if main:
            lx = bx + 12 + 4 * rw + 2
            c.rect(lx, top - 18 - 22, 2 * rw - 4, 22, stroke=1, fill=0)
            c.setFont(FB, 7.5); c.drawCentredString(lx + rw - 2, top - 31, "LOBBY")
            c.setFont(F, 7); c.drawCentredString(lx + rw - 2, top - 39, "monitor desk")
            # front entrance arrow upward out of the lobby
            arrow(c, lx + rw - 2, top - 18, lx + rw - 2, top + 10)
            c.setFont(FB, 7.5); c.drawCentredString(lx + rw - 2, top + 13, "FRONT ENTRANCE / LOBBY DOORS")
        # fire doors at both ends
        for side in (-1, 1):
            ex = bx if side < 0 else bx + bw
            c.setLineWidth(2.5)
            c.line(ex, hy - 14, ex, hy + 14)
            c.setLineWidth(1)
            arrow(c, ex, hy, ex + side * 34, hy)
            c.setFont(FB, 8)
            tx = ex + side * 38
            if side < 0:
                c.drawRightString(tx, hy + 10, "FIRE"); c.drawRightString(tx, hy - 1, "DOOR")
            else:
                c.drawString(tx, hy + 10, "FIRE"); c.drawString(tx, hy - 1, "DOOR")
    y2 = y - 3 * (bh + gap) + gap - 24
    rules = [
        "Nearest exit wins. Do not walk past a fire door to use the lobby.",
        "Fire doors stay closed and never propped open. They hold back smoke.",
        "Keep hallways and the area inside every fire door clear: no shoes, bags, laundry or furniture.",
        "Once you are out, keep moving: the next person out needs the door.",
        "Walking route from any fire door: along the outside of the building to the front, then across Kingsway College Dr to the parking lot.",
    ]
    c.setFont(FB, 10.5); c.drawString(M, y2, "Exit rules"); y2 -= 14
    bullets(c, M, y2, PAGE_W - 2 * M, rules, size=9.5, leading=12.5)
    c.showPage()

    # ---- page 4: muster point on the aerial photo
    header(c, "Muster point: the lot across the road", K, 4, total)
    y = PAGE_H - M - 50
    intro = ("Aerial view of Ryan Hall and the parking lot across Kingsway College Dr. The garbage can at the end of "
             "the parking spaces is the anchor. The RAs stand in a row in front of the parking spaces, facing the "
             "dorm, about 10 feet apart: Grade 9 at the can, then 10, 11 and 12 to the left. Both Grade 12 RAs share "
             "the 12 spot. Each grade lines up in one line behind its RA, away from the dorm. Nobody stands in the "
             "parking stalls or on the road.")
    y = text_block(c, M, y, PAGE_W - 2 * M, simpleSplit(intro, F, 9.5, PAGE_W - 2 * M), F, 9.5, 12) - 10
    avail_h = y - (M + 26)
    scale = min((PAGE_W - 2 * M - 150) / img_w, avail_h / img_h)
    dw, dh = img_w * scale, img_h * scale
    ix = M
    c.drawImage(ImageReader(annotated), ix, y - dh, dw, dh)
    c.setLineWidth(1); c.rect(ix, y - dh, dw, dh, stroke=1, fill=0)
    # legend to the right
    lx = ix + dw + 12
    ly = y - 4
    c.setFont(FB, 10); c.drawString(lx, ly - 10, "Legend"); ly -= 26
    items = [
        ("route", "Walking route from the front entrance, across the road, to the muster point"),
        ("can", "Garbage can: the muster point anchor. Grade 9 lines up here."),
        ("circle", "RA position, facing the dorm. The number is the grade the RA is responsible for."),
        ("line", "Where that grade's students line up: a single line behind their RA, away from the dorm"),
    ]
    lw = PAGE_W - M - lx
    for kind, desc in items:
        if kind == "route":
            c.setLineWidth(4); c.line(lx, ly - 6, lx + 26, ly - 6)
            c.setLineWidth(1.5); c.setStrokeColorRGB(*WHITE); c.line(lx + 1, ly - 6, lx + 25, ly - 6); c.setStrokeColorRGB(*BLACK)
        elif kind == "can":
            c.setFillColorRGB(*BLACK); c.rect(lx + 7, ly - 12, 12, 12, stroke=0, fill=1); c.setFillColorRGB(*BLACK)
        elif kind == "circle":
            c.setLineWidth(1.5); c.circle(lx + 13, ly - 6, 8, stroke=1, fill=0)
            c.setFont(FB, 8); c.drawCentredString(lx + 13, ly - 9, "9")
        else:
            c.setLineWidth(3); c.line(lx, ly - 6, lx + 26, ly - 6)
        c.setLineWidth(1)
        lines = simpleSplit(desc, F, 8.5, lw - 34)
        text_block(c, lx + 32, ly, lw - 34, lines, F, 8.5, 10.5)
        ly -= max(len(lines) * 10.5, 14) + 10
    ly -= 6
    c.setFont(FB, 9); c.drawString(lx, ly, "Order from the can, going left"); ly -= 14
    for g in ["1.  Grade 9 RA (at the can)", "2.  Grade 10 RA", "3.  Grade 11 RA", "4.  Grade 12, both RAs, one line"]:
        c.setFont(F, 9); c.drawString(lx + 4, ly, g); ly -= 13
    ly -= 8
    note = ("\"Left\" means left as you stand in the lot facing the dorm. The photo was taken on a different day; cars "
            "will not be where they are shown. The garbage can and the parking spaces are the landmarks. Map imagery: Google.")
    text_block(c, lx, ly, lw, simpleSplit(note, FI, 7.5, lw), FI, 7.5, 9.5)
    c.showPage()

    # ---- page 5: lineup schematic + RA assignments
    header(c, "Grade lineup at the muster point", K, 5, total)
    y = PAGE_H - M - 50
    intro = ("Not to scale. You are looking down at the lot with the dorm at the top. The RAs stand in a row in front "
             "of the parking spaces, facing the dorm, about 10 feet apart: Grade 9 at the garbage can and the rest to the "
             "left. Both Grade 12 RAs stand at the 12 spot and all Grade 12s make one line. Each grade stands in a single "
             "line behind its RA, so the RA turns around and takes the roll down the line.")
    y = text_block(c, M, y, PAGE_W - 2 * M, simpleSplit(intro, F, 9.5, PAGE_W - 2 * M), F, 9.5, 12) - 14
    # schematic frame
    fx, fw = M, PAGE_W - 2 * M
    fh = 330
    c.setLineWidth(1); c.rect(fx, y - fh, fw, fh, stroke=1, fill=0)
    # dorm, road and tree line hint at top
    c.setFont(FB, 8); c.drawCentredString(fx + fw / 2, y - 11, "RYAN HALL (across Kingsway College Dr)")
    c.setLineWidth(0.8)
    for k in range(0, int(fw), 14):
        c.circle(fx + k + 8, y - 24, 4, stroke=1, fill=0)
    c.setFont(FI, 7); c.drawString(fx + 6, y - 36, "tree line")
    # parking stalls along the tree line
    sx0, stall_w, stall_h = fx + 10, 30, 40
    c.setFont(F, 7)
    for k in range(13):
        sx = sx0 + k * stall_w
        c.rect(sx, y - 40 - stall_h, stall_w, stall_h, stroke=1, fill=0)
    c.drawString(sx0 + 2, y - 40 - stall_h - 9, "parking stalls (do not stand here)")
    # garbage can right after the stalls
    gx = sx0 + 13 * stall_w + 16
    gy = y - 40 - stall_h / 2
    c.setFillColorRGB(*BLACK); c.rect(gx - 7, gy - 7, 14, 14, stroke=0, fill=1); c.setFillColorRGB(*BLACK)
    c.setFont(FB, 8); c.drawString(gx + 12, gy - 3, "GARBAGE CAN"); c.setFont(F, 7.5); c.drawString(gx + 12, gy - 13, "(anchor)")
    # RA row in front of the stalls, Grade 9 under the can, the rest to the left
    row_y = y - 40 - stall_h - 34
    spacing = 84
    grades = [("9", "Grade 9"), ("10", "Grade 10"), ("11", "Grade 11"), ("12", "Grade 12 (one line)")]
    xs = [gx - i * spacing for i in range(4)]
    c.setLineWidth(1); c.setDash([3, 3]); c.line(gx, gy + 7, gx, row_y + 12); c.line(xs[-1], row_y, xs[0], row_y); c.setDash([])
    # "facing the dorm" arrow
    arrow(c, xs[-1] - 60, row_y - 12, xs[-1] - 60, row_y + 14)
    c.setFont(FI, 7); c.drawCentredString(xs[-1] - 60, row_y - 23, "RAs face"); c.drawCentredString(xs[-1] - 60, row_y - 32, "the dorm")
    for i, (x, (g, name)) in enumerate(zip(xs, grades)):
        # the grade's students in a single line behind the RA
        for k in range(9):
            sy = row_y - 30 - k * 16
            c.setLineWidth(0.7); c.rect(x - 4, sy - 4, 8, 8, stroke=1, fill=0)
        c.setLineWidth(1.5); c.setFillColorRGB(*WHITE)
        if g == "12":
            # both Grade 12 RAs at the one spot
            c.circle(x - 9, row_y, 12, stroke=1, fill=1)
            c.circle(x + 9, row_y, 12, stroke=1, fill=1)
            c.setFillColorRGB(*BLACK)
            c.setFont(FB, 10); c.drawCentredString(x - 9, row_y - 3.5, g); c.drawCentredString(x + 9, row_y - 3.5, g)
            c.setFont(FI, 7); c.drawCentredString(x, row_y + 16, "2 RAs")
        else:
            c.circle(x, row_y, 12, stroke=1, fill=1)
            c.setFillColorRGB(*BLACK)
            c.setFont(FB, 10); c.drawCentredString(x, row_y - 3.5, g)
        c.setFont(FB, 7.5); c.drawCentredString(x, row_y - 30 - 9 * 16 + 2, name)
        c.setFont(F, 7); c.drawCentredString(x, row_y - 30 - 9 * 16 - 8, "students")
        if i < 3:
            c.setFont(FI, 7); c.drawCentredString((x + xs[i + 1]) / 2, row_y + 16, "10 ft")
    c.setFont(F, 8); c.drawString(fx + 6, y - fh + 8, "open parking lot (rest of the lot)")
    # RA assignment table
    ty = y - fh - 22
    c.setFont(FB, 10.5); c.drawString(M, ty, "RA positions this year (fill in, post on the monitor desk)"); ty -= 10
    c.setLineWidth(0.6)
    heads = ["Position", "Grade", "RA name", "Floor they cover", "Backup if that RA is away"]
    cw = [52, 44, 150, 110, PAGE_W - 2 * M - 356]
    rows2 = [("1 (at can)", "9"), ("2 (left)", "10"), ("3", "11"), ("4 (far left)", "12"), ("4 (far left)", "12")]
    rh = 20
    x = M
    c.setFillColorRGB(*BLACK); c.rect(M, ty - rh, PAGE_W - 2 * M, rh, stroke=0, fill=1); c.setFillColorRGB(*WHITE)
    c.setFont(FB, 8.5)
    for h, w in zip(heads, cw):
        c.drawString(x + 4, ty - 13, h); x += w
    c.setFillColorRGB(*BLACK)
    for pos, g in rows2:
        ty -= rh
        c.rect(M, ty - rh, PAGE_W - 2 * M, rh, stroke=1, fill=0)
        x = M
        c.setFont(F, 9)
        c.drawString(x + 4, ty - rh + 6, pos); x += cw[0]
        c.drawString(x + 4, ty - rh + 6, g); x += cw[1]
        for w in cw[1:]:
            c.line(x, ty, x, ty - rh)
            x += w
    c.showPage()
    c.save()
    os.remove(annotated)


if __name__ == "__main__":
    roles_pdf(os.path.join(HERE, "Ryan-Hall-Roles-and-Responsibilities.pdf"))
    fire_pdf(os.path.join(HERE, "Ryan-Hall-Fire-Drill-Plan.pdf"), os.path.join(HERE, "aerial-ryan-hall-lot.jpg"))
    print("done")
