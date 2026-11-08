const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, builder, plain } = require("./harness");

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

/** Every hard rule of liftWeights, checked on one exercise; returns the broken ones as text. */
function ruleBreaks(app, L, t, label) {
  const W = app.liftWeights(t, L), bad = [], lines = {};
  t.blocks.forEach((blk, k) => blk.weeks.forEach((wk, i) => {
    const seen = {};
    wk.groups.forEach((g, gi) => {
      const key = app.lineKey(g), id = `${key}#${(seen[key] = (seen[key] ?? 0) + 1)}`, w = W[k][i][gi];
      (lines[id] ||= []).push({ k, i, w });
      const one = app.oneFor(t, L, g.mods), tol = t.method !== "kg" && one > 0 ? 0.01 * (one + app.liftBw(L)) : 0;
      // 1. never above its own planned load + 1% of 1RM
      if (w > app.rawGroup(t, L, g) + tol + 1e-6) bad.push(`${label}: b${k + 1}w${i + 1} ${key} ${w} above plan`);
      // 2. not above the week's top set unless planned heavier (same variation only)
      const ti = wk.groups.findIndex((x) => x.kind === "TOP");
      if (g.kind !== "TOP" && ti >= 0 && app.modText(wk.groups[ti].mods) === app.modText(g.mods)
        && app.num(g.load) <= app.num(wk.groups[ti].load) && w > W[k][i][ti] + 1e-6) bad.push(`${label}: b${k + 1}w${i + 1} ${key} above top`);
    });
  }));
  // 3. equal jumps: weekly inside a block, block to block across consecutive blocks with the line
  Object.entries(lines).forEach(([id, pts]) => {
    const ks = [...new Set(pts.map((p) => p.k))], runs = [];
    ks.forEach((k) => (runs.at(-1)?.at(-1) === k - 1 ? runs.at(-1).push(k) : runs.push([k])));
    runs.forEach((r) => {
      const ps = pts.filter((p) => r.includes(p.k)), p0 = ps[0];
      const pj = ps.find((p) => p.k === p0.k && p.i > p0.i), J = pj ? (pj.w - p0.w) / (pj.i - p0.i) : 0;
      const pb = ps.find((p) => p.k > p0.k), B = pb ? (pb.w - p0.w - (pb.i - p0.i) * J) / (pb.k - p0.k) : 0;
      ps.forEach((p) => { if (Math.abs(p.w - (p0.w + (p.k - p0.k) * B + (p.i - p0.i) * J)) > 1e-6) bad.push(`${label}: ${id} b${p.k + 1}w${p.i + 1} jump not equal`); });
    });
  });
  // 4. every weight is a whole weight step
  W.flat(2).forEach((w) => { if (Math.abs(w / app.STEP - Math.round(w / app.STEP)) > 1e-6) bad.push(`${label}: ${w} not a weight step`); });
  return bad;
}

describe("planned load of a set group (rawGroup)", () => {
  const { app, run } = loadApp();
  const be = builder(app, run, { weeks: "2" }, {}, ["Squat", "Pull-ups"]);
  const [sq, pu] = be.lifts;
  sq.one[""] = "200"; pu.one[""] = "40"; pu.bw = "80";
  const bw = 0.9 * 80;
  test("RPE: 1RM × RPE-table %", () => close(app.rawGroup({ method: "rpe" }, sq, { reps: 5, load: 8 }), 200 * 0.811));
  test("%: 1RM × %", () => close(app.rawGroup({ method: "pct" }, sq, { reps: 5, load: 85 }), 170));
  test("kg: start kg + offset", () => {
    sq.start[""] = "150";
    close(app.rawGroup({ method: "kg" }, sq, { reps: 5, load: -10 }), 140);
  });
  test("bodyweight lifts: (1RM + 0.9·BW) × % − 0.9·BW", () => {
    close(app.rawGroup({ method: "rpe" }, pu, { reps: 3, load: 9 }), (40 + bw) * 0.892 - bw);
    close(app.rawGroup({ method: "pct" }, pu, { reps: 3, load: 85 }), (40 + bw) * 0.85 - bw);
  });
  test("more than 12 reps uses the 12-rep column", () => close(app.rawGroup({ method: "rpe" }, sq, { reps: 20, load: 8 }), 200 * app.Rpe.pct(12, 8)));
});

describe("1RM per variation (oneFor)", () => {
  const { app, run } = loadApp();
  const be = builder(app, run, { weeks: "2" }, {}, ["Squat"]);
  const L = be.lifts[0], t = { method: "rpe" };
  L.one[""] = "180";
  test("standard sets use the standard 1RM", () => assert.equal(app.oneFor(t, L, []), 180));
  test("a variation without its own 1RM and no history uses the standard one", () => assert.equal(app.oneFor(t, L, ["Pin"]), 180));
  test("…with history it uses the best logged e1RM of that exact variation", () => {
    run(`db.logs.push({ id: nextId(), date: "2026-11-01", lift: "Squat", kind: "Set", n: 1, reps: 1, w: 150, mods: ["Pin"], source: "app" })`);
    assert.equal(app.oneFor(t, L, ["Pin"]), 150);
  });
  test("its own 1RM wins", () => {
    L.one.Pin = "160";
    assert.equal(app.oneFor(t, L, ["Pin"]), 160);
  });
  test("kg method uses the start kg map", () => {
    L.start[""] = "120";
    assert.equal(app.oneFor({ method: "kg" }, L, ["Chain"]), 120);
  });
  test("sets with a variation the exercise doesn't have are skipped", () => {
    assert.equal(app.liftOk(L, { mods: ["Pin"] }), true);
    assert.equal(app.liftOk(L, { mods: ["Deficit"] }), false);
  });
});

test("hard rules hold for every generated scheme, also after edits", () => {
  const { app, run } = loadApp();
  const breaks = [];
  for (const blocks of ["1", "2", "3"]) for (const weeks of ["3", "4", "6"])
    for (const [t0, t1, b0, b1] of [["9", "9", "8", "8"], ["8", "9.5", "7", "8.5"], ["7", "9", "6", "8"]])
      for (const [cR0, bR0, rDw, bDw] of [["6", "", "-1", ""], ["3", "6", "0", "0"], ["5", "8", "-1", "-1"], ["1", "5", "0", "0"]]) {
        const label = `${blocks}×${weeks} T${t0}-${t1} B${b0}-${b1} reps ${cR0}/${bR0 || cR0} ${rDw}/${bDw || rDw}`;
        const be = builder(app, run, { blocks, weeks, cR0, bR0, cLd: "0.5" }, { rpeT0: t0, rpeT1: t1, rpeB0: b0, rpeB1: b1, rDw, bDw }, ["Squat", "Pull-ups"]);
        be.lifts.forEach((L) => breaks.push(...ruleBreaks(app, L, app.liftT(L), `${label} ${L.lift}`)));
        // hand edits: middle-week load, a removed last-week back-off, Band back-offs in block 1
        const T = be.tmpl, last = T.blocks.length - 1;
        if (T.blocks[0].weeks.length > 2) app.setG(null, 0, 1, 0, "load", String(T.blocks[0].weeks[1].groups[0].load + 0.4));
        app.removeGroup(null, last, T.blocks[last].weeks.length - 1, 1);
        app.toggleBlockMod(null, 0, "Back-off|", "Band");
        be.lifts.forEach((L) => breaks.push(...ruleBreaks(app, L, app.liftT(L), `edited ${label} ${L.lift}`)));
      }
  for (const method of ["pct", "kg"]) {
    const be = builder(app, run, { blocks: "3", weeks: "4", cLd: method === "pct" ? "2.5" : "10" }, { method }, ["Squat", "Pull-ups"]);
    be.lifts.forEach((L) => breaks.push(...ruleBreaks(app, L, app.liftT(L), `${method} ${L.lift}`)));
  }
  assert.deepEqual(breaks.slice(0, 10), []);
});

describe("weights in particular cases", () => {
  const { app, run } = loadApp();
  /** One block, hand-built weeks: [[group, …], …] with groups [kind, sets, reps, load, mods]. */
  const manual = (weeks, method = "rpe") => {
    const be = builder(app, run, { weeks: String(weeks.length) }, { method }, ["Squat"]);
    be.tmpl.blocks = [{ model: "tb", weeks: weeks.map((gs) => ({ groups: gs.map(([kind, sets, reps, load, mods = []]) => ({ kind, sets, reps, load, mods })) })) }];
    be.lifts[0].one[""] = "175";
    return be;
  };
  test("a back-off planned heavier than the top set may be heavier", () => {
    const be = manual([[["TOP", 1, 5, 8], ["Back-off", 2, 5, 9]]]);
    const W = app.liftWeights(be.tmpl, be.lifts[0]);
    assert.ok(W[0][0][1] > W[0][0][0], `${W[0][0][1]} > ${W[0][0][0]}`);
  });
  test("a back-off planned lighter never ends up heavier than the top set", () => {
    const be = manual([[["TOP", 1, 6, 8], ["Back-off", 2, 6, 7.5]], [["TOP", 1, 1, 9.5], ["Back-off", 2, 1, 8.5]], [["TOP", 1, 6, 8], ["Back-off", 2, 6, 7.9]]]);
    const W = app.liftWeights(be.tmpl, be.lifts[0]);
    W[0].forEach((wk, i) => assert.ok(wk[1] <= wk[0], `week ${i + 1}: ${wk[1]} ≤ ${wk[0]}`));
  });
  test("variation sets have their own 1RM and are not held under the top set", () => {
    const be = manual([[["TOP", 1, 5, 8], ["Back-off", 2, 5, 7, ["Band"]]]]);
    be.lifts[0].one.Band = "250";
    const W = app.liftWeights(be.tmpl, be.lifts[0]);
    assert.ok(W[0][0][1] > W[0][0][0]);
  });
  test("hand-set weights win", () => {
    const be = manual([[["TOP", 1, 5, 8]], [["TOP", 1, 4, 8.5]]]);
    be.lifts[0].over = { "0-1-0": 199 };
    assert.equal(app.liftWeights(be.tmpl, be.lifts[0])[0][1][0], 199);
  });
  test("bigger jumps win: a planned rise of 4.4 kg / week is rounded up to 5", () => {
    const pts = [0, 1, 2, 3, 4, 5].map((i) => ({ k: 0, i, target: 140 + 4.4 * i, cap: 140 + 4.4 * i + 1.75 }));
    const fit = app.fitLine(pts);
    assert.equal(fit.w({ k: 0, i: 1 }) - fit.w({ k: 0, i: 0 }), 5);
    pts.forEach((p) => assert.ok(fit.w(p) <= p.cap + 1e-9));
  });
  test("a weekly rise under one weight step still moves (no flat lines)", () => {
    const be = builder(app, run, { blocks: "3", weeks: "4", cLd: "2.5" }, { method: "pct" }, ["Pull-ups"]);
    const L = be.lifts[0];
    L.one[""] = "65"; L.bw = "81.5";
    app.liftWeights(be.tmpl, L).forEach((blk, k) => {
      const top = blk.map((w) => w[0]);
      assert.ok(top.at(-1) > top[0], `block ${k + 1}: ${top.join(" → ")}`);
    });
  });
  test("liftPlan lists every set, tags variation sets and skips 0-set groups", () => {
    const be = manual([[["TOP", 1, 5, 8], ["Back-off", 2, 5, 7, ["Pin"]], ["Extra", 0, 5, 7]]]);
    const sets = plain(app.liftPlan(be.tmpl, be.lifts[0])[0].sets);
    assert.deepEqual(sets.map((s) => [s.kind, s.reps, s.mods ?? null]), [["TOP", 5, null], ["Back-off", 5, ["Pin"]], ["Back-off", 5, ["Pin"]]]);
  });
});
