package com.gymapp.domain.model

import java.time.LocalDate

data class Exercise(
    val id: Long,
    val name: String,
    val category: ExerciseCategory,
    val isPrimaryLift: Boolean,
    /** Load is bodyweight + added weight (e.g. weighted pull-ups, dips). */
    val isBodyweight: Boolean,
    val incrementKg: Double,
)

data class WorkoutSession(
    val id: Long,
    val date: LocalDate,
    val type: SessionType,
    val templateDayId: Long?,
    val blockWeek: Int?,
    val notes: String,
)

data class WorkoutSet(
    val id: Long = 0,
    val sessionId: Long,
    val exerciseId: Long,
    val date: LocalDate,
    val setType: SetType,
    val setIndex: Int,
    val reps: Int,
    /** For bodyweight exercises this is the *added* load. */
    val weightKg: Double,
    val rpe: Double?,
)

data class TrainingBlock(
    val id: Long = 0,
    val exerciseId: Long,
    val startDate: LocalDate,
    val startReps: Int,
    val repStep: Int,
    val startWeightKg: Double,
    val weeklyIncrementKg: Double,
    val totalWeeks: Int,
    val isActive: Boolean,
)

data class BodyMeasurement(
    val id: Long = 0,
    val date: LocalDate,
    val weightKg: Double?,
    val waistCm: Double?,
    val armsCm: Double?,
    val glutesCm: Double?,
    val legsCm: Double?,
)

data class RunningLog(
    val id: Long = 0,
    val date: LocalDate,
    val runType: RunType,
    val distanceKm: Double,
    val durationSec: Int,
    val avgHr: Int?,
    val notes: String = "",
) {
    val paceSecPerKm: Int get() = if (distanceKm > 0) (durationSec / distanceKm).toInt() else 0
}

data class RunningPlanEntry(
    val id: Long,
    val week: Int,
    val runType: RunType,
    val targetDistanceKm: Double,
    val description: String,
)

data class ProgramTemplate(
    val id: Long,
    val name: String,
    val daysPerWeek: Int,
    val days: List<TemplateDay>,
)

data class TemplateDay(
    val id: Long,
    val name: String,
    val dayIndex: Int,
    val exercises: List<TemplateExercise>,
)

data class TemplateExercise(
    val exerciseId: Long,
    val exerciseName: String,
    val targetSets: String,
    val repScheme: String,
)

data class ChecklistItem(
    val id: Long,
    val name: String,
    val prescription: String,
    val category: ChecklistCategory,
    val isDone: Boolean = false,
)

data class TrendPoint(val date: LocalDate, val value: Double)
