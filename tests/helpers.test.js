const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./harness");

const { app } = loadApp(); // clock: Sunday 2026-11-08

describe("numbers and text", () => {
  test("fmt rounds to 2 decimals and shows – for nothing", () => {
    assert.equal(app.fmt(2.345), "2.35");
    assert.equal(app.fmt(100), "100");
    assert.equal(app.fmt(null), "–");
    assert.equal(app.fmt(""), "–");
  });
  test("num reads comma decimals", () => {
    assert.equal(app.num("2,5"), 2.5);
    assert.equal(app.num(" 7.5 "), 7.5);
    assert.equal(app.num("x"), null);
    assert.equal(app.num(""), null);
    assert.equal(app.num(null), null);
  });
  test("esc escapes HTML", () => assert.equal(app.esc(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;"));
  test("setCount reads split set counts", () => {
    assert.equal(app.setCount("3x"), 3);
    assert.equal(app.setCount("3-4x"), 3);
    assert.equal(app.setCount("0-2x"), 2);
    assert.equal(app.setCount("4"), 4);
    assert.equal(app.setCount(""), 3);
    assert.equal(app.setsLabel("3"), "3x");
    assert.equal(app.setsLabel("3-4x"), "3-4x");
  });
  test("durations", () => {
    assert.equal(app.parseDur("1:45:30"), 6330);
    assert.equal(app.parseDur("45:30"), 2730);
    assert.equal(app.parseDur("90"), 90);
    assert.equal(app.parseDur(""), null);
    assert.equal(app.parseDur("a:1"), null);
    assert.equal(app.fmtDur(6330), "1:45:30");
    assert.equal(app.fmtDur(65), "1:05");
    assert.equal(app.fmtHold(30), "30s");
    assert.equal(app.fmtHold(90), "1:30");
  });
});

describe("dates", () => {
  test("today follows the clock", () => assert.equal(app.today(), "2026-11-08"));
  test("addDays crosses months and years", () => {
    assert.equal(app.addDays("2026-11-28", 5), "2026-12-03");
    assert.equal(app.addDays("2026-12-30", 3), "2027-01-02");
    assert.equal(app.addDays("2026-03-01", -1), "2026-02-28");
  });
  test("daysBetween", () => {
    assert.equal(app.daysBetween("2026-11-01", "2026-11-08"), 7);
    assert.equal(app.daysBetween("2026-11-08", "2026-11-01"), -7);
  });
  test("mondayOf: weeks run Monday–Sunday", () => {
    assert.equal(app.mondayOf("2026-11-08"), "2026-11-02"); // Sunday
    assert.equal(app.mondayOf("2026-11-02"), "2026-11-02"); // Monday
    assert.equal(app.mondayOf("2026-11-04"), "2026-11-02");
  });
  test("dmy", () => assert.equal(app.dmy("2026-11-08"), "08.11.26"));
});

describe("bodyweight", () => {
  test("bwAt: last entry on/before the date, else the first after, else the default", () => {
    const { app: a, run } = loadApp();
    assert.equal(a.bwAt("2026-01-01"), a.DEFAULT_BW);
    run(`db.bodyweights = [{ id: 1, date: "2026-05-01", kg: 80 }, { id: 2, date: "2026-07-01", kg: 82 }]`);
    assert.equal(a.bwAt("2026-04-01"), 80);
    assert.equal(a.bwAt("2026-06-15"), 80);
    assert.equal(a.bwAt("2026-07-01"), 82);
    assert.equal(a.bwAt("2026-12-01"), 82);
  });
  test("bwOf: 0.9 × bodyweight for bodyweight lifts only", () => {
    assert.equal(app.bwOf("Squat"), 0);
    assert.equal(app.bwOf("Pull-ups"), 0.9 * app.DEFAULT_BW);
  });
});
