package com.gymapp.domain.engine

import com.gymapp.domain.model.TrainingBlock
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate

class RpeEngineTest {

    @Test
    fun `matrix matches workbook FLOOR(260 x pct, 0_25)`() {
        // Values copied from the RPE sheet with A1 = 260.
        assertEquals(260.0, RpeEngine.targetWeight(260.0, 1, 10.0, incrementKg = 0.25)!!, 0.0)
        assertEquals(224.25, RpeEngine.targetWeight(260.0, 5, 10.0, incrementKg = 0.25)!!, 0.0)
        assertEquals(201.0, RpeEngine.targetWeight(260.0, 6, 7.5, incrementKg = 0.25)!!, 0.0)
        assertEquals(149.0, RpeEngine.targetWeight(260.0, 12, 6.0, incrementKg = 0.25)!!, 0.0)
    }

    @Test
    fun `e1RM inverts the matrix`() {
        val e1rm = RpeEngine.estimateOneRm(200.0, 3, 8.0)
        assertEquals(200.0 / 0.863, e1rm, 1e-9)
    }

    @Test
    fun `bodyweight lifts use system load`() {
        // Workbook: (81.5 + 30) / 0.825 * 0.85 - 81.5 style maths.
        val e1rm = RpeEngine.estimateOneRm(30.0, 1, 10.0, bodyweightKg = 81.5)
        assertEquals(30.0, e1rm, 1e-9)
        val target = RpeEngine.targetWeight(30.0, 5, 10.0, bodyweightKg = 81.5, incrementKg = 0.0)!!
        assertEquals(111.5 * 0.863 - 81.5, target, 1e-9)
    }

    @Test
    fun `out of table reps fall back to Epley or null`() {
        assertEquals(100.0 * (1 + 15 / 30.0), RpeEngine.estimateOneRm(100.0, 15), 1e-9)
        assertNull(RpeEngine.targetWeight(200.0, 15, 8.0))
    }

    @Test
    fun `rep drop block mirrors GYM v2`() {
        val block = TrainingBlock(
            exerciseId = 1, startDate = LocalDate.of(2025, 7, 28), startReps = 10, repStep = 1,
            startWeightKg = 90.0, weeklyIncrementKg = 5.0, totalWeeks = 10, isActive = true,
        )
        val schedule = ProgressionEngine.schedule(block)
        assertEquals(10, schedule.size)
        assertEquals(WeekPrescription(1, 10, 90.0), schedule.first())
        assertEquals(WeekPrescription(10, 1, 135.0), schedule.last())
        assertEquals(10, ProgressionEngine.naturalLength(10, 1))
    }
}
