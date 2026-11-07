// ================= Storage =================
// Inside the Android app data goes to its SQLite database (AndroidDb bridge); in a browser to localStorage.
const storage = window.AndroidDb ?? localStorage;
const STORE = "gymlog-db";
const SCHEMA = 6;
["ironlog-v1", "ironlog-v2"].forEach((k) => storage.removeItem(k));
// Keep data saved under the app's former name.
if (!storage.getItem(STORE) && storage.getItem("ironlog-db")) storage.setItem(STORE, storage.getItem("ironlog-db"));
storage.removeItem("ironlog-db");
let STEP = 2.5; // every load is rounded to this (Settings)
const DEFAULT_BW = 81.5; // bodyweight used for history logged before any bodyweight was recorded
const BW_FACTOR = 0.9; // share of bodyweight moved in a pull-up: 1RM = (0.9·BW + kg) / % − 0.9·BW

const SEED_RECORDS = [
  ["Pull-ups max reps", "reps", [32]], ["Handstand push-ups max reps", "reps", [17]], ["Pull-ups w/ gf", "reps", [6]],
  ["One-arm pull-up max reps", "reps", []], ["Half marathon time", "time", []], ["Overhand deadlift max", "kg", []],
];

/**
 * Data migrations: MIGRATIONS[n] upgrades a database from version n-1 to n.
 * When the stored data shape changes, bump SCHEMA and add a step here so existing data carries over.
 */
const MIGRATIONS = {
  // Excel history moves into the database so it can be edited like any other workout.
  2: (d) => { d.logs = SEED_HISTORY.map((h) => ({ id: d.seq++, ...h, kind: "Set", source: "excel" })).concat(d.logs); },
  // Log types (reps/time × weight/bodyweight), resistance bands, and running (Excel run log + half-marathon plan).
  3: (d) => {
    d.exercises.forEach((e) => {
      const [measure, load] = LOG_TYPES[e.name] ?? ["reps", e.bw ? "bw+" : "kg"];
      e.measure ??= measure; e.load ??= load; e.bw = e.load !== "kg";
    });
    d.bands ??= DEFAULT_BANDS.map((b) => ({ ...b }));
    d.runs ??= SEED_RUNS.map((r) => ({ id: d.seq++, ...r, note: "", source: "excel" }));
    d.runPlans ??= [{ id: d.seq++, ...SEED_RUN_PLAN, active: false }];
  },
  // Settings (bar, plates, rounding) and a log of finished split days for the weekly order on Home.
  4: (d) => {
    d.settings ??= { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25], step: 2.5 };
    d.dayLog ??= [];
  },
  // Test weeks ramp 80% → 90% → target instead of 90% → 95% → target.
  5: (d) => {
    const kg = d.bodyweights.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1)?.kg ?? DEFAULT_BW;
    d.blocks.forEach((b) => b.lifts.forEach((l) => {
      const wk = l.plan.at(-1);
      if (wk?.test) l.plan[l.plan.length - 1] = testWeek(l.lift, wk.sets.at(-1).w, d.exercises.find((e) => e.name === l.lift)?.bw ? BW_FACTOR * kg : 0);
    }));
  },
  // Several muscle groups per exercise (first = primary) and per-exercise variations (paused, pin, band, …).
  6: (d) => d.exercises.forEach((e) => {
    e.muscles ??= [e.muscle, ...(SECONDARY_MUSCLES[e.name] ?? [])].filter(Boolean);
    e.variations ??= [...(DEFAULT_VARIATIONS[e.name] ?? [])];
  }),
};
function migrate(d) {
  d.schema ||= 1;
  while (d.schema < SCHEMA) MIGRATIONS[++d.schema](d);
  d.prOverrides ||= {}; // { lift: { reps: { w, date, note } } } — manual corrections of rep maxes
  d.liftRecords ||= []; // variation PRs (paused bench, clean pull-up, …) and PRs of other lifts
  return d;
}

let saveTimer = null;
let db = load();
if (!db || (db.schema || 1) < SCHEMA) { db = migrate(db || seed()); save(); }
STEP = db.settings.step || 2.5;
applyAccent();

function seed() {
  const d = { schema: 1, seq: 1, bodyweights: [], exercises: [], programs: [], currentProgramId: null, logs: [], blocks: [], records: [], workout: null };
  CATALOG.forEach(([name, muscle, pattern, mechanic, bw]) =>
    d.exercises.push({ id: d.seq++, name, muscle, pattern, mechanic, bw: !!bw, main: DEFAULT_MAIN_LIFTS.includes(name), custom: false }));
  PROGRAMS.forEach((p) => {
    const id = d.seq++;
    d.programs.push({ id, name: p.name, notes: p.notes || "", days: p.days.map(([name, items]) => ({ name, items: items.map(([sets, label]) => ({ sets, label })) })) });
    if (p.current) d.currentProgramId = id;
  });
  const heaviestSingle = (lift) => Math.max(0, ...SEED_HISTORY.filter((h) => h.lift === lift && h.reps === 1).map((h) => h.w));
  d.blocks.push({
    id: d.seq++, name: SEED_BLOCK.name, start: SEED_BLOCK.start, weeks: SEED_BLOCK.weeks, active: true,
    lifts: SEED_BLOCK.lifts.map((l) => ({ lift: l.lift, model: "custom", oneRm: String(heaviestSingle(l.lift)), plan: l.plan })),
  });
  d.records = SEED_RECORDS.map(([name, unit, values]) => ({ id: d.seq++, name, unit, entries: values.map((value) => ({ id: d.seq++, date: null, value })) }));
  return d;
}
function load() { try { return JSON.parse(storage.getItem(STORE)); } catch { return null; } }
function save() { clearTimeout(saveTimer); saveTimer = null; storage.setItem(STORE, JSON.stringify(db)); }
// Typing in set fields saves shortly after the last keystroke instead of on every key.
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }
function flushSave() { if (saveTimer) save(); }
document.addEventListener("visibilitychange", () => document.hidden && flushSave());
window.addEventListener("pagehide", flushSave);
const nextId = () => db.seq++;

// ================= Helpers =================
const fmt = (v) => (v == null || v === "" || isNaN(v) ? "–" : String(Math.round(v * 100) / 100));
const num = (s) => { const v = parseFloat(String(s ?? "").replace(",", ".")); return isNaN(v) ? null : v; };
function isoLocal(d = new Date()) { return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
const today = () => isoLocal();
const addDays = (iso, n) => { const d = new Date(iso + "T00:00"); d.setDate(d.getDate() + n); return isoLocal(d); };
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00") - new Date(a + "T00:00")) / 86400000);
const dmy = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}`;
const niceDate = (iso) => new Date(iso + "T00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const q = (s) => esc(JSON.stringify(s));
const $ = (id) => document.getElementById(id);
function r25(v) { return Rpe.round(v, STEP); } // a declaration, so migrations can use it

const exByName = (name) => db.exercises.find((e) => e.name.toLowerCase() === String(name).toLowerCase());
const mainLifts = () => db.exercises.filter((e) => e.main).map((e) => e.name);
const program = (id) => db.programs.find((p) => p.id === id);
const currentProgram = () => program(db.currentProgramId) ?? db.programs[0];
/** Bodyweight on a date: last entry on/before it, else the first one after, else the workbook default. */
function bwAt(date = today()) {
  const sorted = db.bodyweights.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  return sorted.filter((b) => b.date <= date).at(-1)?.kg ?? sorted[0]?.kg ?? DEFAULT_BW;
}
const bwOf = (name, date) => (exByName(name)?.bw ? BW_FACTOR * bwAt(date) : 0);
const activeBlock = () => db.blocks.find((b) => b.active);
const mondayOf = (iso) => { const d = new Date(iso + "T00:00"); return addDays(iso, -((d.getDay() + 6) % 7)); };
/** Block weeks are calendar weeks (Mon–Sun) counted from the week the block starts in. */
const blockWeek = (b, date = today()) => Math.floor(daysBetween(mondayOf(b.start), date) / 7) + 1;

const nBlocks = (b) => b.blocks || 1;
/** "block 2/4 · week 3/6" for a multi-block cycle, "week 3/6" otherwise; weeks past the blocks are the test week. */
function cyclePos(b, wk) {
  if (b.blockLens) {
    const lens = b.blockLens;
    let k = 0, w = wk;
    while (k < lens.length && w > lens[k]) w -= lens[k++];
    if (k >= lens.length) return hasTest(b) && wk === b.weeks ? "test week" : `week ${wk}/${b.weeks}`;
    return lens.length === 1 ? `week ${w}/${lens[0]}` : `block ${k + 1}/${lens.length} · week ${w}/${lens[k]}`;
  }
  const per = b.blockWeeks || b.weeks, nb = nBlocks(b);
  if (wk > nb * per) return "test week";
  if (nb === 1) return `week ${wk}/${b.weeks}`;
  return `block ${Math.ceil(wk / per)}/${nb} · week ${((wk - 1) % per) + 1}/${per}`;
}

/** "3-4x" → 3, "0-2x" → 2, "4" → 4. */
function setCount(text) {
  const n = String(text).match(/\d+/g)?.map(Number) ?? [3];
  return n[0] > 0 ? n[0] : n.at(-1) || 1;
}
const setsLabel = (s) => (/x$/i.test(String(s)) ? s : `${s}x`);

/** Program label → a concrete exercise, a placeholder slot (limited to pool when the split picked some), or an "A / B" choice. */
function resolveItem(label, pool) {
  const ex = exByName(label);
  if (ex) return { exercise: ex.name };
  if (SLOTS[label]) {
    const picked = (pool ?? []).map((n) => exByName(n)?.name).filter(Boolean);
    return { options: picked.length ? picked : slotExercises(label) };
  }
  if (label.includes(" / ")) {
    const opts = label.split(" / ").map((s) => exByName(s.trim())?.name).filter(Boolean);
    return opts.length === 1 ? { exercise: opts[0] } : { options: opts };
  }
  return { options: db.exercises.map((e) => e.name) };
}
const slotExercises = (label) => db.exercises.filter(SLOTS[label]).map((e) => e.name);
/** Swap candidates for an exercise: same movement pattern. */
function alternativesFor(item) {
  if (item.options) return item.options;
  const pattern = exByName(item.exercise)?.pattern;
  return db.exercises.filter((e) => e.pattern === pattern).map((e) => e.name);
}

// ================= History & PRs =================
function allHistory() {
  return db.logs;
}
function sessionsOf(name) {
  const byDate = {};
  allHistory().filter((h) => h.lift === name).forEach((h) => (byDate[h.date] ||= []).push(h));
  return Object.keys(byDate).sort().reverse().map((date) => ({ date, entries: byDate[date], e1: sessionBest(byDate[date], name, date) }));
}
/** How an exercise is logged: measure "reps" | "time", load "kg" | "bw" (bodyweight) | "bw+" (bodyweight + kg). */
const logType = (name) => { const e = exByName(name); return { measure: e?.measure ?? "reps", load: e?.load ?? "kg" }; };
/** Session progress number: e1RM for loaded reps, max reps for bodyweight, longest hold for static work. */
function sessionBest(entries, name, date) {
  const { measure, load } = logType(name);
  entries = entries.filter(isStd); // variation sets (paused, pins, chains…) are not standard PRs
  if (measure === "time") return Math.max(0, ...entries.map((e) => e.t || 0)) || null;
  if (load === "bw") return Math.max(0, ...entries.map((e) => e.reps || 0)) || null;
  return bestE1(entries.filter((e) => !e.band), name, date); // band-assisted sets aren't comparable
}
const bestLabel = (name) => ({ time: "Longest hold", reps: logType(name).load === "bw" ? "Max reps" : "e1RM" })[logType(name).measure];
const bestText = (name, v) => (logType(name).measure === "time" ? (v ? fmtHold(v) : "") : fmt(v));
/** e1RM of a session = the set with the fewest reps (>0, heaviest on ties) read off the RPE-10 column. */
function bestE1(entries, name, date) {
  const sets = entries.filter((e) => e.reps > 0 && e.w != null);
  if (!sets.length) return null;
  const minReps = Math.min(...sets.map((e) => e.reps));
  const w = Math.max(...sets.filter((e) => e.reps === minReps).map((e) => e.w));
  return Rpe.oneRm(w, minReps, 10, bwOf(name, date));
}
/** Consecutive identical sets collapse to "sets x reps x kg" (e.g. 3x10x90). */
function groupSets(entries) {
  const out = [];
  entries.forEach((e) => {
    const last = out.at(-1);
    if (last && last.reps === e.reps && last.w === e.w && (last.t ?? null) === (e.t ?? null) && (last.band ?? null) === (e.band ?? null) && modText(last.mods) === modText(e.mods)) last.n += e.n || 1;
    else out.push({ n: e.n || 1, reps: e.reps, w: e.w, t: e.t ?? null, band: e.band ?? null, mods: e.mods?.length ? e.mods : null });
  });
  return out;
}
/** "3x5x100", "12" (bodyweight), "3x30s", "10s @100" (weighted hold), plus a band dot when assisted. */
const setText = (g) => {
  const body = g.t != null ? fmtHold(g.t) : String(g.reps);
  const load = g.w ? (g.t != null ? ` @${fmt(g.w)}` : `x${fmt(g.w)}`) : "";
  return `${g.n > 1 ? g.n + "x" : ""}${body}${load}${g.band ? bandDot(g.band) : ""}${modTag(g.mods)}`;
};
const fmtHold = (s) => (s < 60 ? `${s}s` : fmtDur(s));
const bandOf = (name) => db.bands.find((b) => b.name === name);
const bandDot = (name) => { const b = bandOf(name); return b ? `<i class="band" style="background:${b.color}" title="${esc(b.name)} band"></i>` : ""; };
/** Band cycle for a set: none → lightest → … → strongest → none. */
const nextBand = (cur) => { const order = ["", ...db.bands.map((b) => b.name)]; return order[(order.indexOf(cur || "") + 1) % order.length]; };

// ----- Variations: per-set modifiers of an exercise (paused, pin, tempo, band, chain…), freely combined -----
const variationsOf = (name) => exByName(name)?.variations ?? [];
/** A standard set has no variation; only standard sets count towards PRs, e1RM and test targets. */
const isStd = (x) => !x?.mods?.length;
const modText = (mods) => (mods?.length ? mods.join(" + ") : "");
/** Best e1RM logged for exactly this variation combination (null when never done). */
function variantE1(lift, mods) {
  const key = modText(mods), sets = allHistory().filter((h) => h.lift === lift && h.reps > 0 && h.w != null && !isStd(h) && modText(h.mods) === key);
  return sets.length ? Math.max(...sets.map((h) => Rpe.oneRm(h.w, h.reps, 10, bwOf(lift, h.date)))) : null;
}
/** "Squat", or "Squat · Band + Pin" for a cycle entry with its own variation progression. */
const cfgName = (c) => (c.variant?.length ? `${c.lift} · ${modText(c.variant)}` : c.lift);
const modTag = (mods) => (mods?.length ? ` <span class="mods">${esc(modText(mods))}</span>` : "");
/** Toggles a variation in a set's list, kept in the exercise's own variation order. */
function toggled(list, v, name) {
  const order = variationsOf(name), at = (x) => (order.includes(x) ? order.indexOf(x) : 999);
  const set = new Set(list ?? []);
  set.has(v) ? set.delete(v) : set.add(v);
  return [...set].sort((a, b) => at(a) - at(b));
}
/** Variation picker under a logging row. src: "m" = the session editor, "w:i" = workout item i. */
const rowsFor = (src) => (src === "m" ? ui.modal.rows : db.workout.items[+src.slice(2)].rows);
const nameFor = (src) => (src === "m" ? ui.modal.lift : db.workout.items[+src.slice(2)].exercise);
const rerender = (src) => (src === "m" ? renderModal() : render());
function openRowMods(src, j) { const k = `${src}:${j}`; ui.modRow = ui.modRow === k ? null : k; rerender(src); }
function toggleRowMod(src, j, v) {
  const r = rowsFor(src)[j];
  r.mods = toggled(r.mods, v, nameFor(src));
  if (src !== "m") save();
  rerender(src);
}

/** A row from the logging table → a log entry (null when empty). */
function rowToLog(r, name) {
  const { measure, load } = logType(name);
  const t = measure === "time" ? parseDur(r.t) : null, reps = measure === "time" ? null : parseInt(r.reps);
  if (!(t > 0 || reps > 0)) return null;
  return { kind: r.kind || "Set", n: 1, reps, t, w: load === "bw" ? 0 : num(r.w) ?? 0, band: load === "kg" ? null : r.band || null, ...(r.mods?.length ? { mods: [...r.mods] } : {}) };
}
/**
 * Editable set table shared by the workout and the history editor. on(j, field) returns the oninput JS.
 * src (see rowsFor) adds a variation column when the exercise has variations.
 */
function setsTable(name, rows, on, onBand, extraCell, rowCls = () => "", src = null) {
  const { measure, load } = logType(name);
  const vars = variationsOf(name), hasVar = !!src && (vars.length > 0 || rows.some((r) => r.mods?.length));
  const cols = 3 + (load === "bw" ? 0 : 2) + (load === "kg" ? 0 : 1) + (hasVar ? 1 : 0);
  const varCell = (r, j) => (hasVar ? `<td><button class="bandbtn varbtn ${r.mods?.length ? "on" : ""}" onclick="openRowMods(${q(src)},${j})">${r.mods?.length ? esc(modText(r.mods)) : "std"}</button></td>` : "");
  const varRow = (r, j) => (hasVar && ui.modRow === `${src}:${j}` ? `<tr class="var-pick"><td></td><td colspan="${cols - 1}"><div class="row wrap" style="gap:6px">
      ${[...vars, ...(r.mods ?? []).filter((v) => !vars.includes(v))].map((v) => `<button class="fchip ${r.mods?.includes(v) ? "sel" : ""}" onclick="toggleRowMod(${q(src)},${j},${q(v)})">${esc(v)}</button>`).join("")}
      <button class="fchip" onclick="openRowMods(${q(src)},${j})">${ic("check")}</button></div></td></tr>` : "");
  return `<table class="log"><tr><th>Set</th><th>${measure === "time" ? "Sec" : "Reps"}</th>${load === "bw" ? "" : `<th></th><th>${load === "bw+" ? "+kg" : "kg"}</th>`}${load === "kg" ? "" : "<th>Band</th>"}${hasVar ? "<th>Variation</th>" : ""}<th></th></tr>
    ${rows.map((r, j) => `<tr class="${rowCls(r)}"><td class="setno">${j + 1}</td>
      <td>${measure === "time" ? `<input inputmode="numeric" placeholder="sec" value="${esc(r.t ?? "")}" oninput="${on(j, "t")}">`
        : `<input inputmode="numeric" value="${esc(r.reps ?? "")}" oninput="${on(j, "reps")}">`}</td>
      ${load === "bw" ? "" : `<td class="muted">${measure === "time" ? "@" : "×"}</td><td><input inputmode="decimal" value="${esc(r.w ?? "")}" oninput="${on(j, "w")}"></td>`}
      ${load === "kg" ? "" : `<td><button class="bandbtn" onclick="${onBand(j)}">${r.band ? `${bandDot(r.band)}${esc(r.band)}` : "none"}</button></td>`}
      ${varCell(r, j)}<td>${extraCell(r, j)}</td></tr>${varRow(r, j)}`).join("")}
  </table>`;
}

// ================= Cycle templates =================
/**
 * A cycle is built in three steps: ① a weekly scheme generates a template, ② the template is edited freely,
 * ③ each exercise's weights are checked. One template is shared by every exercise unless an exercise is customized
 * (it then gets its own copy).
 * Template: { method, test, blocks: [{ model: "tb" | "drop", weeks: [{ groups: [{ kind, sets, reps, load, mods }] }] }] }
 * method "rpe": load is the RPE · "pct": % of 1RM · "kg": kg added to the exercise's start kg.
 * Every group uses the 1RM (or start kg) of its own variation, so variation sets get their own weights.
 */
const lerp = (a, b, i, n) => (n <= 1 ? a : a + ((b - a) * i) / (n - 1));
/** Share of bodyweight moved counts as load for bodyweight lifts: (0.9·BW + kg). */
const liftBw = (cfg) => (exByName(cfg.lift)?.bw ? BW_FACTOR * (num(cfg.bw) ?? bwAt()) : 0);
const shareOf = (cfg, w) => { const one = num(cfg.oneRm) ?? 0, bw = liftBw(cfg); return one + bw > 0 ? (w + bw) / (one + bw) : 0; };
const e1Of = (lift) => sessionsOf(lift).find((s) => s.e1)?.e1 ?? 100;
const METHODS = { rpe: ["RPE", "@", "RPE"], pct: ["% of 1RM", "@", "%"], kg: ["Weight", "+", "kg"] };
const KINDS = [["TOP", "Top"], ["Back-off", "Back-off"], ["Set", "Set"], ["Extra", "Extra"]];
const kindLabel = (k) => KINDS.find(([v]) => v === k)?.[1] ?? k;

/** One block of the template from the step-① scheme; k = block index (0-based), n = weeks. */
function genBlock(g, k, model = g.def.model, n = Math.max(1, parseInt(g.weeks) || 1), method = g.def.method) {
  const d = g.def, cl = (num(g.cLd) ?? 0) * k;
  const r0 = num(g.cR0) ?? 5, rd = num(d.rDw) ?? 0, rk = num(g.cRd) ?? 0;
  const b0 = num(g.bR0) ?? r0, bd = num(d.bDw) ?? rd, bk = num(g.bRd) ?? rk;
  const reps = (a, step, blk, i) => Math.max(1, Math.round(a + k * blk + i * step));
  const load = (part, i) => {
    if (method === "kg") return (num(d.kgStep) || 0) * i + cl + (part === "B" ? num(d.boKg) ?? 0 : 0);
    const v = lerp(num(d[`${method}${part}0`]) ?? 0, num(d[`${method}${part}1`]) ?? 0, i, n) + cl;
    return method === "rpe" ? Math.min(10, v) : v;
  };
  const boSets = Math.max(0, parseInt(d.boSets) || 0);
  return {
    model, weeks: Array.from({ length: n }, (_, i) => ({
      groups: model === "drop"
        ? [{ kind: "Set", sets: Math.max(1, parseInt(d.sets) || 1), reps: reps(r0, rd, rk, i), load: load("T", i), mods: [] }]
        : [{ kind: "TOP", sets: 1, reps: reps(r0, rd, rk, i), load: load("T", i), mods: [] },
          ...(boSets ? [{ kind: "Back-off", sets: boSets, reps: reps(b0, bd, bk, i), load: load("B", i), mods: [] }] : [])],
    })),
  };
}
function generateTemplate(g) {
  return { method: g.def.method, test: !!g.test, blocks: Array.from({ length: Math.max(1, parseInt(g.blocks) || 1) }, (_, k) => genBlock(g, k)) };
}

/** 1RM (start kg for the kg method) an exercise uses for a variation: its own value, else best logged, else standard. */
function oneFor(t, L, mods) {
  const key = modText(mods), map = (t.method === "kg" ? L.start : L.one) ?? {};
  const own = num(map[key]);
  if (own != null) return own;
  if (key && t.method !== "kg") { const v = variantE1(L.lift, mods); if (v) return r25(v); }
  return num(map[""]) ?? 0;
}
/** Groups with a variation the exercise doesn't have are skipped for that exercise. */
const liftOk = (L, g) => !g.mods?.length || g.mods.every((v) => variationsOf(L.lift).includes(v));
function rawGroup(t, L, g) {
  const one = oneFor(t, L, g.mods), bw = liftBw(L), load = num(g.load) ?? 0;
  if (t.method === "kg") return one + load;
  if (t.method === "pct") return ((one + bw) * load) / 100 - bw;
  return (one + bw) * (Rpe.pct(Math.min(12, Math.max(1, parseInt(g.reps) || 1)), load) ?? 0) - bw;
}
/**
 * Equal jumps for one line: weight = start + block·B + week·J, with J (weekly) and B (block to block) whole weight
 * steps — always equal. Hard limit: no week above its cap (its own planned load + 1% of 1RM). Weeks may land under
 * their planned load; the jumps that keep the week furthest under it closest win (then the smallest total gap).
 * pts: [{ k: block within the run, i: week within the block, target: planned kg, cap }] — weeks may be missing.
 */
function fitLine(pts) {
  const byK = {};
  pts.forEach((p) => (byK[p.k] ||= []).push(p));
  const ks = Object.keys(byK).map(Number).sort((a, b) => a - b);
  const slopeOf = (ps) => { const a = ps.reduce((m, p) => (p.i < m.i ? p : m)), z = ps.reduce((m, p) => (p.i > m.i ? p : m)); return z.i > a.i ? (z.target - a.target) / (z.i - a.i) : null; };
  const slopes = ks.map((k) => slopeOf(byK[k])).filter((v) => v != null);
  const avg = slopes.length ? slopes.reduce((a, v) => a + v, 0) / slopes.length : 0;
  const icept = ks.map((k) => byK[k].reduce((a, p) => a + p.target - p.i * avg, 0) / byK[k].length);
  const bsteps = ks.slice(1).map((k, j) => (icept[j + 1] - icept[j]) / (k - ks[j]));
  const range = (vals) => {
    if (!vals.length) return [0];
    const lo = Math.floor(Math.min(...vals) / STEP) - 3, hi = Math.ceil(Math.max(...vals) / STEP) + 3;
    return Array.from({ length: hi - lo + 1 }, (_, j) => (lo + j) * STEP);
  };
  let best = null;
  for (const J of range(slopes)) for (const B of ks.length > 1 ? range(bsteps) : [0]) {
    const S = Rpe.floor(Math.min(...pts.map((p) => p.cap - p.k * B - p.i * J)) + 1e-9, STEP);
    let worst = -Infinity, sum = 0;
    pts.forEach((p) => { const d = p.target - (S + p.k * B + p.i * J); worst = Math.max(worst, d); sum += Math.abs(d); });
    if (!best || worst < best.worst - 1e-9 || (Math.abs(worst - best.worst) <= 1e-9 && sum < best.sum - 1e-9)) best = { J, B, S, worst, sum };
  }
  return { w: (p) => best.S + p.k * best.B + p.i * best.J, worst: best.worst };
}
/**
 * Weights [block][week][group]. Hard rules:
 * - Jumps are always equal. A line is one set group of a block (same kind and variation, e.g. "Back-off · Band"),
 *   in every week it appears in. It rises by one equal jump per week, and consecutive blocks that have the same line
 *   form a run that also steps by one equal jump from block to block (see fitLine).
 * - No set goes above its own planned load + 1% of 1RM, so nothing is heavier than its RPE / % says; sets may land
 *   under it instead.
 * Weights set by hand (L.over, keyed "block-week-group") win.
 */
function liftWeights(t, L) {
  const tolOf = (mods) => { const one = oneFor(t, L, mods); return t.method !== "kg" && one > 0 ? 0.01 * (one + liftBw(L)) : 0; };
  const W = t.blocks.map((blk) => blk.weeks.map((wk) => wk.groups.map((g) => r25(rawGroup(t, L, g)))));
  // Lines of each block: "kind|variation#n" (n-th such group in a week) → the weeks and positions it is in.
  const lines = t.blocks.map((blk) => {
    const m = new Map();
    blk.weeks.forEach((wk, i) => {
      const seen = {};
      wk.groups.forEach((g, gi) => {
        const k = lineKey(g), id = `${k}#${(seen[k] = (seen[k] ?? 0) + 1)}`;
        if (!m.has(id)) m.set(id, []);
        m.get(id).push({ i, gi });
      });
    });
    return m;
  });
  const done = t.blocks.map(() => new Set());
  t.blocks.forEach((_, k0) => lines[k0].forEach((__, id) => {
    if (done[k0].has(id)) return;
    let k1 = k0;
    while (k1 + 1 < t.blocks.length && lines[k1 + 1].has(id)) k1++;
    const pts = [];
    for (let k = k0; k <= k1; k++) {
      done[k].add(id);
      lines[k].get(id).forEach(({ i, gi }) => {
        const g = t.blocks[k].weeks[i].groups[gi], target = rawGroup(t, L, g);
        pts.push({ k: k - k0, i, gi, target, cap: target + tolOf(g.mods) });
      });
    }
    const fit = fitLine(pts);
    pts.forEach((p) => (W[k0 + p.k][p.i][p.gi] = r25(fit.w(p))));
  }));
  t.blocks.forEach((blk, bi) => blk.weeks.forEach((wk, wi) => wk.groups.forEach((_, gi) => {
    const o = L.over?.[`${bi}-${wi}-${gi}`];
    if (o != null) W[bi][wi][gi] = o;
  })));
  return W;
}
/** The exercise's weeks as saved in a cycle: every set listed on its own, variation sets tagged. */
function liftPlan(t, L) {
  const W = liftWeights(t, L);
  return t.blocks.flatMap((blk, bi) => blk.weeks.map((wk, wi) => ({
    block: bi + 1, wk: wi + 1,
    sets: wk.groups.flatMap((g, gi) => (liftOk(L, g) ? Array.from({ length: Math.max(0, parseInt(g.sets) || 0) }, () => ({
      kind: g.kind, n: 1, reps: Math.max(1, parseInt(g.reps) || 1), w: W[bi][wi][gi], ...(g.mods?.length ? { mods: [...g.mods] } : {}),
    })) : [])),
  })));
}

// ================= Today's plan for an exercise =================
function expand(entries) {
  return entries.flatMap((e) => Array.from({ length: Math.max(1, e.n || 1) }, () => ({
    kind: e.kind, reps: String(e.reps ?? ""), t: e.t ? String(e.t) : "", w: e.w == null || e.w === "" ? "" : fmt(e.w), band: e.band ?? "", mods: e.mods ? [...e.mods] : [], done: false,
  })));
}

function planFor(name, date = today()) {
  const b = activeBlock();
  // The lift's standard entry first, then its variation entries (each with its own progression), in cycle order.
  const cfgs = (b?.lifts.filter((l) => l.lift === name) ?? []).sort((x, y) => !!x.variant?.length - !!y.variant?.length);
  if (cfgs.length) {
    let wk = blockWeek(b, date);
    const weekStart = addDays(mondayOf(b.start), (wk - 1) * 7);
    // Already trained this lift in the current block week → next session gets next week's sets.
    if (sessionsOf(name).some((s) => s.date >= weekStart && s.date < date)) wk++;
    const sets = wk >= 1 && wk <= b.weeks ? cfgs.flatMap((c) => c.plan[wk - 1]?.sets ?? []) : [];
    if (sets.length) return { type: "block", week: wk, sets: expand(sets) };
  }
  const last = sessionsOf(name).find((s) => s.date !== date);
  if (last) return { type: "last", sets: expand(last.entries) };
  return { type: "new", sets: [] };
}

/**
 * Rows = program set count (or block set count), pre-filled in order from the plan. Variations come from the cycle;
 * outside a cycle from the split (itemMods: one list per set) when it sets any, else from the last session.
 */
function buildRows(name, setsText, date, itemMods = null) {
  const p = planFor(name, date);
  const count = p.type === "block" ? p.sets.length : setCount(setsText);
  const rows = Array.from({ length: count }, (_, i) => ({ ...(p.sets[i] ?? p.sets.at(-1) ?? { kind: "Set", reps: "", w: "" }), done: false }));
  rows.forEach((r) => (r.mods = [...(r.mods ?? [])]));
  if (p.type !== "block" && itemMods?.some((m) => m?.length)) rows.forEach((r, i) => (r.mods = [...(itemMods[i] ?? [])]));
  return { rows, plan: p };
}

/**
 * This week's order of the current split: days still to do first (standard order, or the order picked this week),
 * then days already done this week in the order they were done. A new week starts again in standard order.
 */
function weekOrder(prog) {
  const from = mondayOf(today()), to = addDays(from, 6), inWeek = (d) => d >= from && d <= to;
  const fixed = prog.days.map((d) => d.items.map((it) => resolveItem(it.label).exercise).filter(Boolean));
  const doneOn = prog.days.map((_, i) => {
    if (db.workout?.programId === prog.id && db.workout.dayIdx === i) return null; // in progress
    const logged = db.dayLog.filter((l) => l.programId === prog.id && l.dayIdx === i && inWeek(l.date)).map((l) => l.date);
    // Workouts not finished in the app (e.g. imported) count via exercises that only this day has.
    const own = fixed[i].filter((ex) => !fixed.some((f, k) => k !== i && f.includes(ex)));
    const trained = db.logs.filter((l) => own.includes(l.lift) && inWeek(l.date)).map((l) => l.date);
    return [...logged, ...trained].sort()[0] ?? null;
  });
  const std = prog.days.map((_, i) => i);
  const picked = db.weekOrder?.week === from && db.weekOrder.programId === prog.id ? db.weekOrder.order.filter((i) => i < std.length) : [];
  const todo = [...picked, ...std.filter((i) => !picked.includes(i))].filter((i) => !doneOn[i]);
  const done = std.filter((i) => doneOn[i]).sort((a, b) => (doneOn[a] < doneOn[b] ? -1 : doneOn[a] > doneOn[b] ? 1 : a - b));
  return { todo, done, doneOn };
}
/** Moves a day to the front of this week's to-do list (resets next week). */
function doNext(i) {
  const prog = currentProgram();
  db.weekOrder = { week: mondayOf(today()), programId: prog.id, order: [i, ...weekOrder(prog).todo.filter((k) => k !== i)] };
  save(); render();
}

// ================= UI shell =================
const ui = { tab: "home", view: "home", toast: null, hist: { lift: "Squat", range: "1Y", mode: "lifts" }, progOpen: {}, progTab: "programs", statTab: "records", pb: null, be: null, rb: null, blockOpen: {}, exq: "", exPattern: "All", modal: null, rpeBase: "" };
const svg = (paths, cls = "") => `<svg ${cls ? `class="${cls}" ` : ""}viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
/** Inline pictograms; they take the colour and size of the surrounding text. */
const ICONS = {
  check: '<path d="M20 6 9 17l-5-5"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  swap: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  play: '<path d="M8 5v14l11-7z"/>', circle: '<circle cx="12" cy="12" r="7"/>', skip: '<path d="M5 5l10 7-10 7zM19 5v14"/>',
  up: '<path d="m18 15-6-6-6 6"/>', copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>', down: '<path d="m6 9 6 6 6-6"/>', arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
};
const ic = (name) => svg(ICONS[name], "ic");
const chev = (open) => ic(open ? "up" : "down");
const TABS = [
  ["history", "History", svg('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>')],
  ["stats", "Stats", svg('<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 6h3v1a3 3 0 0 1-3 3M7 6H4v1a3 3 0 0 0 3 3"/>')],
  ["home", "Home", svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>')],
  ["programs", "Splits", svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h4M7 17h7"/>')],
  ["blocks", "Cycles", svg('<path d="M4 20V15h4v-4h4V7h4V3h4"/><path d="M3 21h18"/>')],
];

function render() {
  $("nav").innerHTML = TABS.map(([k, label, icon]) =>
    `<button class="${ui.tab === k ? "on" : ""}" onclick="go('${k}')" title="${label}" aria-label="${label}">${icon}</button>`).join("");
  const scroll = $("main").scrollTop;
  if (ui.settings) renderSettings();
  else ({
    home: ui.view === "day" ? renderDay : renderHome,
    history: renderHistory, stats: renderStats,
    programs: ui.pb ? renderProgramBuilder : ui.progTab === "exercises" ? renderExercises : renderPrograms,
    blocks: ui.be ? renderBlockBuilder : ui.rb ? renderRunBuilder : renderBlocks,
  })[ui.tab]();
  if (ui.toast) $("main").insertAdjacentHTML("afterbegin", `<div class="toast">${esc(ui.toast)}</div>`);
  $("main").scrollTop = scroll;
  renderModal();
}
function go(tab) {
  ui.tab = tab; ui.settings = false;
  if (tab === "home") ui.view = db.workout ? "day" : "home";
  $("main").scrollTop = 0;
  render();
}
/** Android back button: close the open layer, else go Home; false lets the app exit. */
function handleBack() {
  document.activeElement?.blur();
  if (ui.modal) ui.modal = null;
  else if (ui.settings) ui.settings = false;
  else if (ui.swap != null) { ui.swap = null; ui.pick = null; }
  else if (ui.pb) ui.pb = null;
  else if (ui.be?.step > 1) return goStep(ui.be.scope != null ? 3 : ui.be.step - 1), true;
  else if (ui.be) ui.be = null;
  else if (ui.rb) ui.rb = null;
  else if (ui.tab === "home" && ui.view === "day") ui.view = "home";
  else if (ui.tab !== "home") return go("home"), true;
  else return false;
  render();
  return true;
}
const SETTINGS_BTN = `<button class="icon" title="Settings" aria-label="Settings" onclick="openSettings()">${svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')}</button>`;
function setTop(title, sub = "", actions = "") {
  $("topbar").innerHTML = `<div class="grow"><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div>${actions}`;
}
function toast(msg) {
  ui.toast = msg; render();
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { ui.toast = null; render(); }, 2500);
}
const stat = (label, value) => `<div class="stat"><div class="v">${value}</div><div class="l">${label}</div></div>`;
const goalText = (sets) => sets.map((s) => `${s.reps}x${s.w || "?"}${s.mods?.length ? ` (${esc(modText(s.mods))})` : ""}`).join(" · ");
/** "Paused / std / Band + Pin" — a split item's variation per set, or "" when it has none. */
function itemModsText(it) {
  if (!it.mods?.some((m) => m?.length)) return "";
  return Array.from({ length: setCount(it.sets) }, (_, j) => modText(it.mods[j]) || "std").join(" / ");
}
const itemModsTag = (it) => (itemModsText(it) ? ` <span class="mods">${esc(itemModsText(it))}</span>` : "");

// ================= HOME =================
function renderHome() {
  const prog = currentProgram();
  const { todo, done, doneOn } = weekOrder(prog);
  const b = activeBlock();
  setTop("GymLog", niceDate(today()), SETTINGS_BTN);
  const w = db.workout;
  const active = w && w.programId === prog.id ? w.dayIdx : null;
  // The day in progress always comes first; otherwise the first day still to do is next.
  const order = active != null ? [active, ...todo.filter((i) => i !== active), ...done.filter((i) => i !== active)] : [...todo, ...done];
  const backupDue = db.logs.some((l) => l.source !== "excel") && (!db.lastExport || daysBetween(db.lastExport, today()) > 14);
  // Gym | Running tabs only exist while a running plan is active; a run due today opens the Running tab first.
  const hasRun = !!activeRunPlan();
  const tab = hasRun ? (ui.homeTab ?? (runDueToday() && !w ? "running" : "gym")) : "gym";
  $("main").innerHTML = `
    ${backupDue ? `<button class="card row" onclick="openSettings()"><span class="grow muted">${db.lastExport ? `Last backup ${daysBetween(db.lastExport, today())} days ago` : "No backup yet"}</span><b class="lime">Back up</b></button>` : ""}
    ${hasRun ? segTabs([["gym", "Gym"], ["running", `Running${runDueToday() ? " •" : ""}`]], tab, "homeTab") : ""}
    ${tab === "running" ? `${runCard()}<button class="btn-t" style="align-self:flex-start" onclick="openRun(null)">${ic("plus")} Log another run</button>` : `
    ${w ? `<button class="card resume" onclick="ui.view='day';render()">
        <div class="muted">WORKOUT IN PROGRESS</div>
        <div class="ex-name">${esc(program(w.programId)?.days[w.dayIdx]?.name)}</div>
        <div class="muted">${w.items.filter((i) => i.status !== "pending").length}/${w.items.length} exercises done · tap to continue</div></button>` : ""}
    <div><div class="title">Current split</div><div class="ex-name">${esc(prog.name)}</div>
      ${b ? `<div class="muted">Active cycle: <b class="lime">${esc(b.name)}</b> · ${cyclePos(b, Math.min(Math.max(blockWeek(b), 1), b.weeks))}</div>` : ""}</div>
    ${order.map((i) => dayCard(prog.days[i], i, { active: i === active, next: active == null && i === todo[0], doneOn: doneOn[i], locked: !!w && i !== active, canMove: active == null && todo.includes(i) && i !== todo[0] })).join("")}
    ${todo.length ? "" : `<div class="muted" style="text-align:center">All days done this week. New week starts in standard order.</div>`}`}`;
}
/** Segmented tabs bound to ui[key], like the Stats tabs. */
const segTabs = (tabs, cur, key) => `<div class="seg">${tabs.map(([k, l]) =>
  `<button class="${cur === k ? "sel" : ""}" onclick="ui.${key}='${k}';$('main').scrollTop=0;render()">${l}</button>`).join("")}</div>`;

function dayCard(d, i, s) {
  const goals = d.items.map((it) => resolveItem(it.label).exercise).filter(Boolean)
    .map((ex) => ({ ex, p: planFor(ex) })).filter(({ p }) => p.type === "block");
  const badge = s.active ? `<span class="badge">IN PROGRESS</span>` : s.next ? `<span class="badge">NEXT UP</span>`
    : s.doneOn ? `<span class="badge done">${ic("check")} ${WEEKDAYS[(new Date(s.doneOn + "T00:00").getDay() + 6) % 7]}</span>` : "";
  const btn = s.locked ? `<button class="btn-o start" disabled>Finish the current workout first</button>`
    : `<button class="${s.active || s.next ? "btn" : "btn-o"} start" onclick="startDay(${i})">${s.active ? "Continue" : s.doneOn ? "Do again" : "Start"} ${esc(d.name)}</button>`;
  return `<div class="card day ${s.active || s.next ? "next" : ""} ${s.doneOn && !s.active ? "done-day" : ""}">
    <div class="row"><b class="grow" style="font-size:18px">${esc(d.name)}</b>${badge}
      ${s.canMove ? `<button class="btn-t sm" onclick="doNext(${i})">Do next</button>` : ""}</div>
    <table class="plan">${d.items.map((it) => `<tr><td class="mono muted">${esc(setsLabel(it.sets))}</td><td>${esc(it.label)}${itemModsTag(it)}</td></tr>`).join("")}</table>
    ${goals.length && !s.doneOn ? `<div class="goals">${goals.map(({ ex, p }) => `<div><b>${esc(ex)}</b> <span class="mono">${goalText(p.sets)}</span></div>`).join("")}</div>` : ""}
    ${btn}
  </div>`;
}

// ================= DAY (guided logging) =================
function startDay(dayIdx) {
  const prog = currentProgram();
  const w = db.workout;
  const same = w && w.programId === prog.id && w.dayIdx === dayIdx;
  if (w && !same) return alert("Finish or discard the workout in progress first.");
  if (!same) {
    db.workout = {
      programId: prog.id, dayIdx, date: today(), current: 0, bw: fmt(bwAt()),
      items: prog.days[dayIdx].items.map((it) => {
        const r = resolveItem(it.label, it.pool);
        const mods = r.exercise && it.mods?.some((m) => m?.length) ? it.mods : null;
        return { label: it.label, sets: it.sets, exercise: r.exercise ?? null, options: r.options ?? null, mods, status: "pending", rows: null, planType: null, logIds: [] };
      }),
    };
    save();
  }
  ui.view = "day"; $("main").scrollTop = 0;
  render();
}

function ensureRows(item) {
  if (item.exercise && !item.rows) {
    const { rows, plan } = buildRows(item.exercise, item.sets, db.workout.date, item.mods);
    item.rows = rows; item.planType = plan.type;
    save();
  }
}

function renderDay() {
  const w = db.workout;
  if (!w) { ui.view = "home"; return renderHome(); }
  const prog = program(w.programId), day = prog.days[w.dayIdx];
  setTop(day.name, `${esc(prog.name)} · <input type="date" class="inline-date" value="${w.date}" onchange="db.workout.date=this.value;save()">`,
    `<button class="icon" title="Back" onclick="ui.view='home';render()">${ic("x")}</button>`);
  const cur = w.items[w.current];
  if (cur) ensureRows(cur);
  const done = w.items.filter((i) => i.status !== "pending").length;
  $("main").innerHTML = `
    <div class="card row bw-row"><span class="grow">Bodyweight today</span>
      <input inputmode="decimal" value="${esc(w.bw ?? "")}" onchange="setWorkoutBw(this.value)"><span class="muted">kg</span></div>
    <div class="progress"><div style="width:${(done / w.items.length) * 100}%"></div></div>
    ${cur ? (ui.swap === w.current ? swapCard(cur, w.current) : upNextCard(cur, w.current)) : `<div class="card done-card"><div class="ex-name">All done</div>
        <div class="muted">${w.items.filter((i) => i.status === "done").length} exercises logged for ${dmy(w.date)}.</div>
        <button class="btn" onclick="finishWorkout()">Finish workout</button></div>`}
    <div class="title">Today's plan</div>
    ${w.items.map((it, i) => itemRow(it, i)).join("")}
    <button class="btn-t" style="align-self:flex-start" onclick="openAddExercise()">${ic("plus")} Add exercise</button>
    ${cur ? `<button class="btn-o" style="text-align:center" onclick="finishWorkout()">Finish workout early</button>` : ""}
    <button class="btn-t red" onclick="discardWorkout()">Discard workout</button>`;
}

function swapCard(item, i) {
  if (ui.pick?.i !== i) ui.pick = { i, sel: item.exercise ? [item.exercise] : [] };
  const sel = ui.pick.sel;
  // The slot's default exercises, plus anything picked from the full library with "Choose any".
  const base = alternativesFor(item);
  return `<div class="card up"><div class="muted">CHOOSE EXERCISES · ${esc(item.label)}</div>
    <div class="muted">Tap one or more — each gets its own sets.</div>
    <div class="opt-list">${[...sel.filter((o) => !base.includes(o)), ...base].map((o) => {
      const k = sel.indexOf(o);
      return `<button class="fchip ${k >= 0 ? "sel" : ""}" onclick="togglePick(${q(o)})">${k >= 0 ? `<b>${k + 1}</b> ` : ""}${esc(o)}</button>`;
    }).join("")}<button class="fchip" onclick="openPicker({ mode: 'pick' })">${ic("plus")} Choose any…</button></div>
    <div class="row"><span class="grow"></span>
      ${item.exercise ? `<button class="btn-t" onclick="ui.swap=null;ui.pick=null;render()">Cancel</button>` : ""}
      <button class="btn" ${sel.length ? "" : "disabled"} onclick="applyPick(${i})">Use ${sel.length > 1 ? `${sel.length} exercises` : "exercise"}</button></div></div>`;
}
function togglePick(name) {
  const sel = ui.pick.sel, k = sel.indexOf(name);
  k >= 0 ? sel.splice(k, 1) : sel.push(name);
  render();
}
/**
 * Picks replace this slot in tap order, each as its own item. An exercise that stays keeps its item and the
 * sets already entered; if it was dropped, the first pick takes over the item with fresh sets.
 */
function applyPick(i) {
  const w = db.workout, it = w.items[i], sel = ui.pick.sel, keep = sel.includes(it.exercise);
  const items = sel.map((name, k) => name === it.exercise ? it
    : !keep && k === 0 ? Object.assign(it, { exercise: name, rows: null, planType: null, mods: null })
    : { label: it.label, sets: it.sets, exercise: name, options: it.options, mods: null, status: "pending", rows: null, planType: null, logIds: [] });
  w.items.splice(i, 1, ...items);
  ui.swap = null; ui.pick = null;
  save(); render();
}

function upNextCard(item, i) {
  const w = db.workout;
  if (!item.exercise) return swapCard(item, i);
  return `<div class="card up">
    <div class="row"><div class="grow"><div class="muted">UP NEXT · ${i + 1} of ${w.items.length}</div>
      <div class="ex-name">${esc(item.exercise)}</div></div>
      <button class="btn-o sm" onclick="ui.swap=${i};render()">${ic("swap")} Change</button></div>
    ${setsTable(item.exercise, item.rows, (j, f) => `setRow(${i},${j},'${f}',this.value)`, (j) => `cycleBand(${i},${j})`,
      (r, j) => `<button class="tick ${r.done ? "on" : ""}" onclick="toggleDone(${i},${j})">${ic("check")}</button>`, (r) => (r.done ? "set-done" : ""), `w:${i}`)}
    <div class="row"><button class="btn-t" onclick="addRow(${i})">${ic("plus")} Set</button>
      ${item.rows.length > 1 ? `<button class="btn-t muted" onclick="removeRow(${i})">${ic("minus")} Set</button>` : ""}
      <span class="grow"></span><button class="btn-t" onclick="skipItem(${i})">Skip</button>
      <button class="btn" onclick="completeItem(${i})">Complete ${ic("check")}</button></div>
  </div>`;
}

function itemRow(it, i) {
  const w = db.workout;
  const icon = ic(it.status === "done" ? "check" : it.status === "skipped" ? "skip" : i === w.current ? "play" : "circle");
  let summary;
  if (it.status === "skipped") summary = "skipped";
  else if (!it.exercise) summary = "choose exercise";
  else {
    const rows = it.rows ?? buildRows(it.exercise, it.sets, w.date, it.mods).rows;
    const shown = it.status === "done" && rows.some((r) => r.done) ? rows.filter((r) => r.done) : rows;
    const logs = shown.map((r) => rowToLog(r, it.exercise)).filter(Boolean);
    summary = groupSets(logs).map((g) => setText({ ...g, band: null, mods: null }) + (g.band ? ` ${g.band}` : "") + (g.mods ? ` (${modText(g.mods)})` : "")).join(" · ") || (it.status === "done" ? "done" : `${rows.length} sets`);
  }
  return `<div class="item-wrap"><button class="item ${it.status} ${i === w.current ? "cur" : ""}" onclick="focusItem(${i})">
    <span class="st">${icon}</span>
    <div class="grow"><div><span class="mono muted">${esc(setsLabel(it.sets))}</span> ${esc(it.exercise ?? it.label)}</div>
      <div class="muted mono" style="font-size:12px">${esc(summary)}</div></div></button>
    <button class="icon" title="Remove from workout" aria-label="Remove from workout" onclick="removeItem(${i})">${ic("x")}</button></div>`;
}

/** Removes an exercise from today's workout; sets already saved for it are deleted with it. */
function removeItem(i) {
  const w = db.workout, it = w.items[i], name = it.exercise ?? it.label;
  if (!confirm(it.logIds.length ? `Remove ${name}? Its ${it.logIds.length} saved sets from today are deleted too.` : `Remove ${name} from this workout?`)) return;
  db.logs = db.logs.filter((l) => !it.logIds.includes(l.id));
  w.items.splice(i, 1);
  if (w.current > i) w.current--;
  else if (w.current === i) advance(i - 1);
  if (w.items[w.current]?.status !== "pending") advance(w.current);
  ui.swap = null; ui.pick = null;
  save(); render();
}
/**
 * Pick any exercise from the library, or create one when it is missing.
 * mode: "add" (new item in today's workout), "pick" (into the open exercise choice), "pool" (a split placeholder's defaults, with di/k).
 */
function openPicker(target) { ui.modal = { type: "addEx", q: "", target }; renderModal(); }
function openAddExercise() { openPicker({ mode: "add" }); }
function addExerciseList() {
  const raw = ui.modal.q.trim(), qText = raw.toLowerCase();
  const list = db.exercises.filter((e) => !qText || [e.name, ...musclesOf(e), e.pattern].some((s) => s.toLowerCase().includes(qText)));
  const create = `<button class="btn-o" style="text-align:center" onclick="openExercise(null, ui.modal.target, ${q(raw)})">${ic("plus")} Create ${raw && !exByName(raw) ? `“${esc(raw)}”` : "new exercise"}</button>`;
  $("addex-list").innerHTML = (raw && !exByName(raw) ? create : "") + list.map((e) => `<button class="item" onclick="pickExercise(${q(e.name)})">
    <div class="grow"><div>${esc(e.name)}</div><div class="muted" style="font-size:12px">${esc(e.pattern)} · ${esc(musclesOf(e).join(", "))}</div></div><span class="lime">${ic("plus")}</span></button>`).join("")
    + (raw && !exByName(raw) ? "" : create);
}
function pickExercise(name, target = ui.modal.target) {
  ui.modal = null;
  if (target.mode === "add") return addExercise(name);
  if (target.mode === "pick" && ui.pick && !ui.pick.sel.includes(name)) ui.pick.sel.push(name);
  if (target.mode === "pool") {
    const it = ui.pb.days[target.di].items[target.k];
    it.pool = [...new Set([...poolOf(it), name])];
  }
  render();
}
function addExercise(name) {
  const w = db.workout;
  w.items.push({ label: name, sets: "3", exercise: name, options: null, status: "pending", rows: null, planType: null, logIds: [] });
  if (!w.items[w.current] || w.items[w.current].status !== "pending") w.current = w.items.length - 1;
  ui.modal = null; save(); toast(`${name} added`);
}

function setRow(i, j, field, value) { db.workout.items[i].rows[j][field] = value; saveSoon(); }
function cycleBand(i, j) { const r = db.workout.items[i].rows[j]; r.band = nextBand(r.band); save(); render(); }
/** Bodyweight is stored per workout date so pull-up e1RM uses the weight of that day. */
function setWorkoutBw(value) {
  const w = db.workout, kg = num(value);
  w.bw = value;
  db.bodyweights = db.bodyweights.filter((b) => b.date !== w.date);
  if (kg > 0) db.bodyweights.push({ id: nextId(), date: w.date, kg });
  save();
}
function toggleDone(i, j) { const r = db.workout.items[i].rows[j]; r.done = !r.done; save(); render(); }
function addRow(i) {
  const rows = db.workout.items[i].rows;
  const last = rows.at(-1) ?? { kind: "Set", reps: "", w: "" };
  rows.push({ ...last, mods: [...(last.mods ?? [])], done: false });
  save(); render();
}
function removeRow(i) { db.workout.items[i].rows.pop(); ui.modRow = null; save(); render(); }
function focusItem(i) {
  db.workout.items[i].status = "pending";
  db.workout.current = i; ui.swap = null; ui.pick = null;
  save(); $("main").scrollTop = 0; render();
}
function advance(from) {
  const w = db.workout, n = w.items.length;
  for (let k = 1; k <= n; k++) {
    const idx = (from + k) % n;
    if (w.items[idx].status === "pending") { w.current = idx; return; }
  }
  w.current = -1;
}
function skipItem(i) { db.workout.items[i].status = "skipped"; advance(i); save(); $("main").scrollTop = 0; render(); }

function completeItem(i) {
  const w = db.workout, it = w.items[i];
  const anyTicked = it.rows.some((r) => r.done);
  const rows = it.rows.filter((r) => (anyTicked ? r.done : true)).map((r) => rowToLog(r, it.exercise)).filter(Boolean);
  // Main lifts drive blocks and PRs, so they need real sets; accessories can be ticked off empty.
  if (!rows.length && exByName(it.exercise)?.main) return alert("Enter at least one set for a main lift.");
  db.logs = db.logs.filter((l) => !it.logIds.includes(l.id));
  it.logIds = rows.map((r) => {
    const id = nextId();
    db.logs.push({ id, date: w.date, lift: it.exercise, ...r, source: "app" });
    return id;
  });
  it.status = "done";
  advance(i);
  save(); $("main").scrollTop = 0;
  toast(rows.length ? `${it.exercise} saved · ${rows.length} sets` : `${it.exercise} done`);
}
function finishWorkout() {
  const w = db.workout, n = w.items.filter((i) => i.status === "done").length;
  if (num(w.bw) > 0) setWorkoutBw(w.bw);
  if (n) db.dayLog.push({ date: w.date, programId: w.programId, dayIdx: w.dayIdx });
  db.workout = null; ui.view = "home"; save();
  toast(`Workout saved (${n} exercises)`);
}
function discardWorkout() {
  const w = db.workout, saved = w.items.filter((i) => i.status === "done").length;
  if (!confirm(saved ? `Discard this workout? The ${saved} exercise(s) already completed stay in History.` : "Discard this workout?")) return;
  db.workout = null; ui.view = "home"; ui.swap = null; ui.pick = null; save();
  toast("Workout discarded");
}

// ================= HISTORY =================
function liftsWithHistory() {
  const names = [...new Set(allHistory().map((h) => h.lift))];
  const main = mainLifts();
  return main.filter((n) => names.includes(n)).concat(names.filter((n) => !main.includes(n)).sort());
}
const histToggle = () => `<div class="seg">${[["lifts", "Lifts"], ["runs", "Runs"]].map(([k, l]) =>
  `<button class="${(ui.hist.mode ?? "lifts") === k ? "sel" : ""}" onclick="ui.hist.mode='${k}';render()">${l}</button>`).join("")}</div>`;
const rangeChips = () => `<div class="hscroll">${["3M", "6M", "1Y", "All"].map((r) =>
  `<button class="fchip ${ui.hist.range === r ? "sel" : ""}" onclick="ui.hist.range='${r}';render()">${r}</button>`).join("")}</div>`;
const inHistRange = (date) => daysBetween(date, today()) <= { "3M": 92, "6M": 183, "1Y": 366, All: 1e6 }[ui.hist.range];
function renderHistory() {
  if (ui.hist.mode === "runs") return renderRuns();
  const lifts = liftsWithHistory();
  if (!lifts.includes(ui.hist.lift)) ui.hist.lift = lifts[0];
  const name = ui.hist.lift;
  const sessions = name ? sessionsOf(name) : [];
  const inRange = sessions.filter((s) => inHistRange(s.date));
  const withE1 = inRange.filter((s) => s.e1);
  const MAX_COLS = 4;
  const grouped = inRange.map((s) => ({ ...s, groups: groupSets(s.entries) }));
  const nCols = Math.min(MAX_COLS, Math.max(1, ...grouped.map((s) => s.groups.length)));
  const cell = (groups, c) => (c < nCols - 1 ? (groups[c] ? setText(groups[c]) : "") : groups.slice(c).map(setText).join("<br>"));
  const label = name ? bestLabel(name) : "";
  const chartTitle = { e1RM: `Estimated 1RM${exByName(name)?.bw ? " (incl. 0.9×bodyweight)" : ""}`, "Max reps": "Max reps", "Longest hold": "Longest hold (seconds)" }[label];
  setTop("History", "By lift", SETTINGS_BTN);
  $("main").innerHTML = `${histToggle()}
    <select onchange="ui.hist.lift=this.value;render()">${lifts.map((n) => `<option ${n === name ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
    ${rangeChips()}
    <div class="card"><div class="title">${chartTitle ?? ""}</div>${chart(withE1.slice().reverse().map((s) => ({ x: s.date, y: s.e1 })), "var(--lime)")}</div>
    <div class="card" style="padding:8px">
      <table class="hist fit"><tr><th>Date</th>${[...Array(nCols)].map((_, c) => `<th>Set ${c + 1}</th>`).join("")}<th>${label === "e1RM" ? "e1RM" : "Best"}</th></tr>
      ${grouped.map((s) => `<tr class="tap" onclick="editSession(${q(s.date)})"><td class="mono">${dmy(s.date)}</td>
        ${[...Array(nCols)].map((_, c) => `<td class="mono">${cell(s.groups, c)}</td>`).join("")}
        <td class="mono lime">${bestText(name, s.e1)}</td></tr>`).join("")}
      </table>${inRange.length ? "" : `<div class="empty">No sessions in this range</div>`}
      ${name ? `<div class="row" style="padding:6px"><span class="muted grow">Tap a session to fix or delete it.</span>
        <button class="btn-t" onclick="editSession(null)">${ic("plus")} Add session</button></div>` : ""}
    </div>`;
}
function editSession(date) {
  const lift = ui.hist.lift;
  const rows = date ? expand(db.logs.filter((l) => l.lift === lift && l.date === date)) : [{ reps: "", t: "", w: "", band: "" }];
  ui.modal = { type: "session", lift, orig: date, date: date ?? today(), rows }; ui.modRow = null;
  renderModal();
}
function saveSession() {
  const m = ui.modal, rows = m.rows.map((r) => rowToLog(r, m.lift)).filter(Boolean);
  if (!m.date) return alert("Pick a date.");
  if (!rows.length) return alert("Enter at least one set, or delete the session.");
  db.logs = db.logs.filter((l) => !(l.lift === m.lift && l.date === m.orig));
  rows.forEach((r) => db.logs.push({ id: nextId(), date: m.date, lift: m.lift, ...r, source: "edited" }));
  ui.modal = null; save(); toast("Session saved");
}
function deleteSession() {
  const m = ui.modal;
  if (!confirm(`Delete ${m.lift} on ${dmy(m.orig)}?`)) return;
  db.logs = db.logs.filter((l) => !(l.lift === m.lift && l.date === m.orig));
  ui.modal = null; save(); toast("Session deleted");
}

// ================= RUNNING =================
// A running plan works like a block: Monday-aligned weeks from its start, shown on Home only while active.
const activeRunPlan = () => db.runPlans.find((p) => p.active);
const paceText = (r) => (r.km > 0 && r.sec ? `${fmtDur(r.sec / r.km)}/km` : "–");
const planMonday = (p, wk) => addDays(mondayOf(p.start), (wk - 1) * 7);
/** Planned runs of a week, each paired with a logged run from that week (same type first, then any). */
function planWeek(p, wk) {
  const from = planMonday(p, wk), to = addDays(from, 6);
  const pool = db.runs.filter((r) => r.date >= from && r.date <= to).sort((a, b) => (a.date < b.date ? -1 : 1));
  const take = (pred) => { const k = pool.findIndex(pred); return k < 0 ? null : pool.splice(k, 1)[0]; };
  const week = (p.weeks[wk - 1] ?? []).map((s) => ({ ...s, run: null }));
  week.forEach((s) => (s.run = take((r) => r.type === s.type)));
  week.forEach((s) => (s.run ??= take(() => true)));
  return week;
}
const todayDow = () => (new Date(today() + "T00:00").getDay() + 6) % 7;
/** True when the active running plan has an unlogged run planned for today (the card then goes to the top of Home). */
function runDueToday() {
  const p = activeRunPlan(), wk = p ? blockWeek(p) : 0;
  return !!p && wk >= 1 && wk <= p.weeks.length && planWeek(p, wk).some((s) => s.day === todayDow() && !s.run);
}
function startRunPlanNow(id) {
  db.runPlans.find((p) => p.id === id).start = mondayOf(today());
  save(); toast("Plan starts this week");
}
function runCard() {
  const p = activeRunPlan();
  if (!p) return "";
  const wk = blockWeek(p), n = p.weeks.length;
  const head = (badge) => `<div class="row"><div class="grow"><div class="muted">RUNNING PLAN</div><b style="font-size:18px">${esc(p.name)}</b></div>${badge}</div>`;
  if (wk < 1) {
    const first = p.weeks[0] ?? [];
    return `<div class="card day col">${head(`<span class="badge sm">STARTS ${dmy(mondayOf(p.start))}</span>`)}
      <div class="muted">Week 1: ${first.map((s) => `${WEEKDAYS[s.day]} ${esc(s.type.toLowerCase())} ${fmt(s.km)} km`).join(" · ")}</div>
      <button class="btn-o start" onclick="startRunPlanNow(${p.id})">Start this week instead</button></div>`;
  }
  if (wk > n) {
    return `<div class="card day col">${head(`<span class="badge">DONE</span>`)}
      <div class="muted">All ${n} weeks finished. Start a new plan in Cycles → Running plans.</div>
      <button class="btn-o start" onclick="stopRunPlan(${p.id})">Close plan</button></div>`;
  }
  const week = planWeek(p, wk), dow = todayDow();
  const doneRuns = week.filter((s) => s.run), kmPlan = week.reduce((a, s) => a + s.km, 0), kmDone = doneRuns.reduce((a, s) => a + s.run.km, 0);
  // Like split days: runs still to do first (today's on top), done runs drop to the bottom in the order they were run.
  const keys = [...week.keys()];
  const todo = keys.filter((k) => !week[k].run).sort((a, b) => (week[b].day === dow) - (week[a].day === dow));
  const order = todo.concat(keys.filter((k) => week[k].run).sort((a, b) => (week[a].run.date < week[b].run.date ? -1 : 1)));
  const next = todo[0];
  return `<div class="card day col ${runDueToday() ? "next" : ""}">
    ${head(`<span class="badge">WEEK ${wk}/${n}</span>`)}
    <div class="row"><span class="muted grow">${doneRuns.length}/${week.length} runs this week</span><span class="mono muted">${fmt(kmDone)} / ${fmt(kmPlan)} km</span></div>
    <div class="progress"><div style="width:${kmPlan ? Math.min(100, (kmDone / kmPlan) * 100) : 0}%"></div></div>
    ${order.map((k) => {
      const s = week[k], isToday = s.day === dow && !s.run;
      return `<button class="item ${s.run ? "done" : ""} ${isToday ? "cur" : ""}" onclick="${s.run ? `openRun(${s.run.id})` : `openRun(null,${k})`}">
        <span class="st">${ic(s.run ? "check" : "circle")}</span>
        <div class="grow"><div><b>${esc(s.type)}</b> ${fmt(s.km)} km <span class="muted">· ${WEEKDAYS[s.day] ?? ""}</span>${isToday ? ' <span class="badge">TODAY</span>' : ""}</div>
          <div class="muted" style="font-size:12px">${s.run ? `Done ${dmy(s.run.date)}: ${fmt(s.run.km)} km${s.run.sec ? ` in ${fmtDur(s.run.sec)} · ${paceText(s.run)}` : ""}${s.run.hr ? ` · ${s.run.hr} bpm` : ""}` : esc(s.note || "Tap to log")}</div></div>
        ${s.run ? "" : `<span class="lime" style="font-size:13px;font-weight:600">Log</span>`}</button>`;
    }).join("")}
    ${next != null ? `<button class="${runDueToday() ? "btn" : "btn-o"} start" onclick="openRun(null,${next})">Log ${esc(week[next].type.toLowerCase())} run · ${fmt(week[next].km)} km</button>`
      : `<div class="muted" style="text-align:center">Week ${wk} done. Next week: ${(p.weeks[wk] ?? []).map((s) => `${esc(s.type.toLowerCase())} ${fmt(s.km)}`).join(" · ") || "plan ends"}</div>`}
  </div>`;
}
function openRun(id, plannedIdx = null) {
  let r = id ? db.runs.find((x) => x.id === id) : null;
  if (!r) {
    const p = activeRunPlan(), s = p && plannedIdx != null ? p.weeks[blockWeek(p) - 1]?.[plannedIdx] : null;
    r = { date: today(), type: s?.type ?? "Easy", km: s?.km ?? null, sec: null, hr: null, note: "" };
  }
  ui.modal = { type: "run", r: { ...r, km: r.km ? fmt(r.km) : "", time: r.sec ? fmtDur(r.sec) : "", hr: r.hr ?? "" } };
  renderModal();
}
function renderRunModal(m, scrim) {
  const r = m.r;
  $("modal").innerHTML = `${scrim}<div class="dialog">
    <h2>${r.id ? "Edit run" : "Log run"}</h2>
    <label class="f">Date<input type="date" value="${r.date}" onchange="ui.modal.r.date=this.value"></label>
    <div class="opt-list">${RUN_TYPES.map((t) => `<button class="fchip ${r.type === t ? "sel" : ""}" onclick="ui.modal.r.type='${t}';renderModal()">${t}</button>`).join("")}</div>
    <div class="row"><label class="f">Distance km<input inputmode="decimal" value="${esc(r.km)}" oninput="ui.modal.r.km=this.value;runPace()"></label>
      <label class="f">Time<input placeholder="h:mm:ss" value="${esc(r.time)}" oninput="ui.modal.r.time=this.value;runPace()"></label></div>
    <div class="row"><label class="f">Avg HR<input inputmode="numeric" value="${esc(r.hr)}" oninput="ui.modal.r.hr=this.value"></label>
      <label class="f">Pace<b id="run-pace" class="mono lime" style="padding:10px 0"></b></label></div>
    <label class="f">Note<input value="${esc(r.note)}" placeholder="e.g. last 4 km at tempo" oninput="ui.modal.r.note=this.value"></label>
    <div class="row">${r.id ? `<button class="btn-t red" onclick="deleteRun()">Delete</button>` : ""}<span class="grow"></span>
      <button class="btn-t" onclick="ui.modal=null;render()">Cancel</button><button class="btn" onclick="saveRun()">Save</button></div></div>`;
  runPace();
}
function runPace() { const r = ui.modal.r; $("run-pace").textContent = paceText({ km: num(r.km), sec: parseDur(r.time) }); }
function saveRun() {
  const r = ui.modal.r, km = num(r.km), sec = parseDur(r.time);
  if (!r.date || !(km > 0)) return alert("Enter the date and distance.");
  if (String(r.time).trim() && !(sec > 0)) return alert("Enter time like 45:30 or 1:45:30.");
  const run = { id: r.id ?? nextId(), date: r.date, type: r.type, km, sec: sec || null, hr: parseInt(r.hr) || null, note: String(r.note ?? "").trim(), source: r.source ?? "app" };
  db.runs = db.runs.filter((x) => x.id !== run.id).concat(run);
  ui.modal = null; save(); toast("Run saved");
}
function deleteRun() {
  if (!confirm("Delete this run?")) return;
  db.runs = db.runs.filter((x) => x.id !== ui.modal.r.id);
  ui.modal = null; save(); toast("Run deleted");
}
function renderRuns() {
  setTop("History", "Runs", SETTINGS_BTN);
  const runs = db.runs.filter((r) => inHistRange(r.date)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const weekly = {};
  runs.forEach((r) => (weekly[mondayOf(r.date)] = (weekly[mondayOf(r.date)] || 0) + r.km));
  const sumKm = (list) => list.reduce((s, r) => s + r.km, 0);
  $("main").innerHTML = `${histToggle()}${rangeChips()}
    <div class="card col"><div class="row sb">${stat("This week", fmt(sumKm(db.runs.filter((r) => r.date >= mondayOf(today())))) + " km")}${stat("This month", fmt(sumKm(db.runs.filter((r) => r.date.slice(0, 7) === today().slice(0, 7)))) + " km")}${stat("Runs", runs.length)}</div>
      <div class="title">Weekly distance (km)</div>${chart(Object.keys(weekly).sort().map((x) => ({ x, y: Math.round(weekly[x] * 10) / 10 })), "var(--cyan)", "Log runs to see weekly distance")}</div>
    <div class="card" style="padding:8px"><table class="hist fit"><tr><th>Date</th><th>Run</th><th>km</th><th>Time</th><th>Pace</th><th>HR</th></tr>
      ${runs.map((r) => `<tr class="tap" onclick="openRun(${r.id})"><td class="mono">${dmy(r.date)}</td><td>${esc(r.type)}</td><td class="mono">${fmt(r.km)}</td>
        <td class="mono">${r.sec ? fmtDur(r.sec) : "–"}</td><td class="mono lime">${paceText(r).replace("/km", "")}</td><td class="mono muted">${r.hr ?? ""}</td></tr>`).join("")}
      </table>${runs.length ? "" : `<div class="empty">No runs in this range</div>`}
      <div class="row" style="padding:6px"><span class="muted grow">Tap a run to edit it.</span><button class="btn-t" onclick="openRun(null)">${ic("plus")} Log run</button></div></div>`;
}
/** Best times from logged runs: time at that run's average pace, from runs at least that long. */
function runningBests() {
  if (!db.runs.length) return "";
  const timed = db.runs.filter((r) => r.sec && r.km > 0);
  const best = (d) => timed.filter((r) => r.km >= d * 0.98).map((r) => ({ r, t: (r.sec * d) / r.km })).sort((a, b) => a.t - b.t)[0];
  const longest = db.runs.reduce((b, r) => (!b || r.km > b.km ? r : b), null);
  const fastest = timed.filter((r) => r.km >= 5).sort((a, b) => a.sec / a.km - b.sec / b.km)[0];
  const row = (label, value, date) => `<div class="row"><span class="grow">${label}</span><span class="mono lime">${value}</span><span class="mono muted" style="width:64px;text-align:right">${date ? dmy(date) : ""}</span></div>`;
  return `<div class="card col"><div class="title">Running · from your runs</div>
    ${[["5 km", 5], ["10 km", 10], ["Half marathon", 21.1]].map(([l, d]) => { const b = best(d); return row(l, b ? fmtDur(b.t) : "–", b?.r.date); }).join("")}
    ${row("Longest run", longest ? `${fmt(longest.km)} km` : "–", longest?.date)}
    ${row("Fastest pace (5 km+)", fastest ? paceText(fastest) : "–", fastest?.date)}
    <div class="muted" style="font-size:12px">Times use the average pace of runs at least that long.</div></div>`;
}
function runPlanCard(p) {
  const wk = blockWeek(p), open = ui.blockOpen[`r${p.id}`] ?? p.active;
  const end = addDays(mondayOf(p.start), p.weeks.length * 7 - 1);
  return `<div class="card ${p.active ? "cur-prog" : ""}">
    <div class="row" style="cursor:pointer" onclick="ui.blockOpen['r${p.id}']=${!open};render()">
      <div class="grow"><b>${esc(p.name)}</b> ${p.active ? '<span class="badge">ACTIVE</span>' : ""}
        <div class="muted">${dmy(p.start)} – ${dmy(end)} · ${p.weeks.length} weeks${p.active && wk >= 1 && wk <= p.weeks.length ? ` · now week ${wk}` : ""}</div></div><span>${chev(open)}</span></div>
    ${open ? `<table class="hist fit"><tr><th>Wk</th><th>Runs (km)</th><th>Total</th></tr>
      ${p.weeks.map((w, i) => `<tr class="${p.active && i + 1 === wk ? "cur-week" : ""}"><td>${i + 1}</td>
        <td>${w.map((s) => `${WEEKDAYS[s.day]} ${esc(s.type)} <span class="mono">${fmt(s.km)}</span>`).join(" · ")}</td><td class="mono">${fmt(w.reduce((a, s) => a + s.km, 0))}</td></tr>`).join("")}</table>
      <div class="row wrap">${p.active ? `<button class="btn-t" onclick="stopRunPlan(${p.id})">Stop plan</button>` : ""}<span class="grow"></span>
        <button class="btn-t" onclick="openRunBuilder(${p.id})">${p.active ? "Copy as new" : "Use again"}</button>
        <button class="btn-t red" onclick="deleteRunPlan(${p.id})">Delete</button></div>` : ""}
  </div>`;
}
function stopRunPlan(id) {
  if (!confirm("Stop this running plan? It stays in the list and your runs are kept.")) return;
  db.runPlans.find((p) => p.id === id).active = false;
  save(); render();
}
function deleteRunPlan(id) {
  if (!confirm("Delete this running plan? Logged runs are kept.")) return;
  db.runPlans = db.runPlans.filter((p) => p.id !== id);
  save(); render();
}
function openRunBuilder(copyId) {
  const src = copyId ? db.runPlans.find((p) => p.id === copyId) : null;
  const first = src?.weeks[0] ?? [{ day: 0, type: "Easy", km: 6 }, { day: 2, type: "Tempo", km: 6 }, { day: 5, type: "Long", km: 12 }];
  const peak = (k) => Math.max(...src.weeks.map((w) => (w[k]?.type === "Race" ? 0 : w[k]?.km ?? 0)));
  ui.rb = {
    name: src?.name ?? "", start: mondayOf(today()), nWeeks: String(src?.weeks.length ?? 10),
    slots: first.map((s, k) => ({ day: s.day, type: s.type, km0: fmt(s.km), km1: fmt(src ? peak(k) : s.km * 1.75) })),
    taper: "2", race: src ? fmt(src.weeks.at(-1).find((s) => s.type === "Race")?.km ?? "") : "21.1",
    weeks: src ? JSON.parse(JSON.stringify(src.weeks)) : [],
  };
  if (ui.rb.race === "–") ui.rb.race = "";
  if (!src) generateRunWeeks();
  $("main").scrollTop = 0; render();
}
/** Linear build from start to peak km per run, then taper weeks at 70%, 60%… of peak; optional race as the last run. */
function generateRunWeeks() {
  const rb = ui.rb, n = Math.max(1, parseInt(rb.nWeeks) || 1);
  const taper = Math.min(n - 1, Math.max(0, parseInt(rb.taper) || 0)), build = n - taper, race = num(rb.race);
  const half = (v) => Math.round(v * 2) / 2;
  rb.weeks = Array.from({ length: n }, (_, i) => rb.slots.map((s) => {
    const a = num(s.km0) || 0, b = num(s.km1) || a;
    return { day: +s.day, type: s.type, km: i < build ? half(lerp(a, b, i, build)) : half(b * (0.7 - 0.1 * (i - build))), note: "" };
  }));
  const last = rb.weeks.at(-1);
  if (race > 0 && last?.length) last[last.length - 1] = { ...last.at(-1), type: "Race", km: race, note: "Race day" };
}
function renderRunBuilder() {
  const rb = ui.rb;
  const regen = "generateRunWeeks();render()";
  const f = (label, key, mode = "decimal") => `<label class="f">${label}<input inputmode="${mode}" value="${esc(rb[key])}" onchange="ui.rb.${key}=this.value;${regen}"></label>`;
  setTop("New running plan", "Set weekly runs, preview, then start", `<button class="icon" onclick="ui.rb=null;render()">${ic("x")}</button>`);
  $("main").innerHTML = `
    <div class="card col">
      <label class="f">Plan name<input value="${esc(rb.name)}" placeholder="e.g. Half marathon" onchange="ui.rb.name=this.value"></label>
      <div class="row"><label class="f">Start week<input type="date" value="${rb.start}" onchange="ui.rb.start=this.value;render()"></label>${f("Weeks", "nWeeks", "numeric")}</div>
      <div class="row">${f("Taper weeks", "taper", "numeric")}${f("Race km (optional)", "race")}</div>
    </div>
    <div class="card col"><div class="title">Runs each week · start → peak km</div>
      ${rb.slots.map((s, k) => `<div class="row">
        <select style="width:auto" onchange="ui.rb.slots[${k}].day=+this.value;${regen}">${WEEKDAYS.map((d, i) => `<option value="${i}" ${i === s.day ? "selected" : ""}>${d}</option>`).join("")}</select>
        <select style="width:auto" onchange="ui.rb.slots[${k}].type=this.value;${regen}">${RUN_TYPES.map((t) => `<option ${t === s.type ? "selected" : ""}>${t}</option>`).join("")}</select>
        <input class="sets-in" inputmode="decimal" value="${esc(s.km0)}" onchange="ui.rb.slots[${k}].km0=this.value;${regen}"><span class="muted">→</span>
        <input class="sets-in" inputmode="decimal" value="${esc(s.km1)}" onchange="ui.rb.slots[${k}].km1=this.value;${regen}">
        <button class="icon" onclick="ui.rb.slots.splice(${k},1);${regen}">${ic("x")}</button></div>`).join("")}
      <button class="btn-t" style="align-self:flex-start" onclick="ui.rb.slots.push({day:3,type:'Easy',km0:'5',km1:'5'});${regen}">${ic("plus")} Run per week</button>
    </div>
    <div class="card" style="padding:8px"><div class="title" style="padding:6px">Preview · tap a distance to change it</div>
      <table class="hist fit"><tr><th>Wk</th>${(rb.weeks[0] ?? []).map((s) => `<th>${WEEKDAYS[s.day]}</th>`).join("")}<th>km</th></tr>
      ${rb.weeks.map((w, i) => `<tr><td>${i + 1}</td>${w.map((s, k) => `<td><input class="ov" inputmode="decimal" value="${fmt(s.km)}" onchange="ui.rb.weeks[${i}][${k}].km=num(this.value)||0;render()">
        <div class="muted" style="font-size:11px">${esc(s.type)}</div></td>`).join("")}<td class="mono">${fmt(w.reduce((a, s) => a + s.km, 0))}</td></tr>`).join("")}</table></div>
    <button class="btn" onclick="saveRunPlan()">Save & start plan</button>`;
}
function saveRunPlan() {
  const rb = ui.rb;
  if (!rb.name.trim()) return alert("Give the plan a name.");
  if (!rb.weeks.length || rb.weeks.some((w) => !w.length)) return alert("Add at least one run per week.");
  const cur = activeRunPlan();
  if (cur && !confirm(`This stops the running plan "${cur.name}". Continue?`)) return;
  if (cur) cur.active = false;
  db.runPlans.push({ id: nextId(), name: rb.name.trim(), start: mondayOf(rb.start), weeks: rb.weeks, active: true });
  ui.rb = null; save(); toast("Running plan started");
}

// ================= STATS =================
const REP_PRS = [1, 2, 3, 4, 5, 6, 8, 10];
const STAT_TABS = [["records", "Lifts"], ["other", "Other bests"], ["bodyweight", "Bodyweight"]];
function renderStats() {
  const tabs = `<div class="seg">${STAT_TABS.map(([k, l]) => `<button class="${ui.statTab === k ? "sel" : ""}" onclick="ui.statTab='${k}';render()">${l}</button>`).join("")}</div>`;
  setTop("Stats", "Personal records", `<button class="btn sm" onclick="openCalc()">Calculator</button>${SETTINGS_BTN}`);
  $("main").innerHTML = tabs + ({ records: statsRecords, bodyweight: statsBodyweight, other: statsOther })[ui.statTab]();
}
function statsBodyweight() {
  const bws = db.bodyweights.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  return `<div class="card col">
      <div class="row sb">${stat("Latest", bws.length ? fmt(bws.at(-1).kg) + " kg" : "–")}${stat("Lowest", bws.length ? fmt(Math.min(...bws.map((b) => b.kg))) + " kg" : "–")}${stat("Highest", bws.length ? fmt(Math.max(...bws.map((b) => b.kg))) + " kg" : "–")}</div>
      ${chart(bws.map((b) => ({ x: b.date, y: b.kg })), "var(--cyan)", "Bodyweight is saved from each workout day")}
    </div>
    <div class="card" style="padding:8px"><table class="hist"><tr><th>Date</th><th>Bodyweight</th><th></th></tr>
      ${bws.slice().reverse().map((b) => `<tr><td class="mono">${dmy(b.date)}</td><td class="mono">${fmt(b.kg)} kg</td>
        <td style="text-align:right"><button class="icon" onclick="deleteBodyweight(${b.id})">${ic("x")}</button></td></tr>`).join("")}
    </table>${bws.length ? "" : `<div class="empty">Enter bodyweight at the top of a workout day</div>`}</div>`;
}
function deleteBodyweight(id) { db.bodyweights = db.bodyweights.filter((b) => b.id !== id); save(); render(); }
// ----- Other bests: any result outside the main lifts (max reps, race times, …) -----
const UNITS = { reps: "Reps", kg: "Weight (kg)", time: "Time (h:mm:ss)" };
const fmtDur = (sec) => {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};
const parseDur = (t) => {
  const p = String(t).trim().split(":").map(Number);
  if (!String(t).trim() || p.some(isNaN) || p.length > 3) return null;
  return p.reduce((acc, v) => acc * 60 + v, 0);
};
const recValue = (r, v) => (r.unit === "time" ? fmtDur(v) : `${fmt(v)} ${r.unit === "kg" ? "kg" : "reps"}`);
/** Best entry: lowest time, otherwise highest value. */
const recBest = (r) => r.entries.reduce((b, e) => (!b || (r.unit === "time" ? e.value < b.value : e.value > b.value) ? e : b), null);

function statsOther() {
  const suggestions = ["Pull-ups max reps", "One-arm pull-up max reps", "Half marathon time", "Overhand deadlift max", "Handstand push-ups max reps", "Muscle-ups max reps", "Plank hold time", "5 km run time"];
  return `${runningBests()}${db.records.map((r) => {
    const best = recBest(r), open = ui.recOpen === r.id;
    return `<div class="card col">
      <div class="row" style="cursor:pointer" onclick="ui.recOpen=${open ? "null" : r.id};render()">
        <div class="grow"><b>${esc(r.name)}</b><div class="muted">${best ? (best.date ? dmy(best.date) : "date unknown") : "no result yet"} · ${r.entries.length} result${r.entries.length === 1 ? "" : "s"}</div></div>
        <span class="mono lime" style="font-size:18px">${best ? recValue(r, best.value) : "–"}</span></div>
      ${open ? `<div class="row"><input id="rv-${r.id}" placeholder="${r.unit === "time" ? "h:mm:ss" : UNITS[r.unit]}" inputmode="${r.unit === "time" ? "text" : "decimal"}">
          <input id="rd-${r.id}" type="date" value="${today()}" style="width:auto"><button class="btn sm" onclick="addRecordEntry(${r.id})">Add</button></div>
        ${r.entries.slice().sort((a, b) => ((b.date || "") > (a.date || "") ? 1 : -1)).map((e) => `<div class="row"><span class="mono grow">${e.date ? dmy(e.date) : "–"}</span>
          <span class="mono">${recValue(r, e.value)}</span><button class="icon" onclick="deleteRecordEntry(${r.id},${e.id})">${ic("x")}</button></div>`).join("")}
        <button class="btn-t red" style="align-self:flex-end" onclick="deleteRecord(${r.id})">Delete this stat</button>` : ""}
    </div>`;
  }).join("")}
    <div class="card col"><div class="title">Track another best</div>
      <label class="f">Name<input id="rec-name" placeholder="e.g. One-arm pull-up max reps"></label>
      ${suggestChips("rec-name", suggestions.filter((s) => !db.records.some((r) => r.name === s)))}
      <label class="f">Measured in<select id="rec-unit">${Object.entries(UNITS).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
      <button class="btn" onclick="addRecord()">Add stat</button></div>`;
}
// Inline chips instead of <datalist>: the native popup renders detached from the input in some browsers.
function suggestChips(inputId, list, multi = false) {
  if (!list.length) return "";
  return `<div class="row wrap" style="gap:6px">${list.map((s) =>
    `<button class="fchip" onclick="pickSuggestion(this,${q(inputId)},${q(s)},${multi})">${esc(s)}</button>`).join("")}</div>`;
}
function pickSuggestion(btn, inputId, value, multi) {
  const input = $(inputId);
  if (!multi) {
    input.value = value;
    btn.parentElement.querySelectorAll(".fchip").forEach((b) => b.classList.toggle("sel", b === btn));
    return;
  }
  const parts = input.value.split(",").map((p) => p.trim()).filter(Boolean);
  const i = parts.indexOf(value);
  i >= 0 ? parts.splice(i, 1) : parts.push(value);
  input.value = parts.join(", ");
  btn.classList.toggle("sel", i < 0);
}
function addRecord() {
  const name = $("rec-name").value.trim();
  if (!name) return alert("Enter a name.");
  const r = { id: nextId(), name, unit: $("rec-unit").value, entries: [] };
  db.records.push(r); ui.recOpen = r.id;
  save(); render();
}
function addRecordEntry(id) {
  const r = db.records.find((x) => x.id === id), raw = $(`rv-${id}`).value;
  const value = r.unit === "time" ? parseDur(raw) : num(raw);
  if (!(value > 0)) return alert(r.unit === "time" ? "Enter a time like 1:45:30." : "Enter a number.");
  r.entries.push({ id: nextId(), date: $(`rd-${id}`).value || today(), value });
  save(); toast(recBest(r).value === value ? "New best!" : "Result saved");
}
function deleteRecordEntry(id, entryId) {
  const r = db.records.find((x) => x.id === id);
  r.entries = r.entries.filter((e) => e.id !== entryId);
  save(); render();
}
function deleteRecord(id) {
  if (!confirm("Delete this stat and all its results?")) return;
  db.records = db.records.filter((r) => r.id !== id);
  save(); render();
}

function statsRecords() {
  // Only show bodyweight that was actually recorded on/before the lift date.
  const bwText = (date) => {
    const kg = db.bodyweights.filter((b) => b.date <= date).sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.kg;
    return kg ? `${fmt(kg)} kg` : "–";
  };
  const main = mainLifts();
  const prs = liftsWithHistory().filter((name) => main.includes(name)).map((name) => {
    const all = allHistory().filter((h) => h.lift === name && h.reps > 0 && h.w != null && isStd(h));
    // Rep max = heaviest load actually lifted for exactly that many reps (unless corrected by hand); 1 rep = 1RM.
    const repMax = Object.fromEntries(REP_PRS.map((r) => {
      const ov = db.prOverrides[name]?.[r];
      return [r, ov ? { ...ov, edited: true } : all.filter((e) => e.reps === r).reduce((b, e) => (!b || e.w > b.w ? e : b), null)];
    }));
    return { name, oneRm: repMax[1], repMax };
  });
  const cls = (pr) => `mono editable ${pr?.edited ? "edited" : ""}`;
  const recs = db.liftRecords.slice().sort((a, b) => a.lift.localeCompare(b.lift) || b.w - a.w);
  // Best logged set (by e1RM) of each lift + variation combination, kept apart from the standard PRs.
  const varBest = {};
  allHistory().filter((h) => !isStd(h) && h.reps > 0 && h.w != null && logType(h.lift).measure === "reps").forEach((h) => {
    const key = `${h.lift}|${modText(h.mods)}`, e1 = Rpe.oneRm(h.w, h.reps, 10, bwOf(h.lift, h.date));
    if (!varBest[key] || e1 > varBest[key].e1) varBest[key] = { h, e1 };
  });
  const vb = Object.values(varBest).sort((a, b) => a.h.lift.localeCompare(b.h.lift) || modText(a.h.mods).localeCompare(modText(b.h.mods)));
  return `
    <div class="card" style="padding:8px"><div class="title" style="padding:6px">1RM · heaviest single</div>
      <table class="hist"><tr><th>Lift</th><th>1RM</th><th>BW</th><th>Date</th></tr>
      ${prs.map((p) => `<tr><td onclick="ui.hist.lift=${q(p.name)};go('history')" style="cursor:pointer"><b>${esc(p.name)}</b></td>
        <td class="${cls(p.oneRm)} lime" onclick="editPr(${q(p.name)},1)">${p.oneRm ? `${fmt(p.oneRm.w)} kg` : "–"}${p.oneRm?.note ? `<div class="muted">${esc(p.oneRm.note)}</div>` : ""}</td>
        <td class="mono">${p.oneRm?.date ? bwText(p.oneRm.date) : ""}</td>
        <td class="mono muted">${p.oneRm?.date ? dmy(p.oneRm.date) : ""}</td></tr>`).join("")}
      </table><div class="muted" style="padding:6px">Tap a value to correct it (e.g. touch-and-go vs paused).</div></div>
    <div class="card" style="padding:8px"><div class="title" style="padding:6px">Rep maxes · heaviest set for exactly N reps</div>
      <table class="hist fit"><tr><th>Lift</th>${REP_PRS.map((r) => `<th>${r}</th>`).join("")}</tr>
      ${prs.map((p) => `<tr><td><b>${esc(p.name)}</b></td>${REP_PRS.map((r) =>
        `<td class="${cls(p.repMax[r])}" onclick="editPr(${q(p.name)},${r})" title="${p.repMax[r]?.date ? dmy(p.repMax[r].date) : ""}">${p.repMax[r] ? fmt(p.repMax[r].w) : "–"}</td>`).join("")}</tr>`).join("")}
      </table></div>
    ${vb.length ? `<div class="card" style="padding:8px"><div class="title" style="padding:6px">Variation bests · from logged sets</div>
      <table class="hist"><tr><th>Lift</th><th>Best set</th><th>e1RM</th><th>Date</th></tr>
      ${vb.map(({ h, e1 }) => `<tr><td><b>${esc(h.lift)}</b><div class="muted">${esc(modText(h.mods))}</div></td><td class="mono lime">${h.reps}x${fmt(h.w)}</td>
        <td class="mono">${fmt(Math.round(e1 * 10) / 10)}</td><td class="mono muted">${dmy(h.date)}</td></tr>`).join("")}
      </table><div class="muted" style="padding:6px">Sets with a variation (paused, pins, bands, chains…) don't count towards the standard PRs above.</div></div>` : ""}
    <div class="card col"><div class="title">Variations & other lifts</div>
      ${recs.length ? `<table class="hist"><tr><th>Lift</th><th>Set</th><th>Date</th><th></th></tr>
        ${recs.map((r) => `<tr><td><b>${esc(r.lift)}</b>${r.variant ? `<div class="muted">${esc(r.variant)}</div>` : ""}</td>
          <td class="mono lime">${r.reps}x${fmt(r.w)}</td><td class="mono muted">${r.date ? dmy(r.date) : ""}</td>
          <td style="text-align:right"><button class="icon" onclick="deleteLiftRecord(${r.id})">${ic("x")}</button></td></tr>`).join("")}</table>`
        : `<div class="muted">e.g. Bench Press · paused, Pull-ups · not clean, or any other lift.</div>`}
      <select id="lr-lift">${db.exercises.map((e) => `<option>${esc(e.name)}</option>`).join("")}</select>
      <label class="f">Variation / note<input id="lr-variant" placeholder="e.g. paused, touch-and-go, clean"></label>
      ${suggestChips("lr-variant", ["paused", "touch-and-go", "clean", "not clean", "belt", "no belt", "straps", "competition"], true)}
      <div class="row"><label class="f">Reps<input id="lr-reps" inputmode="numeric" value="1"></label>
        <label class="f">kg<input id="lr-w" inputmode="decimal"></label>
        <label class="f">Date<input id="lr-date" type="date" value="${today()}"></label></div>
      <button class="btn" onclick="addLiftRecord()">Add record</button></div>`;
}
function addLiftRecord() {
  const reps = parseInt($("lr-reps").value), w = num($("lr-w").value);
  if (!(reps > 0) || w == null) return alert("Enter reps and weight.");
  db.liftRecords.push({ id: nextId(), lift: $("lr-lift").value, variant: $("lr-variant").value.trim(), reps, w, date: $("lr-date").value || null });
  save(); toast("Record added");
}
function deleteLiftRecord(id) { db.liftRecords = db.liftRecords.filter((r) => r.id !== id); save(); render(); }
function editPr(lift, reps) { ui.modal = { type: "pr", lift, reps, cur: db.prOverrides[lift]?.[reps] ?? null }; renderModal(); }
function savePr() {
  const { lift, reps } = ui.modal, w = num($("pr-w").value);
  if (w == null) return alert("Enter a weight.");
  (db.prOverrides[lift] ||= {})[reps] = { w, date: $("pr-date").value || null, note: $("pr-note").value.trim() };
  ui.modal = null; save(); toast("Record updated");
}
function revertPr() {
  const { lift, reps } = ui.modal;
  delete db.prOverrides[lift]?.[reps];
  ui.modal = null; save(); render();
}

// ================= PROGRAMS =================
const progToggle = () => `<div class="seg">${[["programs", "Splits"], ["exercises", "Exercises"]].map(([k, l]) =>
  `<button class="${ui.progTab === k ? "sel" : ""}" onclick="ui.progTab='${k}';render()">${l}</button>`).join("")}</div>`;
function renderPrograms() {
  setTop("Splits", `${db.programs.length} splits`, `<button class="btn sm" onclick="openProgramBuilder()">${ic("plus")} New</button>${SETTINGS_BTN}`);
  const ordered = [currentProgram(), ...db.programs.filter((p) => p.id !== db.currentProgramId)];
  $("main").innerHTML = progToggle() + ordered.map((p) => {
    const open = ui.progOpen[p.id] ?? p.id === db.currentProgramId;
    const isCur = p.id === db.currentProgramId;
    return `<div class="card ${isCur ? "cur-prog" : ""}">
      <div class="row" style="cursor:pointer" onclick="ui.progOpen[${p.id}]=${!open};render()">
        <div class="grow"><b>${esc(p.name)}</b> ${isCur ? '<span class="badge">CURRENT</span>' : ""}
          <div class="muted">${p.days.length}-day split</div></div><span>${chev(open)}</span></div>
      ${open ? `<div class="days">${p.days.map((d) => `<div class="pday"><b>${esc(d.name)}</b>
          ${d.items.map((it) => `<div><span class="mono muted">${esc(setsLabel(it.sets))}</span> ${esc(it.label)}${itemModsTag(it)}</div>`).join("")}</div>`).join("")}</div>
        <div class="row">${isCur ? "" : `<button class="btn" onclick="makeCurrent(${p.id})">Make current</button>`}
          <span class="grow"></span><button class="btn-t" onclick="openProgramBuilder(${p.id})">Edit</button>
          ${isCur ? "" : `<button class="btn-t red" onclick="deleteProgram(${p.id})">Delete</button>`}</div>` : ""}
    </div>`;
  }).join("");
}
function makeCurrent(id) { db.currentProgramId = id; save(); toast("Current split changed"); }
function deleteProgram(id) {
  if (!confirm("Delete this split?")) return;
  db.programs = db.programs.filter((p) => p.id !== id);
  save(); render();
}

function openProgramBuilder(id) {
  const p = id ? program(id) : null;
  ui.pb = p ? JSON.parse(JSON.stringify({ id: p.id, name: p.name, days: p.days, makeCurrent: p.id === db.currentProgramId }))
    : { id: null, name: "", makeCurrent: true, days: [{ name: "Day 1", items: [{ sets: "3", label: "Squat" }] }] };
  $("main").scrollTop = 0; render();
}
function exerciseOptions(selected) {
  const groups = PATTERNS.map((p) => [p, db.exercises.filter((e) => e.pattern === p)]).filter(([, l]) => l.length);
  return `<optgroup label="Placeholder (choose on the day)">${Object.keys(SLOTS).map((s) => `<option ${s === selected ? "selected" : ""}>${esc(s)}</option>`).join("")}</optgroup>` +
    groups.map(([g, l]) => `<optgroup label="${g}">${l.map((e) => `<option ${e.name === selected ? "selected" : ""}>${esc(e.name)}</option>`).join("")}</optgroup>`).join("") +
    (selected && !exByName(selected) && !SLOTS[selected] ? `<option selected>${esc(selected)}</option>` : "");
}
function renderProgramBuilder() {
  const pb = ui.pb;
  setTop(pb.id ? "Edit split" : "New split", `${pb.days.length} days`, `<button class="icon" onclick="ui.pb=null;render()">${ic("x")}</button>`);
  $("main").innerHTML = `
    <label class="f">Split name<input value="${esc(pb.name)}" onchange="ui.pb.name=this.value"></label>
    ${pb.days.map((d, di) => `<div class="card col">
      <div class="row"><input value="${esc(d.name)}" onchange="ui.pb.days[${di}].name=this.value" style="font-weight:700">
        ${pb.days.length > 1 ? `<button class="icon" onclick="ui.pb.days.splice(${di},1);render()">${ic("trash")}</button>` : ""}</div>
      ${d.items.map((it, k) => `<div class="row">
        <input class="sets-in" inputmode="numeric" value="${esc(String(it.sets).replace(/x$/i, ""))}" onchange="ui.pb.days[${di}].items[${k}].sets=this.value;render()" title="Sets">
        <span class="muted">×</span>
        <select onchange="setPbLabel(${di},${k},this.value)">${exerciseOptions(it.label)}</select>
        <button class="icon" onclick="ui.pb.days[${di}].items.splice(${k},1);render()">${ic("x")}</button></div>${SLOTS[it.label] ? poolPicker(it, di, k) : modPicker(it, di, k)}`).join("")}
      <button class="btn-t" onclick="ui.pb.days[${di}].items.push({sets:'3',label:'Leg isolation'});render()">${ic("plus")} Exercise</button>
    </div>`).join("")}
    <button class="btn-o" style="text-align:center" onclick="ui.pb.days.push({name:'Day ${pb.days.length + 1}',items:[]});render()">${ic("plus")} Add day</button>
    <label class="chk-item"><input type="checkbox" ${pb.makeCurrent ? "checked" : ""} onchange="ui.pb.makeCurrent=this.checked"> Set as current split</label>
    <button class="btn" onclick="saveProgram()">Save split</button>`;
}
function setPbLabel(di, k, label) { const it = ui.pb.days[di].items[k]; it.label = label; delete it.pool; delete it.mods; render(); }
/** Under an exercise with variations: which variation each set uses (combine freely; none = standard). */
function modPicker(it, di, k) {
  const vars = variationsOf(it.label);
  if (!vars.length) return "";
  const key = `m${di}-${k}`, open = ui.pbPool === key;
  return `<button class="btn-t sm pool-btn" onclick="ui.pbPool=${open ? "null" : q(key)};render()">Variations · ${esc(itemModsText(it) || "standard")} ${chev(open)}</button>
    ${open ? `<div class="pool col">${Array.from({ length: setCount(it.sets) }, (_, j) => `<div class="row wrap" style="gap:6px"><span class="muted" style="width:44px">Set ${j + 1}</span>
      ${vars.map((v) => `<button class="fchip ${it.mods?.[j]?.includes(v) ? "sel" : ""}" onclick="togglePbMod(${di},${k},${j},${q(v)})">${esc(v)}</button>`).join("")}</div>`).join("")}
      <div class="muted">Used when no cycle plans this exercise. Variation sets don't count towards standard PRs.</div></div>` : ""}`;
}
function togglePbMod(di, k, j, v) {
  const it = ui.pb.days[di].items[k];
  it.mods = Array.from({ length: Math.max(setCount(it.sets), it.mods?.length ?? 0) }, (_, x) => it.mods?.[x] ?? []);
  it.mods[j] = toggled(it.mods[j], v, it.label);
  if (!it.mods.some((m) => m.length)) delete it.mods;
  render();
}
/** A placeholder's default exercises: its own pick (any exercise) or, when none, every exercise matching the slot. */
const poolOf = (it) => resolveItem(it.label, it.pool).options;
/** Under a placeholder: which exercises show up as buttons on the day; "Choose any" adds others from the library. */
function poolPicker(it, di, k) {
  const pool = poolOf(it), all = [...new Set([...slotExercises(it.label), ...pool])];
  const key = `${di}-${k}`, open = ui.pbPool === key;
  return `<button class="btn-t sm pool-btn" onclick="ui.pbPool=${open ? "null" : q(key)};render()">Default exercises · ${it.pool?.length ? pool.length : "all"} ${chev(open)}</button>
    ${open ? `<div class="pool">${all.map((e) => `<button class="fchip ${pool.includes(e) ? "sel" : ""}" onclick="togglePool(${di},${k},${q(e)})">${esc(e)}</button>`).join("")}
      <button class="fchip" onclick="openPicker({ mode: 'pool', di: ${di}, k: ${k} })">${ic("plus")} Choose any…</button></div>` : ""}`;
}
function togglePool(di, k, name) {
  const it = ui.pb.days[di].items[k], pool = poolOf(it);
  const next = pool.includes(name) ? pool.filter((n) => n !== name) : [...pool, name];
  if (!next.length) return; // keep at least one
  const all = slotExercises(it.label);
  if (next.length === all.length && next.every((n) => all.includes(n))) delete it.pool; else it.pool = next;
  render();
}
function saveProgram() {
  const pb = ui.pb;
  if (!pb.name.trim()) return alert("Give the split a name.");
  if (!pb.days.length || pb.days.some((d) => !d.items.length)) return alert("Every day needs at least one exercise.");
  const data = { name: pb.name.trim(), days: pb.days };
  let id = pb.id;
  if (id) Object.assign(program(id), data);
  else { id = nextId(); db.programs.push({ id, notes: "", ...data }); }
  if (pb.makeCurrent) db.currentProgramId = id;
  ui.pb = null; save(); toast("Split saved");
}

// ================= BLOCKS (periodization) =================
function renderBlocks() {
  const tab = ui.blockTab ?? "strength";
  const pastToggle = (key, label, n) => `<button class="row btn-t" style="width:100%;color:var(--t2)" onclick="ui.${key}=!ui.${key};render()">
    <span class="title grow" style="text-align:left">${label} · ${n}</span><span>${chev(ui[key])}</span></button>`;
  if (tab === "running") {
    const act = activeRunPlan(), past = db.runPlans.filter((p) => !p.active).sort((a, b) => (a.start < b.start ? 1 : -1));
    setTop("Cycles", "Running plans", `<button class="btn sm" onclick="openRunBuilder()">${ic("plus")} New plan</button>${SETTINGS_BTN}`);
    $("main").innerHTML = `${segTabs([["strength", "Strength"], ["running", "Running"]], tab, "blockTab")}
      ${act ? runPlanCard(act) : `<div class="card muted">No active running plan. Start one with New plan, or reuse a previous plan below.</div>`}
      ${past.length ? pastToggle("pastRunOpen", "Previous plans", past.length) + (ui.pastRunOpen ? past.map(runPlanCard).join("") : "") : ""}`;
    return;
  }
  const act = activeBlock();
  const past = db.blocks.filter((b) => !b.active).slice().reverse();
  setTop("Cycles", "Periodization", `<button class="btn sm" onclick="openBlockBuilder()">${ic("plus")} New cycle</button>${SETTINGS_BTN}`);
  $("main").innerHTML = `${segTabs([["strength", "Strength"], ["running", "Running"]], tab, "blockTab")}
    ${act ? blockCard(act) : `<div class="card muted">No active cycle. Workouts are pre-filled from your last session.</div>`}
    ${past.length ? pastToggle("pastBlocksOpen", "Previous cycles", past.length) + (ui.pastBlocksOpen ? past.map(blockCard).join("") : "") : ""}
    ${rpeCard()}`;
  rpeRefresh();
}
function blockCard(b) {
  const wk = blockWeek(b);
  const open = ui.blockOpen[b.id] ?? b.active;
  const end = b.ended ?? addDays(b.start, b.weeks * 7 - 1);
  return `<div class="card ${b.active ? "cur-prog" : ""}">
    <div class="row" style="cursor:pointer" onclick="ui.blockOpen[${b.id}]=${!open};render()">
      <div class="grow"><b>${esc(b.name)}</b> ${b.active ? '<span class="badge">ACTIVE</span>' : ""}
        <div class="muted">${dmy(b.start)} – ${dmy(end)} · ${b.blockLens?.length > 1 ? `${b.blockLens.length} blocks · ${b.blockLens.join(" + ")} weeks${hasTest(b) ? " + test" : ""}` : nBlocks(b) > 1 ? `${nBlocks(b)} blocks × ${b.blockWeeks} weeks${hasTest(b) ? " + test" : ""}` : `${b.weeks} weeks`}${b.active && wk >= 1 && wk <= b.weeks ? ` · now ${cyclePos(b, wk)}` : ""}</div>
        <div class="muted">${b.lifts.map((l) => esc(cfgName(l))).join(" · ")}</div></div><span>${chev(open)}</span></div>
    ${open ? `${b.lifts.map((l, li) => planTable(l, l.plan, b.active ? wk : 0, `setTestTarget(${b.id},${li},this.value)`)).join("")}
      <div class="row wrap">${hasTest(b)
        ? `<button class="btn-t" onclick="removeTestWeek(${b.id})">Remove test week</button>`
        : `<button class="btn-t" onclick="addTestWeek(${b.id})">${ic("plus")} Add test week</button>`}
        <span class="grow"></span><button class="btn-t" onclick="openBlockBuilder(${b.id})">Copy as new</button>
        <button class="btn-t red" onclick="deleteBlock(${b.id})">Delete</button></div>` : ""}
  </div>`;
}

// ----- Test week: three singles at 80% · 90% · 100% of a target max -----
function testWeek(lift, target, bw = exByName(lift)?.bw ? BW_FACTOR * bwAt() : 0) {
  const at = (p) => r25((target + bw) * p - bw);
  return { test: true, sets: [{ n: 1, reps: 1, w: at(0.8) }, { n: 1, reps: 1, w: at(0.9) }, { n: 1, reps: 1, w: target }] };
}
/** Default test target: the higher of the block's 1RM and the heaviest single ever logged. */
const defaultTestTarget = (cfg) =>
  r25(Math.max(num(cfg.oneRm) || 0, ...allHistory().filter((h) => h.lift === cfg.lift && h.reps === 1 && isStd(h)).map((h) => h.w)));
const hasTest = (b) => b.lifts.some((l) => l.plan.at(-1)?.test);
function addTestWeek(id) {
  const b = db.blocks.find((x) => x.id === id);
  b.lifts.forEach((l) => { if (!l.variant?.length) l.plan.push(testWeek(l.lift, defaultTestTarget(l))); });
  b.weeks += 1;
  save(); toast("Test week added — tap a target to change it");
}
function removeTestWeek(id) {
  const b = db.blocks.find((x) => x.id === id);
  b.lifts.forEach((l) => { if (l.plan.at(-1)?.test) l.plan.pop(); });
  b.weeks -= 1;
  save(); render();
}
function setTestTarget(id, li, value) {
  const l = db.blocks.find((x) => x.id === id).lifts[li], v = num(value);
  if (v > 0) l.plan[l.plan.length - 1] = testWeek(l.lift, v);
  save(); render();
}

const modelLabel = (c) => c.model === "tmpl" ? METHODS[c.method]?.[0] ?? "" : c.model === "custom" ? "Single + back-offs"
  : `${c.model === "drop" ? "Rep drop" : "Top + back-off"} · ${{ rpe: "RPE", pct: "% of 1RM", kg: "Weight" }[c.method]}`;
/** Week table of a saved cycle; testEdit is the handler for the test target input. */
function planTable(cfg, plan, curWeek = 0, testEdit = null) {
  const tb = cfg.model === "tb", tmpl = cfg.model === "tmpl";
  const one = num(cfg.oneRm), bw = exByName(cfg.lift)?.bw ? BW_FACTOR * (num(cfg.bw) ?? bwAt()) : 0;
  const pct = (w) => (one > 0 ? `${Math.round(((w + bw) / (one + bw)) * 1000) / 10}%` : "");
  const kg = (part, i, w) => fmt(w);
  const testRow = (wk) => {
    const last = wk.sets.at(-1);
    const target = testEdit ? `<input class="ov" inputmode="decimal" value="${fmt(last.w)}" onchange="${testEdit}">` : fmt(last.w);
    return `<td>T</td><td class="mono" colspan="${tb ? 3 : 1}">${wk.sets.slice(0, -1).map(setText).join(" · ")} · 1x${target}</td><td class="mono muted">${pct(last.w)}</td>`;
  };
  return `<div class="plan-tbl"><div class="row"><b>${esc(cfgName(cfg))}</b> <span class="muted grow">${modelLabel(cfg)}</span></div>
    <table class="hist fit"><tr><th>Wk</th>${tb ? `<th>Top</th><th>%</th><th>Back-off</th><th>%</th>` : `<th>Sets</th><th>%</th>`}</tr>
    ${plan.map((wk, i) => {
      const cls = i + 1 === curWeek ? "cur-week" : "";
      const multi = plan.some((x) => x.block > 1);
      const head = multi && wk.block && wk.wk === 1 ? `<tr class="blk-row"><td colspan="${tb ? 5 : 3}">Block ${wk.block}</td></tr>` : "";
      const label = multi && wk.block ? wk.wk : i + 1;
      if (wk.test) return `<tr class="${cls} test-row">${testRow(wk)}</tr>`;
      return head + rowHtml(wk, i, cls, label);
    }).join("")}</table></div>`;
  function rowHtml(wk, i, cls, label) {
    if (tmpl) {
      // Each set group on its own line, % against the 1RM for standard sets (variations have their own 1RM).
      const gs = groupSets(wk.sets), std = wk.sets.filter(isStd);
      return `<tr class="${cls}"><td>${label}</td><td class="mono">${gs.map(setText).join("<br>") || "–"}</td><td class="mono muted">${std.length && cfg.method !== "kg" ? pct(Math.max(...std.map((s) => s.w))) : ""}</td></tr>`;
    }
    if (cfg.model === "custom") {
      const heaviest = Math.max(...wk.sets.map((s) => s.w));
      return `<tr class="${cls}"><td>${label}</td><td class="mono">${groupSets(wk.sets).map(setText).join(" · ")}</td><td class="mono muted">${pct(heaviest)}</td></tr>`;
    }
    const top = wk.sets[0], bo = wk.sets.filter((s) => s.kind === "Back-off");
    return `<tr class="${cls}"><td>${label}</td>
      ${tb ? `<td class="mono">${top.reps}x${kg("T", i, top.w)}${modsLine([top])}</td><td class="mono muted">${pct(top.w)}</td>
             <td class="mono">${bo.length ? `${bo.length}x${bo[0].reps}x${kg("B", i, bo[0].w)}` : "–"}${modsLine(bo)}</td><td class="mono muted">${bo.length ? pct(bo[0].w) : ""}</td>`
        : `<td class="mono">${wk.sets.length}x${top.reps}x${kg("T", i, top.w)}${modsLine(wk.sets)}</td><td class="mono muted">${pct(top.w)}</td>`}</tr>`;
  }
}
/** Variations of a group of sets: one label when they all match, else per set ("std / Band / Band + Pin"). */
function modsLine(sets) {
  if (!sets.some((x) => x.mods?.length)) return "";
  const texts = sets.map((x) => modText(x.mods) || "std");
  return `<div class="mods">${esc(texts.every((t) => t === texts[0]) ? texts[0] : texts.join(" / "))}</div>`;
}
function deleteBlock(id) {
  if (!confirm("Delete this cycle?")) return;
  db.blocks = db.blocks.filter((b) => b.id !== id);
  save(); render();
}

// ----- Cycle builder: ① generate a template · ② edit it · ③ check each exercise -----
const SHARED = ["model", "rDw", "bDw", "boKg", "boSets", "sets", "method", "rpeT0", "rpeT1", "rpeB0", "rpeB1", "pctT0", "pctT1", "pctB0", "pctB1", "kgStep"];
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const BLOCK_LOAD = { rpe: "0.5", pct: "5", kg: "10" };
function newGen() {
  return {
    blocks: "1", weeks: "6", test: false, cR0: "6", cRd: "-2", bR0: "", bRd: "", cLd: BLOCK_LOAD.rpe,
    def: { model: "tb", method: "rpe", rDw: "-1", bDw: "", boKg: "-10", boSets: "2", sets: "3", rpeT0: "8", rpeT1: "9.5", rpeB0: "7", rpeB1: "8.5",
      pctT0: "85", pctT1: "92.5", pctB0: "72.5", pctB1: "82.5", kgStep: "2.5" },
  };
}
function newLift(lift, oneRm) {
  const e1 = num(oneRm) ?? r25(e1Of(lift));
  return { lift, one: { "": fmt(e1) }, start: { "": fmt(r25(e1 * 0.8)) }, bw: fmt(bwAt()), custom: false, tmpl: null, over: {}, testMax: "" };
}
/** The template an exercise uses: its own once customized, else the shared one. */
const effTmpl = (L) => (L.custom && L.tmpl ? L.tmpl : ui.be.tmpl);
const tmplOf = (s) => (s == null ? ui.be.tmpl : ui.be.lifts[s].tmpl);
const usersOf = (s) => (s == null ? ui.be.lifts.filter((L) => !L.custom) : [ui.be.lifts[s]]);
/** Adding or removing weeks, blocks or set groups shifts positions, so hand-set weights of those exercises reset. */
const structChanged = (s) => usersOf(s).forEach((L) => (L.over = {}));
/** A set line across the template: its kind and variation (e.g. "Back-off|Band"). */
const lineKey = (g) => `${g.kind}|${modText(g.mods)}`;
/** Set lines of one block (or the whole template) in order of first appearance. */
function tmplLines(t, bi = null) {
  const m = new Map();
  (bi == null ? t.blocks : [t.blocks[bi]]).forEach((b) => b.weeks.forEach((w) => w.groups.forEach((g) => { if (!m.has(lineKey(g))) m.set(lineKey(g), { key: lineKey(g), kind: g.kind, mods: g.mods ?? [] }); })));
  return [...m.values()];
}
/**
 * The template as one exercise uses it, without needing its own template: per block and set line it can use another
 * variation (L.vmods["block:line"] = mods) or leave the line out (= "off"), and it can add set lines of its own with
 * their own progression per block (L.extra). Extra sets go after the template's, so hand-set weights keep their place.
 * (Keys without a block came from an earlier version and apply to every block.)
 */
function liftT(L) {
  const t = clone(effTmpl(L)), vm = L.vmods ?? {};
  t.blocks.forEach((blk, bi) => {
    blk.weeks.forEach((wk) => wk.groups.forEach((g) => {
      const v = vm[`${bi}:${lineKey(g)}`] ?? vm[lineKey(g)];
      if (v === "off") g.sets = 0; else if (Array.isArray(v)) g.mods = [...v];
    }));
    (L.extra ?? []).filter((x) => x.method === t.method && (x.bi == null || x.bi === bi)).forEach((x) => blk.weeks.forEach((wk, i, all) =>
      wk.groups.push({ kind: x.kind, sets: x.sets, reps: Math.max(1, Math.round(x.r0 + i * x.rd)), load: lerp(x.l0, x.l1, i, all.length), mods: [...x.mods] })));
  });
  return t;
}
const testTarget = (L) => num(L.testMax) || defaultTestTarget({ lift: L.lift, oneRm: L.one?.[""] });

function openBlockBuilder(copyId) {
  const src = copyId ? db.blocks.find((b) => b.id === copyId) : null;
  if (src?.builder) {
    ui.be = { ...clone(src.builder), name: `${src.name} (copy)`, start: today(), step: 2, scope: null, gform: null };
  } else if (src) {
    // Cycles saved before templates existed: rebuild the scheme from their settings and generate a template.
    const g0 = src.lifts.find((l) => l.model !== "custom" && !l.variant?.length), g = newGen();
    const srcN = src.blockWeeks ?? src.weeks - (hasTest(src) ? 1 : 0);
    if (g0) {
      Object.assign(g.def, Object.fromEntries(SHARED.filter((k) => g0[k] != null).map((k) => [k, g0[k]])));
      g.def.rDw ??= String(srcN > 1 ? Math.round((num(g0.topR1) - num(g0.topR0)) / (srcN - 1)) : 0);
      Object.assign(g, { cR0: g0.cR0 || g0.topR0 || "6", cRd: g0.cRd ?? "-2", bR0: g0.bR0 ?? "", bRd: g0.bRd ?? "",
        cLd: g0.cLm === g.def.method ? g0.cLd ?? BLOCK_LOAD[g.def.method] : BLOCK_LOAD[g.def.method] });
    }
    Object.assign(g, { blocks: String(src.blocks ?? 1), weeks: String(srcN), test: hasTest(src) });
    const names = [...new Set(src.lifts.map((l) => l.lift))];
    ui.be = { step: 2, name: `${src.name} (copy)`, start: today(), gen: g, tmpl: generateTemplate(g),
      lifts: names.map((n) => newLift(n, src.lifts.find((l) => l.lift === n && !l.variant?.length)?.oneRm)), scope: null, allEx: false, chart: 0 };
  } else {
    ui.be = { step: 1, name: "", start: today(), gen: newGen(), tmpl: null, lifts: ["Squat", "Bench Press", "Deadlift"].map((n) => newLift(n)), scope: null, allEx: false, chart: 0 };
  }
  $("main").scrollTop = 0; render();
}
function goStep(k, scope = null) {
  const be = ui.be;
  if (k > 1 && !be.tmpl) return;
  Object.assign(be, { step: k, scope: k === 2 ? scope : null, gform: null });
  $("main").scrollTop = 0; render();
}
function renderBlockBuilder() {
  const be = ui.be;
  if (be.scope != null && !be.lifts[be.scope]?.custom) be.scope = null;
  const lift = be.step === 2 && be.scope != null ? be.lifts[be.scope].lift : null;
  setTop(lift ? `${esc(lift)} template` : "New cycle", ["Generate a template from a weekly scheme", "Edit the template · sets, reps, blocks, variations", "Check each exercise's weights, then save"][be.step - 1],
    `<button class="icon" onclick="ui.be=null;render()">${ic("x")}</button>`);
  const steps = `<div class="seg steps">${[[1, "① Template"], [2, "② Edit"], [3, "③ Exercises"]].map(([k, l]) =>
    `<button class="${be.step === k ? "sel" : ""}" ${k > 1 && !be.tmpl ? "disabled" : ""} onclick="goStep(${k})">${l}</button>`).join("")}</div>`;
  $("main").innerHTML = steps + [beStep1, beStep2, beStep3][be.step - 1]();
}
const field = (path, c) => (label, key, mode = "decimal") =>
  `<label class="f">${label}<input inputmode="${mode}" value="${esc(c[key])}" onchange="${path}.${key}=this.value;render()"></label>`;
/** Like field(), but empty means "same as …" and the placeholder shows that value. */
const fieldP = (path, c) => (label, key, auto, mode = "numeric") =>
  `<label class="f">${label}<input inputmode="${mode}" value="${esc(c[key] ?? "")}" placeholder="${esc(auto ?? "")}" onchange="${path}.${key}=this.value;render()"></label>`;

// ----- ① Template: cycle length, exercises and a weekly scheme that generates the template -----
function beStep1() {
  const be = ui.be, g = be.gen, d = g.def, f = field("ui.be.gen", g), fp = fieldP("ui.be.gen", g), fd = field("ui.be.gen.def", d), fpd = fieldP("ui.be.gen.def", d);
  const n = parseInt(g.weeks) || 0, nb = Math.max(1, parseInt(g.blocks) || 1), total = n * nb + (g.test ? 1 : 0), tb = d.model !== "drop", m = d.method;
  const seg = (key, opts, extra = () => "") => `<div class="seg">${opts.map(([v, l]) => `<button class="${d[key] === v ? "sel" : ""}" onclick="ui.be.gen.def.${key}='${v}';${extra(v)}render()">${l}</button>`).join("")}</div>`;
  const ranges = {
    rpe: `<div class="row">${fd("Top RPE start", "rpeT0")}${fd("→ end", "rpeT1")}</div>${tb ? `<div class="row">${fd("Back-off RPE start", "rpeB0")}${fd("→ end", "rpeB1")}</div>` : ""}`,
    pct: `<div class="row">${fd("Top % start", "pctT0")}${fd("→ end", "pctT1")}</div>${tb ? `<div class="row">${fd("Back-off % start", "pctB0")}${fd("→ end", "pctB1")}</div>` : ""}`,
    kg: `<div class="row">${fd("+kg / week", "kgStep")}${tb ? fd("Back-off kg vs top", "boKg") : ""}</div><div class="muted">Each exercise's start kg is set in step ②.</div>`,
  }[m];
  const r0 = num(g.cR0) ?? 5, b0 = num(g.bR0) ?? r0, rd = num(d.rDw) ?? 0, bd = num(d.bDw) ?? rd;
  const seq = (a, step) => Array.from({ length: Math.min(n, 8) }, (_, i) => Math.max(1, Math.round(a + i * step))).join(" → ") + (n > 8 ? " → …" : "");
  // Exercises: main lifts by default; "Show all" offers every exercise logged with a weight.
  const free = (e) => !be.lifts.some((L) => L.lift === e.name);
  const mainFree = db.exercises.filter((e) => e.main && free(e));
  const others = be.allEx ? PATTERNS.map((p) => [p, db.exercises.filter((e) => !e.main && free(e) && e.pattern === p && e.measure !== "time" && e.load !== "bw")]).filter(([, l]) => l.length) : [];
  const opts = (l) => l.map((e) => `<option>${esc(e.name)}</option>`).join("");
  return `
    <div class="card col">
      <label class="f">Cycle name<input value="${esc(be.name)}" placeholder="e.g. Winter strength" onchange="ui.be.name=this.value"></label>
      <label class="f">Start date<input type="date" value="${be.start}" onchange="ui.be.start=this.value;render()"></label>
      <div class="row">${f("Blocks", "blocks", "numeric")}${f("Weeks per block", "weeks", "numeric")}</div>
      <div class="muted">${n > 0 ? `${total} weeks · ${dmy(be.start)} – ${dmy(addDays(be.start, total * 7 - 1))} · blocks and weeks can be added or removed in step ②` : ""}</div>
      <label class="chk-item"><input type="checkbox" ${g.test ? "checked" : ""} onchange="ui.be.gen.test=this.checked;render()"> Test week at the end (singles at 80% · 90% · 100% of target)</label>
    </div>
    <div class="card col"><div class="title">Exercises</div>
      <div class="opt-list">${be.lifts.map((L, i) => `<button class="fchip sel" onclick="removeLift(${i})" title="Remove">${esc(L.lift)}${L.custom ? " · own template" : ""} ${ic("x")}</button>`).join("")}</div>
      ${mainFree.length || others.length ? `<select onchange="if(this.value)addLift(this.value)"><option value="">${be.allEx ? "Add exercise…" : "Add main lift…"}</option>
        ${be.allEx ? `${mainFree.length ? `<optgroup label="Main lifts">${opts(mainFree)}</optgroup>` : ""}${others.map(([p, l]) => `<optgroup label="${esc(p)}">${opts(l)}</optgroup>`).join("")}` : opts(mainFree)}</select>` : ""}
      <label class="chk-item"><input type="checkbox" ${be.allEx ? "checked" : ""} onchange="ui.be.allEx=this.checked;render()"> Show all exercises, not only main lifts</label>
    </div>
    <div class="card col"><div class="title">Weekly scheme · every block</div>
      ${seg("model", [["tb", "Top + back-off"], ["drop", "Rep drop"]])}
      <div class="row">${f(tb ? "Top start reps" : "Start reps", "cR0", "numeric")}${tb ? fp("Back-off start reps", "bR0", g.cR0) : ""}</div>
      ${tb ? `<div class="row">${fd("Top reps / week", "rDw")}${fpd("Back-off reps / week", "bDw", d.rDw, "decimal")}${fd("Back-off sets", "boSets", "numeric")}</div>`
        : `<div class="row">${fd("Reps change / week", "rDw")}${fd("Sets", "sets", "numeric")}</div>`}
      <div class="muted">Load method</div>
      ${seg("method", Object.entries(METHODS).map(([k, [l]]) => [k, l]), (v) => `ui.be.gen.cLd='${BLOCK_LOAD[v]}';`)}
      ${ranges}
      ${n > 0 ? `<div class="muted">Block 1 reps · ${tb ? `top ${seq(r0, rd)} · back-off ${seq(b0, bd)}` : seq(r0, rd)}</div>` : ""}
    </div>
    ${nb > 1 ? `<div class="card col"><div class="title">Block to block</div>
      <div class="row">${f(tb ? "Top reps / block" : "Reps / block", "cRd")}${tb ? fp("Back-off reps / block", "bRd", g.cRd, "decimal") : ""}</div>
      <div class="row">${f(`Load / block (${METHODS[m][2]})`, "cLd")}</div>
      <div class="muted">Each block can follow a different pattern in step ②.</div></div>` : ""}
    <button class="btn" onclick="generateNow()">Generate template →</button>`;
}
function addLift(name) { ui.be.lifts.push(newLift(name)); render(); }
function removeLift(i) {
  const L = ui.be.lifts[i];
  if (L.custom && !confirm(`Remove ${L.lift} and its own template?`)) return;
  ui.be.lifts.splice(i, 1); ui.be.chart = 0; render();
}
function generateNow() {
  const be = ui.be;
  if (!be.lifts.length) return alert("Add at least one exercise.");
  if (!(parseInt(be.gen.weeks) > 0)) return alert("Weeks per block must be a number.");
  if (be.tmpl && !confirm("Replace the shared template? Your edits in step ② are lost (customized exercises keep theirs).")) return;
  be.tmpl = generateTemplate(be.gen);
  be.lifts.forEach((L) => { if (!L.custom) L.over = {}; });
  goStep(2);
}

// ----- ② Edit: blocks (pattern, weeks), set groups (sets × reps @ load, variation) and 1RMs -----
const S_ = (s) => (s == null ? "null" : s);
/** Variations offered in the template: every variation of its exercises, plus any already used. */
function varChoices(s) {
  const used = tmplOf(s).blocks.flatMap((b) => b.weeks.flatMap((w) => w.groups.flatMap((g) => g.mods ?? [])));
  return [...new Set([...usersOf(s).flatMap((L) => variationsOf(L.lift)), ...used])];
}
/** Variation combinations used in a template: [key, mods], standard first. */
function usedMods(t) {
  const m = new Map([["", []]]);
  t.blocks.forEach((b) => b.weeks.forEach((w) => w.groups.forEach((g) => m.set(modText(g.mods), g.mods ?? []))));
  return [...m];
}
function beStep2() {
  const be = ui.be, s = be.scope, t = tmplOf(s), S = S_(s), users = usersOf(s);
  const custom = be.lifts.filter((L) => L.custom).map((L) => L.lift);
  const head = s == null
    ? `<div class="card col"><div class="title">Shared template</div>
        <div class="muted">${users.length ? `Used by ${users.map((L) => esc(L.lift)).join(", ")}.` : "Every exercise has its own template."}${custom.length ? ` Own templates (edit in ③): ${custom.map(esc).join(", ")}.` : ""}</div>
        <div class="muted">Tap any number to change it. Weights are worked out per exercise in step ③.</div></div>`
    : `<div class="card col"><div class="title">${esc(be.lifts[s].lift)} only</div>
        <div class="muted">Changes here apply only to ${esc(be.lifts[s].lift)}.</div>
        <button class="btn-o sm" style="align-self:flex-start" onclick="goStep(3)">← Back to exercises</button></div>`;
  return `${head}${oneTable(t, s)}
    ${t.blocks.map((blk, bi) => blockEditor(t, blk, bi, s)).join("")}
    <button class="btn-o" style="text-align:center" onclick="addBlock(${S})">${ic("plus")} Add block</button>
    <label class="chk-item"><input type="checkbox" ${t.test ? "checked" : ""} onchange="tmplOf(${S}).test=this.checked;render()"> Test week at the end (singles at 80% · 90% · 100% of target)</label>
    <button class="btn" onclick="goStep(3)">Continue to exercises →</button>`;
}
/** 1RM (start kg for the kg method) of each exercise for standard sets and every variation the template uses. */
function oneTable(t, s) {
  const be = ui.be, idx = s == null ? be.lifts.map((_, i) => i).filter((i) => !be.lifts[i].custom) : [s];
  if (!idx.length) return "";
  const kg = t.method === "kg", mods = usedMods(t), anyBw = idx.some((i) => exByName(be.lifts[i].lift)?.bw);
  const cell = (i, [key, m]) => {
    const L = be.lifts[i], map = (kg ? L.start : L.one) ?? {};
    if (!liftOk(L, { mods: m })) return `<td class="muted">n/a</td>`;
    const auto = key ? fmt(oneFor(t, { ...L, [kg ? "start" : "one"]: { "": map[""] } }, m)) : "";
    return `<td><input class="ov" inputmode="decimal" value="${esc(map[key] ?? "")}" placeholder="${esc(auto)}" onchange="setOne(${i},${q(key)},this.value)"></td>`;
  };
  return `<div class="card col"><div class="title">${kg ? "Start kg" : "1RM"} · per exercise and variation</div>
    <div class="mwrap"><table class="hist fit"><tr><th>Exercise</th>${mods.map(([key]) => `<th>${key ? esc(key) : "Standard"}</th>`).join("")}${anyBw ? "<th>BW</th>" : ""}</tr>
    ${idx.map((i) => `<tr><td><b>${esc(be.lifts[i].lift)}</b></td>${mods.map((m) => cell(i, m)).join("")}
      ${anyBw ? `<td>${exByName(be.lifts[i].lift)?.bw ? `<input class="ov" inputmode="decimal" value="${esc(be.lifts[i].bw)}" onchange="ui.be.lifts[${i}].bw=this.value;render()">` : ""}</td>` : ""}</tr>`).join("")}
    </table></div>
    ${mods.length > 1 ? `<div class="muted">Empty variation = ${kg ? "the standard start kg" : "best logged e1RM for that variation, else the standard 1RM"} (shown faint). n/a = not a variation of that exercise; those sets are skipped.</div>` : ""}
    ${anyBw ? `<div class="muted">Bodyweight lifts: 1RM is added load, (0.9·BW + kg).</div>` : ""}</div>`;
}
function setOne(i, key, value) {
  const L = ui.be.lifts[i], map = effTmpl(L).method === "kg" ? (L.start ||= {}) : (L.one ||= {});
  const v = String(value).trim();
  if (v === "" && key) delete map[key]; else map[key] = v;
  render();
}
function blockEditor(t, blk, bi, s) {
  const S = S_(s), gf = ui.be.gform;
  return `<div class="card col tblk">
    <div class="row"><b class="grow" style="font-size:16px">Block ${bi + 1}</b><span class="muted">${blk.weeks.length} week${blk.weeks.length === 1 ? "" : "s"}</span>
      <button class="icon" title="Duplicate block" aria-label="Duplicate block" onclick="copyBlock(${S},${bi})">${ic("copy")}</button>
      ${t.blocks.length > 1 ? `<button class="icon" title="Remove block" aria-label="Remove block" onclick="removeBlock(${S},${bi})">${ic("trash")}</button>` : ""}</div>
    <div class="seg">${[["tb", "Top + back-off"], ["drop", "Rep drop"]].map(([m, l]) => `<button class="${blk.model === m ? "sel" : ""}" onclick="setBlockModel(${S},${bi},'${m}')">${l}</button>`).join("")}</div>
    ${blockVars(t, bi, s)}
    ${blk.weeks.map((wk, wi) => `<div class="twk"><div class="row"><span class="title grow">Week ${wi + 1}</span>
        <button class="btn-t sm" onclick="addGroup(${S},${bi},${wi})">${ic("plus")} Sets</button>
        <button class="icon" title="Duplicate week" aria-label="Duplicate week" onclick="copyWeek(${S},${bi},${wi})">${ic("copy")}</button>
        ${blk.weeks.length > 1 ? `<button class="icon" title="Remove week" aria-label="Remove week" onclick="removeWeek(${S},${bi},${wi})">${ic("trash")}</button>` : ""}</div>
      ${wk.groups.map((g, gi) => groupRow(t, g, s, bi, wi, gi)).join("") || `<div class="muted">No sets — rest week.</div>`}</div>`).join("")}
    <div class="row wrap"><button class="btn-t sm" onclick="addWeek(${S},${bi})">${ic("plus")} Week</button><span class="grow"></span>
      <button class="btn-t sm" onclick="openGForm(${S},${bi})">${ic("plus")} Sets to every week…</button></div>
    ${gf && gf.s === s && gf.bi === bi ? gformCard(t, s) : ""}
  </div>`;
}
function groupRow(t, g, s, bi, wi, gi) {
  const S = S_(s), [, pre, unit] = METHODS[t.method], at = `${S},${bi},${wi},${gi}`;
  const inp = (k, cls, mode) => `<input class="${cls}" inputmode="${mode}" value="${fmt(g[k])}" onchange="setG(${at},'${k}',this.value)">`;
  return `<div class="tg-row"><button class="kindbtn" title="Set type" onclick="cycleKind(${at})">${kindLabel(g.kind)}</button>
      ${inp("sets", "n-in", "numeric")}<span class="muted">×</span>${inp("reps", "n-in", "numeric")}
      <span class="muted">${pre}</span>${inp("load", "l-in", "decimal")}<span class="muted u">${unit}</span>
      <span class="tg-mods">${g.mods?.length ? esc(modText(g.mods)) : ""}</span>
      <button class="icon" title="Remove sets" aria-label="Remove sets" onclick="removeGroup(${at})">${ic("x")}</button></div>`;
}
const grp = (s, bi, wi, gi) => tmplOf(s).blocks[bi].weeks[wi].groups[gi];
const dropOver = (s, bi, wi, gi) => usersOf(s).forEach((L) => delete L.over?.[`${bi}-${wi}-${gi}`]);
function setG(s, bi, wi, gi, key, value) {
  const v = num(value);
  if (v != null && (key === "load" || v >= (key === "sets" ? 0 : 1))) { grp(s, bi, wi, gi)[key] = key === "load" ? v : Math.round(v); dropOver(s, bi, wi, gi); }
  render();
}
function cycleKind(s, bi, wi, gi) {
  const g = grp(s, bi, wi, gi), k = KINDS.findIndex(([v]) => v === g.kind);
  g.kind = KINDS[(k + 1) % KINDS.length][0];
  render();
}
/** Variations are set per block: one row per set line (top, back-off, …), applied to every week of the block. */
function blockVars(t, bi, s) {
  const S = S_(s), vars = varChoices(s), lines = tmplLines(t, bi);
  if (!lines.length) return "";
  return `<div class="bvars"><div class="muted">Variations · whole block</div>
    ${lines.map((l) => `<div class="row wrap" style="gap:6px"><span class="bv-name">${kindLabel(l.kind)}</span>
      ${vars.map((v) => `<button class="fchip ${l.mods.includes(v) ? "sel" : ""}" onclick="toggleBlockMod(${S},${bi},${q(l.key)},${q(v)})">${esc(v)}</button>`).join("")
        || `<span class="muted">No variations — add them in Splits → Exercises.</span>`}</div>`).join("")}</div>`;
}
function toggleBlockMod(s, bi, key, v) {
  const name = usersOf(s)[0]?.lift;
  tmplOf(s).blocks[bi].weeks.forEach((wk, wi) => wk.groups.forEach((g, gi) => {
    if (lineKey(g) !== key) return;
    g.mods = toggled(g.mods, v, name);
    dropOver(s, bi, wi, gi);
  }));
  render();
}
function edit(s, fn) { fn(tmplOf(s)); structChanged(s); render(); }
const blankGroup = (t, model) => ({ kind: model === "drop" ? "Set" : "Back-off", sets: 1, reps: 5, load: { rpe: 7, pct: 70, kg: 0 }[t.method], mods: [] });
function addGroup(s, bi, wi) {
  edit(s, (t) => { const blk = t.blocks[bi], gs = blk.weeks[wi].groups, last = gs.at(-1); gs.push(last ? { ...clone(last), kind: last.kind === "TOP" ? "Back-off" : last.kind } : blankGroup(t, blk.model)); });
}
function removeGroup(s, bi, wi, gi) { edit(s, (t) => t.blocks[bi].weeks[wi].groups.splice(gi, 1)); }
function addWeek(s, bi) { edit(s, (t) => { const w = t.blocks[bi].weeks; w.push(clone(w.at(-1) ?? { groups: [] })); }); }
function copyWeek(s, bi, wi) { edit(s, (t) => { const w = t.blocks[bi].weeks; w.splice(wi + 1, 0, clone(w[wi])); }); }
function removeWeek(s, bi, wi) { edit(s, (t) => t.blocks[bi].weeks.splice(wi, 1)); }
function copyBlock(s, bi) { edit(s, (t) => t.blocks.splice(bi + 1, 0, clone(t.blocks[bi]))); }
function removeBlock(s, bi) {
  if (!confirm(`Remove block ${bi + 1}?`)) return;
  edit(s, (t) => t.blocks.splice(bi, 1));
}
/** The next block continues the step-① scheme (reps and load change per block) with the last block's pattern and length. */
function addBlock(s) {
  edit(s, (t) => { const last = t.blocks.at(-1); t.blocks.push(genBlock(ui.be.gen, t.blocks.length, last?.model, last?.weeks.length, t.method)); });
}
/** Switching a block's pattern regenerates its weeks from the scheme; variation and extra sets stay. */
function setBlockModel(s, bi, model) {
  const blk = tmplOf(s).blocks[bi];
  if (blk.model === model || !confirm(`Make block ${bi + 1} ${model === "drop" ? "rep drop" : "top + back-off"}? Its top and back-off sets are generated again; variation and extra sets stay.`)) return;
  edit(s, (t) => {
    const fresh = genBlock(ui.be.gen, bi, model, blk.weeks.length, t.method);
    t.blocks[bi] = { model, weeks: fresh.weeks.map((wk, wi) => ({ groups: [...wk.groups, ...(blk.weeks[wi]?.groups ?? []).filter((g) => g.mods?.length || g.kind === "Extra")] })) };
  });
}
// "Sets to every week": a set group with its own progression (start reps + change per week, load start → end).
function openGForm(s, bi) {
  const t = tmplOf(s);
  ui.be.gform = { s, bi, kind: "Back-off", mods: [], sets: "2", r0: "5", rd: "0", l0: { rpe: "7", pct: "70", kg: "-20" }[t.method], l1: { rpe: "8", pct: "77.5", kg: "-10" }[t.method], all: false };
  render();
}
function gformCard(t, s) {
  const gf = ui.be.gform, f = field("ui.be.gform", gf), [, , unit] = METHODS[t.method], vars = varChoices(s);
  return `<div class="gform col">
    <div class="title">Add sets to every week · own progression</div>
    <div class="seg">${[["Back-off", "Back-off sets"], ["Extra", "Extra sets"]].map(([k, l]) => `<button class="${gf.kind === k ? "sel" : ""}" onclick="ui.be.gform.kind='${k}';render()">${l}</button>`).join("")}</div>
    <div class="muted">Variation (combine any, none = standard)</div>
    <div class="row wrap" style="gap:6px">${vars.map((v) => `<button class="fchip ${gf.mods.includes(v) ? "sel" : ""}" onclick="ui.be.gform.mods=toggled(ui.be.gform.mods,${q(v)},usersOf(ui.be.gform.s)[0]?.lift);render()">${esc(v)}</button>`).join("") || `<span class="muted">No variations yet.</span>`}</div>
    <div class="row">${f("Sets", "sets", "numeric")}${f("Start reps", "r0", "numeric")}${f("Reps / week", "rd")}</div>
    <div class="row">${f(`Load start (${unit})`, "l0")}${f("→ end", "l1")}</div>
    <label class="chk-item"><input type="checkbox" ${gf.all ? "checked" : ""} onchange="ui.be.gform.all=this.checked"> Add to every block</label>
    <div class="row"><span class="grow"></span><button class="btn-t" onclick="ui.be.gform=null;render()">Cancel</button><button class="btn sm" onclick="applyGForm()">Add</button></div></div>`;
}
function applyGForm() {
  const gf = ui.be.gform, sets = parseInt(gf.sets), r0 = num(gf.r0), rd = num(gf.rd) ?? 0, l0 = num(gf.l0), l1 = num(gf.l1) ?? l0;
  if (!(sets > 0) || !(r0 >= 1) || l0 == null) return alert("Enter sets, start reps and a start load.");
  edit(gf.s, (t) => (gf.all ? t.blocks : [t.blocks[gf.bi]]).forEach((blk) => blk.weeks.forEach((wk, i, all) =>
    wk.groups.push({ kind: gf.kind, sets, reps: Math.max(1, Math.round(r0 + i * rd)), load: lerp(l0, l1, i, all.length), mods: [...gf.mods] }))));
  ui.be.gform = null; render();
}

// ----- ③ Exercises: each exercise's weights; customize to give it its own template -----
function beStep3() {
  const be = ui.be;
  if (!be.lifts.length) return `<div class="card muted">No exercises — add some in step ①.</div>`;
  const ci = Math.min(be.chart || 0, be.lifts.length - 1), L = be.lifts[ci], t = liftT(L);
  const chips = be.lifts.length > 1 ? `<div class="row wrap">${be.lifts.map((x, i) =>
    `<button class="fchip ${i === ci ? "sel" : ""}" onclick="ui.be.chart=${i};render()">${esc(x.lift)}</button>`).join("")}</div>` : "";
  return `<div class="card col">${chips}<div class="row"><span class="muted grow">${esc(L.lift)} · first set by week</span>
      <span class="muted"><span class="lime">━</span> kg${t.method === "kg" ? "" : " · % of 1RM"} &nbsp; ▮ reps</span></div>
      ${stairsChart({ lift: L.lift, oneRm: L.one?.[""], bw: L.bw }, liftPlan(t, L), t.method !== "kg")}</div>
    ${be.lifts.map((x, i) => liftCard(x, i)).join("")}
    <button class="btn" onclick="saveBlock()">Save & set active</button>`;
}
function liftCard(L, i) {
  const t = liftT(L), W = liftWeights(t, L), kg = t.method === "kg", bw = liftBw(L);
  const anyOver = Object.keys(L.over ?? {}).length > 0;
  const pct = (g, w) => { const one = oneFor(t, L, g.mods); return kg || !(one + bw > 0) ? "" : `${Math.round(((w + bw) / (one + bw)) * 1000) / 10}%`; };
  const rows = t.blocks.map((blk, bi) => `${t.blocks.length > 1 ? `<tr class="blk-row"><td colspan="3">Block ${bi + 1} · ${blk.model === "drop" ? "rep drop" : "top + back-off"}</td></tr>` : ""}
    ${blk.weeks.map((wk, wi) => {
      const gs = wk.groups.map((g, gi) => [g, gi]).filter(([g]) => liftOk(L, g) && parseInt(g.sets) > 0);
      return `<tr><td>${wi + 1}</td><td class="mono">${gs.map(([g, gi]) => `<div class="wline">${g.sets}x${g.reps}x<input class="ov ${L.over?.[`${bi}-${wi}-${gi}`] != null ? "edited" : ""}" inputmode="decimal" value="${fmt(W[bi][wi][gi])}" onchange="setOver(${i},'${bi}-${wi}-${gi}',this.value)">${modTag(g.mods)}</div>`).join("") || "–"}</td>
        <td class="mono muted">${gs.map(([g, gi]) => `<div class="wline">${pct(g, W[bi][wi][gi])}</div>`).join("")}</td></tr>`;
    }).join("")}`).join("");
  const test = t.test ? (() => { const tw = testWeek(L.lift, testTarget(L), bw); return `<tr class="test-row"><td>T</td><td class="mono" colspan="2">${tw.sets.slice(0, -1).map(setText).join(" · ")} · 1x<input class="ov" inputmode="decimal" value="${fmt(tw.sets.at(-1).w)}" onchange="ui.be.lifts[${i}].testMax=this.value;render()"></td></tr>`; })() : "";
  const live = { blocks: t.blocks.map((b) => ({ weeks: b.weeks.map((w) => ({ groups: w.groups.filter((g) => parseInt(g.sets) > 0) })) })) };
  const mods = usedMods(live).filter(([, m]) => liftOk(L, { mods: m })), map = (kg ? L.start : L.one) ?? {};
  return `<div class="card col">
    <div class="row"><b class="grow" style="font-size:18px">${esc(L.lift)}</b>${L.custom ? '<span class="badge sm">OWN TEMPLATE</span>' : ""}
      <button class="icon" title="Remove exercise" aria-label="Remove exercise" onclick="removeLift(${i})">${ic("trash")}</button></div>
    <div class="row wrap">${mods.map(([key, m]) => `<label class="f one-f">${key ? esc(key) : kg ? "Start kg" : "1RM kg"}<input inputmode="decimal" value="${esc(map[key] ?? "")}"
      placeholder="${key ? esc(fmt(oneFor(t, { ...L, [kg ? "start" : "one"]: { "": map[""] } }, m))) : ""}" onchange="setOne(${i},${q(key)},this.value)"></label>`).join("")}</div>
    <label class="chk-item"><input type="checkbox" ${L.custom ? "checked" : ""} onchange="setCustom(${i},this.checked)"> Make this exercise different (own template)</label>
    ${L.custom ? `<button class="btn-o sm" style="align-self:flex-start" onclick="goStep(2,${i})">Edit ${esc(L.lift)} template →</button>` : ""}
    ${liftLines(L, i)}
    <div class="plan-tbl"><div class="row"><span class="muted grow">${METHODS[t.method][0]} · tap a weight to set it yourself</span>
      ${anyOver ? `<button class="btn-t sm" onclick="ui.be.lifts[${i}].over={};render()">Reset weights</button>` : ""}</div>
      <table class="hist fit"><tr><th>Wk</th><th>Sets</th><th>${kg ? "" : "%"}</th></tr>${rows}${test}</table></div>
  </div>`;
}
/** ③ Per exercise: change, add or remove variations of each set line (top, back-off, …) without its own template. */
function liftLines(L, i) {
  const t = effTmpl(L), vm = L.vmods ?? {}, open = ui.be.vopen === i;
  const changed = Object.keys(vm).length + (L.extra?.length ?? 0);
  const head = `<button class="btn-t sm pool-btn" onclick="ui.be.vopen=${open ? "null" : i};ui.be.xform=null;render()">Sets & variations per block${changed ? ` · ${changed} change${changed > 1 ? "s" : ""}` : ""} ${chev(open)}</button>`;
  if (!open) return head;
  const everyBlock = (L.extra ?? []).map((x, k) => [x, k]).filter(([x]) => x.bi == null);
  return `${head}<div class="col vbox">
    <div class="muted">Only for ${esc(L.lift)}, block by block. Variation sets use their own 1RM above.</div>
    ${t.blocks.map((_, bi) => liftBlockLines(L, i, t, bi)).join("")}
    ${everyBlock.length ? `<div class="vblock col"><div class="title">Every block</div>${everyBlock.map(([x, k]) => extraRow(L, i, t, x, k)).join("")}</div>` : ""}</div>`;
}
function liftBlockLines(L, i, t, bi) {
  const vm = L.vmods ?? {}, vars = variationsOf(L.lift);
  const lines = tmplLines(t, bi).map((l) => {
    const v = vm[`${bi}:${l.key}`] ?? vm[l.key], off = v === "off", cur = Array.isArray(v) ? v : l.mods;
    const chips = [...new Set([...vars, ...cur])].map((x) => `<button class="fchip ${cur.includes(x) ? "sel" : ""}" ${off ? "disabled" : ""} onclick="setLineMod(${i},${bi},${q(l.key)},${q(x)})">${esc(x)}</button>`).join("");
    return `<div class="vline ${off ? "off" : ""}"><div class="row"><b class="grow">${kindLabel(l.kind)}${l.mods.length ? ` <span class="mods">${esc(modText(l.mods))} in template</span>` : ""}</b>
        <button class="btn-t sm ${off ? "" : "red"}" onclick="toggleLineOff(${i},${bi},${q(l.key)})">${off ? "Add back" : "Remove"}</button></div>
      ${off ? `<div class="muted">Left out in block ${bi + 1}.</div>` : `<div class="row wrap" style="gap:6px">${chips || `<span class="muted">${esc(L.lift)} has no variations — add them in Splits → Exercises.</span>`}</div>`}</div>`;
  }).join("");
  const extras = (L.extra ?? []).map((x, k) => [x, k]).filter(([x]) => x.bi === bi).map(([x, k]) => extraRow(L, i, t, x, k)).join("");
  const xf = ui.be.xform;
  return `<div class="vblock col"><div class="title">Block ${bi + 1}</div>${lines}${extras}
    ${xf?.i === i && xf.bi === bi ? xformCard(L, i, t) : `<button class="btn-t sm" style="align-self:flex-start" onclick="openXForm(${i},${bi})">${ic("plus")} Add sets to block ${bi + 1}</button>`}</div>`;
}
function extraRow(L, i, t, x, k) {
  return `<div class="vline"><div class="row"><span class="grow"><b>${kindLabel(x.kind)}</b> ${x.mods.length ? `<span class="mods">${esc(modText(x.mods))}</span>` : "std"}
      <span class="muted">· ${x.sets}×${fmt(x.r0)}${x.rd ? ` (${x.rd > 0 ? "+" : ""}${fmt(x.rd)}/wk)` : ""} · ${fmt(x.l0)}→${fmt(x.l1)} ${METHODS[t.method][2]}${x.method !== t.method ? " · other load method, not used" : ""}</span></span>
      <button class="icon" title="Remove" aria-label="Remove" onclick="ui.be.lifts[${i}].extra.splice(${k},1);render()">${ic("x")}</button></div></div>`;
}
function setLineMod(i, bi, key, v) {
  const L = ui.be.lifts[i], vm = (L.vmods ||= {}), k = `${bi}:${key}`;
  const base = tmplLines(effTmpl(L), bi).find((l) => l.key === key)?.mods ?? [];
  const cur = vm[k] ?? vm[key];
  const next = toggled(Array.isArray(cur) ? cur : base, v, L.lift);
  // An all-blocks setting from an earlier version is split up, so this block can differ from the others.
  if (vm[key] != null) { effTmpl(L).blocks.forEach((_, b) => { if (b !== bi) vm[`${b}:${key}`] ??= vm[key]; }); delete vm[key]; }
  if (modText(next) === modText(base)) delete vm[k]; else vm[k] = next;
  L.over = {}; render();
}
function toggleLineOff(i, bi, key) {
  const L = ui.be.lifts[i], vm = (L.vmods ||= {}), k = `${bi}:${key}`;
  if (vm[key] != null) { effTmpl(L).blocks.forEach((_, b) => { if (b !== bi) vm[`${b}:${key}`] ??= vm[key]; }); vm[k] ??= vm[key]; delete vm[key]; }
  if (vm[k] === "off") delete vm[k]; else vm[k] = "off";
  render();
}
function openXForm(i, bi) {
  const m = effTmpl(ui.be.lifts[i]).method;
  ui.be.xform = { i, bi, kind: "Back-off", mods: [], sets: "2", r0: "5", rd: "0", l0: { rpe: "7", pct: "70", kg: "-20" }[m], l1: { rpe: "8", pct: "77.5", kg: "-10" }[m] };
  render();
}
function xformCard(L, i, t) {
  const xf = ui.be.xform, f = field("ui.be.xform", xf), [, , unit] = METHODS[t.method];
  return `<div class="gform col">
    <div class="title">Add sets to block ${xf.bi + 1} · ${esc(L.lift)} only</div>
    <div class="seg">${[["Back-off", "Back-off sets"], ["Extra", "Extra sets"]].map(([k, l]) => `<button class="${xf.kind === k ? "sel" : ""}" onclick="ui.be.xform.kind='${k}';render()">${l}</button>`).join("")}</div>
    <div class="row wrap" style="gap:6px">${variationsOf(L.lift).map((v) => `<button class="fchip ${xf.mods.includes(v) ? "sel" : ""}" onclick="ui.be.xform.mods=toggled(ui.be.xform.mods,${q(v)},${q(L.lift)});render()">${esc(v)}</button>`).join("") || `<span class="muted">No variations — these will be standard sets.</span>`}</div>
    <div class="row">${f("Sets", "sets", "numeric")}${f("Start reps", "r0", "numeric")}${f("Reps / week", "rd")}</div>
    <div class="row">${f(`Load start (${unit})`, "l0")}${f("→ end", "l1")}</div>
    <div class="row"><span class="grow"></span><button class="btn-t" onclick="ui.be.xform=null;render()">Cancel</button><button class="btn sm" onclick="applyXForm()">Add</button></div></div>`;
}
function applyXForm() {
  const xf = ui.be.xform, L = ui.be.lifts[xf.i], sets = parseInt(xf.sets), r0 = num(xf.r0), l0 = num(xf.l0);
  if (!(sets > 0) || !(r0 >= 1) || l0 == null) return alert("Enter sets, start reps and a start load.");
  (L.extra ||= []).push({ kind: xf.kind, mods: [...xf.mods], sets, r0, rd: num(xf.rd) ?? 0, l0, l1: num(xf.l1) ?? l0, bi: xf.bi, method: effTmpl(L).method });
  ui.be.xform = null; render();
}
function setOver(i, key, value) {
  const L = ui.be.lifts[i], v = num(value);
  L.over ||= {};
  if (v == null) delete L.over[key]; else L.over[key] = v;
  render();
}
function setCustom(i, on) {
  const L = ui.be.lifts[i];
  if (on) { L.custom = true; L.tmpl = clone(ui.be.tmpl); L.over = {}; return goStep(2, i); }
  if (!confirm(`Use the shared template for ${L.lift} again? Its own template is discarded.`)) return render();
  Object.assign(L, { custom: false, tmpl: null, over: {} });
  render();
}
/** First set per week: reps as bars, kg as a line broken at each block, labelled with kg (and % of 1RM). */
function stairsChart(cfg, plan, showPct = true) {
  const weeks = plan.filter((wk) => !wk.test && wk.sets.length);
  if (!weeks.length) return "";
  const W = 360, H = 190, padX = 8, top = 34, bottom = 22, n = weeks.length, bw = (W - 2 * padX) / n;
  const reps = weeks.map((wk) => wk.sets[0].reps), kg = weeks.map((wk) => wk.sets[0].w);
  const maxR = Math.max(...reps), lo = Math.min(...kg), hi = Math.max(...kg), span = hi - lo || 1;
  const yR = (v) => H - bottom - (v / maxR) * (H - bottom - top) * 0.35;
  const yK = (v) => top + (1 - (v - lo) / span) * (H - bottom - top) * 0.5;
  const x = (i) => padX + i * bw + bw / 2, fs = n > 16 ? 7 : 9, labelAll = n <= 16;
  let out = "";
  weeks.forEach((wk, i) => {
    out += `<rect x="${padX + i * bw + 1.5}" y="${yR(reps[i])}" width="${bw - 3}" height="${H - bottom - yR(reps[i])}" rx="2" fill="var(--sx)"/>
      <text x="${x(i)}" y="${H - bottom - 4}" font-size="${fs}" fill="var(--t2)" text-anchor="middle">${reps[i]}</text>`;
  });
  const groups = [];
  weeks.forEach((wk, i) => (groups.at(-1)?.block === wk.block ? groups.at(-1).idx.push(i) : groups.push({ block: wk.block, idx: [i] })));
  groups.forEach(({ block, idx }, b) => {
    const x0 = padX + idx[0] * bw, x1 = padX + (idx.at(-1) + 1) * bw;
    if (b) out += `<line x1="${x0}" x2="${x0}" y1="${top - 10}" y2="${H - bottom}" stroke="var(--o)" stroke-dasharray="3 3"/>`;
    out += `<polyline fill="none" stroke="var(--lime)" stroke-width="2" points="${idx.map((i) => `${x(i).toFixed(1)},${yK(kg[i]).toFixed(1)}`).join(" ")}"/>`;
    if (groups.length > 1) out += `<text x="${(x0 + x1) / 2}" y="${H - 6}" font-size="10" fill="var(--t2)" text-anchor="middle">Block ${block}</text>`;
    idx.forEach((i, j) => {
      out += `<circle cx="${x(i)}" cy="${yK(kg[i])}" r="2.5" fill="var(--lime)"/>`;
      if (labelAll || j === 0 || j === idx.length - 1) {
        out += `<text x="${x(i)}" y="${yK(kg[i]) - (showPct ? 15 : 6)}" font-size="${fs}" fill="var(--t)" text-anchor="middle">${fmt(kg[i])}</text>`;
        if (showPct) out += `<text x="${x(i)}" y="${yK(kg[i]) - 6}" font-size="${fs}" fill="var(--lime)" text-anchor="middle">${Math.round(shareOf(cfg, kg[i]) * 100)}%</text>`;
      }
    });
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${out}</svg>`;
}
function saveBlock() {
  const be = ui.be;
  if (!be.name.trim()) { goStep(1); return alert("Give the cycle a name."); }
  if (!be.lifts.length) return alert("Add at least one exercise.");
  const cur = activeBlock();
  if (cur && !confirm(`This ends the active cycle "${cur.name}". Continue?`)) return;
  if (cur) { cur.active = false; cur.ended = addDays(be.start, -1) < cur.start ? cur.start : addDays(be.start, -1); }
  const plans = be.lifts.map((L) => ({ L, t: liftT(L), core: liftPlan(liftT(L), L) }));
  const coreN = Math.max(...plans.map((p) => p.core.length)), anyTest = plans.some((p) => p.t.test);
  const lifts = plans.map(({ L, t, core }) => ({
    lift: L.lift, model: "tmpl", method: t.method, oneRm: t.method === "kg" ? "" : L.one?.[""] ?? "", bw: L.bw,
    // Shorter custom templates rest until the others finish, so test weeks line up.
    plan: [...core, ...Array.from({ length: coreN - core.length }, () => ({ sets: [] })), ...(t.test ? [testWeek(L.lift, testTarget(L), liftBw(L))] : [])],
  }));
  const lens = be.tmpl.blocks.map((b) => b.weeks.length);
  db.blocks.push({ id: nextId(), name: be.name.trim(), start: be.start, weeks: coreN + (anyTest ? 1 : 0), blocks: lens.length, blockLens: lens, active: true, lifts,
    builder: clone({ ...be, step: 2, scope: null, gform: null }) });
  ui.be = null; save(); toast("Cycle saved and active");
}

function rpeCard() {
  if (ui.rpeBase === "") ui.rpeBase = fmt(r25(sessionsOf("Squat").find((s) => s.e1)?.e1 ?? 100));
  return `<div class="card col"><div class="row"><div class="title grow">RPE table</div>
      <label class="f" style="max-width:120px">1RM kg<input inputmode="decimal" value="${esc(ui.rpeBase)}" oninput="ui.rpeBase=this.value;rpeRefresh()"></label></div>
    <div class="mwrap" id="rpe-matrix"></div></div>`;
}
function rpeRefresh() {
  const base = num(ui.rpeBase), el = $("rpe-matrix");
  if (!el) return;
  let h = `<table class="m"><tr><th>RPE\\Reps</th>${[...Array(12)].map((_, i) => `<th>${i + 1}</th>`).join("")}</tr>`;
  RPE_VALUES.forEach((p) => {
    h += `<tr><th>${p}</th>${[...Array(12)].map((_, i) => `<td>${base ? fmt(Rpe.floor(base * Rpe.pct(i + 1, p), STEP)) : ""}</td>`).join("")}</tr>`;
  });
  el.innerHTML = h + "</table>";
}

// ================= EXERCISES =================
function renderExercises() {
  const qText = ui.exq.trim().toLowerCase();
  const counts = {};
  allHistory().forEach((h) => (counts[h.lift] = (counts[h.lift] || 0) + 1));
  const list = db.exercises.filter((e) => (ui.exPattern === "All" || (ui.exPattern === "Main lifts" ? e.main : e.pattern === ui.exPattern)) &&
    (!qText || [e.name, ...musclesOf(e), e.pattern, ...(e.variations ?? [])].some((s) => s.toLowerCase().includes(qText))));
  const groups = PATTERNS.filter((p) => list.some((e) => e.pattern === p));
  setTop("Exercises", `${db.exercises.length} exercises`, `<button class="btn sm" onclick="openExercise()">${ic("plus")} Add</button>${SETTINGS_BTN}`);
  $("main").innerHTML = `${progToggle()}
    <input id="ex-search" placeholder="Search name, muscle, pattern…" value="${esc(ui.exq)}" oninput="ui.exq=this.value;searchExercises()">
    <div class="hscroll">${["All", "Main lifts", ...PATTERNS].map((p) => `<button class="fchip ${ui.exPattern === p ? "sel" : ""}" onclick="ui.exPattern=${q(p)};render()">${p}</button>`).join("")}</div>
    ${groups.map((g) => `<div class="title">${g}</div>${list.filter((e) => e.pattern === g).map((e) => `
      <div class="card ex-row" onclick="openExercise(${e.id})">
        <div class="grow"><b>${esc(e.name)}</b>${e.main ? ' <span class="badge">MAIN</span>' : ""}${e.custom ? ' <span class="badge sm">custom</span>' : ""}
          <div class="tags">${musclesOf(e).map((m, k) => `<span class="${k ? "sec" : ""}">${esc(m)}</span>`).join("")}<span>${esc(e.mechanic)}</span>${e.load && e.load !== "kg" ? `<span>${e.load === "bw" ? "Bodyweight" : "BW + kg"}</span>` : ""}${e.measure === "time" ? "<span>Hold</span>" : ""}</div>
          ${e.variations?.length ? `<div class="mods">Variations: ${esc(e.variations.join(", "))}</div>` : ""}</div>
        ${counts[e.name] ? `<span class="muted">${counts[e.name]} sets</span>` : ""}
      </div>`).join("")}`).join("")}`;
}
function searchExercises() {
  const pos = $("ex-search").selectionStart;
  render();
  const el = $("ex-search"); el.focus(); el.setSelectionRange(pos, pos);
}
/** after: a picker target (see openPicker) that receives the new exercise once it is saved. */
/** Muscle groups of an exercise, primary first. */
const musclesOf = (e) => (e.muscles?.length ? e.muscles : [e.muscle].filter(Boolean));
function openExercise(id, after, name = "") {
  const e = id ? db.exercises.find((x) => x.id === id) : { name, muscle: "Chest", pattern: "Horizontal Push", mechanic: "Compound", measure: "reps", load: "kg", bw: false, main: false, custom: true };
  ui.modal = { type: "exercise", e: { ...e, muscles: [...musclesOf(e)], variations: [...(e.variations ?? [])] }, after };
  renderModal();
}
/** A new pattern keeps only the muscle groups that pattern can train. */
function setExPattern(p) {
  const e = ui.modal.e, ok = PATTERN_MUSCLES[p] ?? MUSCLES;
  e.pattern = p; e.muscles = e.muscles.filter((m) => ok.includes(m));
  renderModal();
}
/** First muscle picked is the primary one; tapping a picked muscle removes it. */
function toggleExMuscle(m) {
  const list = ui.modal.e.muscles, k = list.indexOf(m);
  k >= 0 ? list.splice(k, 1) : list.push(m);
  renderModal();
}
function makePrimary(m) { const e = ui.modal.e; e.muscles = [m, ...e.muscles.filter((x) => x !== m)]; renderModal(); }
function addExVariation() {
  const e = ui.modal.e, v = $("exm-var").value.trim();
  if (!v) return;
  if (!e.variations.some((x) => x.toLowerCase() === v.toLowerCase())) e.variations.push(v);
  renderModal();
  $("exm-var")?.focus();
}
function removeExVariation(k) { ui.modal.e.variations.splice(k, 1); renderModal(); }
function saveExercise() {
  const e = ui.modal.e;
  e.name = String(e.name ?? "").trim();
  e.bw = e.load !== "kg";
  if (!e.name) return alert("Name is required.");
  if (!e.muscles.length) return alert("Pick at least one muscle group.");
  e.muscle = e.muscles[0];
  if (db.exercises.some((x) => x.name.toLowerCase() === e.name.toLowerCase() && x.id !== e.id)) return alert("An exercise with that name already exists.");
  if (e.id) Object.assign(db.exercises.find((x) => x.id === e.id), e);
  else db.exercises.push({ ...e, id: nextId(), custom: true });
  const after = ui.modal.after;
  save(); ui.modal = null;
  if (after) return pickExercise(e.name, after);
  toast(`${e.name} saved`);
}
function deleteExercise() {
  const e = ui.modal.e;
  if (!confirm(`Delete ${e.name}?`)) return;
  db.exercises = db.exercises.filter((x) => x.id !== e.id);
  save(); ui.modal = null; render();
}

// ================= Backup =================
function exportData() {
  flushSave();
  const name = `gymlog-backup-${today()}.json`, json = JSON.stringify(db);
  if (window.AndroidBackup) return AndroidBackup.exportFile(name, json); // calls onExported() when written
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  onExported();
}
function onExported() { db.lastExport = today(); ui.modal = null; save(); toast("Backup saved"); }
function importData() {
  if (window.AndroidBackup) return AndroidBackup.pickFile(); // calls onImportText(text)
  const input = document.createElement("input");
  input.type = "file"; input.accept = ".json,application/json";
  input.onchange = () => input.files[0]?.text().then(onImportText);
  input.click();
}
function onImportText(text) {
  let data = null;
  try { data = JSON.parse(text); } catch { /* handled below */ }
  if (!data || !Array.isArray(data.logs) || !Array.isArray(data.programs) || !Array.isArray(data.exercises)) return alert("That file is not a GymLog backup.");
  if ((data.schema || 1) > SCHEMA) return alert("This backup is from a newer GymLog version. Update the app first.");
  if (!confirm(`Replace ALL current data with this backup (${data.logs.length} sets)?`)) return;
  storage.setItem(`${STORE}-before-restore`, JSON.stringify(db)); // safety copy of what was replaced
  db = migrate(data);
  STEP = db.settings.step || 2.5;
  applyAccent();
  ui.modal = null; ui.view = db.workout ? ui.view : "home";
  save(); toast("Backup restored");
}

// ================= Settings =================
/** Accent colour drives every highlight (buttons, ticks, badges); --pc is its 13% tint, --pb its 45% border. */
function applyAccent() {
  const hex = /^#[0-9a-f]{6}$/i.test(db.settings.accent ?? "") ? db.settings.accent : ACCENTS[0][0];
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  document.documentElement.style.setProperty("--lime", hex);
  document.documentElement.style.setProperty("--pc", `rgba(${r}, ${g}, ${b}, 0.13)`);
  document.documentElement.style.setProperty("--pb", `rgba(${r}, ${g}, ${b}, 0.45)`);
}
function setAccent(hex) { db.settings.accent = hex; applyAccent(); save(); render(); }
function openSettings() { ui.settings = true; ui.modal = null; $("main").scrollTop = 0; render(); }
function renderSettings() {
  const s = db.settings, kb = Math.round(JSON.stringify(db).length / 1024), accent = s.accent ?? ACCENTS[0][0];
  setTop("Settings", "GymLog", `<button class="icon" title="Close" onclick="ui.settings=false;render()">${ic("x")}</button>`);
  $("main").innerHTML = `
    <div class="card col"><div class="title">Appearance · accent colour</div>
      <div class="row wrap" style="gap:10px">${ACCENTS.map(([hex, name]) => `<button class="accent-dot ${hex === accent ? "sel" : ""}" style="background:${hex}" title="${name}" aria-label="${name}" onclick="setAccent('${hex}')"></button>`).join("")}
        <label class="accent-dot custom ${ACCENTS.some(([h]) => h === accent) ? "" : "sel"}" title="Custom" style="background:${esc(accent)}"><input type="color" value="${esc(accent)}" onchange="setAccent(this.value)"></label></div></div>
    <div class="card col"><div class="title">Backup & restore</div>
      <div class="muted">Your data lives only on this device. Export a backup file now and then and keep it somewhere safe (Drive, email, PC). The same file can be imported on another phone.</div>
      <div class="muted">${db.logs.length} sets · ${db.runs.length} runs · ${kb} KB · last backup: ${db.lastExport ? dmy(db.lastExport) : "never"}</div>
      <div class="row"><button class="btn grow" onclick="exportData()">Export backup</button><button class="btn-o grow" style="text-align:center" onclick="importData()">Import backup…</button></div></div>
    <div class="card col"><div class="title">Barbell & plates</div>
      <div class="row"><label class="f">Bar kg<input inputmode="decimal" value="${fmt(s.bar)}" onchange="setSetting('bar',this.value)"></label>
        <label class="f">Round loads to<select onchange="setSetting('step',this.value)">${[2.5, 2, 1.25, 1, 0.5].map((v) => `<option value="${v}" ${v === s.step ? "selected" : ""}>${v} kg</option>`).join("")}</select></label></div>
      <label class="f">Plate sizes you have (kg)<input value="${s.plates.join(", ")}" onchange="setSetting('plates',this.value)"></label></div>
    <div class="card col"><div class="title">Resistance bands · lightest first</div>
      ${db.bands.map((b, k) => `<div class="row"><input type="color" value="${esc(b.color)}" onchange="setBand(${k},'color',this.value)" class="swatch">
        <input value="${esc(b.name)}" onchange="setBand(${k},'name',this.value)">
        <button class="icon" ${k ? "" : "disabled"} title="Move up" onclick="moveBand(${k})">${ic("arrowUp")}</button>
        <button class="icon" title="Delete" onclick="deleteBand(${k})">${ic("x")}</button></div>`).join("")}
      <button class="btn-t" style="align-self:flex-start" onclick="addBand()">${ic("plus")} Band</button></div>
    <div class="muted" style="text-align:center">GymLog · data version ${db.schema}</div>`;
}
function setSetting(key, value) {
  const s = db.settings;
  if (key === "plates") s.plates = String(value).split(/[,;\s]+/).map(num).filter((v) => v > 0).sort((a, b) => b - a);
  else {
    const v = num(value);
    if (!(v > 0)) { alert("Enter a positive number."); return render(); }
    s[key] = v;
  }
  if (key === "step") STEP = s.step;
  save(); render();
}
function setBand(k, field, value) {
  const b = db.bands[k];
  if (field === "name") {
    const name = value.trim();
    if (!name || db.bands.some((x, j) => j !== k && x.name.toLowerCase() === name.toLowerCase())) { alert("Band names must be unique."); return render(); }
    // Logged sets and the open workout refer to bands by name.
    db.logs.forEach((l) => { if (l.band === b.name) l.band = name; });
    db.workout?.items.forEach((it) => it.rows?.forEach((r) => { if (r.band === b.name) r.band = name; }));
    b.name = name;
  } else b[field] = value;
  save(); render();
}
function moveBand(k) { const [b] = db.bands.splice(k, 1); db.bands.splice(k - 1, 0, b); save(); render(); }
function addBand() {
  let n = db.bands.length + 1;
  while (bandOf(`Band ${n}`)) n++;
  db.bands.push({ name: `Band ${n}`, color: "#8fb5d6" });
  save(); render();
}
function deleteBand(k) {
  const b = db.bands[k], used = db.logs.filter((l) => l.band === b.name).length;
  if (!confirm(used ? `Delete ${b.name}? ${used} logged sets lose their band marker.` : `Delete ${b.name}?`)) return;
  db.bands.splice(k, 1); save(); render();
}

// ================= Calculator (Stats) =================
function openCalc() {
  ui.modal = { type: "calc", tab: ui.calcTab ?? "1rm", lift: "", w: "", reps: "", rpe: "10", work: "", workReps: "5" };
  renderModal();
}
function renderCalc(m, scrim) {
  const tabs = `<div class="seg">${[["1rm", "1RM"], ["warm", "Warm-up"]].map(([k, l]) =>
    `<button class="${m.tab === k ? "sel" : ""}" onclick="ui.modal.tab='${k}';ui.calcTab='${k}';renderModal()">${l}</button>`).join("")}</div>`;
  const inp = (label, key, mode = "decimal") => `<label class="f">${label}<input inputmode="${mode}" value="${esc(m[key])}" oninput="ui.modal.${key}=this.value;calcRefresh()"></label>`;
  const lifts = [...new Set([...mainLifts(), ...db.exercises.filter((e) => e.load === "bw+").map((e) => e.name)])];
  const body = m.tab === "1rm"
    ? `<label class="f">Lift<select onchange="ui.modal.lift=this.value;calcRefresh()"><option value="">Any barbell lift</option>
        ${lifts.map((n) => `<option ${n === m.lift ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
      <div class="row">${inp("kg", "w")}${inp("Reps", "reps", "numeric")}${inp("RPE", "rpe")}</div>`
    : `<div class="row">${inp("Working weight kg", "work")}${inp("Work reps", "workReps", "numeric")}</div>`;
  $("modal").innerHTML = `${scrim}<div class="dialog">
    <div class="row"><h2 class="grow">Calculator</h2><button class="icon" onclick="ui.modal=null;render()">${ic("x")}</button></div>
    ${tabs}${body}<div id="calc-out" class="col"></div></div>`;
  calcRefresh();
}
function calcRefresh() {
  const m = ui.modal, out = $("calc-out");
  if (m.tab === "1rm") {
    const w = num(m.w), reps = parseInt(m.reps), rpe = num(m.rpe) ?? 10;
    const bw = m.lift && exByName(m.lift)?.bw ? BW_FACTOR * bwAt() : 0;
    const one = w != null && reps > 0 ? Rpe.oneRm(w, reps, Math.min(10, Math.max(6, rpe)), bw) : null;
    if (one == null) { out.innerHTML = `<div class="muted">Enter the weight and reps of a set. RPE 10 = nothing left; 8 = two reps left.</div>`; return; }
    const at = (r, p) => fmt(Rpe.floor((one + bw) * Rpe.pct(r, p) - bw, STEP));
    out.innerHTML = `<div class="calc-big"><span class="muted">Estimated 1RM</span><b class="mono lime">${fmt(Math.round(one * 10) / 10)} kg</b></div>
      ${bw ? `<div class="muted">Added load, using 0.9 × ${fmt(bwAt())} kg bodyweight.</div>` : ""}
      <table class="hist fit"><tr><th>Reps</th>${[10, 9, 8, 7].map((p) => `<th>@${p}</th>`).join("")}</tr>
      ${[1, 2, 3, 4, 5, 6, 8, 10, 12].map((r) => `<tr><td>${r}</td>${[10, 9, 8, 7].map((p) => `<td class="mono">${at(r, p)}</td>`).join("")}</tr>`).join("")}</table>`;
    return;
  }
  const work = num(m.work), workReps = parseInt(m.workReps) || 5, bar = db.settings.bar;
  if (!(work > bar)) { out.innerHTML = `<div class="muted">Enter a working weight above the bar (${fmt(bar)} kg).</div>`; return; }
  const plates = (kg) => {
    let side = (kg - bar) / 2;
    const list = [];
    for (const p of db.settings.plates) while (side >= p - 1e-9) { list.push(p); side -= p; }
    return list.length ? list.map(fmt).join(" + ") + (side > 0.01 ? ` (+${fmt(Math.round(side * 100) / 100)})` : "") : "bar";
  };
  const sets = [...warmupSets(work, bar), { w: work, reps: workReps, work: true }];
  out.innerHTML = `<table class="hist fit"><tr><th></th><th>Set</th><th>Plates per side</th></tr>
    ${sets.map((s, k) => `<tr class="${s.work ? "cur-week" : ""}"><td class="muted">${s.work ? "Work" : k + 1}</td>
      <td class="mono">${s.reps}x${fmt(s.w)}</td><td class="mono muted">${plates(s.w)}</td></tr>`).join("")}</table>
    <div class="muted">Last two warm-up singles at 80 % and 90 % of the working weight. Bar ${fmt(bar)} kg — change it in Settings.</div>`;
}
/** The last warm-ups before a working weight: singles at 80% and 90% (lighter ramp sets are left to feel). */
function warmupSets(work, bar) {
  const sets = [];
  [[0.8, 1], [0.9, 1]].forEach(([p, reps]) => {
    const w = Rpe.round(work * p, STEP);
    if (w < bar || w >= work || sets.some((s) => s.w >= w)) return;
    sets.push({ w, reps });
  });
  return sets;
}

// ================= Modal =================
function renderModal() {
  const m = ui.modal;
  if (!m) { $("modal").innerHTML = ""; return; }
  const scrim = `<div class="scrim" onclick="ui.modal=null;render()"></div>`;
  if (m.type === "session") {
    $("modal").innerHTML = `${scrim}<div class="dialog">
      <h2>${esc(m.lift)}</h2>
      <label class="f">Date<input type="date" value="${m.date}" onchange="ui.modal.date=this.value"></label>
      ${setsTable(m.lift, m.rows, (j, f) => `ui.modal.rows[${j}].${f}=this.value`, (j) => `ui.modal.rows[${j}].band=nextBand(ui.modal.rows[${j}].band);renderModal()`,
        (r, j) => `<button class="icon" onclick="ui.modal.rows.splice(${j},1);ui.modRow=null;renderModal()">${ic("x")}</button>`, () => "", "m")}
      <button class="btn-t" style="align-self:flex-start" onclick="ui.modal.rows.push({...(ui.modal.rows.at(-1) ?? {reps:'',t:'',w:'',band:''})});renderModal()">${ic("plus")} Set</button>
      <div class="row">${m.orig ? `<button class="btn-t red" onclick="deleteSession()">Delete</button>` : ""}<span class="grow"></span>
        <button class="btn-t" onclick="ui.modal=null;render()">Cancel</button><button class="btn" onclick="saveSession()">Save</button></div></div>`;
    return;
  }
  if (m.type === "run") return renderRunModal(m, scrim);
  if (m.type === "calc") return renderCalc(m, scrim);
  if (m.type === "addEx") {
    $("modal").innerHTML = `${scrim}<div class="dialog">
      <div class="row"><h2 class="grow">${m.target.mode === "add" ? "Add exercise" : "Choose any exercise"}</h2><button class="icon" onclick="ui.modal=null;render()">${ic("x")}</button></div>
      <input id="addex-q" placeholder="Search name, muscle, pattern…" value="${esc(m.q)}" oninput="ui.modal.q=this.value;addExerciseList()">
      <div id="addex-list" class="col" style="gap:6px"></div></div>`;
    addExerciseList();
    return;
  }
  if (m.type === "pr") {
    const c = m.cur;
    $("modal").innerHTML = `<div class="scrim" onclick="ui.modal=null;render()"></div><div class="dialog">
      <h2>${esc(m.lift)} · ${m.reps === 1 ? "1RM" : `${m.reps}RM`}</h2>
      <div class="muted">Overrides the value calculated from your logged sets.</div>
      <div class="row"><label class="f">kg<input id="pr-w" inputmode="decimal" value="${c ? fmt(c.w) : ""}"></label>
        <label class="f">Date<input id="pr-date" type="date" value="${c?.date ?? ""}"></label></div>
      <label class="f">Note<input id="pr-note" placeholder="e.g. paused, clean, touch-and-go" value="${esc(c?.note ?? "")}"></label>
      <div class="row">${c ? `<button class="btn-t red" onclick="revertPr()">Use calculated</button>` : ""}<span class="grow"></span>
        <button class="btn-t" onclick="ui.modal=null;render()">Cancel</button><button class="btn" onclick="savePr()">Save</button></div></div>`;
    return;
  }
  const e = m.e, locked = e.id && sessionsOf(e.name).length > 0;
  // Every field writes straight into ui.modal.e, so re-rendering (pattern, muscles, variations) keeps what was typed.
  const bind = (key) => `onchange="ui.modal.e.${key}=this.value"`;
  const sel = (key, opts, v, on = bind(key)) => `<select ${on}>${opts.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  const pairs = (key, opts, v) => `<select ${bind(key)}>${opts.map(([k, l]) => `<option value="${k}" ${k === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const allowed = PATTERN_MUSCLES[e.pattern] ?? MUSCLES;
  const shown = [...allowed, ...e.muscles.filter((x) => !allowed.includes(x))];
  $("modal").innerHTML = `<div class="scrim" onclick="ui.modal=null;render()"></div><div class="dialog">
    <h2>${e.id ? "Edit exercise" : "New exercise"}</h2>
    <label class="f">Name<input value="${esc(e.name)}" oninput="ui.modal.e.name=this.value" ${locked ? "disabled" : ""}></label>
    <label class="f">Movement pattern${sel("pattern", PATTERNS, e.pattern, `onchange="setExPattern(this.value)"`)}</label>
    <div class="f-label">Muscle groups · first is primary, the rest secondary</div>
    <div class="opt-list">${shown.map((o) => {
      const k = e.muscles.indexOf(o);
      return `<button class="fchip ${k >= 0 ? "sel" : ""}" onclick="toggleExMuscle(${q(o)})">${k === 0 ? "<b>Primary</b> " : k > 0 ? `<b>${k + 1}</b> ` : ""}${esc(o)}</button>`;
    }).join("")}</div>
    ${e.muscles.length > 1 ? `<div class="row wrap" style="gap:6px"><span class="muted">Make primary:</span>${e.muscles.slice(1).map((o) =>
      `<button class="btn-t sm" onclick="makePrimary(${q(o)})">${esc(o)}</button>`).join("")}</div>` : ""}
    <label class="f">Type${sel("mechanic", MECHANICS, e.mechanic)}</label>
    <div class="row"><label class="f">Logged as${pairs("measure", MEASURES, e.measure ?? "reps")}</label>
      <label class="f">Load${pairs("load", LOADS, e.load ?? "kg")}</label></div>
    <div class="muted">Bodyweight exercises can be logged with a resistance band.</div>
    <label class="chk-item"><input type="checkbox" ${e.main ? "checked" : ""} onchange="ui.modal.e.main=this.checked"> Main lift (shown first in Cycles and PRs)</label>
    <div class="f-label">Variations · e.g. paused, pin, tempo, band, chain</div>
    ${e.variations.length ? `<div class="opt-list">${e.variations.map((v, k) =>
      `<button class="fchip sel" onclick="removeExVariation(${k})" title="Remove">${esc(v)} ${ic("x")}</button>`).join("")}</div>` : ""}
    <div class="row"><input id="exm-var" placeholder="New variation" onkeydown="if(event.key==='Enter')addExVariation()">
      <button class="btn-o sm" onclick="addExVariation()">${ic("plus")} Add</button></div>
    <div class="muted">Each set can use any mix of variations (or none). Variation sets don't count towards standard PRs.</div>
    ${locked ? `<div class="muted">Name locked: this exercise has history.</div>` : ""}
    <div class="row">${e.custom && e.id ? `<button class="btn-t red" onclick="deleteExercise()">Delete</button>` : ""}<span class="grow"></span>
      <button class="btn-t" onclick="ui.modal=null;render()">Cancel</button><button class="btn" onclick="saveExercise()">Save</button></div></div>`;
}

// ================= Chart =================
function chart(points, color, emptyText = "No data yet") {
  if (points.length < 2) return `<div class="empty">${points.length ? "Need two entries for a trend" : emptyText}</div>`;
  const W = 360, H = 190, L = 38, R = 8, T = 10, B = 22;
  const xs = points.map((p) => new Date(p.x + "T00:00").getTime()), ys = points.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.1; y0 -= pad; y1 += pad;
  const sx = (x) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R), sy = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  const grid = [0, 0.5, 1].map((f) => { const y = y0 + (y1 - y0) * f; return `<line x1="${L}" x2="${W - R}" y1="${sy(y)}" y2="${sy(y)}" stroke="#2a2a2a"/><text x="${L - 4}" y="${sy(y) + 4}" fill="#9e9e9e" font-size="10" text-anchor="end">${Math.round(y)}</text>`; }).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${grid}
    <polyline points="${points.map((p, i) => `${sx(xs[i]).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ")}" fill="none" stroke="${color}" stroke-width="2"/>
    ${points.map((p, i) => `<circle cx="${sx(xs[i])}" cy="${sy(p.y)}" r="2.5" fill="${color}"><title>${dmy(p.x)}: ${fmt(p.y)}</title></circle>`).join("")}
    <text x="${L}" y="${H - 5}" fill="#9e9e9e" font-size="10">${dmy(points[0].x)}</text>
    <text x="${W - R}" y="${H - 5}" fill="#9e9e9e" font-size="10" text-anchor="end">${dmy(points.at(-1).x)}</text></svg>`;
}

save();
if (db.workout) ui.view = "day";
render();
