package com.gymapp.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.gymapp.domain.model.SetType

object GymColors {
    val Black = Color(0xFF000000)
    val Surface = Color(0xFF111111)
    val SurfaceHigh = Color(0xFF1C1C1C)
    val Outline = Color(0xFF4A4A4A)
    val Lime = Color(0xFFC6FF00)
    val Amber = Color(0xFFFFB300)
    val Cyan = Color(0xFF00E5FF)
    val Red = Color(0xFFFF5252)
    val TextPrimary = Color(0xFFFFFFFF)
    val TextSecondary = Color(0xFFBDBDBD)
    val WarmUp = Color(0xFF90A4AE)
}

fun SetType.color(): Color = when (this) {
    SetType.WARM_UP -> GymColors.WarmUp
    SetType.TOP -> GymColors.Lime
    SetType.BACK_OFF -> GymColors.Amber
}

private val GymColorScheme = darkColorScheme(
    primary = GymColors.Lime,
    onPrimary = GymColors.Black,
    primaryContainer = Color(0xFF2E3B00),
    onPrimaryContainer = GymColors.Lime,
    secondary = GymColors.Amber,
    onSecondary = GymColors.Black,
    tertiary = GymColors.Cyan,
    onTertiary = GymColors.Black,
    background = GymColors.Black,
    onBackground = GymColors.TextPrimary,
    surface = GymColors.Surface,
    onSurface = GymColors.TextPrimary,
    surfaceVariant = GymColors.SurfaceHigh,
    onSurfaceVariant = GymColors.TextSecondary,
    surfaceContainer = GymColors.Surface,
    surfaceContainerHigh = GymColors.SurfaceHigh,
    surfaceContainerHighest = Color(0xFF262626),
    outline = GymColors.Outline,
    error = GymColors.Red,
    onError = GymColors.Black,
)

private val base = Typography()

/** Large, heavy numerals — readable at arm's length mid-set. */
private val GymTypography = base.copy(
    displaySmall = base.displaySmall.copy(fontWeight = FontWeight.Black),
    headlineMedium = base.headlineMedium.copy(fontWeight = FontWeight.Bold),
    titleLarge = base.titleLarge.copy(fontWeight = FontWeight.Bold),
    titleMedium = base.titleMedium.copy(fontWeight = FontWeight.SemiBold),
    labelLarge = base.labelLarge.copy(fontWeight = FontWeight.Bold),
)

val NumberStyle = TextStyle(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 18.sp)

@Composable
fun GymTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = GymColorScheme, typography = GymTypography, content = content)
}
