const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, plain } = require("./harness");

describe("fresh database and migrations", () => {
  test("a new install is seeded and migrated to the current schema", () => {
    const { app } = loadApp();
    assert.equal(app.db.schema, app.SCHEMA);
    assert.ok(app.db.logs.length > 0);
    assert.ok(app.activeBlock());
    app.db.exercises.forEach((e) => assert.equal(e.muscles[0], e.muscle, e.name));
    assert.deepEqual(plain(app.exByName("Squat").variations), ["Paused", "Pin", "Tempo", "Band", "Chain"]);
    assert.deepEqual(plain(app.exByName("Squat").muscles), ["Quads", "Glutes", "Adductors"]);
  });
  test("an older database gets muscles and variations without losing anything", () => {
    const { app } = loadApp();
    const old = plain(app.db);
    old.schema = 5;
    old.exercises.forEach((e) => { delete e.muscles; delete e.variations; });
    old.exercises.find((e) => e.name === "Leg Press").muscle = "Glutes"; // a user change stays
    const { app: b } = loadApp({ stored: old });
    assert.equal(b.db.schema, b.SCHEMA);
    assert.equal(b.db.logs.length, old.logs.length);
    assert.deepEqual(plain(b.exByName("Leg Press").muscles), ["Glutes"]);
    assert.deepEqual(plain(b.exByName("Bench Press").muscles), ["Chest", "Triceps", "Shoulders"]);
    assert.deepEqual(plain(b.exByName("Deadlift").variations), ["Paused", "Deficit", "Block", "Band", "Chain"]);
    assert.deepEqual(plain(b.exByName("Leg Curl").variations), []);
  });
  test("data saved by the app loads back the same", () => {
    const { app, storage } = loadApp();
    app.save();
    const { app: b } = loadApp({ stored: storage.getItem("gymlog-db") });
    assert.deepEqual(plain(b.db), plain(app.db));
  });
});

describe("backup import", () => {
  test("rejects files that are not a backup, and backups from a newer version", () => {
    const { app, alerts } = loadApp();
    const before = app.db.logs.length;
    app.onImportText("not json");
    app.onImportText(JSON.stringify({ ...plain(app.db), schema: app.SCHEMA + 1 }));
    assert.equal(alerts.length, 2);
    assert.equal(app.db.logs.length, before);
  });
  test("replaces the data, migrates it and keeps a safety copy", () => {
    const { app, storage } = loadApp();
    const backup = plain(app.db);
    backup.logs = backup.logs.slice(0, 10);
    backup.schema = 5;
    backup.exercises.forEach((e) => delete e.muscles);
    app.onImportText(JSON.stringify(backup));
    assert.equal(app.db.logs.length, 10);
    assert.equal(app.db.schema, app.SCHEMA);
    assert.ok(app.db.exercises.every((e) => e.muscles?.length));
    assert.ok(storage.getItem("gymlog-db-before-restore"));
  });
});

describe("exercise catalogue", () => {
  const { app } = loadApp();
  test("every catalogue exercise's muscles are allowed for its pattern", () => {
    app.CATALOG.forEach(([name, muscle, pattern]) => {
      assert.ok(app.PATTERN_MUSCLES[pattern].includes(muscle), `${name}: ${muscle} / ${pattern}`);
      (app.SECONDARY_MUSCLES[name] ?? []).forEach((m) => assert.ok(app.PATTERN_MUSCLES[pattern].includes(m), `${name}: ${m} / ${pattern}`));
    });
  });
  test("every pattern lists only known muscles; default variations are for real exercises", () => {
    Object.values(app.PATTERN_MUSCLES).flat().forEach((m) => assert.ok(app.MUSCLES.includes(m), m));
    Object.keys(app.DEFAULT_VARIATIONS).forEach((n) => assert.ok(app.exByName(n), n));
    assert.deepEqual(Object.keys(app.PATTERN_MUSCLES).sort(), [...app.PATTERNS].sort());
  });
});

describe("exercise editor", () => {
  test("pattern first, muscles limited to it, first muscle primary, variations added", () => {
    const { app, elements } = loadApp();
    app.openExercise(null, null, "Belt Squat");
    const e = app.ui.modal.e;
    app.setExPattern("Squat");
    assert.deepEqual(plain(e.muscles), []); // Chest isn't a squat muscle
    app.toggleExMuscle("Glutes"); app.toggleExMuscle("Quads");
    app.makePrimary("Quads");
    elements["exm-var"] = { value: " Paused ", focus() {} };
    app.addExVariation();
    elements["exm-var"].value = "paused"; // same name, other case: not added twice
    app.addExVariation();
    app.saveExercise();
    const saved = app.exByName("Belt Squat");
    assert.deepEqual(plain([saved.muscle, saved.muscles, saved.variations, saved.pattern]), ["Quads", ["Quads", "Glutes"], ["Paused"], "Squat"]);
    assert.equal(saved.custom, true);
  });
  test("needs a name, a muscle and a unique name", () => {
    const { app, alerts } = loadApp();
    const n = app.db.exercises.length;
    app.openExercise(null, null, "");
    app.saveExercise();
    app.ui.modal.e.name = "Squat";
    app.saveExercise();
    app.ui.modal.e.name = "New one"; app.ui.modal.e.muscles = [];
    app.saveExercise();
    assert.equal(alerts.length, 3);
    assert.equal(app.db.exercises.length, n);
  });
  test("renaming a band keeps logged sets and the open workout pointing at it", () => {
    const { app, run } = loadApp();
    run(`db.logs.push({ id: nextId(), date: "2026-11-01", lift: "Pull-ups", kind: "Set", n: 1, reps: 5, w: 0, band: "Red", source: "app" })`);
    const k = app.db.bands.findIndex((b) => b.name === "Red");
    app.setBand(k, "name", "Crimson");
    assert.equal(app.db.logs.filter((l) => l.band === "Red").length, 0);
    assert.ok(app.db.logs.some((l) => l.band === "Crimson"));
  });
});

describe("settings", () => {
  test("weight step drives all rounding; plates are sorted", () => {
    const { app } = loadApp();
    app.setSetting("step", "2");
    assert.equal(app.STEP, 2);
    assert.equal(app.r25(101.3), 102);
    app.setSetting("plates", "5, 25; 10 1.25");
    assert.deepEqual(plain(app.db.settings.plates), [25, 10, 5, 1.25]);
  });
});

describe("calculator", () => {
  const { app } = loadApp();
  test("warm-ups: singles at 80% and 90%, never below the bar or at the working weight", () => {
    assert.deepEqual(plain(app.warmupSets(100, 20)), [{ w: 80, reps: 1 }, { w: 90, reps: 1 }]);
    assert.deepEqual(plain(app.warmupSets(30, 20)), [{ w: 25, reps: 1 }, { w: 27.5, reps: 1 }]);
    assert.deepEqual(plain(app.warmupSets(22, 20)), [{ w: 20, reps: 1 }]);
  });
});

describe("running", () => {
  const { app, run } = loadApp();
  test("pace", () => {
    assert.equal(app.paceText({ km: 10, sec: 3000 }), "5:00/km");
    assert.equal(app.paceText({ km: 0, sec: 100 }), "–");
  });
  test("plan generator: linear build to the peak, taper at 70%, 60%…, race as the last run", () => {
    run(`ui.rb = { name: "HM", start: "2026-11-02", nWeeks: "6", slots: [{ day: 1, type: "Easy", km0: "6", km1: "10" }, { day: 5, type: "Long", km0: "10", km1: "18" }], taper: "2", race: "21.1", weeks: [] }`);
    app.generateRunWeeks();
    const weeks = plain(app.ui.rb.weeks);
    assert.equal(weeks.length, 6);
    assert.deepEqual(weeks.slice(0, 4).map((w) => w[1].km), [10, 12.5, 15.5, 18]); // ½-km steps
    assert.equal(weeks[4][1].km, 12.5); // 18 × 70%
    assert.deepEqual([weeks[5][1].type, weeks[5][1].km], ["Race", 21.1]);
    assert.equal(weeks[5][0].km, 6); // 10 × 60%
  });
  test("logged runs pair with the planned runs of their week, same type first", () => {
    run(`db.runs = [{ id: 1, date: "2026-11-03", type: "Long", km: 15 }, { id: 2, date: "2026-11-04", type: "Easy", km: 5 }]`);
    const p = { start: "2026-11-02", weeks: [[{ day: 1, type: "Easy", km: 6 }, { day: 5, type: "Long", km: 14 }]] };
    const wk = plain(app.planWeek(p, 1));
    assert.deepEqual(wk.map((s) => s.run?.id), [2, 1]);
  });
});
