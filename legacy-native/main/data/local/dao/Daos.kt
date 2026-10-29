package com.gymapp.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.gymapp.data.local.entity.BodyMeasurementEntity
import com.gymapp.data.local.entity.ChecklistCompletionEntity
import com.gymapp.data.local.entity.ChecklistItemEntity
import com.gymapp.data.local.entity.ChecklistRow
import com.gymapp.data.local.entity.ExerciseEntity
import com.gymapp.data.local.entity.ProgramTemplateEntity
import com.gymapp.data.local.entity.RunningLogEntity
import com.gymapp.data.local.entity.RunningPlanEntity
import com.gymapp.data.local.entity.TemplateDayEntity
import com.gymapp.data.local.entity.TemplateExerciseEntity
import com.gymapp.data.local.entity.TemplateWithDays
import com.gymapp.data.local.entity.TrainingBlockEntity
import com.gymapp.data.local.entity.WorkoutSessionEntity
import com.gymapp.data.local.entity.WorkoutSetEntity
import kotlinx.coroutines.flow.Flow
import java.time.LocalDate

@Dao
interface ExerciseDao {
    @Query("SELECT * FROM exercises ORDER BY isPrimaryLift DESC, name")
    fun observeAll(): Flow<List<ExerciseEntity>>

    @Query("SELECT * FROM exercises WHERE isPrimaryLift = 1 ORDER BY name")
    fun observePrimary(): Flow<List<ExerciseEntity>>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(exercise: ExerciseEntity): Long
}

@Dao
interface WorkoutDao {
    @Query("SELECT * FROM workout_sessions WHERE id = :id")
    fun observeSession(id: Long): Flow<WorkoutSessionEntity?>

    @Query("SELECT * FROM workout_sessions WHERE type = :type ORDER BY date DESC, id DESC")
    fun observeSessions(type: String): Flow<List<WorkoutSessionEntity>>

    @Query("SELECT * FROM workout_sessions WHERE date = :date AND type = :type ORDER BY id DESC LIMIT 1")
    suspend fun findSession(date: LocalDate, type: String): WorkoutSessionEntity?

    @Insert
    suspend fun insertSession(session: WorkoutSessionEntity): Long

    @Query("DELETE FROM workout_sessions WHERE id = :id")
    suspend fun deleteSession(id: Long)

    @Query("SELECT * FROM workout_sets WHERE sessionId = :sessionId ORDER BY id")
    fun observeSetsForSession(sessionId: Long): Flow<List<WorkoutSetEntity>>

    @Query("SELECT * FROM workout_sets WHERE exerciseId = :exerciseId ORDER BY date, setIndex")
    fun observeSetsForExercise(exerciseId: Long): Flow<List<WorkoutSetEntity>>

    @Query(
        """
        SELECT ws.* FROM workout_sets ws
        INNER JOIN workout_sessions s ON s.id = ws.sessionId
        WHERE s.type = :type
        ORDER BY ws.date
        """,
    )
    fun observeSetsBySessionType(type: String): Flow<List<WorkoutSetEntity>>

    @Upsert
    suspend fun upsertSet(set: WorkoutSetEntity): Long

    @Query("DELETE FROM workout_sets WHERE id = :id")
    suspend fun deleteSet(id: Long)
}

@Dao
abstract class BlockDao {
    @Query("SELECT * FROM training_blocks WHERE isActive = 1")
    abstract fun observeActive(): Flow<List<TrainingBlockEntity>>

    @Query("UPDATE training_blocks SET isActive = 0 WHERE exerciseId = :exerciseId")
    abstract suspend fun deactivateForExercise(exerciseId: Long)

    @Insert
    abstract suspend fun insert(block: TrainingBlockEntity): Long

    @Transaction
    open suspend fun replaceActive(block: TrainingBlockEntity) {
        deactivateForExercise(block.exerciseId)
        insert(block.copy(id = 0, isActive = true))
    }
}

@Dao
interface TemplateDao {
    @Transaction
    @Query("SELECT * FROM program_templates ORDER BY daysPerWeek, name")
    fun observeTemplates(): Flow<List<TemplateWithDays>>

    @Insert
    suspend fun insertTemplate(template: ProgramTemplateEntity): Long

    @Insert
    suspend fun insertDay(day: TemplateDayEntity): Long

    @Insert
    suspend fun insertExercises(exercises: List<TemplateExerciseEntity>)
}

@Dao
interface ChecklistDao {
    @Query(
        """
        SELECT c.id, c.name, c.prescription, c.category,
            EXISTS(SELECT 1 FROM checklist_completions cc
                   WHERE cc.itemId = c.id AND cc.sessionId = :sessionId) AS isDone
        FROM checklist_items c
        ORDER BY c.category, c.sortOrder
        """,
    )
    fun observeForSession(sessionId: Long): Flow<List<ChecklistRow>>

    @Insert
    suspend fun insertItems(items: List<ChecklistItemEntity>)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun markDone(completion: ChecklistCompletionEntity)

    @Query("DELETE FROM checklist_completions WHERE sessionId = :sessionId AND itemId = :itemId")
    suspend fun markUndone(sessionId: Long, itemId: Long)
}

@Dao
interface BodyDao {
    @Query("SELECT * FROM body_measurements ORDER BY date")
    fun observeAll(): Flow<List<BodyMeasurementEntity>>

    @Query("SELECT weightKg FROM body_measurements WHERE weightKg IS NOT NULL ORDER BY date DESC, id DESC LIMIT 1")
    fun observeLatestWeight(): Flow<Double?>

    @Insert
    suspend fun insert(measurement: BodyMeasurementEntity): Long

    @Query("DELETE FROM body_measurements WHERE id = :id")
    suspend fun delete(id: Long)
}

@Dao
interface RunningDao {
    @Query("SELECT * FROM running_logs ORDER BY date DESC, id DESC")
    fun observeLogs(): Flow<List<RunningLogEntity>>

    @Query("SELECT * FROM running_plan ORDER BY week, runType")
    fun observePlan(): Flow<List<RunningPlanEntity>>

    @Insert
    suspend fun insert(log: RunningLogEntity): Long

    @Insert
    suspend fun insertPlan(entries: List<RunningPlanEntity>)

    @Query("DELETE FROM running_logs WHERE id = :id")
    suspend fun delete(id: Long)
}
