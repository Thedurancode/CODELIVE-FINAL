# Codelive TV - Fire TV App

A Fire TV / Android TV app that displays the Codelive TV slideshow dashboard.

## Features

- Fullscreen WebView wrapper for the Codelive TV web app
- Fire TV remote (D-pad) navigation support
- Media button support (play/pause, skip, rewind)
- Auto-start on boot (optional)
- Keep screen on during playback
- Hardware accelerated rendering

## Requirements

- Android Studio Arctic Fox or later
- JDK 17
- Android SDK 34
- Fire TV device or emulator

## Quick Start

### 1. Configure the TV URL

Edit `app/src/main/java/com/codelive/tvapp/MainActivity.kt`:

```kotlin
companion object {
    // For local development (Fire TV on same network as your dev server)
    private const val TV_URL_LOCAL = "http://YOUR_LOCAL_IP:3000/tv/projects"

    // For production
    private const val TV_URL_PRODUCTION = "https://your-domain.com/tv/projects"

    // Toggle this for production builds
    private const val USE_PRODUCTION = false
}
```

### 2. Build the APK

**Using Android Studio:**
1. Open this folder in Android Studio
2. Wait for Gradle sync to complete
3. Build > Build Bundle(s) / APK(s) > Build APK(s)
4. APK will be in `app/build/outputs/apk/debug/`

**Using Command Line:**
```bash
cd fire-tv-app

# Debug build
./gradlew assembleDebug

# Release build (requires signing config)
./gradlew assembleRelease
```

### 3. Install on Fire TV

**Option A: ADB over Network**
```bash
# Enable ADB on Fire TV: Settings > My Fire TV > Developer Options > ADB Debugging

# Find Fire TV IP: Settings > My Fire TV > About > Network

# Connect via ADB
adb connect FIRE_TV_IP:5555

# Install APK
adb install app/build/outputs/apk/debug/app-debug.apk
```

**Option B: USB**
1. Connect Fire TV via USB
2. Enable USB debugging
3. `adb install app/build/outputs/apk/debug/app-debug.apk`

**Option C: Sideload via Fire TV App**
1. Install "Downloader" app from Amazon App Store
2. Host APK on a web server
3. Enter URL in Downloader app

## Remote Control Mapping

| Fire TV Button | Action |
|----------------|--------|
| D-pad Left/Right | Previous/Next slide |
| D-pad Up/Down | Scroll (if applicable) |
| Select (Center) | Click / Toggle |
| Play/Pause | Toggle slideshow |
| Rewind | Previous slide |
| Fast Forward | Next slide |
| Menu | Open settings |
| Back | Go back / Exit |

## Configuration Options

### Auto-Start on Boot

Edit `BootReceiver.kt`:
```kotlin
private const val AUTO_START_ON_BOOT = true
```

### WebView Debugging

Enabled by default for debug builds. To debug:
1. Connect Fire TV via ADB
2. Open Chrome on your computer
3. Navigate to `chrome://inspect`
4. Click "inspect" under your device

### Keep Screen On

Enabled by default. The screen will stay on while the app is running.

## Project Structure

```
fire-tv-app/
├── app/
│   ├── src/main/
│   │   ├── java/com/codelive/tvapp/
│   │   │   ├── MainActivity.kt      # Main WebView activity
│   │   │   └── BootReceiver.kt      # Boot auto-start receiver
│   │   ├── res/
│   │   │   ├── drawable/            # Icons and banners
│   │   │   ├── layout/              # Layouts (not used - programmatic)
│   │   │   ├── mipmap-*/            # App icons
│   │   │   └── values/              # Strings, colors, themes
│   │   └── AndroidManifest.xml      # App manifest
│   ├── build.gradle                 # App build config
│   └── proguard-rules.pro           # ProGuard rules
├── build.gradle                     # Project build config
├── settings.gradle                  # Gradle settings
├── gradle.properties                # Gradle properties
└── README.md                        # This file
```

## Troubleshooting

### "Connection Error" on launch
- Ensure your server is running and accessible
- Check the TV_URL is correct
- Fire TV must be on the same network as your dev server

### Black screen
- Check WebView console logs via Chrome inspect
- Verify the web app loads in a regular browser first

### Remote buttons not working
- The web app must handle keyboard events
- Check browser console for dispatched events

### App not appearing in Fire TV launcher
- Ensure `LEANBACK_LAUNCHER` intent filter is present
- Clear Fire TV launcher cache

## Publishing to Amazon App Store

1. Create Amazon Developer account
2. Generate signed APK:
   - Build > Generate Signed Bundle / APK
   - Create keystore if needed
   - Select "release" build type
3. Submit to Amazon Appstore Console
4. Fill in app details, screenshots, etc.
5. Submit for review

## License

Private - Codelive
