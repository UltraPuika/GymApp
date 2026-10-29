package com.gymapp.di

import android.content.Context
import com.gymapp.data.local.GymDatabase
import com.gymapp.data.repository.BodyRepositoryImpl
import com.gymapp.data.repository.RunningRepositoryImpl
import com.gymapp.data.repository.TrainingRepositoryImpl
import com.gymapp.domain.repository.BodyRepository
import com.gymapp.domain.repository.RunningRepository
import com.gymapp.domain.repository.TrainingRepository
import com.gymapp.domain.usecase.GetOneRmTrendUseCase
import com.gymapp.domain.usecase.GetVolumeTrendUseCase
import com.gymapp.domain.usecase.GetWeeklyRunSummaryUseCase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/** Manual DI graph — swap for Hilt if the module count grows. */
class AppContainer(context: Context) {

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val database: GymDatabase by lazy { GymDatabase.build(context, appScope) }

    val trainingRepository: TrainingRepository by lazy {
        TrainingRepositoryImpl(
            database.exerciseDao(),
            database.workoutDao(),
            database.blockDao(),
            database.templateDao(),
            database.checklistDao(),
        )
    }

    val bodyRepository: BodyRepository by lazy { BodyRepositoryImpl(database.bodyDao()) }

    val runningRepository: RunningRepository by lazy { RunningRepositoryImpl(database.runningDao()) }

    val getOneRmTrend by lazy { GetOneRmTrendUseCase(trainingRepository, bodyRepository) }
    val getVolumeTrend by lazy { GetVolumeTrendUseCase(trainingRepository) }
    val getWeeklyRunSummary by lazy { GetWeeklyRunSummaryUseCase(runningRepository) }
}
