package com.gymapp.data.local.entity

import androidx.room.Embedded
import androidx.room.Relation
import com.gymapp.domain.model.ChecklistCategory

data class TemplateExerciseWithExercise(
    @Embedded val entry: TemplateExerciseEntity,
    @Relation(parentColumn = "exerciseId", entityColumn = "id")
    val exercise: ExerciseEntity,
)

data class TemplateDayWithExercises(
    @Embedded val day: TemplateDayEntity,
    @Relation(entity = TemplateExerciseEntity::class, parentColumn = "id", entityColumn = "dayId")
    val exercises: List<TemplateExerciseWithExercise>,
)

data class TemplateWithDays(
    @Embedded val template: ProgramTemplateEntity,
    @Relation(entity = TemplateDayEntity::class, parentColumn = "id", entityColumn = "templateId")
    val days: List<TemplateDayWithExercises>,
)

data class ChecklistRow(
    val id: Long,
    val name: String,
    val prescription: String,
    val category: ChecklistCategory,
    val isDone: Boolean,
)
