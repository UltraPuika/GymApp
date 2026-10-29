package com.gymapp.domain.engine

import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.roundToInt

/**
 * RPE / percentage engine mirroring the `RPE` sheet of the training workbook.
 * Rows = RPE 10.0 → 6.0 (0.5 steps), columns = reps 1..12, values = fraction of 1RM.
 */
object RpeEngine {

    const val MAX_REPS = 12
    const val DEFAULT_INCREMENT_KG = 2.5

    val rpeValues: List<Double> = listOf(10.0, 9.5, 9.0, 8.5, 8.0, 7.5, 7.0, 6.5, 6.0)
    val repValues: List<Int> = (1..MAX_REPS).toList()

    private val table: Array<DoubleArray> = arrayOf(
        doubleArrayOf(1.000, 0.955, 0.922, 0.892, 0.863, 0.837, 0.811, 0.786, 0.762, 0.739, 0.707, 0.680),
        doubleArrayOf(0.978, 0.939, 0.907, 0.878, 0.850, 0.824, 0.799, 0.774, 0.751, 0.723, 0.694, 0.667),
        doubleArrayOf(0.955, 0.922, 0.892, 0.863, 0.837, 0.811, 0.786, 0.762, 0.739, 0.707, 0.680, 0.653),
        doubleArrayOf(0.939, 0.907, 0.878, 0.850, 0.824, 0.799, 0.774, 0.751, 0.723, 0.694, 0.667, 0.640),
        doubleArrayOf(0.922, 0.892, 0.863, 0.837, 0.811, 0.786, 0.762, 0.739, 0.707, 0.680, 0.653, 0.626),
        doubleArrayOf(0.907, 0.878, 0.850, 0.824, 0.799, 0.774, 0.751, 0.723, 0.694, 0.667, 0.640, 0.613),
        doubleArrayOf(0.892, 0.863, 0.837, 0.811, 0.786, 0.762, 0.739, 0.707, 0.680, 0.653, 0.626, 0.599),
        doubleArrayOf(0.878, 0.850, 0.824, 0.799, 0.774, 0.751, 0.723, 0.694, 0.667, 0.640, 0.613, 0.586),
        doubleArrayOf(0.863, 0.837, 0.811, 0.786, 0.762, 0.739, 0.707, 0.680, 0.653, 0.626, 0.599, 0.574),
    )

    fun snapRpe(rpe: Double): Double = ((rpe * 2).roundToInt() / 2.0).coerceIn(6.0, 10.0)

    fun percentage(reps: Int, rpe: Double): Double? {
        if (reps !in 1..MAX_REPS) return null
        val row = rpeValues.indexOfFirst { abs(it - snapRpe(rpe)) < 1e-6 }
        return if (row >= 0) table[row][reps - 1] else null
    }

    /**
     * Estimated 1RM. Missing RPE is treated as RPE 10 (the workbook logs mostly all-out sets).
     * For bodyweight lifts pass [bodyweightKg]; the result is expressed as *added* load,
     * matching the workbook's `(BW + added) / % - BW` formula.
     */
    fun estimateOneRm(weightKg: Double, reps: Int, rpe: Double? = null, bodyweightKg: Double = 0.0): Double {
        if (reps <= 0) return 0.0
        val systemLoad = weightKg + bodyweightKg
        val pct = percentage(reps, rpe ?: 10.0)
        val oneRm = if (pct != null) systemLoad / pct else systemLoad * (1 + reps / 30.0) // Epley above 12 reps
        return oneRm - bodyweightKg
    }

    fun targetWeight(
        oneRmKg: Double,
        reps: Int,
        rpe: Double,
        bodyweightKg: Double = 0.0,
        incrementKg: Double = DEFAULT_INCREMENT_KG,
    ): Double? {
        val pct = percentage(reps, rpe) ?: return null
        return roundDown((oneRmKg + bodyweightKg) * pct - bodyweightKg, incrementKg)
    }

    /** Back-off load derived from today's TOP set rather than a stale max. */
    fun backOffFromTopSet(
        topWeightKg: Double,
        topReps: Int,
        topRpe: Double,
        backOffReps: Int,
        backOffRpe: Double,
        incrementKg: Double = DEFAULT_INCREMENT_KG,
    ): Double? = targetWeight(estimateOneRm(topWeightKg, topReps, topRpe), backOffReps, backOffRpe, 0.0, incrementKg)

    /** Inverse lookup: which RPE does this set correspond to given a known 1RM. */
    fun estimateRpe(weightKg: Double, reps: Int, oneRmKg: Double): Double? {
        if (oneRmKg <= 0 || reps !in 1..MAX_REPS) return null
        val ratio = weightKg / oneRmKg
        return rpeValues.minByOrNull { abs(percentage(reps, it)!! - ratio) }
    }

    fun roundDown(value: Double, incrementKg: Double): Double =
        if (incrementKg <= 0) value else floor(value / incrementKg + 1e-9) * incrementKg
}
