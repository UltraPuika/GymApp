package com.gymapp.ui.rpe

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.gymapp.domain.engine.RpeEngine
import com.gymapp.domain.model.Exercise
import com.gymapp.domain.model.SessionType
import com.gymapp.domain.model.SetType
import com.gymapp.domain.repository.BodyRepository
import com.gymapp.domain.repository.TrainingRepository
import com.gymapp.ui.common.fmt
import com.gymapp.ui.common.toDecimalOrNull
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update

data class LiftMax(val exercise: Exercise, val e1rmKg: Double)

data class RpeInputs(
    val baseMaxText: String = "260",
    val incrementKg: Double = RpeEngine.DEFAULT_INCREMENT_KG,
    val showPercent: Boolean = false,
    val selectedLiftId: Long? = null,
    val estWeightText: String = "",
    val estRepsText: String = "5",
    val estRpe: Double = 8.0,
    val targetReps: Int = 5,
    val targetRpe: Double = 8.0,
)

data class TargetRow(val label: String, val reps: Int, val rpe: Double, val weightKg: Double?, val percent: Double?)

data class RpeUiState(
    val inputs: RpeInputs = RpeInputs(),
    val lifts: List<LiftMax> = emptyList(),
    val bodyweightKg: Double = 0.0,
    val estimatedOneRm: Double? = null,
    val targets: List<TargetRow> = emptyList(),
) {
    val baseMax: Double? get() = inputs.baseMaxText.toDecimalOrNull()
    val selectedIsBodyweight: Boolean get() = lifts.firstOrNull { it.exercise.id == inputs.selectedLiftId }?.exercise?.isBodyweight == true

    /** Bodyweight only enters the maths for loaded bodyweight lifts. */
    val effectiveBodyweight: Double get() = if (selectedIsBodyweight) bodyweightKg else 0.0

    fun cellWeight(reps: Int, rpe: Double): Double? =
        baseMax?.let { RpeEngine.targetWeight(it, reps, rpe, effectiveBodyweight, inputs.incrementKg) }
}

class RpeCalculatorViewModel(training: TrainingRepository, body: BodyRepository) : ViewModel() {

    private val inputs = MutableStateFlow(RpeInputs())

    private val liftMaxes = combine(
        training.observePrimaryLifts(),
        training.observeSetsByType(SessionType.STRENGTH),
        body.observeLatestBodyweight(),
    ) { lifts, sets, bw ->
        lifts.mapNotNull { lift ->
            val working = sets.filter { it.exerciseId == lift.id && it.setType != SetType.WARM_UP && it.reps > 0 }
            val lastDate = working.maxOfOrNull { it.date } ?: return@mapNotNull null
            val liftBw = if (lift.isBodyweight) bw ?: 0.0 else 0.0
            val best = working.filter { it.date == lastDate }
                .maxOf { RpeEngine.estimateOneRm(it.weightKg, it.reps, it.rpe, liftBw) }
            LiftMax(lift, best)
        } to (bw ?: 0.0)
    }

    val state: StateFlow<RpeUiState> = combine(inputs, liftMaxes) { input, (lifts, bw) ->
        val base = RpeUiState(inputs = input, lifts = lifts, bodyweightKg = bw)
        val estimate = run {
            val w = input.estWeightText.toDecimalOrNull() ?: return@run null
            val r = input.estRepsText.toIntOrNull()?.takeIf { it > 0 } ?: return@run null
            RpeEngine.estimateOneRm(w, r, input.estRpe, base.effectiveBodyweight)
        }
        val r = input.targetReps
        val rpe = input.targetRpe
        val targets = listOf(
            "TOP set" to rpe,
            "Back-off (−1 RPE)" to rpe - 1,
            "Back-off (−2 RPE)" to rpe - 2,
        ).filter { it.second >= 6.0 }.map { (label, value) ->
            TargetRow(label, r, value, base.cellWeight(r, value), RpeEngine.percentage(r, value))
        }
        base.copy(estimatedOneRm = estimate, targets = targets)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), RpeUiState())

    fun setBaseMax(text: String) = inputs.update { it.copy(baseMaxText = text) }
    fun setIncrement(kg: Double) = inputs.update { it.copy(incrementKg = kg) }
    fun togglePercent() = inputs.update { it.copy(showPercent = !it.showPercent) }
    fun selectLift(lift: LiftMax) = inputs.update {
        if (it.selectedLiftId == lift.exercise.id) it.copy(selectedLiftId = null)
        else it.copy(baseMaxText = lift.e1rmKg.fmt(), selectedLiftId = lift.exercise.id)
    }
    fun setEstWeight(text: String) = inputs.update { it.copy(estWeightText = text) }
    fun setEstReps(text: String) = inputs.update { it.copy(estRepsText = text) }
    fun setEstRpe(rpe: Double) = inputs.update { it.copy(estRpe = rpe) }
    fun setTarget(reps: Int, rpe: Double) = inputs.update {
        it.copy(targetReps = reps.coerceIn(1, RpeEngine.MAX_REPS), targetRpe = rpe)
    }

    fun useEstimateAsBase() {
        val e1rm = state.value.estimatedOneRm ?: return
        inputs.update { it.copy(baseMaxText = RpeEngine.roundDown(e1rm, 0.25).fmt()) }
    }
}
