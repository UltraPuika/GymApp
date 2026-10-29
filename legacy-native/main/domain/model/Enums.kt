package com.gymapp.domain.model

enum class SetType(val label: String, val short: String) {
    WARM_UP("Warm-up", "W"),
    TOP("TOP", "T"),
    BACK_OFF("Back-off", "B"),
}

enum class ExerciseCategory { STRENGTH, ACCESSORY, CALISTHENICS, MOBILITY }

enum class SessionType { STRENGTH, CALISTHENICS }

enum class RunType(val label: String) {
    EASY("Easy"),
    TEMPO("Tempo"),
    LONG("Long"),
    RACE("Race"),
}

enum class ChecklistCategory(val label: String) {
    WARM_UP("Pre-workout"),
    PREHAB("Shoulder pre-hab"),
}
