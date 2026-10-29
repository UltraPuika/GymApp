package com.gymapp.domain.engine

import com.gymapp.domain.model.TrainingBlock
import java.time.LocalDate
import java.time.temporal.ChronoUnit

data class WeekPrescription(val week: Int, val reps: Int, val weightKg: Double)

/**
 * Linear rep-drop block from `GYM v2`: every week reps fall by [TrainingBlock.repStep]
 * (10, 9, 8 … 1) while the load climbs by [TrainingBlock.weeklyIncrementKg].
 */
object ProgressionEngine {

    fun prescription(block: TrainingBlock, week: Int): WeekPrescription {
        val w = week.coerceIn(1, block.totalWeeks)
        return WeekPrescription(
            week = w,
            reps = (block.startReps - (w - 1) * block.repStep).coerceAtLeast(1),
            weightKg = block.startWeightKg + (w - 1) * block.weeklyIncrementKg,
        )
    }

    fun schedule(block: TrainingBlock): List<WeekPrescription> =
        (1..block.totalWeeks).map { prescription(block, it) }

    fun currentWeek(block: TrainingBlock, today: LocalDate = LocalDate.now()): Int =
        (ChronoUnit.WEEKS.between(block.startDate, today).toInt() + 1).coerceIn(1, block.totalWeeks)

    /** Weeks until reps would hit 1 — the natural block length. */
    fun naturalLength(startReps: Int, repStep: Int): Int =
        if (repStep <= 0) 8 else ((startReps - 1) / repStep) + 1
}
