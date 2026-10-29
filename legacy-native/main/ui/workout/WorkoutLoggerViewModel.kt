package com.gymapp.ui.workout

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.gymapp.domain.engine.ProgressionEngine
import com.gymapp.domain.engine.RpeEngine
import com.gymapp.domain.engine.WeekPrescription
import com.gymapp.domain.model.ChecklistItem
import com.gymapp.domain.model.Exercise
import com.gymapp.domain.model.ExerciseCategory
import com.gymapp.domain.model.ProgramTemplate
import com.gymapp.domain.model.SessionType
import com.gymapp.domain.model.SetType
import com.gymapp.domain.model.TemplateDay
import com.gymapp.domain.model.TrainingBlock
import com.gymapp.domain.model.WorkoutSession
import com.gymapp.domain.model.WorkoutSet
import com.gymapp.domain.repository.BodyRepository
import com.gymapp.domain.repository.TrainingRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate

data class ExerciseLogUi(
    val exercise: Exercise,
    val target: String?,
    val block: TrainingBlock?,
    val prescription: WeekPrescription?,
    val setsByType: Map<SetType, List<WorkoutSet>>,
    /** Best e1RM from today's working sets. */
    val todayE1rm: Double?,
    /** Best e1RM from the most recent previous session — the baseline for suggestions. */
    val previousE1rm: Double?,
    val totalReps: Int,
    val tonnageKg: Double,
) {
    val referenceE1rm: Double? get() = todayE1rm ?: previousE1rm
}

data class WorkoutUiState(
    val type: SessionType,
    val isLoading: Boolean = true,
    val session: WorkoutSession? = null,
    val dayName: String? = null,
    val history: List<WorkoutSession> = emptyList(),
    val templates: List<ProgramTemplate> = emptyList(),
    val library: List<Exercise> = emptyList(),
    val blocks: List<TrainingBlock> = emptyList(),
    val logs: List<ExerciseLogUi> = emptyList(),
    val checklist: List<ChecklistItem> = emptyList(),
    val bodyweightKg: Double? = null,
) {
    val tonnageKg: Double get() = logs.sumOf { it.tonnageKg }
    val totalReps: Int get() = logs.sumOf { it.totalReps }
    val workingSets: Int get() = logs.sumOf { log -> log.setsByType.filterKeys { it != SetType.WARM_UP }.values.sumOf { it.size } }
}

data class SetDraft(
    val id: Long = 0,
    val exerciseId: Long,
    val setType: SetType,
    val reps: Int,
    val weightKg: Double,
    val rpe: Double?,
)

private data class SessionData(
    val session: WorkoutSession?,
    val sets: List<WorkoutSet>,
    val checklist: List<ChecklistItem>,
)

private data class Library(
    val templates: List<ProgramTemplate>,
    val exercises: List<Exercise>,
    val blocks: List<TrainingBlock>,
    val history: List<WorkoutSession>,
)

@OptIn(ExperimentalCoroutinesApi::class)
class WorkoutLoggerViewModel(
    private val type: SessionType,
    private val training: TrainingRepository,
    body: BodyRepository,
) : ViewModel() {

    /** Categories whose templates belong to this logger. */
    private val coreCategories = when (type) {
        SessionType.STRENGTH -> setOf(ExerciseCategory.STRENGTH, ExerciseCategory.ACCESSORY)
        SessionType.CALISTHENICS -> setOf(ExerciseCategory.CALISTHENICS)
    }

    /** Strength days often include push-ups / pull-ups, so they may log any movement. */
    private val libraryCategories = when (type) {
        SessionType.STRENGTH -> coreCategories + ExerciseCategory.CALISTHENICS
        SessionType.CALISTHENICS -> coreCategories
    }

    private val sessionId = MutableStateFlow<Long?>(null)
    private val extraExerciseIds = MutableStateFlow<List<Long>>(emptyList())
    private val loaded = MutableStateFlow(false)

    private val sessionData = sessionId.flatMapLatest { id ->
        if (id == null) {
            flowOf(SessionData(null, emptyList(), emptyList()))
        } else {
            combine(
                training.observeSession(id),
                training.observeSetsForSession(id),
                training.observeChecklist(id),
            ) { s, sets, checklist -> SessionData(s, sets, checklist) }
        }
    }

    private val library = combine(
        training.observeTemplates(),
        training.observeExercises(libraryCategories),
        training.observeActiveBlocks(),
        training.observeSessions(type),
    ) { templates, exercises, blocks, history ->
        val ids = exercises.filter { it.category in coreCategories }.map { it.id }.toSet()
        // A template belongs to this logger when the majority of its movements do.
        val relevant = templates.filter { t ->
            val all = t.days.flatMap { it.exercises }
            all.count { it.exerciseId in ids } * 2 > all.size
        }
        Library(relevant, exercises, blocks, history)
    }

    private val historicalSets = training.observeSetsByType(type)
    private val bodyweight = body.observeLatestBodyweight()

    val state: StateFlow<WorkoutUiState> = combine(
        combine(sessionData, library) { a, b -> a to b },
        combine(historicalSets, bodyweight) { a, b -> a to b },
        extraExerciseIds,
        loaded,
    ) { (data, lib), (allSets, bw), extras, isLoaded ->
        buildState(data, lib, allSets, bw, extras, isLoaded)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), WorkoutUiState(type))

    init {
        viewModelScope.launch {
            sessionId.value = training.findSession(LocalDate.now(), type)?.id
            loaded.value = true
        }
    }

    private fun buildState(
        data: SessionData,
        lib: Library,
        allSets: List<WorkoutSet>,
        bodyweightKg: Double?,
        extras: List<Long>,
        isLoaded: Boolean,
    ): WorkoutUiState {
        val session = data.session
        val day: TemplateDay? = session?.templateDayId?.let { dayId ->
            lib.templates.asSequence().flatMap { it.days }.firstOrNull { it.id == dayId }
        }
        val exercisesById = lib.exercises.associateBy { it.id }

        val orderedIds = LinkedHashSet<Long>().apply {
            day?.exercises?.forEach { add(it.exerciseId) }
            addAll(extras)
            data.sets.forEach { add(it.exerciseId) }
        }

        val logs = if (session == null) emptyList() else orderedIds.mapNotNull { id ->
            val exercise = exercisesById[id] ?: return@mapNotNull null
            val bw = if (exercise.isBodyweight) bodyweightKg ?: 0.0 else 0.0
            val sets = data.sets.filter { it.exerciseId == id }
            val working = sets.filter { it.setType != SetType.WARM_UP }
            val prior = allSets.filter { it.exerciseId == id && it.date < session.date && it.setType != SetType.WARM_UP }
            val lastDate = prior.maxOfOrNull { it.date }
            val previous = prior.filter { it.date == lastDate }
            val block = lib.blocks.firstOrNull { it.exerciseId == id }
            ExerciseLogUi(
                exercise = exercise,
                target = day?.exercises?.firstOrNull { it.exerciseId == id }?.let { "${it.targetSets} · ${it.repScheme}" },
                block = block,
                prescription = block?.let { ProgressionEngine.prescription(it, ProgressionEngine.currentWeek(it, session.date)) },
                setsByType = SetType.entries.associateWith { t -> sets.filter { it.setType == t }.sortedBy { it.setIndex } },
                todayE1rm = working.maxOfOrNull { RpeEngine.estimateOneRm(it.weightKg, it.reps, it.rpe, bw) },
                previousE1rm = previous.maxOfOrNull { RpeEngine.estimateOneRm(it.weightKg, it.reps, it.rpe, bw) },
                totalReps = working.sumOf { it.reps },
                tonnageKg = working.sumOf { it.reps * (it.weightKg + bw) },
            )
        }

        return WorkoutUiState(
            type = type,
            isLoading = !isLoaded,
            session = session,
            dayName = day?.name,
            history = lib.history,
            templates = lib.templates,
            library = lib.exercises,
            blocks = lib.blocks.filter { it.exerciseId in exercisesById },
            logs = logs,
            checklist = data.checklist,
            bodyweightKg = bodyweightKg,
        )
    }

    fun startSession(templateDay: TemplateDay?) = viewModelScope.launch {
        val week = state.value.blocks.maxOfOrNull { ProgressionEngine.currentWeek(it) }
        extraExerciseIds.value = emptyList()
        sessionId.value = training.createSession(LocalDate.now(), type, templateDay?.id, week)
    }

    fun openSession(id: Long) {
        extraExerciseIds.value = emptyList()
        sessionId.value = id
    }

    fun closeSession() {
        sessionId.value = null
    }

    fun deleteSession() = viewModelScope.launch {
        val id = sessionId.value ?: return@launch
        sessionId.value = null
        training.deleteSession(id)
    }

    fun addExercise(exerciseId: Long) = extraExerciseIds.update { if (exerciseId in it) it else it + exerciseId }

    fun saveSet(draft: SetDraft) = viewModelScope.launch {
        val session = state.value.session ?: return@launch
        val existing = state.value.logs
            .firstOrNull { it.exercise.id == draft.exerciseId }
            ?.setsByType?.get(draft.setType).orEmpty()
        val index = existing.firstOrNull { it.id == draft.id }?.setIndex
            ?: ((existing.maxOfOrNull { it.setIndex } ?: 0) + 1)
        training.upsertSet(
            WorkoutSet(
                id = draft.id,
                sessionId = session.id,
                exerciseId = draft.exerciseId,
                date = session.date,
                setType = draft.setType,
                setIndex = index,
                reps = draft.reps,
                weightKg = draft.weightKg,
                rpe = draft.rpe,
            ),
        )
    }

    fun deleteSet(setId: Long) = viewModelScope.launch { training.deleteSet(setId) }

    fun toggleChecklist(itemId: Long, done: Boolean) = viewModelScope.launch {
        val id = sessionId.value ?: return@launch
        training.setChecklistItem(id, itemId, done)
    }

    fun startBlock(exerciseId: Long, startReps: Int, repStep: Int, startWeightKg: Double, incrementKg: Double, weeks: Int) =
        viewModelScope.launch {
            training.startBlock(
                TrainingBlock(
                    exerciseId = exerciseId,
                    startDate = state.value.session?.date ?: LocalDate.now(),
                    startReps = startReps,
                    repStep = repStep,
                    startWeightKg = startWeightKg,
                    weeklyIncrementKg = incrementKg,
                    totalWeeks = weeks,
                    isActive = true,
                ),
            )
        }
}
