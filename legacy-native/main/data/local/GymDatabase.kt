package com.gymapp.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.sqlite.db.SupportSQLiteDatabase
import com.gymapp.data.local.dao.BlockDao
import com.gymapp.data.local.dao.BodyDao
import com.gymapp.data.local.dao.ChecklistDao
import com.gymapp.data.local.dao.ExerciseDao
import com.gymapp.data.local.dao.RunningDao
import com.gymapp.data.local.dao.TemplateDao
import com.gymapp.data.local.dao.WorkoutDao
import com.gymapp.data.local.entity.BodyMeasurementEntity
import com.gymapp.data.local.entity.ChecklistCompletionEntity
import com.gymapp.data.local.entity.ChecklistItemEntity
import com.gymapp.data.local.entity.ExerciseEntity
import com.gymapp.data.local.entity.ProgramTemplateEntity
import com.gymapp.data.local.entity.RunningLogEntity
import com.gymapp.data.local.entity.RunningPlanEntity
import com.gymapp.data.local.entity.TemplateDayEntity
import com.gymapp.data.local.entity.TemplateExerciseEntity
import com.gymapp.data.local.entity.TrainingBlockEntity
import com.gymapp.data.local.entity.WorkoutSessionEntity
import com.gymapp.data.local.entity.WorkoutSetEntity
import com.gymapp.data.local.seed.DatabaseSeeder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

@Database(
    entities = [
        ExerciseEntity::class,
        WorkoutSessionEntity::class,
        WorkoutSetEntity::class,
        TrainingBlockEntity::class,
        BodyMeasurementEntity::class,
        RunningLogEntity::class,
        RunningPlanEntity::class,
        ProgramTemplateEntity::class,
        TemplateDayEntity::class,
        TemplateExerciseEntity::class,
        ChecklistItemEntity::class,
        ChecklistCompletionEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
@TypeConverters(Converters::class)
abstract class GymDatabase : RoomDatabase() {
    abstract fun exerciseDao(): ExerciseDao
    abstract fun workoutDao(): WorkoutDao
    abstract fun blockDao(): BlockDao
    abstract fun templateDao(): TemplateDao
    abstract fun checklistDao(): ChecklistDao
    abstract fun bodyDao(): BodyDao
    abstract fun runningDao(): RunningDao

    companion object {
        fun build(context: Context, scope: CoroutineScope): GymDatabase {
            lateinit var instance: GymDatabase
            instance = Room.databaseBuilder(context, GymDatabase::class.java, "gym.db")
                .addCallback(object : Callback() {
                    // onCreate fires on first open, after `instance` is assigned.
                    override fun onCreate(db: SupportSQLiteDatabase) {
                        scope.launch { DatabaseSeeder(instance).seed() }
                    }
                })
                .build()
            return instance
        }
    }
}
