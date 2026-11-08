// Loads the web app (seed-data.js, data.js, app.js) into an isolated context with just enough browser to run:
// storage, a stand-in DOM, dialogs and a fixed clock. Tests read and call anything the app defines through `app`.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const WEB = path.join(__dirname, "..", "web");
const SOURCES = ["seed-data.js", "data.js", "app.js"].map((f) => [f, fs.readFileSync(path.join(WEB, f), "utf8")]);

/** A DOM element stand-in: render() only writes innerHTML, so that is all it needs to hold. */
function element() {
  return {
    innerHTML: "", value: "", scrollTop: 0, textContent: "", style: { setProperty() {} }, classList: { toggle() {} },
    insertAdjacentHTML(_where, html) { this.innerHTML = html + this.innerHTML; },
    focus() {}, blur() {}, click() {}, setSelectionRange() {}, querySelectorAll: () => [],
  };
}

/**
 * A fresh app on a fresh (or given) database.
 * now: the fixed clock; stored: database JSON to start from (default: the app seeds itself);
 * confirm: what confirm() answers.
 */
function loadApp({ now = "2026-11-08T12:00:00Z", stored = null, confirm = true } = {}) {
  const items = new Map();
  if (stored) items.set("gymlog-db", typeof stored === "string" ? stored : JSON.stringify(stored));
  const storage = {
    getItem: (k) => (items.has(k) ? items.get(k) : null),
    setItem: (k, v) => items.set(k, String(v)),
    removeItem: (k) => items.delete(k),
  };
  const elements = {};
  const alerts = [];
  const document = {
    getElementById: (id) => (elements[id] ||= element()),
    documentElement: element(),
    createElement: () => element(),
    addEventListener() {},
    activeElement: element(),
    hidden: false,
  };
  const ctx = {
    console, document, localStorage: storage, alerts,
    alert: (m) => alerts.push(String(m)),
    confirm: () => confirm,
    setTimeout: () => 0, clearTimeout() {}, // saves and toasts never fire on their own
    URL: { createObjectURL: () => "", revokeObjectURL() {} }, Blob: class {},
    addEventListener() {},
    __NOW: Date.parse(now),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  // Fixed clock: new Date() and Date.now() return `now`; dates built from values work as usual.
  vm.runInContext(`(() => { const Real = Date;
    globalThis.Date = class extends Real { constructor(...a) { super(...(a.length ? a : [__NOW])); } static now() { return __NOW; } };
  })();`, ctx);
  for (const [file, code] of SOURCES) vm.runInContext(code, ctx, { filename: file });
  const run = (code) => vm.runInContext(code, ctx);
  // app.X evaluates X inside the app, so top-level const / let (db, ui, Rpe, STEP, …) are reachable too.
  const app = new Proxy({}, { get: (_, key) => (key === "then" ? undefined : run(String(key))) });
  return { app, run, storage, alerts, elements, ctx };
}

/** Shorthand used by many tests: a cycle builder state from step ① settings, template generated. */
function builder(app, run, gen = {}, def = {}, lifts = ["Squat", "Bench Press", "Deadlift"]) {
  run(`ui.be = null; openBlockBuilder();`);
  const be = app.ui.be;
  Object.assign(be.gen, gen);
  Object.assign(be.gen.def, def);
  be.lifts = lifts.map((l) => app.newLift(l));
  be.name = be.name || "Test cycle";
  app.generateNow();
  return be;
}

module.exports = { loadApp, builder };

/** Values from the app's context have that context's prototypes; compare plain copies with deepStrictEqual. */
const plain = (x) => JSON.parse(JSON.stringify(x));
module.exports.plain = plain;
