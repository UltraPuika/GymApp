package com.gymapp.domain.usecase

import com.gymapp.domain.engine.RpeEngine
import com.gymapp.domain.model.Exercise
import com.gymapp.domain.model.RunType
import com.gymapp.domain.model.RunningLog
import com.gymapp.domain.model.SessionType
import com.gymapp.domain.model.SetType
import com.gymapp.domain.model.TrendPoint
import com.gymapp.domain.repository.BodyRepository
import com.gymapp.domain.repository.RunningRepository
import com.gymapp.domain.repository.TrainingRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.TemporalAdjusters

/** Best estimated 1RM per training day (warm-ups excluded). */
class GetOneRmTrendUseCase(
    private val training: TrainingRepository,
    private val body: BodyRepository,
) {
    operator fun invoke(exercise: Exercise): Flow<List<TrendPoint>> =
        combine(training.observeSetsForExercise(exercise.id), body.observeLatestBodyweight()) { sets, bw ->
            val bodyweight = if (exercise.isBodyweight) bw ?: 0.0 else 0.0
            sets.filter { it.setType != SetType.WARM_UP && it.reps > 0 }
                .groupBy { it.date }
                .map { (date, daySets) ->
                    TrendPoint(date, daySets.maxOf { RpeEngine.estimateOneRm(it.weightKg, it.reps, it.rpe, bodyweight) })
                }
                .sortedBy { it.date }
        }
}

/** Strength: tonnage (reps × kg). Calisthenics: total reps — the workbook's SUM column. */
class GetVolumeTrendUseCase(private val training: TrainingRepository) {
    operator fun invoke(type: SessionType): Flow<List<TrendPoint>> =
        training.observeSetsByType(type).map { sets ->
            sets.groupBy { it.date }
                .map { (date, daySets) ->
                    val volume = when (type) {
                        SessionType.STRENGTH -> daySets.sumOf { it.reps * it.weightKg }
                        SessionType.CALISTHENICS -> daySets.sumOf { it.reps }.toDouble()
                    }
                    TrendPoint(date, volume)
                }
                .sortedBy { it.date }
        }
}

data class WeeklyRunSummary(
    val weekStart: LocalDate,
    val kmByType: Map<RunType, Double>,
    val totalKm: Double,
    val totalDurationSec: Int,
    val runs: List<RunningLog>,
)

class GetWeeklyRunSummaryUseCase(private val running: RunningRepository) {
    operator fun invoke(): Flow<List<WeeklyRunSummary>> =
        running.observeLogs().map { logs ->
            logs.groupBy { it.date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)) }
                .map { (weekStart, runs) ->
                    WeeklyRunSummary(
                        weekStart = weekStart,
                        kmByType = runs.groupBy { it.runType }.mapValues { (_, r) -> r.sumOf { it.distanceKm } },
                        totalKm = runs.sumOf { it.distanceKm },
                        totalDurationSec = runs.sumOf { it.durationSec },
                        runs = runs.sortedBy { it.date },
                    )
                }
                .sortedByDescending { it.weekStart }
        }
}
