package com.gymapp.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.DirectionsRun
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.SelfImprovement
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.gymapp.domain.model.SessionType
import com.gymapp.ui.progress.ProgressScreen
import com.gymapp.ui.rpe.RpeCalculatorScreen
import com.gymapp.ui.running.RunningScreen
import com.gymapp.ui.workout.WorkoutLoggerScreen

private enum class Tab(val route: String, val label: String, val icon: ImageVector) {
    Strength("strength", "Lift", Icons.Default.FitnessCenter),
    Calisthenics("calisthenics", "Cali", Icons.Default.SelfImprovement),
    Rpe("rpe", "RPE", Icons.Default.Calculate),
    Running("running", "Run", Icons.AutoMirrored.Filled.DirectionsRun),
    Progress("progress", "Progress", Icons.AutoMirrored.Filled.ShowChart),
}

@Composable
fun GymNavHost() {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val current = backStack?.destination

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                Tab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = current?.hierarchy?.any { it.route == tab.route } == true,
                        onClick = {
                            nav.navigate(tab.route) {
                                popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label) },
                    )
                }
            }
        },
    ) { padding ->
        NavHost(nav, startDestination = Tab.Strength.route, modifier = Modifier.padding(bottom = padding.calculateBottomPadding())) {
            composable(Tab.Strength.route) { WorkoutLoggerScreen(SessionType.STRENGTH) }
            composable(Tab.Calisthenics.route) { WorkoutLoggerScreen(SessionType.CALISTHENICS) }
            composable(Tab.Rpe.route) { RpeCalculatorScreen() }
            composable(Tab.Running.route) { RunningScreen() }
            composable(Tab.Progress.route) { ProgressScreen() }
        }
    }
}
