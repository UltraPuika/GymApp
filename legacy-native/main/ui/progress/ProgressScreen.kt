package com.gymapp.ui.progress

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import com.gymapp.ui.common.NumberField
import com.gymapp.ui.common.StatBlock
import com.gymapp.ui.common.TrendChart
import com.gymapp.ui.common.fmt
import com.gymapp.ui.common.gymViewModel
import com.gymapp.ui.common.shortDate
import com.gymapp.ui.common.toDecimalOrNull
import java.time.LocalDate

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProgressScreen() {
    val vm = gymViewModel {
        ProgressViewModel(it.trainingRepository, it.bodyRepository, it.getOneRmTrend, it.getVolumeTrend)
    }
    val state by vm.state.collectAsStateWithLifecycle()
    var showAdd by remember { mutableStateOf(false) }

    Scaffold(contentWindowInsets = WindowInsets(0, 0, 0, 0), topBar = { TopAppBar(title = { Text("Progress") }) }) { padding ->
        LazyColumn(
            Modifier.padding(padding),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                ChartCard("Estimated 1RM") {
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        state.exercises.forEach { ex ->
                            FilterChip(
                                selected = state.selectedExercise?.id == ex.id,
                                onClick = { vm.selectExercise(ex.id) },
                                label = { Text(ex.name) },
                            )
                        }
                    }
                    val trend = state.oneRmTrend
                    if (trend.isNotEmpty()) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            StatBlock("Latest", "${trend.last().value.fmt()} kg")
                            StatBlock("Best", "${trend.maxOf { it.value }.fmt()} kg")
                            StatBlock("Δ first", "${(trend.last().value - trend.first().value).fmt()} kg")
                        }
                    }
                    TrendChart(trend)
                }
            }
            item {
                ChartCard("Volume") {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        FilterChip(
                            selected = state.volumeType == SessionType.STRENGTH,
                            onClick = { vm.selectVolumeType(SessionType.STRENGTH) },
                            label = { Text("Strength tonnage (kg)") },
                        )
                        FilterChip(
                            selected = state.volumeType == SessionType.CALISTHENICS,
                            onClick = { vm.selectVolumeType(SessionType.CALISTHENICS) },
                            label = { Text("Calisthenics reps") },
                        )
                    }
                    TrendChart(state.volumeTrend)
                }
            }
            item {
                ChartCard("Body measurements") {
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        BodyMetric.entries.forEach { m ->
                            FilterChip(selected = state.metric == m, onClick = { vm.selectMetric(m) }, label = { Text(m.label) })
                        }
                    }
                    TrendChart(state.metricTrend, emptyText = "No ${state.metric.label.lowercase()} entries yet")
                    OutlinedButton(onClick = { showAdd = true }, modifier = Modifier.fillMaxWidth()) { Text("Add measurement") }
                    state.measurements.take(8).forEach { m ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(m.date.format(shortDate), modifier = Modifier.padding(end = 12.dp))
                            Text(
                                BodyMetric.entries.mapNotNull { metric -> metric.selector(m)?.let { "${metric.label} ${it.fmt()}" } }
                                    .joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.weight(1f),
                            )
                            IconButton(onClick = { vm.deleteMeasurement(m.id) }) { Icon(Icons.Default.Delete, "Delete") }
                        }
                    }
                }
            }
        }
    }

    if (showAdd) {
        AddMeasurementDialog(
            onConfirm = { w, waist, arms, glutes, legs ->
                vm.addMeasurement(LocalDate.now(), w, waist, arms, glutes, legs)
                showAdd = false
            },
            onDismiss = { showAdd = false },
        )
    }
}

@Composable
private fun ChartCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(title.uppercase(), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.tertiary)
            content()
        }
    }
}

@Composable
private fun AddMeasurementDialog(
    onConfirm: (Double?, Double?, Double?, Double?, Double?) -> Unit,
    onDismiss: () -> Unit,
) {
    val values = remember { BodyMetric.entries.associateWith { mutableStateOf("") } }
    val parsed = values.mapValues { (_, v) -> v.value.toDecimalOrNull() }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Today's measurements") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                BodyMetric.entries.forEach { m ->
                    val field = values.getValue(m)
                    NumberField("${m.label} (${m.unit})", field.value, { field.value = it })
                }
            }
        },
        confirmButton = {
            Button(
                enabled = parsed.values.any { it != null },
                onClick = {
                    onConfirm(
                        parsed[BodyMetric.WEIGHT], parsed[BodyMetric.WAIST], parsed[BodyMetric.ARMS],
                        parsed[BodyMetric.GLUTES], parsed[BodyMetric.LEGS],
                    )
                },
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
