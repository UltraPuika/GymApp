package com.gymapp.ui.rpe

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.gymapp.domain.engine.RpeEngine
import com.gymapp.ui.common.NumberField
import com.gymapp.ui.common.NumberStepper
import com.gymapp.ui.common.RpeSelector
import com.gymapp.ui.common.fmt
import com.gymapp.ui.common.gymViewModel
import com.gymapp.ui.theme.NumberStyle

private val incrementOptions = listOf(0.25, 1.25, 2.5, 5.0)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RpeCalculatorScreen() {
    val vm = gymViewModel { RpeCalculatorViewModel(it.trainingRepository, it.bodyRepository) }
    val state by vm.state.collectAsStateWithLifecycle()
    val input = state.inputs

    Scaffold(contentWindowInsets = WindowInsets(0, 0, 0, 0), topBar = { TopAppBar(title = { Text("RPE & 1RM") }) }) { padding ->
        Column(
            Modifier
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SectionCard("Base max") {
                NumberStepper("1RM kg", input.baseMaxText, vm::setBaseMax, step = input.incrementKg)
                if (state.lifts.isNotEmpty()) {
                    Text("From your latest sessions", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        state.lifts.forEach { lift ->
                            FilterChip(
                                selected = input.selectedLiftId == lift.exercise.id,
                                onClick = { vm.selectLift(lift) },
                                label = { Text("${lift.exercise.name} ${lift.e1rmKg.fmt()}") },
                            )
                        }
                    }
                }
                if (state.selectedIsBodyweight) {
                    Text(
                        "Bodyweight lift: maths uses BW ${state.bodyweightKg.fmt()} kg + added load.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.tertiary,
                    )
                }
                Text("Round down to", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    incrementOptions.forEach { inc ->
                        FilterChip(
                            selected = input.incrementKg == inc,
                            onClick = { vm.setIncrement(inc) },
                            label = { Text("${inc.fmt()} kg") },
                        )
                    }
                }
            }

            SectionCard("1RM estimator") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    NumberField("Weight kg", input.estWeightText, vm::setEstWeight, Modifier.weight(1f))
                    NumberField("Reps", input.estRepsText, vm::setEstReps, Modifier.weight(1f), decimal = false)
                }
                RpeSelector(selected = input.estRpe, onSelect = { it?.let(vm::setEstRpe) })
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Estimated 1RM", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            state.estimatedOneRm?.let { "${it.fmt()} kg" } ?: "–",
                            style = MaterialTheme.typography.displaySmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    TextButton(enabled = state.estimatedOneRm != null, onClick = vm::useEstimateAsBase) {
                        Text("Use as base")
                    }
                }
            }

            SectionCard("Target loads") {
                NumberStepper(
                    "Target reps",
                    input.targetReps.toString(),
                    { text -> text.toIntOrNull()?.let { vm.setTarget(it, input.targetRpe) } },
                    step = 1.0,
                    decimal = false,
                    min = 1.0,
                )
                RpeSelector(selected = input.targetRpe, onSelect = { it?.let { rpe -> vm.setTarget(input.targetReps, rpe) } })
                state.targets.forEach { row ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(row.label, style = MaterialTheme.typography.titleMedium)
                            Text(
                                "${row.reps} reps @ RPE ${row.rpe.fmt()} · ${row.percent?.let { (it * 100).fmt() + "%" } ?: "–"}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text(
                            row.weightKg?.let { "${it.fmt()} kg" } ?: "–",
                            style = NumberStyle.copy(fontSize = 24.sp),
                            color = if (row.label.startsWith("TOP")) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary,
                        )
                    }
                }
            }

            SectionCard(
                title = "RPE matrix",
                action = {
                    TextButton(onClick = vm::togglePercent) { Text(if (input.showPercent) "Show kg" else "Show %") }
                },
            ) {
                RpeMatrix(state, onCellClick = vm::setTarget)
                Text(
                    "Tap a cell to load it into Target loads.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun SectionCard(
    title: String,
    action: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title.uppercase(), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.weight(1f))
                action?.invoke()
            }
            content()
        }
    }
}

@Composable
private fun RpeMatrix(state: RpeUiState, onCellClick: (Int, Double) -> Unit) {
    val input = state.inputs
    val cellW = 64.dp
    val cellH = 40.dp
    Row(Modifier.horizontalScroll(rememberScrollState())) {
        Column {
            HeaderCell("RPE\\Reps", cellW, cellH)
            RpeEngine.rpeValues.forEach { rpe -> HeaderCell(rpe.fmt(), cellW, cellH) }
        }
        RpeEngine.repValues.forEach { reps ->
            Column {
                HeaderCell(reps.toString(), cellW, cellH)
                RpeEngine.rpeValues.forEach { rpe ->
                    val selected = reps == input.targetReps && rpe == input.targetRpe
                    val inRow = reps == input.targetReps || rpe == input.targetRpe
                    val text = if (input.showPercent) {
                        RpeEngine.percentage(reps, rpe)?.let { (it * 100).fmt() } ?: ""
                    } else {
                        state.cellWeight(reps, rpe)?.fmt() ?: ""
                    }
                    Box(
                        Modifier
                            .size(cellW, cellH)
                            .background(
                                when {
                                    selected -> MaterialTheme.colorScheme.primary
                                    inRow -> MaterialTheme.colorScheme.primaryContainer
                                    else -> Color.Transparent
                                },
                            )
                            .border(0.5.dp, MaterialTheme.colorScheme.outline)
                            .clickable { onCellClick(reps, rpe) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text,
                            style = NumberStyle.copy(fontSize = 13.sp),
                            color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun HeaderCell(text: String, width: Dp, height: Dp) {
    Box(
        Modifier
            .size(width, height)
            .background(MaterialTheme.colorScheme.surfaceContainerHighest)
            .border(0.5.dp, MaterialTheme.colorScheme.outline),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
    }
}
