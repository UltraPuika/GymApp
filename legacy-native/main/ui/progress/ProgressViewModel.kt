package com.gymapp.ui.progress

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.gymapp.domain.model.BodyMeasurement
import com.gymapp.domain.model.Exercise
import com.gymapp.domain.model.ExerciseCategory
import com.gymapp.domain.model.SessionType
import com.gymapp.domain.model.TrendPoint
import com.gymapp.domain.repository.BodyRepository
import com.gymapp.domain.repository.TrainingRepository
import com.gymapp.domain.usecase.GetOneRmTrendUseCase
import com.gymapp.domain.usecase.GetVolumeTrendUseCase
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate

enum class BodyMetric(val label: String, val unit: String, val selector: (BodyMeasurement) -> Double?) {
    WEIGHT("Weight", "kg", { it.weightKg }),
    WAIST("Waist", "cm", { it.waistCm }),
    ARMS("Arms", "cm", { it.armsCm }),
    GLUTES("Glutes", "cm", { it.glutesCm }),
    LEGS("Legs", "cm", { it.legsCm }),
}

data class ProgressUiState(
    val exercises: List<Exercise> = emptyList(),
    val selectedExercise: Exercise? = null,
    val oneRmTrend: List<TrendPoint> = emptyList(),
    val volumeType: SessionType = SessionType.STRENGTH,
    val volumeTrend: List<TrendPoint> = emptyList(),
    val metric: BodyMetric = BodyMetric.WEIGHT,
    val metricTrend: List<TrendPoint> = emptyList(),
    val measurements: List<BodyMeasurement> = emptyList(),
)

@OptIn(ExperimentalCoroutinesApi::class)
class ProgressViewModel(
    training: TrainingRepository,
    private val body: BodyRepository,
    getOneRmTrend: GetOneRmTrendUseCase,
    getVolumeTrend: GetVolumeTrendUseCase,
) : ViewModel() {

    private val selectedId = MutableStateFlow<Long?>(null)
    private val volumeType = MutableStateFlow(SessionType.STRENGTH)
    private val metric = MutableStateFlow(BodyMetric.WEIGHT)

    private val exercises = training.observeExercises(
        setOf(ExerciseCategory.STRENGTH, ExerciseCategory.ACCESSORY, ExerciseCategory.CALISTHENICS),
    )

    private val selected = combine(exercises, selectedId) { list, id ->
        list.firstOrNull { it.id == id } ?: list.firstOrNull { it.isPrimaryLift }
    }

    private val oneRm = selected.flatMapLatest { ex -> if (ex == null) flowOf(emptyList()) else getOneRmTrend(ex) }
    private val volume = volumeType.flatMapLatest { getVolumeTrend(it) }

    private val bodyState = combine(body.observeMeasurements(), metric) { list, m ->
        Triple(list, m, list.mapNotNull { row -> m.selector(row)?.let { TrendPoint(row.date, it) } })
    }

    val state: StateFlow<ProgressUiState> = combine(
        combine(exercises, selected, oneRm) { a, b, c -> Triple(a, b, c) },
        combine(volumeType, volume) { a, b -> a to b },
        bodyState,
    ) { (list, sel, trend), (vType, vTrend), (measurements, m, mTrend) ->
        ProgressUiState(list, sel, trend, vType, vTrend, m, mTrend, measurements.sortedByDescending { it.date })
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ProgressUiState())

    fun selectExercise(id: Long) { selectedId.value = id }
    fun selectVolumeType(type: SessionType) { volumeType.value = type }
    fun selectMetric(m: BodyMetric) { metric.value = m }

    fun addMeasurement(date: LocalDate, weight: Double?, waist: Double?, arms: Double?, glutes: Double?, legs: Double?) =
        viewModelScope.launch { body.add(BodyMeasurement(date = date, weightKg = weight, waistCm = waist, armsCm = arms, glutesCm = glutes, legsCm = legs)) }

    fun deleteMeasurement(id: Long) = viewModelScope.launch { body.delete(id) }
}
