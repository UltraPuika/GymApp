"""Extract lift history, the current training block and running data from the workbook into web/seed-data.js.

Usage: python tools/import_excel.py [path/to/Gym.xlsx]
"""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
DEFAULT_XLSX = Path.home() / "Downloads" / "Gym.xlsx"
OUT = Path(__file__).resolve().parent.parent / "web" / "seed-data.js"

KINDS = ["Warm-up", "TOP", "Back-off"]

# Heavy single + back-off block that started 06.10.2026: one row per week (undated rows = planned weeks).
CURRENT_BLOCK = {
    "name": "Heavy single + back-offs",
    "start": "2026-10-06",
    "lifts": [
        ("Squat", ["M", "N", "O"], 34, 37),
        ("Bench Press", ["H", "I", "J"], 14, 17),
        ("Deadlift", ["H", "I", "J"], 34, 37),
        ("Overhead Press", ["R", "S", "T"], 14, 17),
        ("Pull-ups", ["M", "N", "O"], 14, 17),
    ],
}

# (lift, date col, [warm-up, top, back-off] cols, first row, last row, year of the last dated row)
LOG_BLOCKS = [
    ("Bench Press", "G", ["H", "I", "J"], 4, 17, 2026),
    ("Pull-ups", "L", ["M", "N", "O"], 4, 17, 2026),
    ("Overhead Press", "Q", ["R", "S", "T"], 4, 17, 2026),
    ("Deadlift", "G", ["H", "I", "J"], 24, 37, 2026),
    ("Squat", "L", ["M", "N", "O"], 24, 37, 2026),
    ("Deadlift", "G", ["H", "I", "J"], 146, 191, 2026),
    ("Bench Press", "L", ["M", "N", "O"], 146, 191, 2026),
    ("Squat", "Q", ["R", "S", "T"], 146, 191, 2026),
    ("Pull-ups", "V", ["W", "X", "Y"], 146, 191, 2026),
    ("Overhead Press", "AA", ["AB", "AC", "AD"], 146, 191, 2026),
]
# RPE sheet AJ5:BF69 — 2024 into 2025. (lift, date col, set cols, first row, last row, year of the first row)
# Rows 70+ are broken (#REF!) copies and are skipped. AY/BF in GYM v2 duplicate the first rows here.
RPE_BLOCKS = [
    ("Deadlift", "AJ", ["AK", "AL", "AM"], 5, 69, 2024),
    ("Squat", "AP", ["AQ", "AR", "AS"], 5, 69, 2024),
    ("Bench Press", "BC", ["BD", "BE", "BF"], 5, 40, 2024),
]
# Pull-ups: AW..AZ are reps (bodyweight + current added load); "+20" notes in BA/BB change the load.
RPE_PULLUPS = ("Pull-ups", "AV", ["AW", "AX", "AY", "AZ"], ["BA", "BB"], 6, 71, 2024)
# Obvious date typos in the sheets.
DATE_FIXES = {
    ("sheet1", "V", 166): "16.12", ("sheet1", "AA", 151): "16.12",
    ("sheet3", "AJ", 15): "08.04", ("sheet3", "AJ", 16): "16.04", ("sheet3", "AJ", 17): "22.04",
    ("sheet3", "AP", 25): "28.06",
    ("sheet2", "C", 44): "29.03.2025",
}

# "Half marathon" sheet: plan I6:L15 (Mon easy / Wed tempo / Sat long) and the run log B37:G47.
RUN_PLAN = {"name": "Half marathon", "start": "2025-03-10", "rows": (6, 15),
            "slots": [("J", 0, "Easy"), ("K", 2, "Tempo"), ("L", 5, "Long")]}
RUN_LOG = (37, 47)
RUN_ORDER = ["Easy", "Tempo", "Long"]  # run type by position within a logged week


def load_sheet(xlsx: Path, sheet: str) -> dict:
    z = zipfile.ZipFile(xlsx)
    shared = [
        "".join(t.text or "" for t in si.iter(NS + "t"))
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(NS + "si")
    ]
    cells = {}
    for c in ET.fromstring(z.read(f"xl/worksheets/{sheet}.xml")).iter(NS + "c"):
        v = c.find(NS + "v")
        if v is None or v.text is None:
            continue
        col, row = re.match(r"([A-Z]+)(\d+)", c.get("r")).groups()
        cells[(col, int(row))] = shared[int(v.text)] if c.get("t") == "s" else v.text
    return cells


def parse_sets(raw: str):
    """'10x90' -> (1,10,90); '3x6x160' -> (3,6,160); '7(8)x65' -> (1,7,65); '-' -> None."""
    raw = raw.strip().replace(",", ".")
    if not raw or raw == "-":
        return None
    parts = [re.sub(r"\(.*?\)", "", p) for p in raw.lower().split("x")]
    try:
        nums = [float(p) for p in parts]
    except ValueError:
        return None
    if len(nums) == 2:
        return 1, int(nums[0]), nums[1]
    if len(nums) == 3:
        return int(nums[0]), int(nums[1]), nums[2]
    return None


def parse_day_month(text: str):
    m = re.match(r"(\d{1,2})\.(\d{1,2})(?!\d)", text.strip())
    return (int(m.group(1)), int(m.group(2))) if m else None


def _gap(a, b):
    return (a[0] - b[0]) * 30 + (a[1] - b[1])


def assign_years(dated_rows, last_year):
    """Walk bottom-up; a date >60 days later in the year than the row below means we crossed into the previous year.
    Smaller inversions are typos in the sheet and keep the year."""
    out, year, prev = {}, last_year, None
    for row, (d, m) in reversed(dated_rows):
        if prev and _gap((m, d), prev) > 60:
            year -= 1
        out[row] = f"{year:04d}-{m:02d}-{d:02d}"
        prev = (m, d)
    return out


def assign_years_forward(dated_rows, first_year):
    out, year, prev = {}, first_year, None
    for row, (d, m) in dated_rows:
        if prev and _gap(prev, (m, d)) > 60:
            year += 1
        out[row] = f"{year:04d}-{m:02d}-{d:02d}"
        prev = (m, d)
    return out


def rows_with_dates(cells, sheet, date_col, first, last):
    dated = []
    for r in range(first, last + 1):
        dm = parse_day_month(DATE_FIXES.get((sheet, date_col, r), cells.get((date_col, r), "")))
        if dm:
            dated.append((r, dm))
    return dated


def extract_gym_v2(cells):
    history = []
    for lift, date_col, cols, first, last, year in LOG_BLOCKS:
        dates = assign_years(rows_with_dates(cells, "sheet1", date_col, first, last), year)
        for r, date in dates.items():
            for col in cols:
                parsed = parse_sets(cells.get((col, r), ""))
                if parsed:
                    history.append({"date": date, "lift": lift, "n": parsed[0], "reps": parsed[1], "w": parsed[2]})
    return history


def extract_current_block(cells):
    lifts = []
    for lift, cols, first, last in CURRENT_BLOCK["lifts"]:
        weeks = []
        for r in range(first, last + 1):
            sets = [parse_sets(cells.get((c, r), "")) for c in cols]
            weeks.append({"sets": [{"n": s[0], "reps": s[1], "w": s[2]} for s in sets if s]})
        lifts.append({"lift": lift, "plan": weeks})
    return {"name": CURRENT_BLOCK["name"], "start": CURRENT_BLOCK["start"], "weeks": len(lifts[0]["plan"]), "lifts": lifts}


def extract_rpe_sheet(cells):
    history = []
    for lift, date_col, cols, first, last, year in RPE_BLOCKS:
        dates = assign_years_forward(rows_with_dates(cells, "sheet3", date_col, first, last), year)
        for r, date in dates.items():
            for col in cols:
                raw = cells.get((col, r), "")
                parsed = parse_sets(raw)
                if parsed:
                    history.append({"date": date, "lift": lift, "n": parsed[0], "reps": parsed[1], "w": parsed[2]})

    lift, date_col, rep_cols, note_cols, first, last, year = RPE_PULLUPS
    dates = assign_years_forward(rows_with_dates(cells, "sheet3", date_col, first, last), year)
    added = 0.0
    for r in range(first, last + 1):
        for col in note_cols:
            m = re.fullmatch(r"\+(\d+(?:\.\d+)?)\s*(kg)?", cells.get((col, r), "").strip())
            if m:
                added = float(m.group(1))
        if r not in dates:
            continue
        reps_only = [cells.get((c, r), "").strip() for c in rep_cols]
        nums = [int(float(v)) for v in reps_only if re.fullmatch(r"\d+(\.0)?", v)]
        # Until row 28 the 4th column is the SUM of the three sets, not a set.
        skip_sum = len(nums) == 4 and nums[3] == sum(nums[:3])
        for i, col in enumerate(rep_cols):
            raw = cells.get((col, r), "").strip()
            parsed = parse_sets(raw) if "x" in raw else None
            if parsed:
                history.append({"date": dates[r], "lift": lift, "n": parsed[0], "reps": parsed[1], "w": parsed[2]})
            elif re.fullmatch(r"\d+(\.0)?", raw) and not (skip_sum and i == 3):
                # Plain numbers are reps; 'b' (band) and '*' cells are skipped.
                history.append({"date": dates[r], "lift": lift, "n": 1, "reps": int(float(raw)), "w": added})
    return history


def parse_duration(raw: str):
    """'35:40' -> 2140 s, '1:07:21' -> 4041 s, Excel day fraction '0.0551' -> seconds."""
    raw = raw.strip()
    if ":" in raw:
        sec = 0
        for part in raw.split(":"):
            sec = sec * 60 + int(part)
        return sec
    return round(float(raw) * 86400) if raw else None


def extract_runs(cells):
    runs, pos = [], 0
    for r in range(RUN_LOG[0], RUN_LOG[1] + 1):
        if cells.get(("B", r)):
            pos = 0  # new week
        m = re.fullmatch(r"(\d{2})\.(\d{2})\.(\d{4})", DATE_FIXES.get(("sheet2", "C", r), cells.get(("C", r), "")).strip())
        if not m:
            continue
        hr = cells.get(("F", r))
        runs.append({
            "date": f"{m.group(3)}-{m.group(2)}-{m.group(1)}", "type": RUN_ORDER[min(pos, 2)],
            "km": float(cells[("D", r)].replace(",", ".")), "sec": parse_duration(cells.get(("G", r), "")),
            "hr": int(float(hr)) if hr else None,
        })
        pos += 1
    return runs


def extract_run_plan(cells):
    weeks = []
    for r in range(RUN_PLAN["rows"][0], RUN_PLAN["rows"][1] + 1):
        week = []
        for col, day, default_type in RUN_PLAN["slots"]:
            text = cells.get((col, r), "").strip()
            m = re.search(r"(\d+(?:[.,]\d+)?)\s*km", text)
            if not m:
                continue
            low = text.lower()
            kind = "Race" if low.startswith("race") else "Easy" if " easy" in low[:12] else default_type
            note = re.sub(r"^\d+(?:[.,]\d+)?\s*km\s*", "", text) if not low.startswith("race") else text
            week.append({"day": day, "type": kind, "km": float(m.group(1).replace(",", ".")), "note": note})
        weeks.append(week)
    return {"name": RUN_PLAN["name"], "start": RUN_PLAN["start"], "weeks": weeks}


def main():
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    gym = load_sheet(xlsx, "sheet1")
    history = extract_gym_v2(gym) + extract_rpe_sheet(load_sheet(xlsx, "sheet3"))
    history.sort(key=lambda h: (h["date"], h["lift"]))
    block = extract_current_block(gym)
    running = load_sheet(xlsx, "sheet2")
    runs, run_plan = extract_runs(running), extract_run_plan(running)
    OUT.write_text(
        "// Generated by tools/import_excel.py — do not edit by hand.\n"
        f"const SEED_HISTORY = {json.dumps(history, separators=(',', ':'))};\n"
        f"const SEED_BLOCK = {json.dumps(block, indent=1)};\n"
        f"const SEED_RUNS = {json.dumps(runs)};\n"
        f"const SEED_RUN_PLAN = {json.dumps(run_plan, ensure_ascii=False)};\n",
        encoding="utf-8",
    )
    print(f"{len(history)} history sets; current block: {len(block['lifts'])} lifts x {block['weeks']} weeks; "
          f"{len(runs)} runs; run plan {len(run_plan['weeks'])} weeks -> {OUT}")


if __name__ == "__main__":
    main()
