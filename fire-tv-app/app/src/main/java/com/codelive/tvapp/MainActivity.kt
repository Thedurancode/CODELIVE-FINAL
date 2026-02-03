package com.codelive.tvapp

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.*
import android.widget.ProgressBar
import android.widget.RelativeLayout
import android.widget.Toast

/**
 * Codelive TV App - Fire TV WebView Wrapper
 *
 * Displays the Codelive TV slideshow in a fullscreen WebView
 * with Fire TV remote (D-pad) navigation support.
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var rootLayout: RelativeLayout

    // Configure your TV app URL here
    companion object {
        // For local development (Fire TV on same network)
        private const val TV_URL_LOCAL = "http://192.168.1.100:3000/tv/projects"

        // For production (deployed URL)
        private const val TV_URL_PRODUCTION = "https://your-domain.com/tv/projects"

        // Set which URL to use
        private const val USE_PRODUCTION = false

        val TV_URL: String
            get() = if (USE_PRODUCTION) TV_URL_PRODUCTION else TV_URL_LOCAL
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Make fullscreen
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        )

        // Keep screen on
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Create root layout
        rootLayout = RelativeLayout(this).apply {
            setBackgroundColor(Color.BLACK)
        }

        // Create progress bar for loading
        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleLarge).apply {
            layoutParams = RelativeLayout.LayoutParams(
                RelativeLayout.LayoutParams.WRAP_CONTENT,
                RelativeLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                addRule(RelativeLayout.CENTER_IN_PARENT)
            }
        }

        // Create and configure WebView
        webView = WebView(this).apply {
            layoutParams = RelativeLayout.LayoutParams(
                RelativeLayout.LayoutParams.MATCH_PARENT,
                RelativeLayout.LayoutParams.MATCH_PARENT
            )

            settings.apply {
                // Enable JavaScript (required for React)
                javaScriptEnabled = true

                // Enable DOM storage (localStorage)
                domStorageEnabled = true

                // Enable media playback
                mediaPlaybackRequiresUserGesture = false

                // Cache settings
                cacheMode = WebSettings.LOAD_DEFAULT

                // Allow mixed content (for development)
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW

                // Viewport settings
                useWideViewPort = true
                loadWithOverviewMode = true

                // Allow file access
                allowFileAccess = true
                allowContentAccess = true

                // Database storage
                databaseEnabled = true
            }

            // Enable WebView debugging (disable in production)
            WebView.setWebContentsDebuggingEnabled(true)

            // Handle page loading
            webViewClient = object : WebViewClient() {
                override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                    super.onPageStarted(view, url, favicon)
                    progressBar.visibility = View.VISIBLE
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    progressBar.visibility = View.GONE

                    // Inject CSS to hide scrollbars and optimize for TV
                    view?.evaluateJavascript("""
                        (function() {
                            var style = document.createElement('style');
                            style.innerHTML = `
                                ::-webkit-scrollbar { display: none !important; }
                                body {
                                    overflow: hidden !important;
                                    cursor: none !important;
                                }
                            `;
                            document.head.appendChild(style);
                        })();
                    """.trimIndent(), null)
                }

                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: WebResourceError?
                ) {
                    super.onReceivedError(view, request, error)
                    if (request?.isForMainFrame == true) {
                        showError("Connection Error: ${error?.description}")
                    }
                }
            }

            // Handle JavaScript dialogs and console
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                    android.util.Log.d("CodeliveTV",
                        "${consoleMessage?.message()} -- ${consoleMessage?.sourceId()}:${consoleMessage?.lineNumber()}")
                    return true
                }

                override fun onProgressChanged(view: WebView?, newProgress: Int) {
                    super.onProgressChanged(view, newProgress)
                    if (newProgress >= 100) {
                        progressBar.visibility = View.GONE
                    }
                }
            }
        }

        // Add views
        rootLayout.addView(webView)
        rootLayout.addView(progressBar)
        setContentView(rootLayout)

        // Load the TV URL
        loadTVApp()
    }

    private fun loadTVApp() {
        webView.loadUrl(TV_URL)
    }

    private fun showError(message: String) {
        runOnUiThread {
            Toast.makeText(this, message, Toast.LENGTH_LONG).show()
        }
    }

    /**
     * Handle Fire TV Remote (D-pad) key events
     */
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        when (keyCode) {
            // D-pad navigation - send to WebView as keyboard events
            KeyEvent.KEYCODE_DPAD_LEFT -> {
                webView.evaluateJavascript(
                    "document.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', code: 'ArrowLeft'}))",
                    null
                )
                return true
            }
            KeyEvent.KEYCODE_DPAD_RIGHT -> {
                webView.evaluateJavascript(
                    "document.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', code: 'ArrowRight'}))",
                    null
                )
                return true
            }
            KeyEvent.KEYCODE_DPAD_UP -> {
                webView.evaluateJavascript(
                    "document.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', code: 'ArrowUp'}))",
                    null
                )
                return true
            }
            KeyEvent.KEYCODE_DPAD_DOWN -> {
                webView.evaluateJavascript(
                    "document.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', code: 'ArrowDown'}))",
                    null
                )
                return true
            }
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                // Select/Enter - trigger click or space key
                webView.evaluateJavascript(
                    "document.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', code: 'Space'}))",
                    null
                )
                return true
            }
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                // Play/Pause button - toggle slideshow
                webView.evaluateJavascript(
                    "document.dispatchEvent(new KeyboardEvent('keydown', {key: 'p', code: 'KeyP'}))",
                    null
                )
                return true
            }
            KeyEvent.KEYCODE_MEDIA_REWIND, KeyEvent.KEYCODE_MEDIA_SKIP_BACKWARD -> {
                // Previous slide
                webView.evaluateJavascript(
                    "document.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', code: 'ArrowLeft'}))",
                    null
                )
                return true
            }
            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD, KeyEvent.KEYCODE_MEDIA_SKIP_FORWARD -> {
                // Next slide
                webView.evaluateJavascript(
                    "document.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', code: 'ArrowRight'}))",
                    null
                )
                return true
            }
            KeyEvent.KEYCODE_MENU -> {
                // Menu button - toggle settings
                webView.evaluateJavascript(
                    "document.dispatchEvent(new KeyboardEvent('keydown', {key: 's', code: 'KeyS'}))",
                    null
                )
                return true
            }
            KeyEvent.KEYCODE_BACK -> {
                // Back button - can go back in WebView or exit
                if (webView.canGoBack()) {
                    webView.goBack()
                    return true
                }
                // Let system handle exit
                return super.onKeyDown(keyCode, event)
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        webView.resumeTimers()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
        webView.pauseTimers()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
