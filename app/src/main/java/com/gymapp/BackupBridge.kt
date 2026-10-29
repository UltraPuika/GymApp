package com.gymapp

import android.net.Uri
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import org.json.JSONObject

/** `window.AndroidBackup`: saves/opens backup files through the system file picker (Drive, Downloads, …). */
class BackupBridge(private val activity: ComponentActivity, private val webView: () -> WebView) {
    private var pendingJson: String? = null

    private val createDoc = activity.registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val json = pendingJson
        pendingJson = null
        if (uri != null && json != null) write(uri, json)
    }

    private val openDoc = activity.registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) read(uri)
    }

    @JavascriptInterface
    fun exportFile(name: String, json: String) {
        pendingJson = json
        activity.runOnUiThread { createDoc.launch(name) }
    }

    @JavascriptInterface
    fun pickFile() {
        activity.runOnUiThread { openDoc.launch(arrayOf("*/*")) }
    }

    private fun write(uri: Uri, json: String) = runCatching {
        activity.contentResolver.openOutputStream(uri, "wt")!!.use { it.write(json.toByteArray()) }
    }.onSuccess { webView().evaluateJavascript("onExported()", null) }
        .onFailure { toast("Could not save backup: ${it.message}") }

    private fun read(uri: Uri) = runCatching {
        activity.contentResolver.openInputStream(uri)!!.use { it.readBytes().decodeToString() }
    }.onSuccess { webView().evaluateJavascript("onImportText(${JSONObject.quote(it)})", null) }
        .onFailure { toast("Could not open file: ${it.message}") }

    private fun toast(msg: String) = Toast.makeText(activity, msg, Toast.LENGTH_LONG).show()
}
