package com.gymapp

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.webkit.JavascriptInterface

/**
 * On-device SQLite key/value store exposed to the web app as `window.AndroidDb`
 * with the same getItem/setItem/removeItem API as localStorage.
 * Every write is committed immediately, so nothing is lost when the app is closed.
 */
class GymDatabase private constructor(context: Context) :
    SQLiteOpenHelper(context, "gymlog.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    @JavascriptInterface
    fun getItem(key: String): String? =
        readableDatabase.rawQuery("SELECT value FROM kv WHERE key = ?", arrayOf(key)).use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }

    @JavascriptInterface
    fun setItem(key: String, value: String) {
        val row = ContentValues().apply {
            put("key", key)
            put("value", value)
            put("updated_at", System.currentTimeMillis())
        }
        writableDatabase.insertWithOnConflict("kv", null, row, SQLiteDatabase.CONFLICT_REPLACE)
    }

    @JavascriptInterface
    fun removeItem(key: String) {
        writableDatabase.delete("kv", "key = ?", arrayOf(key))
    }

    companion object {
        @Volatile private var instance: GymDatabase? = null
        fun get(context: Context): GymDatabase =
            instance ?: synchronized(this) { instance ?: GymDatabase(context.applicationContext).also { instance = it } }
    }
}
