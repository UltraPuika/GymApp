package com.gymapp.data.repository

import com.gymapp.data.local.dao.BlockDao
import com.gymapp.data.local.dao.BodyDao
import com.gymapp.data.local.dao.ChecklistDao
import com.gymapp.data.local.dao.ExerciseDao
import com.gymapp.data.local.dao.RunningDao
import com.gymapp.data.local.dao.TemplateDao
import com.gymapp.data.local.dao.WorkoutDao
import com.gymapp.data.local.entity.ChecklistCompletionEntity
import com.gymapp.data.local.entity.WorkoutSessionEntity
import com.gymapp.data.mapper.toDomain
import com.gymapp.data.mapper.toEntity
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
import com.gymapp.domain.repository.BodyRepository
import com.gymapp.domain.repository.RunningRepository
import com.gymapp.domain.repository.TrainingRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.time.LocalDate

class TrainingRepositoryImpl(
    private val exerciseDao: ExerciseDao,
    private val workoutDao: WorkoutDao,
    private val blockDao: BlockDao,
    private val templateDao: TemplateDao,
    private val checklistDao: ChecklistDao,
) : TrainingRepository {

    override fun observeExercises(categories: Set<ExerciseCategory>?): Flow<List<Exercise>> =
        exerciseDao.observeAll().map { list ->
            list.map { it.toDomain() }.filter { categories == null || it.category in categories }
        }

    override fun observePrimaryLifts(): Flow<List<Exercise>> =
        exerciseDao.observePrimary().map { list -> list.map { it.toDomain() } }

    override fun observeSession(sessionId: Long): Flow<WorkoutSession?> =
        workoutDao.observeSession(sessionId).map { it?.toDomain() }

    override fun observeSessions(type: SessionType): Flow<List<WorkoutSession>> =
        workoutDao.observeSessions(type.name).map { list -> list.map { it.toDomain() } }

    override suspend fun findSession(date: LocalDate, type: SessionType): WorkoutSession? =
        workoutDao.findSession(date, type.name)?.toDomain()

    override suspend fun createSession(date: LocalDate, type: SessionType, templateDayId: Long?, blockWeek: Int?): Long =
        workoutDao.insertSession(
            WorkoutSessionEntity(date = date, type = type, templateDayId = templateDayId, blockWeek = blockWeek),
        )

    override suspend fun deleteSession(sessionId: Long) = workoutDao.deleteSession(sessionId)

    override fun observeSetsForSession(sessionId: Long): Flow<List<WorkoutSet>> =
        workoutDao.observeSetsForSession(sessionId).map { list -> list.map { it.toDomain() } }

    override fun observeSetsForExercise(exerciseId: Long): Flow<List<WorkoutSet>> =
        workoutDao.observeSetsForExercise(exerciseId).map { list -> list.map { it.toDomain() } }

    override fun observeSetsByType(type: SessionType): Flow<List<WorkoutSet>> =
        workoutDao.observeSetsBySessionType(type.name).map { list -> list.map { it.toDomain() } }

    override suspend fun upsertSet(set: WorkoutSet): Long = workoutDao.upsertSet(set.toEntity())

    override suspend fun deleteSet(setId: Long) = workoutDao.deleteSet(setId)

    override fun observeActiveBlocks(): Flow<List<TrainingBlock>> =
        blockDao.observeActive().map { list -> list.map { it.toDomain() } }

    override suspend fun startBlock(block: TrainingBlock) = blockDao.replaceActive(block.toEntity())

    override fun observeTemplates(): Flow<List<ProgramTemplate>> =
        templateDao.observeTemplates().map { list -> list.map { it.toDomain() } }

    override fun observeChecklist(sessionId: Long): Flow<List<ChecklistItem>> =
        checklistDao.observeForSession(sessionId).map { list -> list.map { it.toDomain() } }

    override suspend fun setChecklistItem(sessionId: Long, itemId: Long, done: Boolean) {
        if (done) checklistDao.markDone(ChecklistCompletionEntity(sessionId, itemId))
        else checklistDao.markUndone(sessionId, itemId)
    }
}

class BodyRepositoryImpl(private val dao: BodyDao) : BodyRepository {
    override fun observeMeasurements(): Flow<List<BodyMeasurement>> =
        dao.observeAll().map { list -> list.map { it.toDomain() } }

    override fun observeLatestBodyweight(): Flow<Double?> = dao.observeLatestWeight()

    override suspend fun add(measurement: BodyMeasurement) {
        dao.insert(measurement.toEntity())
    }

    override suspend fun delete(id: Long) = dao.delete(id)
}

class RunningRepositoryImpl(private val dao: RunningDao) : RunningRepository {
    override fun observeLogs(): Flow<List<RunningLog>> = dao.observeLogs().map { list -> list.map { it.toDomain() } }

    override fun observePlan(): Flow<List<RunningPlanEntry>> = dao.observePlan().map { list -> list.map { it.toDomain() } }

    override suspend fun add(log: RunningLog) {
        dao.insert(log.toEntity())
    }

    override suspend fun delete(id: Long) = dao.delete(id)
}
