package com.gymapp.ui.common

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.gymapp.GymApplication
import com.gymapp.di.AppContainer
import com.gymapp.domain.engine.RpeEngine
import com.gymapp.domain.model.TrendPoint
import com.gymapp.ui.theme.NumberStyle
import com.patrykandpatrick.vico.compose.cartesian.CartesianChartHost
import com.patrykandpatrick.vico.compose.cartesian.axis.rememberBottom
import com.patrykandpatrick.vico.compose.cartesian.axis.rememberStart
import com.patrykandpatrick.vico.compose.cartesian.layer.rememberLineCartesianLayer
import com.patrykandpatrick.vico.compose.cartesian.rememberCartesianChart
import com.patrykandpatrick.vico.compose.common.ProvideVicoTheme
import com.patrykandpatrick.vico.compose.m3.common.rememberM3VicoTheme
import com.patrykandpatrick.vico.core.cartesian.axis.HorizontalAxis
import com.patrykandpatrick.vico.core.cartesian.axis.VerticalAxis
import com.patrykandpatrick.vico.core.cartesian.data.CartesianChartModelProducer
import com.patrykandpatrick.vico.core.cartesian.data.CartesianValueFormatter
import com.patrykandpatrick.vico.core.cartesian.data.lineSeries
import java.text.DecimalFormat
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@Composable
inline fun <reified VM : ViewModel> gymViewModel(
    key: String? = null,
    crossinline create: (AppContainer) -> VM,
): VM {
    val container = (LocalContext.current.applicationContext as GymApplication).container
    return viewModel(key = key, factory = viewModelFactory { initializer { create(container) } })
}

private val kgFormat = DecimalFormat("0.##")

fun Double.fmt(): String = kgFormat.format(this)

fun String.toDecimalOrNull(): Double? = replace(',', '.').trim().toDoubleOrNull()

val shortDate: DateTimeFormatter = DateTimeFormatter.ofPattern("dd.MM")
val longDate: DateTimeFormatter = DateTimeFormatter.ofPattern("EEE, dd MMM yyyy")

fun formatDuration(totalSec: Int): String {
    val h = totalSec / 3600
    val m = (totalSec % 3600) / 60
    val s = totalSec % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}

/** Accepts "mm:ss", "h:mm:ss" or plain minutes. */
fun parseDuration(text: String): Int? {
    val parts = text.trim().split(":").map { it.toIntOrNull() ?: return null }
    return when (parts.size) {
        1 -> parts[0] * 60
        2 -> parts[0] * 60 + parts[1]
        3 -> parts[0] * 3600 + parts[1] * 60 + parts[2]
        else -> null
    }
}

/** Big +/- stepper; the centre field stays editable for odd plate maths. */
@Composable
fun NumberStepper(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    step: Double,
    modifier: Modifier = Modifier,
    decimal: Boolean = true,
    min: Double = 0.0,
) {
    fun bump(delta: Double) {
        val next = ((value.toDecimalOrNull() ?: 0.0) + delta).coerceAtLeast(min)
        onValueChange(if (decimal) next.fmt() else next.toInt().toString())
    }
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FilledTonalIconButton(onClick = { bump(-step) }, modifier = Modifier.size(52.dp)) {
            Icon(Icons.Default.Remove, contentDescription = "Decrease $label")
        }
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            singleLine = true,
            textStyle = NumberStyle.copy(textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurface),
            keyboardOptions = KeyboardOptions(keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number),
            modifier = Modifier.weight(1f),
        )
        FilledTonalIconButton(onClick = { bump(step) }, modifier = Modifier.size(52.dp)) {
            Icon(Icons.Default.Add, contentDescription = "Increase $label")
        }
    }
}

@Composable
fun NumberField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    decimal: Boolean = true,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        textStyle = NumberStyle.copy(color = MaterialTheme.colorScheme.onSurface),
        keyboardOptions = KeyboardOptions(keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number),
        modifier = modifier,
    )
}

private val chartDateFormatter = CartesianValueFormatter { _, x, _ ->
    LocalDate.ofEpochDay(x.toLong()).format(shortDate)
}

@Composable
fun TrendChart(points: List<TrendPoint>, modifier: Modifier = Modifier, emptyText: String = "No data yet") {
    if (points.size < 2) {
        Box(modifier.fillMaxWidth().height(180.dp), contentAlignment = Alignment.Center) {
            Text(
                if (points.isEmpty()) emptyText else "Log one more session to see a trend",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    val producer = remember { CartesianChartModelProducer() }
    LaunchedEffect(points) {
        producer.runTransaction {
            lineSeries { series(x = points.map { it.date.toEpochDay() }, y = points.map { it.value }) }
        }
    }
    ProvideVicoTheme(rememberM3VicoTheme()) {
        CartesianChartHost(
            chart = rememberCartesianChart(
                rememberLineCartesianLayer(),
                startAxis = VerticalAxis.rememberStart(),
                bottomAxis = HorizontalAxis.rememberBottom(valueFormatter = chartDateFormatter),
            ),
            modelProducer = producer,
            modifier = modifier.fillMaxWidth().height(220.dp).padding(top = 8.dp),
        )
    }
}

@Composable
fun RpeSelector(selected: Double?, onSelect: (Double?) -> Unit, allowNone: Boolean = false) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        if (allowNone) FilterChip(selected = selected == null, onClick = { onSelect(null) }, label = { Text("–") })
        RpeEngine.rpeValues.reversed().forEach { value ->
            FilterChip(selected = selected == value, onClick = { onSelect(value) }, label = { Text(value.fmt()) })
        }
    }
}

@Composable
fun StatBlock(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(value, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
