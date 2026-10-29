package com.gymapp.data.local.seed

import androidx.room.withTransaction
import com.gymapp.data.local.GymDatabase
import com.gymapp.data.local.entity.ChecklistItemEntity
import com.gymapp.data.local.entity.ExerciseEntity
import com.gymapp.data.local.entity.ProgramTemplateEntity
import com.gymapp.data.local.entity.RunningPlanEntity
import com.gymapp.data.local.entity.TemplateDayEntity
import com.gymapp.data.local.entity.TemplateExerciseEntity
import com.gymapp.domain.model.ChecklistCategory
import com.gymapp.domain.model.ExerciseCategory
import com.gymapp.domain.model.ExerciseCategory.ACCESSORY
import com.gymapp.domain.model.ExerciseCategory.CALISTHENICS
import com.gymapp.domain.model.ExerciseCategory.STRENGTH
import com.gymapp.domain.model.RunType

/** One-time seed of the exercise library, programme templates, checklists and the half-marathon plan. */
class DatabaseSeeder(private val db: GymDatabase) {

    suspend fun seed() = db.withTransaction {
        val ids = seedExercises()
        seedTemplates(ids)
        seedChecklist()
        seedRunningPlan()
    }

    private suspend fun seedExercises(): Map<String, Long> {
        val dao = db.exerciseDao()
        return exercises.associate { (name, category, primary, bodyweight, increment) ->
            name to dao.insert(
                ExerciseEntity(
                    name = name,
                    category = category,
                    isPrimaryLift = primary,
                    isBodyweight = bodyweight,
                    incrementKg = increment,
                ),
            )
        }
    }

    private suspend fun seedTemplates(ids: Map<String, Long>) {
        val dao = db.templateDao()
        templates.forEach { template ->
            val templateId = dao.insertTemplate(
                ProgramTemplateEntity(name = template.name, daysPerWeek = template.days.size),
            )
            template.days.forEachIndexed { dayIndex, day ->
                val dayId = dao.insertDay(TemplateDayEntity(templateId = templateId, dayIndex = dayIndex, name = day.name))
                dao.insertExercises(
                    day.exercises.mapIndexed { order, ex ->
                        TemplateExerciseEntity(
                            dayId = dayId,
                            exerciseId = requireNotNull(ids[ex.name]) { "Unknown seed exercise ${ex.name}" },
                            sortOrder = order,
                            targetSets = ex.sets,
                            repScheme = ex.reps,
                        )
                    },
                )
            }
        }
    }

    private suspend fun seedChecklist() {
        val warmUp = listOf(
            "Pull-ups / Push-ups" to "4x",
            "External rotation" to "3x",
            "Full can" to "2x",
            "Biceps & triceps" to "1x",
        )
        val prehab = listOf(
            "Prone Y-T-W-A raises" to "2x",
            "External rotation at 90°" to "2x",
            "External rotation band hold" to "2x",
            "Banded press" to "2x",
            "Diagonal pattern extension & flexion" to "1x",
        )
        db.checklistDao().insertItems(
            warmUp.mapIndexed { i, (n, p) -> ChecklistItemEntity(name = n, prescription = p, category = ChecklistCategory.WARM_UP, sortOrder = i) } +
                prehab.mapIndexed { i, (n, p) -> ChecklistItemEntity(name = n, prescription = p, category = ChecklistCategory.PREHAB, sortOrder = i) },
        )
    }

    private suspend fun seedRunningPlan() {
        val easy = "5:40–6:00 min/km, 120–145 BPM"
        val tempo = "4:50–5:05 min/km, 150–165 BPM"
        val long = "5:45–6:00 min/km, 120–145 BPM"
        val weeks = listOf(
            PlanWeek(1, 6, 6, 12, 2), PlanWeek(2, 7, 7, 14, 3), PlanWeek(3, 7, 8, 16, 4),
            PlanWeek(4, 7, 8, 17), PlanWeek(5, 8, 9, 18, 5), PlanWeek(6, 8, 9, 19),
            PlanWeek(7, 8, 10, 20, 6), PlanWeek(8, 8, 10, 21), PlanWeek(9, 6, 7, 14, taper = true),
        )
        val entries = weeks.flatMap { w ->
            val (week, easyKm, tempoKm, longKm, finish) = w
            listOf(
                RunningPlanEntity(week = week, runType = RunType.EASY, targetDistanceKm = easyKm.toDouble(), description = "Mon · $easyKm km easy ($easy)"),
                if (w.taper) {
                    RunningPlanEntity(week = week, runType = RunType.EASY, targetDistanceKm = tempoKm.toDouble(), description = "Wed · $tempoKm km easy ($easy)")
                } else {
                    RunningPlanEntity(week = week, runType = RunType.TEMPO, targetDistanceKm = tempoKm.toDouble(), description = "Wed · $tempoKm km tempo ($tempo)")
                },
                RunningPlanEntity(
                    week = week,
                    runType = RunType.LONG,
                    targetDistanceKm = longKm.toDouble(),
                    description = "Sat · $longKm km steady ($long)" +
                        if (finish > 0) ", last $finish km @ 5:10–5:20 min/km" else "",
                ),
            )
        } + listOf(
            RunningPlanEntity(week = 10, runType = RunType.EASY, targetDistanceKm = 5.0, description = "Mon · 5 km easy ($easy)"),
            RunningPlanEntity(week = 10, runType = RunType.EASY, targetDistanceKm = 5.0, description = "Wed · 5 km easy ($easy)"),
            RunningPlanEntity(week = 10, runType = RunType.RACE, targetDistanceKm = 21.1, description = "Sat · RACE DAY 21.1 km @ ~5:00 min/km, 165–175 BPM"),
        )
        db.runningDao().insertPlan(entries)
    }

    private data class PlanWeek(
        val week: Int,
        val easyKm: Int,
        val tempoKm: Int,
        val longKm: Int,
        val fastFinishKm: Int = 0,
        val taper: Boolean = false,
    )

    private data class ExSeed(
        val name: String,
        val category: ExerciseCategory,
        val primary: Boolean = false,
        val bodyweight: Boolean = false,
        val increment: Double = 2.5,
    )

    private data class Ex(val name: String, val sets: String = "3x", val reps: String = "8–12")
    private data class Day(val name: String, val exercises: List<Ex>)
    private data class Template(val name: String, val days: List<Day>)

    private companion object {
        const val DL = "Deadlift"
        const val SQ = "Squat"
        const val BP = "Bench Press"
        const val OHP = "Overhead Press"
        const val WPU = "Weighted Pull-ups"

        val exercises = listOf(
            ExSeed(DL, STRENGTH, primary = true, increment = 5.0),
            ExSeed(SQ, STRENGTH, primary = true),
            ExSeed(BP, STRENGTH, primary = true),
            ExSeed(OHP, STRENGTH, primary = true),
            ExSeed(WPU, STRENGTH, primary = true, bodyweight = true),
            ExSeed("Close-Grip Bench", ACCESSORY),
            ExSeed("Incline Bench", ACCESSORY),
            ExSeed("DB Incline Press", ACCESSORY, increment = 2.0),
            ExSeed("DB Shoulder Press", ACCESSORY, increment = 2.0),
            ExSeed("Machine Shoulder Press", ACCESSORY),
            ExSeed("Front Squat", ACCESSORY),
            ExSeed("Hack Squat", ACCESSORY, increment = 5.0),
            ExSeed("Leg Press", ACCESSORY, increment = 5.0),
            ExSeed("Romanian Deadlift", ACCESSORY, increment = 5.0),
            ExSeed("Single-Leg Deadlift", ACCESSORY, increment = 2.0),
            ExSeed("Lunges", ACCESSORY, increment = 2.0),
            ExSeed("Leg Extension", ACCESSORY),
            ExSeed("Leg Curl", ACCESSORY),
            ExSeed("Calf Raises", ACCESSORY, increment = 5.0),
            ExSeed("Barbell Row", ACCESSORY),
            ExSeed("Machine Row", ACCESSORY),
            ExSeed("Cable Row", ACCESSORY),
            ExSeed("Single-Arm DB Row", ACCESSORY, increment = 2.0),
            ExSeed("Lat Pulldown", ACCESSORY),
            ExSeed("Straight-Arm Pulldown", ACCESSORY),
            ExSeed("Single-Arm Pushdown", ACCESSORY),
            ExSeed("Chest Flys", ACCESSORY),
            ExSeed("Side Laterals", ACCESSORY, increment = 1.0),
            ExSeed("Rear Delts", ACCESSORY, increment = 1.0),
            ExSeed("Abs", ACCESSORY),
            ExSeed("Push-ups", CALISTHENICS, bodyweight = true),
            ExSeed("Pull-ups", CALISTHENICS, bodyweight = true),
            ExSeed("Ring Dips", CALISTHENICS, bodyweight = true),
            ExSeed("Muscle-ups", CALISTHENICS, bodyweight = true),
            ExSeed("Planche Progression", CALISTHENICS, bodyweight = true),
            ExSeed("Handstand Push-ups", CALISTHENICS, bodyweight = true),
            ExSeed("Pseudo Planche Push-ups", CALISTHENICS, bodyweight = true),
            ExSeed("Front Lever", CALISTHENICS, bodyweight = true),
            ExSeed("One-Arm Pull-up Progression", CALISTHENICS, bodyweight = true),
            ExSeed("Single-Leg Squats", CALISTHENICS, bodyweight = true),
            ExSeed("Nordic Curls", CALISTHENICS, bodyweight = true),
        )

        val templates = listOf(
            Template(
                "3-Day Full Body",
                listOf(
                    Day("Day 1", listOf(Ex(BP, reps = "3"), Ex(WPU, reps = "10"), Ex(SQ, reps = "8"), Ex("Close-Grip Bench"), Ex("Barbell Row"), Ex("Hack Squat"))),
                    Day("Day 2", listOf(Ex(DL, reps = "4"), Ex(OHP, reps = "5"), Ex("Pull-ups", reps = "BW max"), Ex("Romanian Deadlift"), Ex("Incline Bench"), Ex("Barbell Row"))),
                    Day("Day 3", listOf(Ex(WPU, reps = "4"), Ex(BP, reps = "8"), Ex(SQ, reps = "15"), Ex("Side Laterals"), Ex("Machine Row"), Ex("Leg Press"))),
                ),
            ),
            Template(
                "4-Day Push/Pull",
                listOf(
                    Day("Push A", listOf(Ex(BP, reps = "8"), Ex(SQ, reps = "12"), Ex("Close-Grip Bench"), Ex("Leg Press"), Ex("Side Laterals"), Ex("Leg Extension"))),
                    Day("Pull A", listOf(Ex(WPU, reps = "6"), Ex("Romanian Deadlift"), Ex("Barbell Row"), Ex("Machine Row"), Ex("Straight-Arm Pulldown"), Ex("Leg Curl"))),
                    Day("Push B", listOf(Ex(OHP, reps = "6"), Ex("Front Squat"), Ex("Incline Bench"), Ex("Hack Squat"), Ex("Chest Flys"), Ex("Side Laterals"))),
                    Day("Pull B", listOf(Ex(DL, reps = "6"), Ex(WPU, reps = "12"), Ex("Machine Row"), Ex("Cable Row"), Ex("Rear Delts"), Ex("Leg Curl"))),
                ),
            ),
            Template(
                "4-Day Upper/Lower",
                listOf(
                    Day("Upper A", listOf(Ex(BP, reps = "10→8→6→4"), Ex("Barbell Row"), Ex("Close-Grip Bench"), Ex("Cable Row"), Ex("Side Laterals"), Ex("Calf Raises"), Ex("Abs"))),
                    Day("Lower A", listOf(Ex(SQ, reps = "10→8→6→4"), Ex("Single-Leg Deadlift"), Ex("Leg Press"), Ex("Lunges"), Ex("Leg Extension"), Ex("Leg Curl"))),
                    Day("Upper B", listOf(Ex(OHP, reps = "10→8→6→4"), Ex(WPU, reps = "10→8→6→4"), Ex("Incline Bench"), Ex("Straight-Arm Pulldown"), Ex("Chest Flys"), Ex("Calf Raises"), Ex("Abs"))),
                    Day("Lower B", listOf(Ex(DL, reps = "10→8→6→4"), Ex("Front Squat"), Ex("Leg Press"), Ex("Lunges"), Ex("Leg Extension"), Ex("Leg Curl"))),
                ),
            ),
            Template(
                "5-Day Upper/Lower",
                listOf(
                    Day("Day 1 · Upper", listOf(Ex(BP, reps = "10→8→6→4"), Ex(WPU), Ex("Close-Grip Bench"), Ex("Machine Row"), Ex("Machine Shoulder Press"))),
                    Day("Day 2 · Lower", listOf(Ex(SQ, reps = "10→8→6→4"), Ex("Leg Press"), Ex("Front Squat"), Ex("Lunges"), Ex("Leg Extension"), Ex("Leg Curl"))),
                    Day("Day 3 · Upper", listOf(Ex(OHP, reps = "10→8→6→4"), Ex("Barbell Row"), Ex("DB Incline Press"), Ex("Single-Arm Pushdown"), Ex("Side Laterals"))),
                    Day("Day 4 · Lower", listOf(Ex(DL, reps = "10→8→6→4"), Ex("Single-Leg Deadlift"), Ex("Hack Squat"), Ex("Lunges"), Ex("Leg Extension"), Ex("Leg Curl"))),
                    Day("Day 5 · Upper", listOf(Ex(WPU, reps = "10→8→6→4"), Ex("Incline Bench"), Ex("Cable Row"), Ex("Chest Flys"), Ex("DB Shoulder Press"), Ex("Calf Raises"), Ex("Abs"))),
                ),
            ),
            Template(
                "Home Gym Upper/Lower",
                listOf(
                    Day("Upper A", listOf(Ex(SQ, sets = "4x", reps = "4"), Ex(WPU, sets = "4x", reps = "8"), Ex(OHP, sets = "4x", reps = "6"), Ex("Leg Press"), Ex("Barbell Row"), Ex("Incline Bench"))),
                    Day("Lower A (Squat)", listOf(Ex(SQ, sets = "5x", reps = "5"), Ex("Romanian Deadlift", sets = "4x"), Ex("Lunges", sets = "4x"), Ex("Calf Raises", sets = "4x", reps = "15–20"))),
                    Day("Upper B", listOf(Ex(BP, sets = "4x", reps = "4"), Ex(SQ, sets = "4x", reps = "8"), Ex("Barbell Row"), Ex("Side Laterals"), Ex("Leg Press"), Ex("Lat Pulldown"))),
                    Day("Lower B (Deadlift)", listOf(Ex(DL, sets = "5x", reps = "5"), Ex("Front Squat", sets = "4x"), Ex("Lunges", sets = "4x"), Ex("Calf Raises", sets = "4x", reps = "15–20"), Ex("Single-Arm DB Row"), Ex("Push-ups", reps = "max"))),
                ),
            ),
            Template(
                "Calisthenics Split",
                listOf(
                    Day("Day 1 · Push", listOf(Ex("Planche Progression", sets = "4x", reps = "hold"), Ex("Push-ups", reps = "+kg"), Ex("Pseudo Planche Push-ups"), Ex("Single-Leg Squats", sets = "4x"))),
                    Day("Day 2 · Pull", listOf(Ex("Front Lever", sets = "4x", reps = "hold"), Ex("One-Arm Pull-up Progression"), Ex("Pull-ups", reps = "+kg"), Ex("Nordic Curls", sets = "4x"))),
                    Day("Day 3 · Push", listOf(Ex("Planche Progression", sets = "4x", reps = "hold"), Ex("Handstand Push-ups"), Ex("Ring Dips"), Ex("Single-Leg Squats", sets = "4x"))),
                    Day("Day 4 · Pull", listOf(Ex("One-Arm Pull-up Progression", sets = "4x"), Ex("Muscle-ups"), Ex("Pull-ups", reps = "+kg"), Ex("Nordic Curls", sets = "4x"))),
                ),
            ),
        )
    }
}
