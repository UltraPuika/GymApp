package com.gymapp.ui.running

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import com.gymapp.domain.model.RunType
import com.gymapp.domain.usecase.WeeklyRunSummary
import com.gymapp.ui.common.NumberField
import com.gymapp.ui.common.StatBlock
import com.gymapp.ui.common.TrendChart
import com.gymapp.ui.common.fmt
import com.gymapp.ui.common.formatDuration
import com.gymapp.ui.common.gymViewModel
import com.gymapp.ui.common.parseDuration
import com.gymapp.ui.common.shortDate
import com.gymapp.ui.common.toDecimalOrNull
import com.gymapp.ui.theme.NumberStyle
import java.time.LocalDate
import java.time.format.DateTimeFormatter

private val inputDate = DateTimeFormatter.ofPattern("dd.MM.yyyy")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RunningScreen() {
    val vm = gymViewModel { RunningViewModel(it.runningRepository, it.getWeeklyRunSummary) }
    val state by vm.state.collectAsStateWithLifecycle()
    var showAdd by remember { mutableStateOf(false) }
    var planExpanded by remember { mutableStateOf(false) }

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = { TopAppBar(title = { Text("Half Marathon") }) },
        floatingActionButton = {
            FloatingActionButton(onClick = { showAdd = true }) { Icon(Icons.Default.Add, "Log run") }
        },
    ) { padding ->
        LazyColumn(
            Modifier.padding(padding),
            contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                    Column(Modifier.padding(16.dp)) {
                        Text("WEEKLY VOLUME (km)", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.tertiary)
                        TrendChart(state.weeklyKm, emptyText = "Log a run to start tracking")
                    }
                }
            }
            items(state.weeks, key = { it.weekStart.toEpochDay() }) { week ->
                WeekCard(week, onDelete = vm::deleteRun)
            }
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)) {
                    Row(
                        Modifier.fillMaxWidth().clickable { planExpanded = !planExpanded }.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("10-week plan", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                        Icon(if (planExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore, null)
                    }
                    if (planExpanded) {
                        state.plan.toSortedMap().forEach { (week, entries) ->
                            Column(Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                                Text(
                                    "Week $week · ${entries.sumOf { it.targetDistanceKm }.fmt()} km",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                                entries.forEach { Text(it.description, style = MaterialTheme.typography.bodySmall) }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAdd) {
        AddRunDialog(
            onConfirm = { date, type, km, sec, hr -> vm.addRun(date, type, km, sec, hr); showAdd = false },
            onDismiss = { showAdd = false },
        )
    }
}

@Composable
private fun WeekCard(week: WeeklyRunSummary, onDelete: (Long) -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Week of ${week.weekStart.format(shortDate)}", style = MaterialTheme.typography.titleMedium)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                StatBlock("Total km", week.totalKm.fmt())
                StatBlock("Time", formatDuration(week.totalDurationSec))
            }
            Text(
                RunType.entries.joinToString("  ·  ") { "${it.label} ${(week.kmByType[it] ?: 0.0).fmt()} km" },
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            week.runs.forEach { run ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(run.date.format(shortDate), style = NumberStyle, modifier = Modifier.padding(end = 8.dp))
                    Column(Modifier.weight(1f)) {
                        Text("${run.runType.label} · ${run.distanceKm.fmt()} km", style = MaterialTheme.typography.bodyLarge)
                        Text(
                            "${formatDuration(run.paceSecPerKm)}/km · ${formatDuration(run.durationSec)}" +
                                (run.avgHr?.let { " · $it bpm" } ?: ""),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(onClick = { onDelete(run.id) }) { Icon(Icons.Default.Delete, "Delete run") }
                }
            }
        }
    }
}

@Composable
private fun AddRunDialog(
    onConfirm: (LocalDate, RunType, Double, Int, Int?) -> Unit,
    onDismiss: () -> Unit,
) {
    var dateText by remember { mutableStateOf(LocalDate.now().format(inputDate)) }
    var type by remember { mutableStateOf(RunType.EASY) }
    var km by remember { mutableStateOf("") }
    var duration by remember { mutableStateOf("") }
    var hr by remember { mutableStateOf("") }

    val date = runCatching { LocalDate.parse(dateText.trim(), inputDate) }.getOrNull()
    val distance = km.toDecimalOrNull()?.takeIf { it > 0 }
    val seconds = parseDuration(duration)?.takeIf { it > 0 }
    val valid = date != null && distance != null && seconds != null

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Log run") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    RunType.entries.forEach {
                        FilterChip(selected = type == it, onClick = { type = it }, label = { Text(it.label) })
                    }
                }
                OutlinedTextField(dateText, { dateText = it }, label = { Text("Date (dd.MM.yyyy)") }, singleLine = true, isError = date == null)
                NumberField("Distance km", km, { km = it })
                OutlinedTextField(duration, { duration = it }, label = { Text("Time (mm:ss or h:mm:ss)") }, singleLine = true)
                NumberField("Avg HR (optional)", hr, { hr = it }, decimal = false)
            }
        },
        confirmButton = {
            Button(enabled = valid, onClick = { onConfirm(date!!, type, distance!!, seconds!!, hr.toIntOrNull()) }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
