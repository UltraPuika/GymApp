package com.gymapp.ui.running

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.gymapp.domain.model.RunType
import com.gymapp.domain.model.RunningLog
import com.gymapp.domain.model.RunningPlanEntry
import com.gymapp.domain.model.TrendPoint
import com.gymapp.domain.repository.RunningRepository
import com.gymapp.domain.usecase.GetWeeklyRunSummaryUseCase
import com.gymapp.domain.usecase.WeeklyRunSummary
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate

data class RunningUiState(
    val weeks: List<WeeklyRunSummary> = emptyList(),
    val plan: Map<Int, List<RunningPlanEntry>> = emptyMap(),
    val weeklyKm: List<TrendPoint> = emptyList(),
)

class RunningViewModel(
    private val running: RunningRepository,
    weeklySummary: GetWeeklyRunSummaryUseCase,
) : ViewModel() {

    val state: StateFlow<RunningUiState> = combine(weeklySummary(), running.observePlan()) { weeks, plan ->
        RunningUiState(
            weeks = weeks,
            plan = plan.groupBy { it.week },
            weeklyKm = weeks.map { TrendPoint(it.weekStart, it.totalKm) }.sortedBy { it.date },
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), RunningUiState())

    fun addRun(date: LocalDate, type: RunType, distanceKm: Double, durationSec: Int, avgHr: Int?) = viewModelScope.launch {
        running.add(RunningLog(date = date, runType = type, distanceKm = distanceKm, durationSec = durationSec, avgHr = avgHr))
    }

    fun deleteRun(id: Long) = viewModelScope.launch { running.delete(id) }
}
