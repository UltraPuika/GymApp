const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./harness");

const { app } = loadApp();
const { Rpe } = app;
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

describe("RPE table (Rpe.pct)", () => {
  test("known values from the table", () => {
    assert.equal(Rpe.pct(1, 10), 1);
    assert.equal(Rpe.pct(5, 8), 0.811);
    assert.equal(Rpe.pct(3, 9), 0.892);
    assert.equal(Rpe.pct(12, 6), 0.574);
  });
  test("quarter RPEs interpolate between the half-step rows", () => {
    close(Rpe.pct(1, 9.25), (0.955 + 0.978) / 2);
    close(Rpe.pct(4, 7.75), (0.824 + 0.837) / 2); // 4 reps: RPE 7.5 row 0.824, RPE 8 row 0.837
  });
  test("RPE is clamped to 6–10", () => {
    assert.equal(Rpe.pct(5, 11), Rpe.pct(5, 10));
    assert.equal(Rpe.pct(5, 4), Rpe.pct(5, 6));
  });
  test("reps outside 1–12 or no RPE give null", () => {
    assert.equal(Rpe.pct(0, 8), null);
    assert.equal(Rpe.pct(13, 8), null);
    assert.equal(Rpe.pct(5, null), null);
  });
  test("more reps → lower %, higher RPE → higher %", () => {
    for (let r = 1; r <= 12; r++) for (let rpe = 6; rpe < 10; rpe += 0.25) {
      assert.ok(Rpe.pct(r, rpe + 0.25) >= Rpe.pct(r, rpe), `reps ${r} rpe ${rpe}`);
      if (r < 12) assert.ok(Rpe.pct(r + 1, rpe) < Rpe.pct(r, rpe), `reps ${r} rpe ${rpe}`);
    }
  });
});

describe("1RM and targets", () => {
  test("oneRm reads the RPE table", () => {
    assert.equal(Rpe.oneRm(100, 1, 10), 100);
    close(Rpe.oneRm(81.1, 5, 8), 100, 1e-6);
  });
  test("oneRm counts bodyweight in the load, returns added load", () => {
    // (20 + 73.35) / 0.922 − 73.35
    close(Rpe.oneRm(20, 3, 10, 73.35), (20 + 73.35) / 0.922 - 73.35);
  });
  test("more than 12 reps falls back to Epley", () => {
    close(Rpe.oneRm(50, 15, 10), 50 * (1 + 15 / 30));
  });
  test("no reps or weight → null", () => {
    assert.equal(Rpe.oneRm(100, 0, 10), null);
    assert.equal(Rpe.oneRm(null, 5, 10), null);
  });
  test("target is the inverse of oneRm, rounded to the weight step", () => {
    assert.equal(Rpe.target(200, 5, 8, 0, 2.5), Rpe.round(200 * 0.811, 2.5));
    assert.equal(Rpe.target(50, 3, 9, 73.35, 2.5), Rpe.round((50 + 73.35) * 0.892 - 73.35, 2.5));
    assert.equal(Rpe.target(100, 20, 8), null);
  });
  test("round / floor to the weight step", () => {
    assert.equal(Rpe.round(101.3, 2.5), 102.5);
    assert.equal(Rpe.round(101.2, 2.5), 100);
    assert.equal(Rpe.floor(102.4, 2.5), 100);
    assert.equal(Rpe.floor(102.5, 2.5), 102.5);
    assert.equal(Rpe.floor(7.3, 0), 7.3);
    assert.equal(app.r25(101.3), 102.5);
  });
});
