package com.gymapp

import android.app.Application
import com.gymapp.di.AppContainer

class GymApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(applicationContext)
    }
}
