const { describe, test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, builder, plain } = require("./harness");

/** A saved 4-week cycle starting Monday 2026-11-02 (clock: Sunday 2026-11-08). */
function setup() {
  const env = loadApp();
  const { app, run } = env;
  const be = builder(app, run, { weeks: "4" });
  be.start = "2026-11-02";
  app.saveBlock();
  env.b = app.activeBlock();
  env.log = (lift, date, extra = "") => run(`db.logs.push({ id: nextId(), date: "${date}", lift: "${lift}", kind: "Set", n: 1, reps: 5, w: 100, source: "app" ${extra} })`);
  env.week = (lift, date) => { const p = app.planFor(lift, date); return p.type === "block" ? p.week : p.type; };
  return env;
}

describe("cycle weeks move on with training, not with the calendar", () => {
  let env;
  beforeEach(() => (env = setup()));
  test("before the cycle starts there is no cycle plan", () => assert.equal(env.week("Squat", "2026-11-01"), "last"));
  test("week 1 until the exercise is done", () => {
    assert.equal(env.week("Squat", "2026-11-03"), 1);
    assert.equal(env.week("Squat", "2026-11-10"), 1);
  });
  test("each logged day completes the next week", () => {
    env.log("Squat", "2026-11-03");
    assert.equal(env.week("Squat", "2026-11-10"), 2);
  });
  test("a skipped calendar week stays on the same cycle week", () => {
    env.log("Squat", "2026-11-03");
    assert.equal(env.week("Squat", "2026-11-17"), 2); // nothing done the week of Nov 9
  });
  test("one cycle week can be spread over two calendar weeks, per exercise", () => {
    env.log("Squat", "2026-11-03"); env.log("Bench Press", "2026-11-05");
    env.log("Squat", "2026-11-18"); // squat week 2 done, bench not yet
    assert.equal(env.week("Squat", "2026-11-24"), 3);
    assert.equal(env.week("Bench Press", "2026-11-24"), 2);
  });
  test("the workout in progress doesn't count for its own day", () => {
    env.log("Squat", "2026-11-03"); env.log("Squat", "2026-11-10");
    env.run(`db.workout = { date: "2026-11-10", items: [] }`);
    assert.equal(env.week("Squat", "2026-11-10"), 2);
    env.run(`db.workout = null`);
    assert.equal(env.week("Squat", "2026-11-10"), 3); // done today, planning another session
  });
  test("weeks without sets for the exercise are skipped", () => {
    env.log("Squat", "2026-11-03");
    env.b.lifts.find((l) => l.lift === "Squat").plan[1] = { sets: [] };
    assert.equal(env.week("Squat", "2026-11-10"), 3);
  });
  test("after the last week the cycle is finished for that exercise", () => {
    ["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24"].forEach((d) => env.log("Squat", d));
    assert.equal(env.app.liftWeek(env.b, env.b.lifts.find((l) => l.lift === "Squat"), "2026-12-01"), 5);
    assert.equal(env.week("Squat", "2026-12-01"), "last");
  });
  test("the cycle's week is its slowest exercise in the split; the end date moves back", () => {
    const { app } = env;
    assert.equal(app.cycleWeek(env.b), 1);
    assert.equal(app.cycleEnd(env.b), "2026-11-29"); // this week + 3 more
    ["Squat", "Bench Press", "Deadlift"].forEach((l) => env.log(l, "2026-11-04"));
    assert.equal(app.cycleWeek(env.b), 2);
    assert.equal(app.cycleEnd(env.b), "2026-11-22");
  });
});

describe("workout pre-fill", () => {
  test("a cycle exercise gets that week's sets, variations included", () => {
    const { app, run } = loadApp();
    builder(app, run, { weeks: "4" });
    app.toggleBlockMod(null, 0, "Back-off|", "Band");
    app.saveBlock();
    const { rows, plan } = app.buildRows("Squat", "3x", app.today());
    assert.equal(plan.type, "block");
    assert.deepEqual(plain(rows.map((r) => r.mods)), [[], ["Band"], ["Band"]]);
    assert.equal(rows.length, 3); // cycle set count wins over the split's
  });
  test("outside a cycle: the split's per-set variations win over the last session's", () => {
    const { app, run } = loadApp();
    run(`db.blocks.forEach((b) => (b.active = false))`);
    run(`db.logs.push({ id: nextId(), date: "2026-11-01", lift: "Squat", kind: "Set", n: 1, reps: 5, w: 100, mods: ["Tempo"], source: "app" })`);
    let rows = app.buildRows("Squat", "2x", app.today()).rows;
    assert.deepEqual(plain(rows.map((r) => r.mods)), [["Tempo"], ["Tempo"]]); // last session carries over
    rows = app.buildRows("Squat", "2x", app.today(), [["Paused"], []]).rows;
    assert.deepEqual(plain(rows.map((r) => r.mods)), [["Paused"], []]);
  });
  test("no history and no cycle: empty rows from the split's set count", () => {
    const { app, run } = loadApp();
    run(`db.blocks.forEach((b) => (b.active = false))`);
    const { rows, plan } = app.buildRows("Nordic Curl", "3-4x", app.today());
    assert.equal(plan.type, "new");
    assert.equal(rows.length, 3);
  });
});

describe("split day order", () => {
  test("days still to do first, done days after, in the order they were done", () => {
    const { app, run } = loadApp();
    const prog = app.currentProgram();
    run(`db.dayLog.push({ date: "2026-11-03", programId: ${prog.id}, dayIdx: 1 })`);
    const { todo, done } = app.weekOrder(prog);
    assert.deepEqual(plain(done), [1]);
    assert.equal(todo.includes(1), false);
    app.doNext(2);
    assert.equal(app.weekOrder(prog).todo[0], 2);
  });
});
