package com.gymapp.domain.repository

import com.gymapp.domain.model.BodyMeasurement
import com.gymapp.domain.model.ChecklistItem
import com.gymapp.domain.model.Exercise
import com.gymapp.domain.model.ExerciseCategory
import com.gymapp.domain.model.ProgramTemplate
import com.gymapp.domain.model.RunningLog
import com.gymapp.domain.model.RunningPlanEntry
import com.gymapp.domain.model.SessionType
import com.gymapp.domain.model.TrainingBlock
import com.gymapp.domain.model.WorkoutSession
import com.gymapp.domain.model.WorkoutSet
import kotlinx.coroutines.flow.Flow
import java.time.LocalDate

interface TrainingRepository {
    fun observeExercises(categories: Set<ExerciseCategory>? = null): Flow<List<Exercise>>
    fun observePrimaryLifts(): Flow<List<Exercise>>

    fun observeSession(sessionId: Long): Flow<WorkoutSession?>
    fun observeSessions(type: SessionType): Flow<List<WorkoutSession>>
    suspend fun findSession(date: LocalDate, type: SessionType): WorkoutSession?
    suspend fun createSession(date: LocalDate, type: SessionType, templateDayId: Long?, blockWeek: Int?): Long
    suspend fun deleteSession(sessionId: Long)

    fun observeSetsForSession(sessionId: Long): Flow<List<WorkoutSet>>
    fun observeSetsForExercise(exerciseId: Long): Flow<List<WorkoutSet>>
    fun observeSetsByType(type: SessionType): Flow<List<WorkoutSet>>
    suspend fun upsertSet(set: WorkoutSet): Long
    suspend fun deleteSet(setId: Long)

    fun observeActiveBlocks(): Flow<List<TrainingBlock>>
    suspend fun startBlock(block: TrainingBlock)

    fun observeTemplates(): Flow<List<ProgramTemplate>>

    fun observeChecklist(sessionId: Long): Flow<List<ChecklistItem>>
    suspend fun setChecklistItem(sessionId: Long, itemId: Long, done: Boolean)
}

interface BodyRepository {
    fun observeMeasurements(): Flow<List<BodyMeasurement>>
    fun observeLatestBodyweight(): Flow<Double?>
    suspend fun add(measurement: BodyMeasurement)
    suspend fun delete(id: Long)
}

interface RunningRepository {
    fun observeLogs(): Flow<List<RunningLog>>
    fun observePlan(): Flow<List<RunningPlanEntry>>
    suspend fun add(log: RunningLog)
    suspend fun delete(id: Long)
}
