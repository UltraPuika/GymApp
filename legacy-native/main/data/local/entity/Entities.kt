package com.gymapp.data.local.entity

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import com.gymapp.domain.model.ChecklistCategory
import com.gymapp.domain.model.ExerciseCategory
import com.gymapp.domain.model.RunType
import com.gymapp.domain.model.SessionType
import com.gymapp.domain.model.SetType
import java.time.LocalDate

@Entity(tableName = "exercises", indices = [Index(value = ["name"], unique = true)])
data class ExerciseEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val category: ExerciseCategory,
    val isPrimaryLift: Boolean = false,
    val isBodyweight: Boolean = false,
    val incrementKg: Double = 2.5,
)

@Entity(
    tableName = "workout_sessions",
    foreignKeys = [
        ForeignKey(
            entity = TemplateDayEntity::class,
            parentColumns = ["id"],
            childColumns = ["templateDayId"],
            onDelete = ForeignKey.SET_NULL,
        ),
    ],
    indices = [Index("date"), Index("templateDayId")],
)
data class WorkoutSessionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val date: LocalDate,
    val type: SessionType,
    val templateDayId: Long? = null,
    val blockWeek: Int? = null,
    val notes: String = "",
)

@Entity(
    tableName = "workout_sets",
    foreignKeys = [
        ForeignKey(
            entity = WorkoutSessionEntity::class,
            parentColumns = ["id"],
            childColumns = ["sessionId"],
            onDelete = ForeignKey.CASCADE,
        ),
        ForeignKey(
            entity = ExerciseEntity::class,
            parentColumns = ["id"],
            childColumns = ["exerciseId"],
            onDelete = ForeignKey.RESTRICT,
        ),
    ],
    indices = [Index("sessionId"), Index(value = ["exerciseId", "date"])],
)
data class WorkoutSetEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val sessionId: Long,
    val exerciseId: Long,
    /** Denormalised from the session so history/1RM queries never need a join. */
    val date: LocalDate,
    val setType: SetType,
    val setIndex: Int,
    val reps: Int,
    val weightKg: Double,
    val rpe: Double?,
)

@Entity(
    tableName = "training_blocks",
    foreignKeys = [
        ForeignKey(
            entity = ExerciseEntity::class,
            parentColumns = ["id"],
            childColumns = ["exerciseId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("exerciseId")],
)
data class TrainingBlockEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val exerciseId: Long,
    val startDate: LocalDate,
    val startReps: Int,
    val repStep: Int,
    val startWeightKg: Double,
    val weeklyIncrementKg: Double,
    val totalWeeks: Int,
    val isActive: Boolean,
)

@Entity(tableName = "body_measurements", indices = [Index("date")])
data class BodyMeasurementEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val date: LocalDate,
    val weightKg: Double?,
    val waistCm: Double?,
    val armsCm: Double?,
    val glutesCm: Double?,
    val legsCm: Double?,
)

@Entity(tableName = "running_logs", indices = [Index("date")])
data class RunningLogEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val date: LocalDate,
    val runType: RunType,
    val distanceKm: Double,
    val durationSec: Int,
    val avgHr: Int?,
    val notes: String = "",
)

@Entity(tableName = "running_plan")
data class RunningPlanEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val week: Int,
    val runType: RunType,
    val targetDistanceKm: Double,
    val description: String,
)

@Entity(tableName = "program_templates")
data class ProgramTemplateEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val daysPerWeek: Int,
)

@Entity(
    tableName = "template_days",
    foreignKeys = [
        ForeignKey(
            entity = ProgramTemplateEntity::class,
            parentColumns = ["id"],
            childColumns = ["templateId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("templateId")],
)
data class TemplateDayEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val templateId: Long,
    val dayIndex: Int,
    val name: String,
)

@Entity(
    tableName = "template_exercises",
    foreignKeys = [
        ForeignKey(
            entity = TemplateDayEntity::class,
            parentColumns = ["id"],
            childColumns = ["dayId"],
            onDelete = ForeignKey.CASCADE,
        ),
        ForeignKey(
            entity = ExerciseEntity::class,
            parentColumns = ["id"],
            childColumns = ["exerciseId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("dayId"), Index("exerciseId")],
)
data class TemplateExerciseEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val dayId: Long,
    val exerciseId: Long,
    val sortOrder: Int,
    val targetSets: String,
    val repScheme: String,
)

@Entity(tableName = "checklist_items")
data class ChecklistItemEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val prescription: String,
    val category: ChecklistCategory,
    val sortOrder: Int,
)

@Entity(
    tableName = "checklist_completions",
    primaryKeys = ["sessionId", "itemId"],
    foreignKeys = [
        ForeignKey(
            entity = WorkoutSessionEntity::class,
            parentColumns = ["id"],
            childColumns = ["sessionId"],
            onDelete = ForeignKey.CASCADE,
        ),
        ForeignKey(
            entity = ChecklistItemEntity::class,
            parentColumns = ["id"],
            childColumns = ["itemId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("itemId")],
)
data class ChecklistCompletionEntity(
    val sessionId: Long,
    val itemId: Long,
)
