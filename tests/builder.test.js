const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, builder, plain } = require("./harness");

/** "sets×reps(mods)" of every group in every week, block by block, as one exercise uses the template. */
const shape = (app, L) => app.liftT(L).blocks.map((b) => b.weeks.map((w) => w.groups.filter((g) => g.sets > 0)
  .map((g) => `${g.kind}${g.mods?.length ? `(${g.mods.join("+")})` : ""}`).join(",")));

describe("step ②: editing the shared template", () => {
  const { app, run } = loadApp();
  test("variations are set per block, for every week of that block", () => {
    const be = builder(app, run, { blocks: "2", weeks: "3" });
    app.toggleBlockMod(null, 0, "Back-off|", "Band");
    assert.deepEqual(plain(shape(app, be.lifts[0])), [
      ["TOP,Back-off(Band)", "TOP,Back-off(Band)", "TOP,Back-off(Band)"],
      ["TOP,Back-off", "TOP,Back-off", "TOP,Back-off"]]);
  });
  test("changing a number drops that cell's hand-set weight only", () => {
    const be = builder(app, run, { weeks: "3" });
    be.lifts[0].over = { "0-0-0": 150, "0-1-0": 155 };
    app.setG(null, 0, 0, 0, "reps", "4");
    assert.equal(be.tmpl.blocks[0].weeks[0].groups[0].reps, 4);
    assert.deepEqual(plain(be.lifts[0].over), { "0-1-0": 155 });
  });
  test("invalid numbers are ignored", () => {
    const be = builder(app, run, { weeks: "3" });
    app.setG(null, 0, 0, 0, "reps", "0");
    app.setG(null, 0, 0, 0, "sets", "x");
    assert.deepEqual([be.tmpl.blocks[0].weeks[0].groups[0].reps, be.tmpl.blocks[0].weeks[0].groups[0].sets], [6, 1]);
  });
  test("adding / removing weeks, blocks or groups resets hand-set weights", () => {
    const be = builder(app, run, { weeks: "3" });
    be.lifts[0].over = { "0-0-0": 150 };
    app.addWeek(null, 0);
    assert.equal(be.tmpl.blocks[0].weeks.length, 4);
    assert.deepEqual(plain(be.lifts[0].over), {});
    app.copyWeek(null, 0, 0); app.removeWeek(null, 0, 1);
    app.addGroup(null, 0, 0);
    assert.equal(be.tmpl.blocks[0].weeks[0].groups.length, 3);
    app.removeGroup(null, 0, 0, 2);
    app.copyBlock(null, 0);
    assert.equal(be.tmpl.blocks.length, 2);
    app.removeBlock(null, 1);
    assert.equal(be.tmpl.blocks.length, 1);
  });
  test("an added block continues the scheme", () => {
    const be = builder(app, run, { blocks: "2", weeks: "3", cR0: "6", cRd: "-2", cLd: "0.5" }, { rpeT0: "7", rpeT1: "9" });
    app.addBlock(null);
    const b3 = be.tmpl.blocks[2];
    assert.equal(b3.weeks.length, 3);
    assert.equal(b3.weeks[0].groups[0].reps, 2);
    assert.equal(b3.weeks[0].groups[0].load, 8); // block starts step on: 7 → 7.5 → 8
  });
  test("switching a block's pattern regenerates it and keeps variation / extra sets", () => {
    const be = builder(app, run, { blocks: "2", weeks: "2" });
    app.toggleBlockMod(null, 1, "Back-off|", "Pin");
    app.addGroup(null, 1, 0);
    Object.assign(be.tmpl.blocks[1].weeks[0].groups.at(-1), { kind: "Extra", mods: [] }); // the copy took the Pin
    app.setBlockModel(null, 1, "drop");
    assert.equal(be.tmpl.blocks[1].model, "drop");
    assert.deepEqual(plain(be.tmpl.blocks[1].weeks[0].groups.map((g) => g.kind + (g.mods?.length ? `(${g.mods})` : ""))), ["Set", "Back-off(Pin)", "Extra"]);
  });
  test("'sets to every week' adds a group with its own progression", () => {
    const be = builder(app, run, { blocks: "2", weeks: "3" });
    app.openGForm(null, 0);
    Object.assign(app.ui.be.gform, { kind: "Extra", mods: ["Paused"], sets: "2", r0: "5", rd: "-1", l0: "7", l1: "8", all: false });
    app.applyGForm();
    const added = be.tmpl.blocks[0].weeks.map((w) => w.groups.at(-1));
    assert.deepEqual(plain(added.map((g) => [g.kind, g.sets, g.reps, g.load, g.mods])), [["Extra", 2, 5, 7, ["Paused"]], ["Extra", 2, 4, 7.5, ["Paused"]], ["Extra", 2, 3, 8, ["Paused"]]]);
    assert.equal(be.tmpl.blocks[1].weeks[0].groups.length, 2); // other block untouched
  });
});

describe("step ③: per exercise, per block", () => {
  const { app, run } = loadApp();
  test("change a variation, remove a line and add sets — only in that block, only for that exercise", () => {
    const be = builder(app, run, { blocks: "3", weeks: "2" });
    app.toggleBlockMod(null, 0, "Back-off|", "Band");
    app.toggleBlockMod(null, 1, "Back-off|", "Band");
    app.removeGroup(null, 2, 1, 1); // last week of block 3 without back-off
    app.setLineMod(0, 1, "Back-off|Band", "Pin");
    app.toggleLineOff(0, 0, "Back-off|Band");
    app.openXForm(0, 2);
    Object.assign(app.ui.be.xform, { mods: ["Paused"], r0: "3" });
    app.applyXForm();
    assert.deepEqual(plain(shape(app, be.lifts[0])), [
      ["TOP", "TOP"],
      ["TOP,Back-off(Pin+Band)", "TOP,Back-off(Pin+Band)"],
      ["TOP,Back-off,Back-off(Paused)", "TOP,Back-off(Paused)"]]);
    assert.deepEqual(plain(shape(app, be.lifts[1])), [ // Bench: shared template as is
      ["TOP,Back-off(Band)", "TOP,Back-off(Band)"], ["TOP,Back-off(Band)", "TOP,Back-off(Band)"], ["TOP,Back-off", "TOP"]]);
  });
  test("removing the only back-off line of one block keeps the other blocks' back-offs", () => {
    const be = builder(app, run, { blocks: "3", weeks: "2" });
    app.toggleBlockMod(null, 0, "Back-off|", "Band");
    app.toggleBlockMod(null, 1, "Back-off|", "Band");
    app.toggleLineOff(0, 2, "Back-off|");
    assert.deepEqual(plain(shape(app, be.lifts[0]).map((b) => b[0])), ["TOP,Back-off(Band)", "TOP,Back-off(Band)", "TOP"]);
  });
  test("settings from before per-block editing apply to every block, and split up when one block changes", () => {
    const be = builder(app, run, { blocks: "2", weeks: "2" });
    const L = be.lifts[0];
    L.vmods = { "Back-off|": ["Chain"] };
    assert.deepEqual(plain(shape(app, L).map((b) => b[0])), ["TOP,Back-off(Chain)", "TOP,Back-off(Chain)"]);
    app.setLineMod(0, 0, "Back-off|", "Chain");
    assert.deepEqual(plain(shape(app, L).map((b) => b[0])), ["TOP,Back-off", "TOP,Back-off(Chain)"]);
    assert.equal("Back-off|" in L.vmods, false);
  });
  test("an exercise with its own template is edited on its own", () => {
    const be = builder(app, run, { blocks: "1", weeks: "3" });
    app.setCustom(1, true);
    app.removeWeek(1, 0, 2);
    assert.equal(app.liftT(be.lifts[1]).blocks[0].weeks.length, 2);
    assert.equal(app.liftT(be.lifts[0]).blocks[0].weeks.length, 3);
  });
});

describe("saving and editing a cycle", () => {
  test("save pads shorter exercises, adds the test week, ends the previous cycle", () => {
    const { app, run } = loadApp();
    const prev = app.activeBlock();
    const be = builder(app, run, { blocks: "2", weeks: "3", test: true });
    app.setCustom(1, true);
    app.removeWeek(1, 1, 2); // Bench: one week shorter
    app.goStep(3);
    app.saveBlock();
    const b = app.activeBlock();
    assert.notEqual(b.id, prev.id);
    assert.equal(prev.active, false);
    assert.ok(prev.ended);
    assert.equal(b.weeks, 7);
    assert.deepEqual(plain(b.blockLens), [3, 3]);
    b.lifts.forEach((l) => { assert.equal(l.plan.length, 7); assert.equal(l.plan.at(-1).test, true); });
    assert.equal(b.lifts[1].plan[5].sets.length, 0); // Bench rests while the others finish
    assert.equal(b.lifts[0].model, "tmpl");
  });
  test("edit updates the same cycle in place and keeps a test target set on the card", () => {
    const { app, run } = loadApp();
    builder(app, run, { blocks: "2", weeks: "3" });
    app.saveBlock();
    const id = app.activeBlock().id, n = app.db.blocks.length;
    app.addTestWeek(id);
    app.setTestTarget(id, 0, "190");
    app.editBlock(id);
    assert.equal(app.ui.be.tmpl.test, true);
    assert.equal(app.ui.be.lifts[0].testMax, "190");
    app.setG(null, 0, 1, 0, "reps", "3");
    app.saveBlock();
    const b = app.activeBlock();
    assert.equal(b.id, id);
    assert.equal(app.db.blocks.length, n);
    assert.equal(b.lifts[0].plan[1].sets[0].reps, 3);
    assert.equal(b.lifts[0].plan.at(-1).sets.at(-1).w, 190);
  });
  test("copying a cycle saved before templates rebuilds one from its settings", () => {
    const { app } = loadApp();
    const old = app.db.blocks.find((b) => !b.builder);
    app.openBlockBuilder(old.id);
    assert.equal(app.ui.be.step, 2);
    assert.ok(app.ui.be.tmpl.blocks.length >= 1);
    assert.deepEqual(plain(app.ui.be.lifts.map((l) => l.lift)), plain([...new Set(old.lifts.map((l) => l.lift))]));
  });
});
