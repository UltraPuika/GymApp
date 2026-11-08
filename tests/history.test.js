const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, plain } = require("./harness");

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

describe("e1RM of a session", () => {
  const { app } = loadApp();
  test("uses the set with the fewest reps (heaviest on ties) at RPE 10", () => {
    const e1 = app.bestE1([{ reps: 5, w: 100 }, { reps: 3, w: 105 }, { reps: 3, w: 110 }], "Squat", "2026-11-01");
    close(e1, 110 / 0.922);
  });
  test("bodyweight lifts: added load, with 0.9 × that day's bodyweight", () => {
    const bw = 0.9 * app.DEFAULT_BW;
    close(app.bestE1([{ reps: 3, w: 20 }], "Pull-ups", "2026-11-01"), (20 + bw) / 0.922 - bw);
  });
  test("variation sets don't count (paused, pins, chains, …)", () => {
    const e1 = app.sessionBest([{ reps: 1, w: 200, mods: ["Band"] }, { reps: 1, w: 150 }], "Squat", "2026-11-01");
    assert.equal(e1, 150);
    assert.equal(app.sessionBest([{ reps: 1, w: 200, mods: ["Pin"] }], "Squat", "2026-11-01"), null);
  });
  test("band-assisted bodyweight sets don't count", () => {
    const bw = 0.9 * app.DEFAULT_BW;
    const e1 = app.sessionBest([{ reps: 1, w: 0, band: "Red" }, { reps: 3, w: 10 }], "Pull-ups", "2026-11-01");
    close(e1, (10 + bw) / 0.922 - bw);
  });
  test("holds: longest time · bodyweight-only: most reps", () => {
    assert.equal(app.sessionBest([{ t: 12 }, { t: 30 }, { t: 20 }], "Planche"), 30);
    assert.equal(app.sessionBest([{ reps: 12, w: 0 }, { reps: 20, w: 0 }], "Push-ups"), 20);
  });
});

describe("standard PRs ignore variation sets", () => {
  test("test-week target and sessions use standard sets only; variation bests are separate", () => {
    const { app, run } = loadApp();
    const before = app.defaultTestTarget({ lift: "Squat", oneRm: "100" });
    const e1Before = app.sessionsOf("Squat").find((s) => s.e1).e1;
    run(`db.logs.push({ id: nextId(), date: "2026-11-07", lift: "Squat", kind: "Set", n: 1, reps: 1, w: 400, mods: ["Band", "Chain"], source: "app" })`);
    assert.equal(app.defaultTestTarget({ lift: "Squat", oneRm: "100" }), before);
    assert.equal(app.sessionsOf("Squat").find((s) => s.e1).e1, e1Before);
    assert.equal(app.variantE1("Squat", ["Band", "Chain"]), 400);
    assert.equal(app.variantE1("Squat", ["Band"]), null); // exactly that combination only
  });
});

describe("grouping and showing sets", () => {
  const { app } = loadApp();
  test("identical consecutive sets collapse, different variations don't", () => {
    const g = plain(app.groupSets([
      { reps: 5, w: 100 }, { reps: 5, w: 100 }, { reps: 5, w: 100, mods: ["Band"] }, { reps: 5, w: 100, mods: ["Band"] }, { reps: 3, w: 110 },
    ]));
    assert.deepEqual(g.map((x) => [x.n, x.reps, x.w, x.mods]), [[2, 5, 100, null], [2, 5, 100, ["Band"]], [1, 3, 110, null]]);
  });
  test("setText", () => {
    assert.equal(app.setText({ n: 3, reps: 5, w: 100 }), "3x5x100");
    assert.equal(app.setText({ n: 1, reps: 12, w: 0 }), "12");
    assert.equal(app.setText({ n: 3, t: 30, w: 0 }), "3x30s");
    assert.equal(app.setText({ n: 1, t: 10, w: 100 }), "10s @100");
    assert.match(app.setText({ n: 2, reps: 5, w: 90, mods: ["Pin", "Band"] }), /^2x5x90 <span class="mods">Pin \+ Band<\/span>$/);
  });
  test("rowToLog follows the exercise's log type", () => {
    assert.deepEqual(plain(app.rowToLog({ reps: "5", w: "100", band: "Red", mods: ["Pin"] }, "Squat")),
      { kind: "Set", n: 1, reps: 5, t: null, w: 100, band: null, mods: ["Pin"] });
    assert.equal(app.rowToLog({ reps: "", w: "100" }, "Squat"), null);
    assert.equal(app.rowToLog({ reps: "10", w: "20" }, "Push-ups").w, 0); // bodyweight only
    assert.equal(app.rowToLog({ reps: "5", w: "10", band: "Red" }, "Pull-ups").band, "Red");
    assert.equal(app.rowToLog({ t: "0:45" }, "Planche").t, 45);
    assert.equal("mods" in plain(app.rowToLog({ reps: "5", w: "100", mods: [] }, "Squat")), false);
  });
  test("expand turns n × set into rows", () => {
    const rows = plain(app.expand([{ kind: "TOP", n: 2, reps: 3, w: 150, mods: ["Pin"] }]));
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], { kind: "TOP", reps: "3", t: "", w: "150", band: "", mods: ["Pin"], done: false });
  });
});

describe("variations on sets", () => {
  const { app } = loadApp();
  test("toggled keeps the exercise's own variation order", () => {
    assert.deepEqual(plain(app.toggled(["Band"], "Pin", "Squat")), ["Pin", "Band"]); // Squat: Paused, Pin, Tempo, Band, Chain
    assert.deepEqual(plain(app.toggled(["Pin", "Band"], "Pin", "Squat")), ["Band"]);
    assert.deepEqual(plain(app.toggled(null, "Paused", "Squat")), ["Paused"]);
  });
  test("isStd / modText", () => {
    assert.equal(app.isStd({}), true);
    assert.equal(app.isStd({ mods: [] }), true);
    assert.equal(app.isStd({ mods: ["Pin"] }), false);
    assert.equal(app.modText(["Pin", "Band"]), "Pin + Band");
    assert.equal(app.modText(null), "");
  });
});
