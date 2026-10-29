package com.gymapp.data.mapper

import com.gymapp.data.local.entity.BodyMeasurementEntity
import com.gymapp.data.local.entity.ChecklistRow
import com.gymapp.data.local.entity.ExerciseEntity
import com.gymapp.data.local.entity.RunningLogEntity
import com.gymapp.data.local.entity.RunningPlanEntity
import com.gymapp.data.local.entity.TemplateWithDays
import com.gymapp.data.local.entity.TrainingBlockEntity
import com.gymapp.data.local.entity.WorkoutSessionEntity
import com.gymapp.data.local.entity.WorkoutSetEntity
import com.gymapp.domain.model.BodyMeasurement
import com.gymapp.domain.model.ChecklistItem
import com.gymapp.domain.model.Exercise
import com.gymapp.domain.model.ProgramTemplate
import com.gymapp.domain.model.RunningLog
import com.gymapp.domain.model.RunningPlanEntry
import com.gymapp.domain.model.TemplateDay
import com.gymapp.domain.model.TemplateExercise
import com.gymapp.domain.model.TrainingBlock
import com.gymapp.domain.model.WorkoutSession
import com.gymapp.domain.model.WorkoutSet

fun ExerciseEntity.toDomain() = Exercise(id, name, category, isPrimaryLift, isBodyweight, incrementKg)

fun WorkoutSessionEntity.toDomain() = WorkoutSession(id, date, type, templateDayId, blockWeek, notes)

fun WorkoutSetEntity.toDomain() = WorkoutSet(id, sessionId, exerciseId, date, setType, setIndex, reps, weightKg, rpe)

fun WorkoutSet.toEntity() = WorkoutSetEntity(id, sessionId, exerciseId, date, setType, setIndex, reps, weightKg, rpe)

fun TrainingBlockEntity.toDomain() = TrainingBlock(
    id, exerciseId, startDate, startReps, repStep, startWeightKg, weeklyIncrementKg, totalWeeks, isActive,
)

fun TrainingBlock.toEntity() = TrainingBlockEntity(
    id, exerciseId, startDate, startReps, repStep, startWeightKg, weeklyIncrementKg, totalWeeks, isActive,
)

fun BodyMeasurementEntity.toDomain() = BodyMeasurement(id, date, weightKg, waistCm, armsCm, glutesCm, legsCm)

fun BodyMeasurement.toEntity() = BodyMeasurementEntity(id, date, weightKg, waistCm, armsCm, glutesCm, legsCm)

fun RunningLogEntity.toDomain() = RunningLog(id, date, runType, distanceKm, durationSec, avgHr, notes)

fun RunningLog.toEntity() = RunningLogEntity(id, date, runType, distanceKm, durationSec, avgHr, notes)

fun RunningPlanEntity.toDomain() = RunningPlanEntry(id, week, runType, targetDistanceKm, description)

fun ChecklistRow.toDomain() = ChecklistItem(id, name, prescription, category, isDone)

fun TemplateWithDays.toDomain() = ProgramTemplate(
    id = template.id,
    name = template.name,
    daysPerWeek = template.daysPerWeek,
    days = days.sortedBy { it.day.dayIndex }.map { d ->
        TemplateDay(
            id = d.day.id,
            name = d.day.name,
            dayIndex = d.day.dayIndex,
            exercises = d.exercises.sortedBy { it.entry.sortOrder }.map {
                TemplateExercise(it.exercise.id, it.exercise.name, it.entry.targetSets, it.entry.repScheme)
            },
        )
    },
)
