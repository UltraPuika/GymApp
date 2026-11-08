# Tests

Unit tests for the web app in `web/` (the same code the Android app runs). No dependencies: Node 22's built-in
test runner.

```bash
npm test
```

`harness.js` loads `seed-data.js`, `data.js` and `app.js` into an isolated context with in-memory storage, a
stand-in DOM and a fixed clock (Sunday 2026-11-08), so every test starts from a freshly seeded database and dates
are predictable. Anything the app defines is reachable as `app.name`, including top-level `const` / `let`.

| File | Covers |
|---|---|
| `rpe.test.js` | RPE table, interpolation, 1RM, targets, rounding |
| `helpers.test.js` | number / date / duration helpers, bodyweight lookup |
| `history.test.js` | e1RM per session, variation and band sets kept out of PRs, set grouping, logging rows |
| `template.test.js` | cycle template generator: whole-cycle start → end range, reps, sets, patterns, kg method |
| `weights.test.js` | planned loads (incl. 0.9 × bodyweight), 1RM per variation, and the hard rules on every scheme: equal jumps, nothing above its planned load + 1%, back-offs not above the top set |
| `builder.test.js` | cycle builder edits (steps ② and ③, per block), saving and editing a cycle |
| `progression.test.js` | cycle weeks moving on with training, workout pre-fill, split day order |
| `data.test.js` | migrations, backup import, exercise catalogue and editor, settings, calculator, running |
