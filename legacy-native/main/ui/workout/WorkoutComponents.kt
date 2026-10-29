package com.gymapp.ui.workout

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.gymapp.domain.engine.ProgressionEngine
import com.gymapp.domain.engine.RpeEngine
import com.gymapp.domain.model.ChecklistItem
import com.gymapp.domain.model.Exercise
import com.gymapp.domain.model.SetType
import com.gymapp.domain.model.TrainingBlock
import com.gymapp.domain.model.WorkoutSet
import com.gymapp.ui.common.NumberField
import com.gymapp.ui.common.NumberStepper
import com.gymapp.ui.common.RpeSelector
import com.gymapp.ui.common.fmt
import com.gymapp.ui.common.toDecimalOrNull
import com.gymapp.ui.theme.NumberStyle
import com.gymapp.ui.theme.color
import java.time.LocalDate

// ---------- Checklist ----------

@Composable
fun ChecklistCard(items: List<ChecklistItem>, onToggle: (Long, Boolean) -> Unit) {
    var expanded by remember { mutableStateOf(items.none { it.isDone }) }
    val done = items.count { it.isDone }
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)) {
        Row(
            Modifier.fillMaxWidth().clickable { expanded = !expanded }.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Pre-workout & pre-hab", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            Text(
                "$done/${items.size}",
                style = NumberStyle,
                color = if (done == items.size) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Icon(if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore, null)
        }
        if (expanded) {
            items.groupBy { it.category }.forEach { (category, group) ->
                Text(
                    category.label.uppercase(),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.tertiary,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
                group.forEach { item ->
                    Row(
                        Modifier.fillMaxWidth().clickable { onToggle(item.id, !item.isDone) }.padding(horizontal = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(checked = item.isDone, onCheckedChange = { onToggle(item.id, it) })
                        Text(item.name, modifier = Modifier.weight(1f))
                        Text(item.prescription, style = NumberStyle, modifier = Modifier.padding(end = 16.dp))
                    }
                }
            }
            Spacer(Modifier.padding(4.dp))
        }
    }
}

// ---------- Exercise card ----------

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ExerciseLogCard(
    log: ExerciseLogUi,
    isCalisthenics: Boolean,
    onAddSet: (SetType) -> Unit,
    onEditSet: (WorkoutSet) -> Unit,
    onStartBlock: () -> Unit,
) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(log.exercise.name, style = MaterialTheme.typography.titleLarge)
                    log.target?.let {
                        Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (!isCalisthenics) {
                    Column(horizontalAlignment = Alignment.End) {
                        Text("e1RM ${log.todayE1rm?.fmt() ?: "–"}", style = NumberStyle, color = MaterialTheme.colorScheme.primary)
                        Text(
                            "prev ${log.previousE1rm?.fmt() ?: "–"}",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            if (!isCalisthenics && log.exercise.isPrimaryLift) {
                BlockStrip(log.block, log, onStartBlock)
            }

            val types = if (isCalisthenics) listOf(SetType.TOP) else SetType.entries
            types.forEach { type ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        if (isCalisthenics) "Sets" else type.label,
                        style = MaterialTheme.typography.labelLarge,
                        color = type.color(),
                        modifier = Modifier.width(76.dp),
                    )
                    FlowRow(
                        Modifier.weight(1f),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        log.setsByType[type].orEmpty().forEach { set ->
                            SetChip(set, isCalisthenics, onClick = { onEditSet(set) })
                        }
                        Surface(
                            shape = MaterialTheme.shapes.small,
                            color = MaterialTheme.colorScheme.surfaceContainerHighest,
                            modifier = Modifier.clickable { onAddSet(type) },
                        ) {
                            Icon(Icons.Default.Add, "Add ${type.label} set", Modifier.padding(10.dp))
                        }
                    }
                }
            }

            if (isCalisthenics) {
                Text("SUM  ${log.totalReps} reps", style = NumberStyle, color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
private fun SetChip(set: WorkoutSet, isCalisthenics: Boolean, onClick: () -> Unit) {
    val text = if (isCalisthenics) {
        "${set.reps}" + if (set.weightKg > 0) " +${set.weightKg.fmt()}kg" else ""
    } else {
        "${set.reps}×${set.weightKg.fmt()}" + (set.rpe?.let { " @${it.fmt()}" } ?: "")
    }
    Surface(
        shape = MaterialTheme.shapes.small,
        border = BorderStroke(1.5.dp, set.setType.color()),
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        modifier = Modifier.clickable(onClick = onClick),
    ) {
        Text(text, style = NumberStyle, modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp))
    }
}

@Composable
private fun BlockStrip(block: TrainingBlock?, log: ExerciseLogUi, onStartBlock: () -> Unit) {
    val p = log.prescription
    if (block == null || p == null) {
        TextButton(onClick = onStartBlock) { Text("Start progression block") }
        return
    }
    Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.primaryContainer) {
        Column(Modifier.fillMaxWidth().padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "WEEK ${p.week}/${block.totalWeeks}",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.weight(1f),
                )
                Text("${p.reps} × ${p.weightKg.fmt()} kg", style = NumberStyle, color = MaterialTheme.colorScheme.primary)
            }
            Text(
                ProgressionEngine.schedule(block).joinToString(" → ") { "${it.reps}×${it.weightKg.fmt()}" },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
            )
            TextButton(onClick = onStartBlock, modifier = Modifier.align(Alignment.End)) { Text("New block") }
        }
    }
}

// ---------- Set entry ----------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SetEntrySheet(
    log: ExerciseLogUi,
    initialType: SetType,
    existing: WorkoutSet?,
    isCalisthenics: Boolean,
    bodyweightKg: Double?,
    onSave: (SetDraft) -> Unit,
    onDelete: (Long) -> Unit,
    onDismiss: () -> Unit,
) {
    val exercise = log.exercise
    val bw = if (exercise.isBodyweight) bodyweightKg ?: 0.0 else 0.0

    fun defaultsFor(type: SetType): Pair<Int, Double> {
        log.setsByType[type]?.lastOrNull()?.let { return it.reps to it.weightKg }
        val p = log.prescription
        when (type) {
            SetType.TOP -> if (p != null) return p.reps to p.weightKg
            SetType.BACK_OFF -> log.setsByType[SetType.TOP]?.lastOrNull()?.let { return it.reps to it.weightKg }
            SetType.WARM_UP -> if (p != null) return p.reps to RpeEngine.roundDown(p.weightKg * 0.6, exercise.incrementKg)
        }
        log.setsByType.values.flatten().maxByOrNull { it.id }?.let { return it.reps to it.weightKg }
        return if (isCalisthenics) 10 to 0.0 else 5 to 20.0
    }

    val initial = existing?.let { it.reps to it.weightKg } ?: defaultsFor(initialType)
    var setType by remember { mutableStateOf(existing?.setType ?: initialType) }
    var repsText by remember { mutableStateOf(initial.first.toString()) }
    var weightText by remember { mutableStateOf(initial.second.fmt()) }
    var rpe by remember { mutableStateOf(existing?.rpe) }

    val reps = repsText.toIntOrNull()
    val weight = weightText.toDecimalOrNull()
    val valid = reps != null && reps > 0 && weight != null && weight >= 0

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            Modifier
                .padding(horizontal = 20.dp)
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(exercise.name, style = MaterialTheme.typography.headlineMedium)

            if (!isCalisthenics) {
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    SetType.entries.forEachIndexed { i, type ->
                        SegmentedButton(
                            selected = setType == type,
                            onClick = {
                                setType = type
                                if (existing == null) {
                                    val (r, w) = defaultsFor(type)
                                    repsText = r.toString()
                                    weightText = w.fmt()
                                }
                            },
                            shape = SegmentedButtonDefaults.itemShape(i, SetType.entries.size),
                        ) { Text(type.label) }
                    }
                }
            }

            NumberStepper("Reps", repsText, { repsText = it }, step = 1.0, decimal = false, min = 1.0)
            NumberStepper(
                if (exercise.isBodyweight) "Added kg" else "Weight kg",
                weightText,
                { weightText = it },
                step = exercise.incrementKg,
            )

            Text("RPE", style = MaterialTheme.typography.labelLarge)
            RpeSelector(selected = rpe, onSelect = { rpe = it }, allowNone = true)

            if (!isCalisthenics && valid) {
                RpeInsight(log, reps!!, weight!!, rpe, bw, onUseWeight = { weightText = it.fmt() })
            }

            Row(Modifier.fillMaxWidth().padding(bottom = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (existing != null) {
                    TextButton(onClick = { onDelete(existing.id) }) {
                        Text("Delete", color = MaterialTheme.colorScheme.error)
                    }
                }
                Spacer(Modifier.weight(1f))
                Button(
                    enabled = valid,
                    onClick = {
                        onSave(SetDraft(existing?.id ?: 0, exercise.id, setType, reps!!, weight!!, rpe))
                    },
                ) { Text(if (existing == null) "Log set" else "Update") }
            }
        }
    }
}

@Composable
private fun RpeInsight(
    log: ExerciseLogUi,
    reps: Int,
    weight: Double,
    rpe: Double?,
    bodyweightKg: Double,
    onUseWeight: (Double) -> Unit,
) {
    val e1rm = RpeEngine.estimateOneRm(weight, reps, rpe, bodyweightKg)
    val targetRpe = rpe ?: 8.0
    val suggestion = log.referenceE1rm?.let {
        RpeEngine.targetWeight(it, reps, targetRpe, bodyweightKg, log.exercise.incrementKg)
    }
    Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceContainerHigh) {
        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row {
                Text("This set → e1RM", modifier = Modifier.weight(1f))
                Text("${e1rm.fmt()} kg", style = NumberStyle, color = MaterialTheme.colorScheme.primary)
            }
            if (suggestion != null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Target $reps @ RPE ${targetRpe.fmt()}",
                        modifier = Modifier.weight(1f),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text("${suggestion.fmt()} kg", style = NumberStyle, color = MaterialTheme.colorScheme.secondary)
                    TextButton(onClick = { onUseWeight(suggestion) }) { Text("Use") }
                }
                Text(
                    "Based on ${if (log.todayE1rm != null) "today's best" else "last session's"} e1RM ${log.referenceE1rm!!.fmt()} kg",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (log.exercise.isBodyweight && bodyweightKg == 0.0) {
                Text(
                    "Log bodyweight under Progress for accurate bodyweight-lift e1RM.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

// ---------- Dialogs ----------

@Composable
fun StartBlockDialog(
    log: ExerciseLogUi,
    bodyweightKg: Double?,
    onConfirm: (startReps: Int, repStep: Int, startWeight: Double, increment: Double, weeks: Int) -> Unit,
    onDismiss: () -> Unit,
) {
    val bw = if (log.exercise.isBodyweight) bodyweightKg ?: 0.0 else 0.0
    var startReps by remember { mutableStateOf("10") }
    var repStep by remember { mutableStateOf("1") }
    var increment by remember { mutableStateOf("5") }
    var startWeight by remember {
        mutableStateOf(
            log.referenceE1rm
                ?.let { RpeEngine.targetWeight(it, 10, 7.0, bw, log.exercise.incrementKg) }
                ?.fmt() ?: "",
        )
    }

    val r = startReps.toIntOrNull()
    val s = repStep.toIntOrNull()
    val w = startWeight.toDecimalOrNull()
    val inc = increment.toDecimalOrNull()
    val weeks = if (r != null && s != null && r > 0 && s >= 0) ProgressionEngine.naturalLength(r, s) else null
    val preview = if (r != null && s != null && w != null && inc != null && weeks != null) {
        ProgressionEngine.schedule(
            TrainingBlock(
                exerciseId = log.exercise.id,
                startDate = LocalDate.now(),
                startReps = r,
                repStep = s,
                startWeightKg = w,
                weeklyIncrementKg = inc,
                totalWeeks = weeks,
                isActive = true,
            ),
        ).joinToString(" → ") { "${it.reps}×${it.weightKg.fmt()}" }
    } else {
        null
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("${log.exercise.name} block") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    NumberField("Start reps", startReps, { startReps = it }, Modifier.weight(1f), decimal = false)
                    NumberField("Rep drop/wk", repStep, { repStep = it }, Modifier.weight(1f), decimal = false)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    NumberField("Start kg", startWeight, { startWeight = it }, Modifier.weight(1f))
                    NumberField("+kg/wk", increment, { increment = it }, Modifier.weight(1f))
                }
                if (preview != null) {
                    Text("$weeks weeks", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                    Text(preview, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        },
        confirmButton = {
            Button(enabled = preview != null, onClick = { onConfirm(r!!, s!!, w!!, inc!!, weeks!!) }) { Text("Start") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
fun ExercisePickerDialog(exercises: List<Exercise>, onPick: (Exercise) -> Unit, onDismiss: () -> Unit) {
    var query by remember { mutableStateOf("") }
    val filtered = exercises.filter { it.name.contains(query.trim(), ignoreCase = true) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add exercise") },
        text = {
            Column {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = { Text("Search") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                LazyColumn(Modifier.heightIn(max = 380.dp)) {
                    items(filtered, key = { it.id }) { ex ->
                        Text(
                            ex.name,
                            style = MaterialTheme.typography.bodyLarge,
                            modifier = Modifier.fillMaxWidth().clickable { onPick(ex) }.padding(vertical = 14.dp),
                        )
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
}
