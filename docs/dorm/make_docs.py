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

    def box(cx, cy, w, h, title, sub, bold=True):
        c.setLineWidth(1.2); c.setFillColorRGB(*WHITE)
        c.rect(cx - w / 2, cy - h / 2, w, h, stroke=1, fill=1)
        c.setFillColorRGB(*BLACK)
        c.setFont(FB, 11); c.drawCentredString(cx, cy + 4, title)
        c.setFont(F, 8); c.drawCentredString(cx, cy - 8, sub)

    cxm = PAGE_W / 2
    bw, bh = 150, 38
    y_dean, y_hra, y_mid, y_jan = y - 24, y - 94, y - 164, y - 234
    box(cxm, y_dean, bw, bh, "Deans", "run the dorm; final say on everything")
    box(cxm, y_hra, bw, bh, "Head RA", "organizes RAs and Monitors; night check")
    x_ra, x_mon = cxm - 150, cxm + 150
    box(x_ra, y_mid, bw, bh, "RAs", "one floor each; worship, study hall, room check")
    box(x_mon, y_mid, bw, bh, "Monitors", "front desk; supervise work periods")
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
    # dashed: Head RA audits janitors' cleaning
    c.setDash([3, 2.5]); c.setLineWidth(0.8)
    c.line(cxm - bw / 2, y_hra - 6, cxm - 110, y_hra - 6)
    c.line(cxm - 110, y_hra - 6, cxm - 110, y_jan)
    arrow(c, cxm - 110, y_jan, x_mon - bw / 2, y_jan)
    c.setFont(FI, 7.5)
    c.drawString(cxm - 108, y_jan + 4, "audits the cleaning")
    # dashed: Deans <-> Monitors (watch the dorm when the Dean is away)
    c.line(cxm + bw / 2, y_dean - 6, x_mon + bw / 2 + 24, y_dean - 6)
    c.line(x_mon + bw / 2 + 24, y_dean - 6, x_mon + bw / 2 + 24, y_mid)
    arrow(c, x_mon + bw / 2 + 24, y_mid, x_mon + bw / 2, y_mid)
    c.saveState(); c.translate(x_mon + bw / 2 + 36, y_mid + 16); c.rotate(90)
    c.drawString(0, 0, "watch the dorm when the Dean is away"); c.restoreState()
    c.setDash([]); c.setLineWidth(1)

    # legend
    ly = y_jan - 48
    c.setFont(FB, 9); c.drawString(M, ly, "Reading the flowcharts")
    ly -= 16
    items = [
        ("start", "Start / end of a shift or routine"),
        ("step", "A task block: the heading is the job, the bullets are what \"done\" means"),
        ("decision", "A question. Follow \"Yes\" to the right, \"No\" straight down"),
        ("note", "A standing rule that applies the whole time, not a step in the sequence"),
    ]
    x = M
    for kind, desc in items:
        n = Node(kind, {"start": "Start", "step": "Task", "decision": "Question?", "note": "Rule"}[kind])
        w = 70
        h = measure(n, w) if kind != "step" else 24
        if kind == "step":
            c.rect(x, ly - h + 4, w, h, stroke=1, fill=0)
            c.setFont(FB, 9); c.drawCentredString(x + w / 2, ly - 8, "Task")
        else:
            draw_node(c, n, x, ly + 4, w, h)
        c.setFont(F, 8.5)
        c.drawString(x + w + 8, ly - 8, desc)
        ly -= max(h, 30) + 6

    # quick reference table
    ty = ly - 10
    c.setFont(FB, 9); c.drawString(M, ty, "Quick reference")
    ty -= 10
    rows = [
        ("Role", "Core job in one line", "Answers to"),
        ("Deans", "Run Ryan Hall. Set the rules, handle discipline, lead drills, receive every report.", "School"),
        ("Head RA", "Night facilities check; organize the RAs; make sure Monitors and janitors do their jobs.", "Deans"),
        ("RAs", "Worship, study hall and room checks on their floor; peace, safety and well-being of their boys.", "Head RA, Deans"),
        ("Monitors", "Front desk: packages, visitors, sign-in, lobby. During work periods: supervise the janitors.", "Head RA, Deans"),
        ("Janitors", "Keep the dorm clean: washrooms, floors, garbage, anything that needs cleaning.", "Monitor on duty"),
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
    c.rect(M, ty, PAGE_W - 2 * M, (ly - 20) - ty, stroke=1, fill=0)


def roles_pdf(path):
    c = canvas.Canvas(path, pagesize=letter)
    c.setTitle("Ryan Hall: Roles and Responsibilities")
    c.setAuthor("Ryan Hall, Kingsway College")
    total = 6

    # ---- cover / org chart
    org_chart_page(c, 1, total)
    c.showPage()

    # ---- Janitors
    janitors = [
        Node("start", "Work period begins. Sign in with the Monitor on duty."),
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
        Node("step", "Report to the Monitor on duty", items=[
            "Walk the Monitor through what was done.",
            "Report anything broken or running low (toilet paper, soap, cleaning supplies) so the Head RA can restock it.",
        ]),
        Node("end", "Monitor signs off on the work period."),
    ]
    draw_flow_page(c, "Janitors", "the Monitor on duty during the work period. The Head RA audits the cleaning.",
                   None, janitors, 2, total,
                   intro="The janitors keep the dorm clean. A work period is not finished when the time is up; it is "
                         "finished when the Monitor has checked the work.")
    c.showPage()

    # ---- Monitors
    monitors = [
        Node("start", "Monitor shift begins. Sign in at the monitor desk."),
        Node("decision", "Is this a work period?", join_after=3,
             side=Node("step", "Supervise the janitors", items=[
                 "Confirm every scheduled janitor shows up, on time. Write down who did not.",
                 "Confirm each janitor knows their tasks for the period.",
                 "When they report done, check it yourself: toilet paper refilled, toilets unclogged, urinals fixed, washrooms clean, floors vacuumed and mopped, garbage out.",
                 "Do not sign off until the work is actually done.",
                 "Report no-shows and unfinished work to the Head RA.",
             ])),
        Node("step", "Lobby and front desk", items=[
            "Keep the lobby clean and organized.",
            "Keep the lobby noise down.",
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
        Node("decision", "A problem you cannot handle from the desk?",
             side=Node("step", "Escalate", items=[
                 "Call the Dean on duty.",
                 "If the Dean cannot be reached, call the Head RA.",
                 "Emergency: call 911 first, then the Dean.",
             ])),
        Node("end", "Shift ends. Hand over to the next Monitor and note anything unusual."),
    ]
    draw_flow_page(c, "Monitors", "the Head RA, and the Dean on duty.", "the janitors during work periods",
                   monitors, 3, total,
                   intro="A Monitor's job depends on the shift. During a work period the Monitor supervises the "
                         "janitors. On every other shift the Monitor runs the front desk and watches the dorm.")
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
        Node("step", "Worship check", sub="Default time 7:30 PM. The Deans set the real times.", items=[
            "Take attendance of your floor at worship.",
            "Mark each boy present, late or absent, and note why.",
        ]),
        Node("step", "Study hall check", sub="Default time 8:30 PM.", items=[
            "Confirm every boy on your floor is in study hall, quiet and on task.",
            "Record lates and absences.",
        ]),
        Node("step", "Room check", sub="Default time 10:00 PM.", items=[
            "Visit every room on your floor. Every boy in his own room and accounted for.",
            "Note lates, absences and dirty rooms.",
            "Settle the floor for the night.",
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
                   ras, 4, total,
                   intro="Each RA is responsible for one floor and, during drills, for one grade. The three checks "
                         "are the backbone of the night; the standing rules on the right apply the whole time.")
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
    draw_flow_page(c, "Head RA: the nightly routine", "the Deans.", "the RAs, the Monitors and, through them, the janitors",
                   hra_night, 5, total,
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
        ]),
        Node("step", "Supervise the Monitors", items=[
            "Monitors are at the desk for their shifts and the sign-in rules are enforced.",
            "During work periods: the Monitors are actually watching the janitors and checking the work, not just signing it off.",
        ]),
        Node("step", "Audit the cleaning", items=[
            "Every so often, walk the dorm yourself: washrooms, floors, lobby, garbage.",
            "Compare what you see with what the Monitor signed off.",
        ], side=Node("note", "Why audit?", items=[
            "The janitors answer to the Monitors, and the Monitors answer to you. The audit is how you know both layers are working.",
        ])),
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
    draw_flow_page(c, "Head RA: organizing the team", "the Deans.", "the RAs, the Monitors and, through them, the janitors",
                   hra_team, 6, total,
                   intro="Beyond the nightly check, the Head RA keeps the whole staff working: RAs doing their checks, "
                         "Monitors watching the janitors, and the dorm actually getting cleaned.")
    c.save()


# --------------------------------------------------------------------------- fire drill document
def annotate_aerial(src, dst):
    """Mark the evacuation route, the muster point and the five RA positions on the aerial photo."""
    im = Image.open(src).convert("RGB")
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
    outlined((gx - 46, gy - 26), "Garbage can", med, anchor="rm")
    outlined((gx - 46, gy + 16), "= muster point", med, anchor="rm")

    # five RA positions in a line away from the trees, 10 ft apart (scale is about 13 px per foot)
    positions = [("9", 1520), ("10", 1650), ("11", 1780), ("12", 1910), ("12", 2040)]
    d.line([(gx, gy + 32), (gx, 2070)], fill="black", width=10)
    d.line([(gx, gy + 32), (gx, 2070)], fill="white", width=4)
    r = 50
    for label, py in positions:
        # grade line runs left from the RA, into the wide open part of the lot
        d.line([(gx - r - 12, py), (gx - r - 300, py)], fill="black", width=16)
        d.line([(gx - r - 12, py), (gx - r - 300, py)], fill="white", width=7)
        outlined((gx - r - 20, py - 18), f"Grade {label} students", med, anchor="rb")
        d.ellipse((gx - r, py - r, gx + r, py + r), fill="white", outline="black", width=7)
        d.text((gx, py + 2), label, font=big, fill="black", anchor="mm")
    outlined((gx + r + 18, 1690), "RAs", big, anchor="lm")
    outlined((gx + r + 18, 1745), "10 ft", med, anchor="lm")
    outlined((gx + r + 18, 1790), "apart", med, anchor="lm")
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
        "Outside, move away from the building and go straight to the muster point: the parking lot across Kingsway College Dr, at the garbage can (see page 4).",
        "Find your grade's RA and line up with your grade. Answer the roll call.",
        "Stay at the muster point. Nobody goes back into the building until the Dean gives the all-clear.",
        "If you think someone is still inside, tell your RA or the Dean. Never go back in to look.",
    ]
    y = numbered(c, M, y - 6, PAGE_W - 2 * M, steps)
    y -= 14
    c.setFont(FB, 12); c.drawString(M, y, "Who does what"); y -= 12
    rows = [
        ("RAs", "Go straight outside to your grade's designated spot. Line up your grade, take the roll against your floor list, and report the count (and any missing name) to the Head RA. Keep your grade together and quiet until the all-clear."),
        ("Head RA", "Sweep the building with the Deans: every room, washroom and common area on all three floors. Exit last. At the muster point, collect the counts from the five RAs and report \"all clear\" or the missing names to the Dean."),
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
         Node("step", "Go to your grade's spot", items=["Garbage can first: Grade 9, then 10, 11, 12, 12."]),
         Node("step", "Line up your grade and take the roll", items=["Check against your floor list."]),
         Node("step", "Report the count to the Head RA", items=["Name anyone missing and where they were last seen."]),
         Node("step", "Hold your grade at the spot", items=["Quiet, together, until the all-clear."])],
        [Node("step", "Alarm sounds"),
         Node("step", "Sweep all three floors", items=["Every room, washroom and common area.", "Knock, open, look, close the door."]),
         Node("step", "Send stragglers to the nearest fire door"),
         Node("step", "Exit last, confirm the building is empty"),
         Node("step", "Head RA collects the five RA counts"),
         Node("decision", "Everyone accounted for?"),
         Node("step", "Dean gives the all-clear", items=["Or tells the fire department who is missing and where."])],
        [Node("step", "Alarm sounds"),
         Node("step", "Leave at once by the nearest fire door", items=["Close your door. Walk. No belongings."]),
         Node("step", "Cross to the parking lot"),
         Node("step", "Find your grade's RA and line up"),
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
        c.setFont(FI, 7.5); c.drawString(bx + 16, hy + 3, "hallway")
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
             "the parked-car row is the anchor. The five RAs stand in a line starting at the can and running away "
             "from the trees into the open lot, about 10 feet apart, in grade order. Each grade lines up in a single "
             "line beside its RA, toward the wide open part of the lot. Nobody stands in the parking stalls or on the road.")
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
        ("circle", "RA position. The number is the grade the RA is responsible for."),
        ("line", "Where that grade's students line up: a single line beside their RA, running into the open lot"),
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
    c.setFont(FB, 9); c.drawString(lx, ly, "Order from the can"); ly -= 14
    for g in ["1.  Grade 9 RA", "2.  Grade 10 RA", "3.  Grade 11 RA", "4.  Grade 12 RA (A)", "5.  Grade 12 RA (B)"]:
        c.setFont(F, 9); c.drawString(lx + 4, ly, g); ly -= 13
    ly -= 8
    note = ("The photo was taken on a different day; cars will not be where they are shown. The garbage can and the "
            "tree line are the landmarks. Map imagery: Google.")
    text_block(c, lx, ly, lw, simpleSplit(note, FI, 7.5, lw), FI, 7.5, 9.5)
    c.showPage()

    # ---- page 5: lineup schematic + RA assignments
    header(c, "Grade lineup at the muster point", K, 5, total)
    y = PAGE_H - M - 50
    intro = ("Not to scale. The parked-car row and the trees are at the top; the open lot is below and to the left. "
             "The RAs form a straight line out from the garbage can, spaced out so the grade lines do not mix. "
             "Students stand in a single line beside their RA, facing the RA, so the roll can be taken quickly.")
    y = text_block(c, M, y, PAGE_W - 2 * M, simpleSplit(intro, F, 9.5, PAGE_W - 2 * M), F, 9.5, 12) - 14
    # schematic frame
    fx, fw = M, PAGE_W - 2 * M
    fh = 330
    c.setLineWidth(1); c.rect(fx, y - fh, fw, fh, stroke=1, fill=0)
    # tree line + road hint at top
    c.setFont(FI, 8); c.drawString(fx + 6, y - 11, "Kingsway College Dr  /  tree line  (Ryan Hall is on the far side of the road)")
    c.setLineWidth(0.8)
    for k in range(0, int(fw), 14):
        c.circle(fx + k + 8, y - 24, 4, stroke=1, fill=0)
    # parking stalls along the tree line
    sx0, stall_w, stall_h = fx + 10, 26, 44
    c.setFont(F, 7)
    for k in range(13):
        sx = sx0 + k * stall_w
        c.rect(sx, y - 34 - stall_h, stall_w, stall_h, stroke=1, fill=0)
    c.drawString(sx0 + 2, y - 34 - stall_h - 9, "parking stalls (do not stand here)")
    # garbage can right after the stalls
    gx = sx0 + 13 * stall_w + 18
    gy = y - 34 - stall_h / 2
    c.setFillColorRGB(*BLACK); c.rect(gx - 7, gy - 7, 14, 14, stroke=0, fill=1); c.setFillColorRGB(*BLACK)
    c.setFont(FB, 8); c.drawString(gx + 12, gy - 3, "GARBAGE CAN (anchor)")
    # RA positions down from the can
    c.setLineWidth(1); c.setDash([3, 3]); c.line(gx, gy + 10, gx, y - fh + 20); c.setDash([])
    grades = [("9", "Grade 9 RA"), ("10", "Grade 10 RA"), ("11", "Grade 11 RA"), ("12", "Grade 12 RA (A)"), ("12", "Grade 12 RA (B)")]
    py = gy - 44
    for i, (g, name) in enumerate(grades):
        c.setLineWidth(1.5); c.setFillColorRGB(*WHITE)
        c.circle(gx, py, 12, stroke=1, fill=1)
        c.setFillColorRGB(*BLACK)
        c.setFont(FB, 10); c.drawCentredString(gx, py - 3.5, g)
        c.setFont(FB, 8); c.drawString(gx + 18, py - 3, name)
        # student line: small squares running left from the RA into the open lot
        for k in range(14):
            sqx = gx - 24 - 8 - k * 15
            c.setLineWidth(0.7); c.rect(sqx, py - 4, 8, 8, stroke=1, fill=0)
        c.setFont(FI, 7.5); c.drawRightString(gx - 24 - 8 - 13 * 15 - 6, py - 3, f"grade {g} students, single line")
        if i < 4:
            c.setFont(FI, 7); c.drawString(gx + 4, py - 32, "about 10 ft")
        py -= 50
    c.setFont(F, 8); c.drawString(fx + 6, y - fh + 8, "open parking lot")
    # RA assignment table
    ty = y - fh - 22
    c.setFont(FB, 10.5); c.drawString(M, ty, "RA positions this year (fill in, post on the monitor desk)"); ty -= 10
    c.setLineWidth(0.6)
    heads = ["Position", "Grade", "RA name", "Floor they cover", "Backup if that RA is away"]
    cw = [52, 44, 150, 110, PAGE_W - 2 * M - 356]
    rows2 = [("1 (at can)", "9"), ("2", "10"), ("3", "11"), ("4", "12"), ("5", "12")]
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
