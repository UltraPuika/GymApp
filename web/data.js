// Mirrors RpeEngine.kt from the Android project + the exercise catalogue and splits.
const RPE_VALUES = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6];
const RPE_TABLE = [
  [1.000, 0.955, 0.922, 0.892, 0.863, 0.837, 0.811, 0.786, 0.762, 0.739, 0.707, 0.680],
  [0.978, 0.939, 0.907, 0.878, 0.850, 0.824, 0.799, 0.774, 0.751, 0.723, 0.694, 0.667],
  [0.955, 0.922, 0.892, 0.863, 0.837, 0.811, 0.786, 0.762, 0.739, 0.707, 0.680, 0.653],
  [0.939, 0.907, 0.878, 0.850, 0.824, 0.799, 0.774, 0.751, 0.723, 0.694, 0.667, 0.640],
  [0.922, 0.892, 0.863, 0.837, 0.811, 0.786, 0.762, 0.739, 0.707, 0.680, 0.653, 0.626],
  [0.907, 0.878, 0.850, 0.824, 0.799, 0.774, 0.751, 0.723, 0.694, 0.667, 0.640, 0.613],
  [0.892, 0.863, 0.837, 0.811, 0.786, 0.762, 0.739, 0.707, 0.680, 0.653, 0.626, 0.599],
  [0.878, 0.850, 0.824, 0.799, 0.774, 0.751, 0.723, 0.694, 0.667, 0.640, 0.613, 0.586],
  [0.863, 0.837, 0.811, 0.786, 0.762, 0.739, 0.707, 0.680, 0.653, 0.626, 0.599, 0.574],
];

const Rpe = {
  /** Interpolates between half-step rows so ramps like RPE 9.25 work. */
  pct(reps, rpe) {
    if (!(reps >= 1 && reps <= 12) || rpe == null) return null;
    const r = Math.min(10, Math.max(6, rpe));
    const hi = Math.ceil(r * 2) / 2, lo = Math.floor(r * 2) / 2;
    const a = RPE_TABLE[RPE_VALUES.indexOf(hi)][reps - 1], b = RPE_TABLE[RPE_VALUES.indexOf(lo)][reps - 1];
    return hi === lo ? a : b + (a - b) * ((r - lo) / (hi - lo));
  },
  oneRm(weight, reps, rpe, bw = 0) {
    if (!(reps > 0) || weight == null) return null;
    const load = weight + bw;
    const p = Rpe.pct(reps, rpe ?? 10);
    return (p != null ? load / p : load * (1 + reps / 30)) - bw;
  },
  target(oneRm, reps, rpe, bw = 0, inc = 2.5) {
    const p = Rpe.pct(reps, rpe);
    return p == null ? null : Rpe.round((oneRm + bw) * p - bw, inc);
  },
  floor: (v, inc) => (inc > 0 ? Math.floor(v / inc + 1e-9) * inc : v),
  round: (v, inc) => (inc > 0 ? Math.round(v / inc) * inc : v),
};

const PATTERNS = [
  "Squat", "Hinge", "Lunge", "Horizontal Push", "Vertical Push", "Horizontal Pull", "Vertical Pull",
  "Leg Isolation", "Upper Isolation", "Arms", "Grip", "Core", "Skill", "Prehab",
];
const MUSCLES = [
  "Quads", "Hamstrings", "Glutes", "Adductors", "Abductors", "Calves", "Chest", "Upper Chest", "Lats", "Upper Back",
  "Traps", "Shoulders", "Side Delts", "Rear Delts", "Biceps", "Triceps", "Forearms", "Core", "Rotator Cuff", "Full Body",
];
const MECHANICS = ["Compound", "Isolation", "Skill", "Prehab"];
const DEFAULT_MAIN_LIFTS = ["Squat", "Bench Press", "Deadlift", "Overhand Deadlift", "Overhead Press", "Pull-ups", "Barbell Row"];

// [name, primary muscle, movement pattern, mechanic, bodyweight-loaded, plate increment kg]
const CATALOG = [
  ["Deadlift", "Hamstrings", "Hinge", "Compound", 0, 5],
  ["Overhand Deadlift", "Hamstrings", "Hinge", "Compound", 0, 5],
  ["Squat", "Quads", "Squat", "Compound", 0, 2.5],
  ["Bench Press", "Chest", "Horizontal Push", "Compound", 0, 2.5],
  ["Overhead Press", "Shoulders", "Vertical Push", "Compound", 0, 2.5],
  ["Pull-ups", "Lats", "Vertical Pull", "Compound", 1, 2.5],
  ["Front Squat", "Quads", "Squat", "Compound", 0, 2.5],
  ["Hack Squat", "Quads", "Squat", "Compound", 0, 5],
  ["Leg Press", "Quads", "Squat", "Compound", 0, 5],
  ["Smith Machine Squat", "Quads", "Squat", "Compound", 0, 2.5],
  ["Single-Leg Squat", "Quads", "Squat", "Compound", 1, 2.5],
  ["Shrimp Squat", "Quads", "Squat", "Compound", 1, 2.5],
  ["Bulgarian Split Squat", "Quads", "Lunge", "Compound", 0, 2],
  ["Lunges", "Glutes", "Lunge", "Compound", 0, 2],
  ["Romanian Deadlift", "Hamstrings", "Hinge", "Compound", 0, 5],
  ["Single-Leg Deadlift", "Hamstrings", "Hinge", "Compound", 0, 2],
  ["Hip Thrust", "Glutes", "Hinge", "Compound", 0, 5],
  ["Leg Extension", "Quads", "Leg Isolation", "Isolation", 0, 2.5],
  ["Leg Curl", "Hamstrings", "Leg Isolation", "Isolation", 0, 2.5],
  ["Nordic Curl", "Hamstrings", "Leg Isolation", "Isolation", 1, 2.5],
  ["Adductor Machine", "Adductors", "Leg Isolation", "Isolation", 0, 2.5],
  ["Abductor Machine", "Abductors", "Leg Isolation", "Isolation", 0, 2.5],
  ["Calf Raise", "Calves", "Leg Isolation", "Isolation", 0, 5],
  ["Close-Grip Bench Press", "Triceps", "Horizontal Push", "Compound", 0, 2.5],
  ["Incline Bench Press", "Upper Chest", "Horizontal Push", "Compound", 0, 2.5],
  ["DB Incline Press", "Upper Chest", "Horizontal Push", "Compound", 0, 2],
  ["Incline Chest Press (Machine)", "Upper Chest", "Horizontal Push", "Compound", 0, 2.5],
  ["Incline Smith Chest Press", "Upper Chest", "Horizontal Push", "Compound", 0, 2.5],
  ["Smith Chest Press", "Chest", "Horizontal Push", "Compound", 0, 2.5],
  ["Machine Bench Press", "Chest", "Horizontal Push", "Compound", 0, 2.5],
  ["Flat Chest Press (Machine)", "Chest", "Horizontal Push", "Compound", 0, 2.5],
  ["Push-ups", "Chest", "Horizontal Push", "Compound", 1, 2.5],
  ["Archer Push-ups", "Chest", "Horizontal Push", "Compound", 1, 2.5],
  ["Pseudo Planche Push-ups", "Shoulders", "Horizontal Push", "Compound", 1, 2.5],
  ["High Incline Press (45°)", "Upper Chest", "Vertical Push", "Compound", 0, 2.5],
  ["Smith Press (45°)", "Shoulders", "Vertical Push", "Compound", 0, 2.5],
  ["Seated Shoulder Press", "Shoulders", "Vertical Push", "Compound", 0, 2.5],
  ["DB Shoulder Press", "Shoulders", "Vertical Push", "Compound", 0, 2],
  ["Machine Shoulder Press", "Shoulders", "Vertical Push", "Compound", 0, 2.5],
  ["Handstand Push-ups", "Shoulders", "Vertical Push", "Compound", 1, 2.5],
  ["Ring Dips", "Triceps", "Vertical Push", "Compound", 1, 2.5],
  ["Barbell Row", "Upper Back", "Horizontal Pull", "Compound", 0, 2.5],
  ["Machine Row (45°)", "Upper Back", "Horizontal Pull", "Compound", 0, 2.5],
  ["Cable Row (0°)", "Upper Back", "Horizontal Pull", "Compound", 0, 2.5],
  ["Chest-Supported Row (90°)", "Upper Back", "Horizontal Pull", "Compound", 0, 2.5],
  ["Incline Row (90°)", "Upper Back", "Horizontal Pull", "Compound", 0, 2.5],
  ["Single-Arm DB Row", "Lats", "Horizontal Pull", "Compound", 0, 2],
  ["Front Lever", "Lats", "Horizontal Pull", "Skill", 1, 2.5],
  ["High Pull-ups", "Lats", "Vertical Pull", "Compound", 1, 2.5],
  ["Lat Pulldown", "Lats", "Vertical Pull", "Compound", 0, 2.5],
  ["Straight-Arm Pulldown", "Lats", "Vertical Pull", "Isolation", 0, 2.5],
  ["One-Arm Pull-up", "Lats", "Vertical Pull", "Skill", 1, 2.5],
  ["Assisted One-Arm Pull-up", "Lats", "Vertical Pull", "Skill", 1, 2.5],
  ["Muscle-ups", "Lats", "Vertical Pull", "Skill", 1, 2.5],
  ["Side Lateral Raise", "Side Delts", "Upper Isolation", "Isolation", 0, 1],
  ["Machine Delts", "Side Delts", "Upper Isolation", "Isolation", 0, 2.5],
  ["Upright Row", "Side Delts", "Upper Isolation", "Isolation", 0, 2.5],
  ["Reverse Flys", "Rear Delts", "Upper Isolation", "Isolation", 0, 1],
  ["Face Pulls", "Rear Delts", "Upper Isolation", "Isolation", 0, 2.5],
  ["Chest Flys", "Chest", "Upper Isolation", "Isolation", 0, 2.5],
  ["Shrugs", "Traps", "Upper Isolation", "Isolation", 0, 5],
  ["Biceps Curl", "Biceps", "Arms", "Isolation", 0, 1],
  ["Triceps Extension", "Triceps", "Arms", "Isolation", 0, 1],
  ["Single-Arm Pushdown", "Triceps", "Arms", "Isolation", 0, 1],
  ["Static Hold", "Forearms", "Grip", "Isolation", 0, 5],
  ["Grip Training", "Forearms", "Grip", "Isolation", 0, 2.5],
  ["Abs", "Core", "Core", "Isolation", 0, 2.5],
  ["Planche", "Shoulders", "Skill", "Skill", 1, 2.5],
  ["Handstand", "Shoulders", "Skill", "Skill", 1, 2.5],
  ["Prone Y-T-W-A Raises", "Rotator Cuff", "Prehab", "Prehab", 0, 0.5],
  ["External Rotation", "Rotator Cuff", "Prehab", "Prehab", 0, 0.5],
  ["External Rotation at 90°", "Rotator Cuff", "Prehab", "Prehab", 0, 0.5],
  ["External Rotation Band Hold", "Rotator Cuff", "Prehab", "Prehab", 0, 0.5],
  ["Full Can Raise", "Rotator Cuff", "Prehab", "Prehab", 0, 0.5],
  ["Banded Press", "Rotator Cuff", "Prehab", "Prehab", 0, 0.5],
  ["Diagonal Pattern Extension & Flexion", "Rotator Cuff", "Prehab", "Prehab", 0, 0.5],
];

/**
 * How an exercise is logged: measure = "reps" | "time" (static hold), load = "kg" (external weight),
 * "bw" (bodyweight only) or "bw+" (bodyweight + added kg). Unlisted exercises: bodyweight-loaded → "bw+", others → "kg".
 */
const LOG_TYPES = {
  "Planche": ["time", "bw"], "Handstand": ["time", "bw"], "Front Lever": ["time", "bw"],
  "Static Hold": ["time", "kg"], "External Rotation Band Hold": ["time", "kg"],
  "Push-ups": ["reps", "bw"], "Archer Push-ups": ["reps", "bw"], "Pseudo Planche Push-ups": ["reps", "bw"],
  "Single-Leg Squat": ["reps", "bw"], "Shrimp Squat": ["reps", "bw"], "Nordic Curl": ["reps", "bw"],
  "Handstand Push-ups": ["reps", "bw"], "Muscle-ups": ["reps", "bw"],
  "One-Arm Pull-up": ["reps", "bw"], "Assisted One-Arm Pull-up": ["reps", "bw"],
};
/** Resistance bands for assisted calisthenics, lightest first. */
const DEFAULT_BANDS = [
  { name: "Yellow", color: "#e8d25a" }, { name: "Red", color: "#d9645a" }, { name: "Black", color: "#9aa0a6" },
  { name: "Purple", color: "#a77bd6" }, { name: "Green", color: "#6fbf73" },
];
const RUN_TYPES = ["Easy", "Tempo", "Long", "Intervals", "Race"];
const ACCENTS = [["#8fd3a8", "Mint"], ["#8fb5d6", "Sky"], ["#d9b26f", "Amber"], ["#e0907a", "Coral"], ["#b39ddb", "Lavender"], ["#c5e17a", "Lime"], ["#f08fb8", "Pink"]];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEASURES = [["reps", "Reps"], ["time", "Time (static hold)"]];
const LOADS = [["kg", "Weight (kg)"], ["bw", "Bodyweight"], ["bw+", "Bodyweight + kg"]];

/** Generic placeholders in the programs — tapping one lets you pick a matching exercise. */
const SLOTS = {
  "Push exercise": (e) => ["Horizontal Push", "Vertical Push"].includes(e.pattern) && e.mechanic === "Compound",
  "Pull exercise": (e) => ["Horizontal Pull", "Vertical Pull"].includes(e.pattern) && e.mechanic === "Compound",
  "Lower exercise": (e) => ["Squat", "Hinge", "Lunge"].includes(e.pattern) && e.mechanic === "Compound",
  "Leg isolation": (e) => e.pattern === "Leg Isolation",
  "Any lower isolation": (e) => e.pattern === "Leg Isolation",
  "Leg accessory": (e) => e.pattern === "Leg Isolation",
  "Upper isolation": (e) => e.pattern === "Upper Isolation",
  "Upper accessory": (e) => ["Upper Isolation", "Arms"].includes(e.pattern),
  "Arms / Grip": (e) => ["Arms", "Grip"].includes(e.pattern),
  "Hip isolation": (e) => ["Glutes", "Adductors", "Abductors"].includes(e.muscle),
  "Any accessory": (e) => e.mechanic === "Isolation",
};

// Splits: days of [sets, exercise | slot | "A / B" choice].
const PROGRAMS = [
  {
    name: "GYM v2 · 3-day", current: true,
    notes: "Rep-drop blocks 10→1 on the main lifts, then heavy single + back-offs.",
    days: [
      ["Day 1", [["3x", "Deadlift"], ["3x", "Machine Row (45°)"], ["3-4x", "Push exercise"], ["0-2x", "Leg isolation"], ["0-2x", "Arms / Grip"]]],
      ["Day 2", [["3x", "Pull-ups"], ["3x", "Bench Press"], ["3-4x", "Lower exercise"], ["0-2x", "Any lower isolation"], ["0-2x", "Upper isolation"]]],
      ["Day 3", [["3x", "Squat"], ["3x", "Overhead Press"], ["3-4x", "Pull exercise"], ["0-2x", "Arms / Grip"], ["0-2x", "Hip isolation"]]],
    ],
  },
  {
    name: "Lower / Lower / Upper hypertrophy",
    days: [
      ["Lower 1", [["3x", "Deadlift"], ["3x", "Leg Press"], ["3x", "Bulgarian Split Squat"], ["2x", "Leg Curl"], ["2x", "Adductor Machine"], ["2x", "Calf Raise"]]],
      ["Lower 2", [["3x", "Squat"], ["3x", "Romanian Deadlift"], ["3x", "Bulgarian Split Squat"], ["2x", "Leg Curl"], ["2x", "Leg Extension"], ["2x", "Calf Raise"]]],
      ["Upper", [["3x", "Pull-ups / Deadlift"], ["3x", "Barbell Row"], ["3x", "Machine Bench Press"], ["3x", "Chest-Supported Row (90°)"], ["2x", "Machine Delts"],
        ["2x", "Chest Flys"], ["2x", "Reverse Flys"], ["2x", "Side Lateral Raise"], ["2x", "Biceps Curl"], ["2x", "Triceps Extension"], ["2x", "Grip Training"]]],
    ],
  },
  {
    name: "4-day Lower / Upper (machines)",
    days: [
      ["Lower (Deadlift)", [["3x", "Deadlift"], ["2x", "Leg Press"], ["2x", "Smith Machine Squat"], ["2x", "Hip Thrust"], ["2x", "Leg Curl"], ["2x", "Calf Raise"], ["2x", "Leg Extension"], ["1x", "Adductor Machine"], ["1x", "Abductor Machine"]]],
      ["Upper (Bench)", [["3x", "Smith Chest Press"], ["3x", "Machine Row (45°)"], ["2x", "Smith Press (45°)"], ["2x", "Cable Row (0°)"], ["1x", "Side Lateral Raise"], ["1x", "Reverse Flys"], ["2x", "Chest Flys"], ["2x", "Biceps Curl"], ["2x", "Triceps Extension"], ["2x", "External Rotation"]]],
      ["Lower (Squat)", [["3x", "Squat"], ["2x", "Romanian Deadlift"], ["2x", "Bulgarian Split Squat"], ["2x", "Hip Thrust"], ["2x", "Leg Curl"], ["2x", "Calf Raise"], ["2x", "Leg Extension"], ["1x", "Adductor Machine"], ["1x", "Abductor Machine"]]],
      ["Upper (Pull-ups)", [["3x", "Pull-ups"], ["3x", "Incline Chest Press (Machine)"], ["2x", "Incline Row (90°)"], ["2x", "Seated Shoulder Press"], ["2x", "Reverse Flys"], ["2x", "Side Lateral Raise"], ["2x", "Chest Flys"], ["2x", "Biceps Curl"], ["2x", "Triceps Extension"], ["2x", "External Rotation"]]],
    ],
  },
  {
    name: "4-day Lower / Upper (barbell)",
    days: [
      ["Lower (Deadlift)", [["4x", "Deadlift"], ["3-4x", "Leg Press / Smith Machine Squat"], ["0-1x", "Hip Thrust"], ["2x", "Calf Raise"], ["4-6x", "Leg accessory"]]],
      ["Upper (Bench)", [["4x", "Bench Press"], ["3x", "Machine Row (45°)"], ["2x", "High Incline Press (45°)"], ["2x", "Cable Row (0°)"], ["4-6x", "Upper accessory"], ["1-2x", "Biceps Curl"], ["1-2x", "Triceps Extension"]]],
      ["Lower (Squat)", [["4x", "Squat"], ["2-3x", "Romanian Deadlift"], ["1-2x", "Lunges / Hip Thrust"], ["2x", "Calf Raise"], ["4-6x", "Leg accessory"]]],
      ["Upper (Pull-up)", [["3-4x", "Pull-ups"], ["3x", "Incline Bench Press / DB Incline Press"], ["2x", "Chest-Supported Row (90°)"], ["2x", "Seated Shoulder Press"], ["4-6x", "Upper accessory"], ["1-2x", "Biceps Curl"], ["1-2x", "Triceps Extension"]]],
      ["Full body (if 3 days)", [["3-4x", "Pull-ups"], ["4x", "Squat"], ["3x", "Incline Bench Press"], ["3x", "Romanian Deadlift"], ["1-2x", "Chest-Supported Row (90°)"], ["1-2x", "Seated Shoulder Press"]]],
    ],
  },
  {
    name: "4-day movement-pattern split",
    days: [
      ["Day 1", [["3x", "Squat"], ["3x", "Bench Press"], ["3x", "Barbell Row"]]],
      ["Day 2", [["3x", "Pull-ups"], ["3x", "Romanian Deadlift"], ["3x", "Seated Shoulder Press"]]],
      ["Day 3", [["3x", "Incline Bench Press"], ["3x", "Lower exercise"], ["3x", "Barbell Row"]]],
      ["Day 4", [["3x", "Deadlift"], ["3x", "Overhead Press"], ["3x", "High Pull-ups"], ["2x", "Leg isolation"], ["2x", "Hip isolation"], ["2x", "Grip Training"]]],
    ],
  },
  {
    name: "3-day Lower / Upper / Full",
    days: [
      ["Lower (Squat)", [["3x", "Squat"], ["2-3x", "Romanian Deadlift"], ["2-3x", "Lunges / Hip Thrust"], ["2x", "Calf Raise"], ["6x", "Leg accessory"]]],
      ["Upper (Bench)", [["3x", "Bench Press"], ["3x", "Pull-ups"], ["2-3x", "Seated Shoulder Press"], ["2-3x", "Chest-Supported Row (90°)"], ["4-6x", "Upper accessory"], ["1-2x", "Biceps Curl"], ["1-2x", "Triceps Extension"]]],
      ["Full body", [["3x", "Deadlift"], ["2-3x", "Incline Bench Press / DB Incline Press"], ["2-3x", "Leg Press / Smith Machine Squat"], ["2-3x", "Machine Row (45°)"], ["2x", "Calf Raise"], ["2x", "Biceps Curl"], ["6x", "Any accessory"]]],
    ],
  },
  {
    name: "4-day full-body rotation",
    days: [
      ["Day 1", [["3x", "Deadlift"], ["3x", "Incline Bench Press"], ["3x", "Chest-Supported Row (90°) / Cable Row (0°)"], ["1-2x", "Leg isolation"], ["1-3x", "Upper isolation"]]],
      ["Day 2", [["3x", "Pull-ups"], ["3x", "Smith Machine Squat / Leg Press / Lunges"], ["3x", "Overhead Press"], ["2x", "Shrugs"], ["2x", "Static Hold"], ["0-2x", "Hip isolation"]]],
      ["Day 3", [["3x", "Bench Press"], ["3x", "Hip Thrust / Romanian Deadlift / Lunges"], ["3x", "Machine Row (45°)"], ["2x", "Shrugs"], ["2x", "Static Hold"], ["0-2x", "Hip isolation"]]],
      ["Day 4", [["3x", "Squat"], ["3x", "Seated Shoulder Press"], ["3x", "Pull-ups / One-Arm Pull-up / Lat Pulldown"], ["1-2x", "Leg isolation"], ["1-3x", "Upper isolation"]]],
    ],
  },
  {
    name: "3-day Full Body",
    days: [
      ["Day 1", [["3x", "Bench Press"], ["3x", "Pull-ups"], ["3x", "Squat"], ["3x", "Close-Grip Bench Press"], ["3x", "Barbell Row"], ["3x", "Hack Squat"]]],
      ["Day 2", [["3x", "Deadlift"], ["3x", "Overhead Press"], ["3x", "Pull-ups"], ["3x", "Romanian Deadlift"], ["3x", "Incline Bench Press"], ["3x", "Barbell Row"]]],
      ["Day 3", [["3x", "Pull-ups"], ["3x", "Bench Press"], ["3x", "Squat"], ["3x", "Side Lateral Raise"], ["3x", "Barbell Row"], ["3x", "Leg Press"]]],
    ],
  },
  {
    name: "4-day Push / Pull",
    days: [
      ["Push 1", [["3x", "Bench Press"], ["3x", "Squat"], ["3x", "Close-Grip Bench Press"], ["3x", "Leg Press"], ["3x", "Side Lateral Raise"], ["3x", "Leg Extension"]]],
      ["Pull 1", [["3x", "Pull-ups"], ["3x", "Romanian Deadlift"], ["3x", "Barbell Row"], ["3x", "Machine Row (45°)"], ["3x", "Straight-Arm Pulldown"], ["3x", "Leg Curl"]]],
      ["Push 2", [["3x", "Overhead Press"], ["3x", "Front Squat"], ["3x", "Incline Bench Press"], ["3x", "Hack Squat"], ["3x", "Chest Flys"], ["3x", "Side Lateral Raise"]]],
      ["Pull 2", [["3x", "Deadlift"], ["3x", "Pull-ups"], ["3x", "Machine Row (45°)"], ["3x", "Cable Row (0°)"], ["3x", "Reverse Flys"], ["3x", "Leg Curl"]]],
    ],
  },
  {
    name: "4-day Upper / Lower",
    days: [
      ["Upper 1", [["3x", "Bench Press"], ["3x", "Barbell Row"], ["3x", "Close-Grip Bench Press"], ["3x", "Cable Row (0°)"], ["3x", "Side Lateral Raise"], ["3x", "Calf Raise"], ["3x", "Abs"]]],
      ["Lower 1", [["3x", "Squat"], ["3x", "Single-Leg Deadlift"], ["3x", "Leg Press"], ["3x", "Lunges"], ["3x", "Leg Extension"], ["3x", "Leg Curl"]]],
      ["Upper 2", [["3x", "Overhead Press"], ["3x", "Pull-ups"], ["3x", "Incline Bench Press"], ["3x", "Straight-Arm Pulldown"], ["3x", "Chest Flys"], ["3x", "Calf Raise"], ["3x", "Abs"]]],
      ["Lower 2", [["3x", "Deadlift"], ["3x", "Front Squat"], ["3x", "Leg Press"], ["3x", "Lunges"], ["3x", "Leg Extension"], ["3x", "Leg Curl"]]],
    ],
  },
  {
    name: "5-day Upper / Lower",
    days: [
      ["Day 1", [["3x", "Bench Press"], ["3x", "High Pull-ups"], ["3x", "Close-Grip Bench Press"], ["3x", "Machine Row (45°)"], ["3x", "Machine Shoulder Press"]]],
      ["Day 2", [["3x", "Squat"], ["3x", "Leg Press"], ["3x", "Front Squat"], ["3x", "Lunges"], ["3x", "Leg Extension"], ["3x", "Leg Curl"]]],
      ["Day 3", [["3x", "Overhead Press"], ["3x", "Barbell Row"], ["3x", "DB Incline Press"], ["3x", "Single-Arm Pushdown"], ["3x", "Side Lateral Raise"]]],
      ["Day 4", [["3x", "Deadlift"], ["3x", "Single-Leg Deadlift"], ["3x", "Hack Squat"], ["3x", "Lunges"], ["3x", "Leg Extension"], ["3x", "Leg Curl"]]],
      ["Day 5", [["3x", "Pull-ups"], ["3x", "Incline Bench Press"], ["3x", "Cable Row (0°)"], ["3x", "Chest Flys"], ["3x", "DB Shoulder Press"], ["3x", "Calf Raise"], ["3x", "Abs"]]],
    ],
  },
  {
    name: "Home gym Upper / Lower",
    days: [
      ["Upper 1", [["4x", "Squat"], ["4x", "Pull-ups"], ["4x", "Overhead Press"], ["3x", "Leg Press"], ["3x", "Barbell Row"], ["3x", "Incline Bench Press"]]],
      ["Lower 1", [["5x", "Squat"], ["4x", "Romanian Deadlift"], ["4x", "Lunges"], ["4x", "Calf Raise"]]],
      ["Upper 2", [["4x", "Bench Press"], ["4x", "Squat"], ["3x", "Barbell Row"], ["3x", "Side Lateral Raise"], ["3x", "Leg Press"], ["3x", "Lat Pulldown"]]],
      ["Lower 2", [["5x", "Deadlift"], ["4x", "Front Squat"], ["4x", "Lunges"], ["4x", "Calf Raise"], ["3x", "Single-Arm DB Row"], ["3x", "Push-ups"]]],
    ],
  },
  {
    name: "Calisthenics v1",
    days: [
      ["Day 1", [["4x", "Planche"], ["3x", "Push-ups"], ["3x", "Pseudo Planche Push-ups"], ["4x", "Single-Leg Squat"], ["4x", "Front Lever"], ["3x", "Assisted One-Arm Pull-up"]]],
      ["Day 2", [["4x", "Planche"], ["3x", "Handstand Push-ups"], ["3x", "Pseudo Planche Push-ups"], ["4x", "Single-Leg Squat"], ["4x", "One-Arm Pull-up"], ["3x", "Pull-ups"]]],
      ["Day 3", [["4x", "Nordic Curl"], ["3x", "Muscle-ups"], ["3x", "Ring Dips"], ["2x", "Handstand"], ["2x", "Abs"]]],
    ],
  },
];
