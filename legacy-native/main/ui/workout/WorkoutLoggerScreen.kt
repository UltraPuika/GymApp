package com.gymapp.ui.workout

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Button
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.gymapp.domain.model.SessionType
import com.gymapp.domain.model.SetType
import com.gymapp.domain.model.TemplateDay
import com.gymapp.domain.model.WorkoutSet
import com.gymapp.ui.common.StatBlock
import com.gymapp.ui.common.fmt
import com.gymapp.ui.common.gymViewModel
import com.gymapp.ui.common.longDate
import java.time.LocalDate

private data class EditorRequest(val exerciseId: Long, val setType: SetType, val existing: WorkoutSet?)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkoutLoggerScreen(type: SessionType) {
    val vm = gymViewModel(key = "logger-${type.name}") {
        WorkoutLoggerViewModel(type, it.trainingRepository, it.bodyRepository)
    }
    val state by vm.state.collectAsStateWithLifecycle()

    var editor by remember { mutableStateOf<EditorRequest?>(null) }
    var blockFor by remember { mutableStateOf<ExerciseLogUi?>(null) }
    var showPicker by remember { mutableStateOf(false) }
    var historyMenu by remember { mutableStateOf(false) }
    var overflowMenu by remember { mutableStateOf(false) }

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(if (type == SessionType.STRENGTH) "Strength Log" else "Calisthenics")
                        val session = state.session
                        if (session != null) {
                            Text(
                                listOfNotNull(session.date.format(longDate), state.dayName).joinToString(" · "),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                },
                actions = {
                    Box {
                        IconButton(onClick = { historyMenu = true }) { Icon(Icons.Default.History, "Session history") }
                        DropdownMenu(expanded = historyMenu, onDismissRequest = { historyMenu = false }) {
                            if (state.history.isEmpty()) DropdownMenuItem(text = { Text("No sessions yet") }, onClick = { historyMenu = false })
                            state.history.take(30).forEach { s ->
                                DropdownMenuItem(
                                    text = { Text(s.date.format(longDate)) },
                                    onClick = { historyMenu = false; vm.openSession(s.id) },
                                )
                            }
                        }
                    }
                    if (state.session != null) {
                        Box {
                            IconButton(onClick = { overflowMenu = true }) { Icon(Icons.Default.MoreVert, "More") }
                            DropdownMenu(expanded = overflowMenu, onDismissRequest = { overflowMenu = false }) {
                                DropdownMenuItem(text = { Text("Finish / close") }, onClick = { overflowMenu = false; vm.closeSession() })
                                DropdownMenuItem(
                                    text = { Text("Delete session", color = MaterialTheme.colorScheme.error) },
                                    onClick = { overflowMenu = false; vm.deleteSession() },
                                )
                            }
                        }
                    }
                },
            )
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when {
                state.isLoading -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                state.session == null -> StartSessionView(state, onStart = vm::startSession, onOpen = vm::openSession)
                else -> SessionContent(
                    state = state,
                    onAddSet = { log, setType -> editor = EditorRequest(log.exercise.id, setType, null) },
                    onEditSet = { set -> editor = EditorRequest(set.exerciseId, set.setType, set) },
                    onStartBlock = { blockFor = it },
                    onToggleChecklist = vm::toggleChecklist,
                    onAddExercise = { showPicker = true },
                )
            }
        }
    }

    editor?.let { req ->
        // The exercise can vanish if its session is deleted while the sheet is open.
        val log = state.logs.firstOrNull { it.exercise.id == req.exerciseId } ?: return@let
        SetEntrySheet(
            log = log,
            initialType = req.setType,
            existing = req.existing,
            isCalisthenics = type == SessionType.CALISTHENICS,
            bodyweightKg = state.bodyweightKg,
            onSave = { vm.saveSet(it); editor = null },
            onDelete = { vm.deleteSet(it); editor = null },
            onDismiss = { editor = null },
        )
    }

    blockFor?.let { log ->
        StartBlockDialog(
            log = log,
            bodyweightKg = state.bodyweightKg,
            onConfirm = { reps, step, weight, inc, weeks ->
                vm.startBlock(log.exercise.id, reps, step, weight, inc, weeks)
                blockFor = null
            },
            onDismiss = { blockFor = null },
        )
    }

    if (showPicker) {
        ExercisePickerDialog(
            exercises = state.library.filter { ex -> state.logs.none { it.exercise.id == ex.id } },
            onPick = { vm.addExercise(it.id); showPicker = false },
            onDismiss = { showPicker = false },
        )
    }
}

@Composable
private fun StartSessionView(
    state: WorkoutUiState,
    onStart: (TemplateDay?) -> Unit,
    onOpen: (Long) -> Unit,
) {
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(LocalDate.now().format(longDate), style = MaterialTheme.typography.headlineMedium)
            Text("Pick a programme day or start a free session.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        item {
            Button(onClick = { onStart(null) }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Default.Add, null)
                Text("  Free session")
            }
        }
        items(state.templates, key = { it.id }) { template ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(template.name, style = MaterialTheme.typography.titleMedium)
                    template.days.forEach { day ->
                        OutlinedButton(onClick = { onStart(day) }, modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.fillMaxWidth()) {
                                Text(day.name, style = MaterialTheme.typography.labelLarge)
                                Text(
                                    day.exercises.joinToString(" · ") { it.exerciseName },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 2,
                                )
                            }
                        }
                    }
                }
            }
        }
        if (state.history.isNotEmpty()) {
            item { Text("Recent", style = MaterialTheme.typography.titleMedium) }
            items(state.history.take(5), key = { "h${it.id}" }) { s ->
                OutlinedButton(onClick = { onOpen(s.id) }, modifier = Modifier.fillMaxWidth()) {
                    Text(s.date.format(longDate), Modifier.fillMaxWidth())
                }
            }
        }
    }
}

@Composable
private fun SessionContent(
    state: WorkoutUiState,
    onAddSet: (ExerciseLogUi, SetType) -> Unit,
    onEditSet: (WorkoutSet) -> Unit,
    onStartBlock: (ExerciseLogUi) -> Unit,
    onToggleChecklist: (Long, Boolean) -> Unit,
    onAddExercise: () -> Unit,
) {
    val isCali = state.type == SessionType.CALISTHENICS
    LazyColumn(
        contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 96.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)) {
                Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    if (isCali) {
                        StatBlock("Total reps (SUM)", state.totalReps.toString())
                    } else {
                        StatBlock("Tonnage", "${(state.tonnageKg / 1000).fmt()} t")
                    }
                    StatBlock("Working sets", state.workingSets.toString())
                    StatBlock("Block week", state.session?.blockWeek?.toString() ?: "–")
                }
            }
        }
        if (state.checklist.isNotEmpty()) {
            item { ChecklistCard(items = state.checklist, onToggle = onToggleChecklist) }
        }
        items(state.logs, key = { it.exercise.id }) { log ->
            ExerciseLogCard(
                log = log,
                isCalisthenics = isCali,
                onAddSet = { onAddSet(log, it) },
                onEditSet = onEditSet,
                onStartBlock = { onStartBlock(log) },
            )
        }
        item {
            HorizontalDivider(Modifier.padding(vertical = 4.dp))
            OutlinedButton(onClick = onAddExercise, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Default.Add, null)
                Text("  Add exercise")
            }
        }
    }
}
