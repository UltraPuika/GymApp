const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, builder, plain } = require("./harness");

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);
/** Load (or reps) of group g in every week, block by block: [[w1, w2, …], …]. */
const col = (t, g = 0, key = "load") => t.blocks.map((b) => b.weeks.map((w) => w.groups[g]?.[key]));

describe("start → end range covers the whole cycle; load / block shifts blocks inside it", () => {
  const { app, run } = loadApp();
  test("RPE 7 → 9, +0.5 / block, 3 blocks × 3 weeks", () => {
    const be = builder(app, run, { blocks: "3", weeks: "3", cLd: "0.5" }, { rpeT0: "7", rpeT1: "9", rpeB0: "6", rpeB1: "8" });
    assert.deepEqual(plain(col(be.tmpl, 0)), [[7, 7.5, 8], [7.5, 8, 8.5], [8, 8.5, 9]]);
    assert.deepEqual(plain(col(be.tmpl, 1)), [[6, 6.5, 7], [6.5, 7, 7.5], [7, 7.5, 8]]);
  });
  test("% of 1RM works the same: 80 → 90, +2.5 / block", () => {
    const be = builder(app, run, { blocks: "3", weeks: "3", cLd: "2.5" }, { method: "pct", pctT0: "80", pctT1: "90", pctB0: "70", pctB1: "80" });
    assert.equal(be.tmpl.method, "pct");
    assert.deepEqual(plain(col(be.tmpl, 0)), [[80, 82.5, 85], [82.5, 85, 87.5], [85, 87.5, 90]]);
  });
  test("one block: the range is that block", () => {
    const be = builder(app, run, { blocks: "1", weeks: "3" }, { rpeT0: "7", rpeT1: "9" });
    assert.deepEqual(plain(col(be.tmpl, 0)), [[7, 8, 9]]);
  });
  test("the last block always ends at the cycle end", () => {
    for (const nb of [2, 3, 4]) for (const n of [2, 4, 6]) for (const step of [0, 0.25, 0.5]) {
      const be = builder(app, run, { blocks: String(nb), weeks: String(n), cLd: String(step) }, { rpeT0: "7", rpeT1: "9.5" });
      const loads = col(be.tmpl, 0);
      close(loads[0][0], 7);
      close(loads.at(-1).at(-1), 9.5);
      loads.forEach((blk, k) => close(blk[0], 7 + k * step));
    }
  });
  test("RPE never goes above 10", () => {
    const be = builder(app, run, { blocks: "2", weeks: "3", cLd: "2" }, { rpeT0: "9", rpeT1: "9.5" });
    assert.ok(col(be.tmpl, 0).flat().every((v) => v <= 10));
  });
});

describe("reps, sets and patterns", () => {
  const { app, run } = loadApp();
  test("reps: start, change per week, change per block, never below 1", () => {
    const be = builder(app, run, { blocks: "3", weeks: "4", cR0: "6", cRd: "-2" }, { rDw: "-1" });
    assert.deepEqual(plain(col(be.tmpl, 0, "reps")), [[6, 5, 4, 3], [4, 3, 2, 1], [2, 1, 1, 1]]);
  });
  test("back-off reps default to the top's; own start and weekly change", () => {
    let be = builder(app, run, { weeks: "3", cR0: "5" }, { rDw: "-1" });
    assert.deepEqual(plain(col(be.tmpl, 1, "reps")), [[5, 4, 3]]);
    be = builder(app, run, { weeks: "3", cR0: "3", bR0: "8" }, { rDw: "0", bDw: "-1" });
    assert.deepEqual(plain(col(be.tmpl, 0, "reps")), [[3, 3, 3]]);
    assert.deepEqual(plain(col(be.tmpl, 1, "reps")), [[8, 7, 6]]);
  });
  test("top + back-off: 1 top set and N back-off sets; 0 back-offs → none", () => {
    let be = builder(app, run, { weeks: "2" }, { boSets: "3" });
    assert.deepEqual(plain(be.tmpl.blocks[0].weeks[0].groups.map((g) => [g.kind, g.sets])), [["TOP", 1], ["Back-off", 3]]);
    be = builder(app, run, { weeks: "2" }, { boSets: "0" });
    assert.equal(be.tmpl.blocks[0].weeks[0].groups.length, 1);
  });
  test("rep drop: one group of N sets at the top-set scheme", () => {
    const be = builder(app, run, { weeks: "3" }, { model: "drop", sets: "4", rpeT0: "8", rpeT1: "9" });
    const g = be.tmpl.blocks[0].weeks[0].groups;
    assert.equal(g.length, 1);
    assert.equal(g[0].kind, "Set");
    assert.equal(g[0].sets, 4);
    assert.equal(be.tmpl.blocks[0].model, "drop");
  });
  test("kg method: kg added to the start weight, per week and per block; back-off offset", () => {
    const be = builder(app, run, { blocks: "2", weeks: "3", cLd: "10" }, { method: "kg", kgStep: "2.5", boKg: "-10" });
    assert.deepEqual(plain(col(be.tmpl, 0)), [[0, 2.5, 5], [10, 12.5, 15]]);
    assert.deepEqual(plain(col(be.tmpl, 1)), [[-10, -7.5, -5], [0, 2.5, 5]]);
  });
  test("test week flag and method are carried into the template", () => {
    const be = builder(app, run, { weeks: "2", test: true }, { method: "pct" });
    assert.equal(be.tmpl.test, true);
    assert.equal(be.tmpl.method, "pct");
  });
});
